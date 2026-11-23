// ═══════════════════════════════════════════════════════════════
// usuarios.js — Usuários e perfil — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

let buscaUsuario = '';

const tagGrupo = id => {
  const g = ESTADO.grupos[id];
  return g ? `<span class="tag"><i class="fa-solid ${g.icone}" style="color:${g.cor}"></i>${esc(g.nome)}</span>` : '<span class="tag muted">sem grupo</span>';
};
const resumoSetores = u => u.setores === 'todos' || !Array.isArray(u.setores) || !u.setores.length ? 'Todos os setores'
  : u.setores.map(id => ESTADO.setores[id]?.nome).filter(Boolean).join(', ');

// Usuários vêm do Dados LAMIC. Cada conta do Dados aparece aqui; o Comercial guarda só grupo, setores,
// ativo e admin (auth/usuarios/{id}, campo login). Só aparecem contas cujo grupo no Dados tem
// "Acessar o Comercial" (ou admin). Conta sem registro = ainda não configurada aqui.
// Registros antigos sem conta no Dados ficam listados (somente leitura) para não perder histórico.
function linhasUsuarios() {
  const linhas = Object.entries(DADOS.usuarios).filter(([login, d]) => contaComAcesso(d, login)).map(([login, d]) => {
    const r = registroDe(login);
    return r ? { ...r, nome: d.nome || r.nome, cargo: d.cargo || r.cargo, usuario: login }
      : { id: 'dados:' + login, login, usuario: login, nome: d.nome || login, cargo: d.cargo || '', semAcesso: true, ativo: false };
  });
  lista(ESTADO.usuarios).filter(u => !u.login || !DADOS.usuarios[u.login]).forEach(u => linhas.push({ ...u, semConta: true }));
  return linhas.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

function renderUsuarios() {
  const p = painelConfig(), editar = pode('usuarios', 'editar');
  p.innerHTML = `<div class="card">
    <div class="toolbar">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="q-user" value="${esc(buscaUsuario)}" placeholder="Buscar nome ou usuário…" oninput="buscaUsuario=this.value;desenharTabelaUsuarios()"></div>
      <div id="pop-ugrupo"></div>
      <span class="muted" style="font-size:12px;margin-left:auto"><i class="fa-solid fa-circle-info"></i> Contas, nome e cargo vêm do Dados LAMIC</span>
      ${editar ? `<button class="btn pri" onclick="abrirLiberarAcesso(event)"><i class="fa-solid fa-user-check"></i>Liberar acesso</button><div id="pop-liberar" class="pop-oculto"></div>` : ''}
    </div>
    <div class="tbl-wrap"><table><thead><tr><th>Usuário</th><th>Cargo</th><th>Grupo</th><th>Setores</th><th>Status</th><th>Último acesso</th><th></th></tr></thead><tbody id="users-body"></tbody></table></div>
    <div class="foot"><span id="users-count"></span><span></span></div></div>`;
  criarPop('pop-ugrupo', {
    rotulo: 'Grupo', titulo: 'Filtrar por grupo', icone: 'fa-user-shield', limpavel: true,
    opcoes: () => [{ valor: '', rotulo: 'Todos os grupos', icone: 'fa-layer-group', qtd: Object.keys(ESTADO.usuarios).length },
      ...lista(ESTADO.grupos, porNome).map(g => ({ valor: g.id, rotulo: g.nome, icone: g.icone, cor: g.cor, desc: g.descricao, qtd: lista(ESTADO.usuarios).filter(u => u.grupoId === g.id).length }))],
    aoMudar: desenharTabelaUsuarios
  });
  if (editar) criarPop('pop-liberar', {
    rotulo: 'Liberar acesso', titulo: 'Conta do Dados LAMIC', icone: 'fa-user-check', busca: 'Buscar nome ou login…',
    opcoes: () => candidatosAcesso().map(([login, d]) => ({ valor: login, rotulo: d.nome || login, icone: 'fa-user', desc: `@${login}${d.cargo ? ' · ' + d.cargo : ''}` })),
    aoMudar: login => { if (login) { POPS['pop-liberar'].valor = ''; abrirUsuario('liberar:' + login); } }
  });
  desenharTabelaUsuarios();
}

// Contas ativas do Dados que ainda não têm acesso ao Comercial
const candidatosAcesso = () => Object.entries(DADOS.usuarios).filter(([login, d]) => d.ativo !== false && !contaComAcesso(d, login))
  .sort(([, a], [, b]) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

function abrirLiberarAcesso(e) {
  e?.stopPropagation();
  if (!candidatosAcesso().length) return toast('Todas as contas ativas do Dados LAMIC já têm acesso ao Comercial.');
  abrirPop('pop-liberar');
}

function desenharTabelaUsuarios() {
  const g = valorPop('pop-ugrupo'), eu = sessao?.usuarioId;
  const todas = linhasUsuarios();
  const us = todas.filter(u => (!g || u.grupoId === g) && contem(u.nome + ' ' + u.usuario, buscaUsuario));
  document.getElementById('users-body').innerHTML = us.map(u => `
    <tr class="row" onclick="abrirUsuario('${u.id}')">
      <td><div class="ucell"><div class="avatar" style="background:${corAvatar(u.id)}">${esc(iniciais(u.nome))}</div><div>${esc(u.nome)} ${u.id === eu ? '<span class="badge-s base">você</span>' : ''}${u.admin ? ' <span class="badge-s warn"><i class="fa-solid fa-crown"></i>admin</span>' : ''}<div class="s">@${esc(u.usuario)}${u.semConta ? ' · <span style="color:var(--amber)">sem conta no Dados</span>' : ''}</div></div></div></td>
      <td>${esc(u.cargo || '—')}</td><td>${u.semAcesso ? '<span class="muted">—</span>' : tagGrupo(u.grupoId)}</td>
      <td class="desc" style="font-size:12.5px;color:var(--text-secondary)">${esc(resumoSetores(u))}</td>
      <td>${u.semAcesso ? '<span class="badge-s off"><i class="fa-solid fa-lock" style="font-size:9px"></i>Não configurado</span>' : u.ativo !== false ? '<span class="badge-s ok"><i class="fa-solid fa-circle" style="font-size:6px"></i>Ativo</span>' : '<span class="badge-s off"><i class="fa-solid fa-circle" style="font-size:6px"></i>Inativo</span>'}</td>
      <td class="muted" style="font-size:12px">${dataHora(u.ultimoAcesso)}</td>
      <td><i class="fa-solid fa-chevron-right muted"></i></td></tr>`).join('') || `<tr><td colspan="7">${vazio('fa-users', 'Nenhum usuário encontrado')}</td></tr>`;
  document.getElementById('users-count').textContent = `${us.length} de ${todas.length} usuários`;
}


// ── Gaveta de usuário ─────────────────────────────────────────
let _uEd = null;
function abrirUsuario(id) {
  let u = linhasUsuarios().find(x => x.id === id);
  if (!u && String(id).startsWith('liberar:')) {
    // Liberar acesso: conta do Dados sem acesso. Reaproveita registro antigo dela, se houver (mantém histórico).
    const login = id.slice(8), d = DADOS.usuarios[login], r = registroDe(login);
    if (d) u = r ? { ...r, nome: d.nome, cargo: d.cargo, usuario: login, semAcesso: true, liberar: true, registroId: r.id }
      : { id, login, usuario: login, nome: d.nome || login, cargo: d.cargo || '', semAcesso: true, liberar: true, ativo: false };
  }
  if (!u) return;
  const novo = !!u.semAcesso;   // conta do Dados ainda sem registro: salvar libera o acesso
  const editar = !u.semConta && (novo ? pode('usuarios', 'criar') || pode('usuarios', 'editar') : pode('usuarios', 'editar'));
  const souAdmin = usuarioAtual()?.admin, eu = id === sessao?.usuarioId;
  _uEd = { id, login: u.login, novo, liberar: !!u.liberar, registroId: u.registroId || null, grupoId: u?.grupoId || grupoPadrao()?.id || null, setores: Array.isArray(u?.setores) ? [...u.setores] : 'todos', ativo: novo ? true : u.ativo !== false, admin: !!u.admin };
  const ro = editar ? '' : 'disabled';
  abrirGaveta({
    sobre: '@' + u.usuario,
    titulo: u.nome,
    meta: u.liberar ? '<span class="tag"><i class="fa-solid fa-user-check"></i>Liberar acesso: escolha grupo e setores e salve</span>'
      : novo ? '<span class="tag"><i class="fa-solid fa-lock"></i>Ainda não entrou: salvar já define grupo e setores</span>' : `${tagGrupo(u.grupoId)}<span class="tag"><i class="fa-solid fa-clock"></i>${dataHora(u.ultimoAcesso)}</span>`,
    corpo: `<div class="form-col">
      ${campo('u-nome', 'Nome completo', u.nome || '', { tipo: 'text', desab: true, dica: 'vem do Dados LAMIC' })}
      <div class="fgrid sem-pad">
        ${campo('u-usuario', 'Login', u.usuario || '', { tipo: 'text', desab: true, dica: 'vem do Dados LAMIC' })}
        ${campo('u-cargo', 'Cargo', u.cargo || '', { tipo: 'text', desab: true, dica: 'vem do Dados LAMIC' })}
      </div>
      ${u.semConta ? '<div class="alert x"><i class="fa-solid fa-circle-info"></i><div>Registro antigo sem conta no Dados LAMIC. Mantido para o histórico; crie a conta no Dados com o mesmo nome completo para vincular.</div></div>' : ''}
      <div class="sec-t"><i class="fa-solid fa-user-shield"></i>Grupo</div>
      <div class="opt-cards" id="u-grupo">${lista(ESTADO.grupos, porNome).map(g => `
        <button type="button" class="oc ${_uEd.grupoId === g.id ? 'on' : ''}" ${ro} onclick="_uEd.grupoId='${g.id}';marcarOc('u-grupo', this)"><span class="po-ic" style="--c:${g.cor}"><i class="fa-solid ${g.icone}"></i></span><span><b>${esc(g.nome)}</b><small>${esc(g.descricao || '')}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`).join('')}</div>
      <div class="sec-t"><i class="fa-solid fa-sitemap"></i>Setores visíveis</div>
      <div id="u-setores"></div>
      <div class="sec-t"><i class="fa-solid fa-toggle-on"></i>Situação</div>
      <div class="casc">
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-user-check"></i><div>Usuário ativo<div class="s">inativo não consegue entrar</div></div></div>${chave(_uEd.ativo, '_uEd.ativo=!_uEd.ativo;this.classList.toggle(\'on\')', !editar || eu)}</div>
        ${souAdmin ? `<div class="casc-r"><div class="lft"><i class="fa-solid fa-crown"></i><div>Administrador<div class="s">acesso total, independente do grupo${DADOS.usuarios[u.login]?.grupo === 'admin' ? ' · admin do Dados LAMIC é sempre admin' : ''}</div></div></div>${chave(_uEd.admin, '_uEd.admin=!_uEd.admin;this.classList.toggle(\'on\')', eu || DADOS.usuarios[u.login]?.grupo === 'admin')}</div>` : ''}
      </div>
    </div>`,
    rodape: `      <button class="btn" onclick="fecharGaveta()">${editar ? 'Cancelar' : 'Fechar'}</button>
      ${editar ? `<button class="btn pri" onclick="gravarUsuario()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>` : ''}`
  });
  desenharSetoresUsuario(editar);
}

function desenharSetoresUsuario(editar = true) {
  const todos = _uEd.setores === 'todos';
  const setores = lista(ESTADO.setores, porNome);
  document.getElementById('u-setores').innerHTML = `
    <div class="chips sem-pad"><button type="button" class="chip ${todos ? 'on' : ''}" ${editar ? '' : 'disabled'} onclick="_uEd.setores=_uEd.setores==='todos'?[]:'todos';desenharSetoresUsuario()"><i class="fa-solid fa-layer-group"></i>Todos os setores</button></div>
    ${todos ? '' : `<div class="chips sem-pad" style="margin-top:8px">${setores.map(s => `<button type="button" class="chip ${_uEd.setores.includes(s.id) ? 'on' : ''}" ${editar ? '' : 'disabled'} onclick="alternarSetorUsuario('${s.id}')"><i class="fa-solid ${s.icone}" style="color:${s.cor}"></i>${esc(s.nome)}</button>`).join('')}</div>
      <div class="hint" style="margin-top:6px">${_uEd.setores.length} setor(es) selecionado(s)</div>`}`;
}
function alternarSetorUsuario(id) {
  const i = _uEd.setores.indexOf(id);
  i >= 0 ? _uEd.setores.splice(i, 1) : _uEd.setores.push(id);
  desenharSetoresUsuario();
}

async function gravarUsuario() {
  if (Array.isArray(_uEd.setores) && !_uEd.setores.length) return toast('Escolha ao menos um setor ou "Todos"', 'erro');
  const d = DADOS.usuarios[_uEd.login] || {};
  const dados = { grupoId: _uEd.grupoId, setores: _uEd.setores, ativo: _uEd.ativo, nome: d.nome || _uEd.login, cargo: d.cargo || '' };
  if (usuarioAtual()?.admin) dados.admin = _uEd.admin || d.grupo === 'admin';
  if (_uEd.liberar) {
    // 1) libera no Dados (comercial_acesso/{login}); 2) cria ou reativa o registro do Comercial
    try { await gravarAcessoDados(_uEd.login, true); } catch (e) { return toast('Sem permissão para liberar acesso: ' + (e.message || e), 'erro'); }
    DADOS.acessoIndividual[_uEd.login] = true;
    dados.ativo = true;
  }
  // Desativar quem foi liberado individualmente também tira a liberação no Dados (o banco deixa de aceitar)
  if (!_uEd.liberar && !dados.ativo && DADOS.acessoIndividual[_uEd.login]) {
    await gravarAcessoDados(_uEd.login, false).catch(() => {});
    delete DADOS.acessoIndividual[_uEd.login];
  }
  if (_uEd.registroId) {
    await DB.mesclar(`${CAMINHOS.usuarios}/${_uEd.registroId}`, { ...dados, login: _uEd.login });
    registrar('usuarios', `Acesso liberado para ${_uEd.login}`);
  } else if (_uEd.novo) {
    const id = DB.novaChave(CAMINHOS.usuarios);
    await DB.gravar(`${CAMINHOS.usuarios}/${id}`, { ...dados, usuario: _uEd.login, login: _uEd.login, admin: !!dados.admin, criadoEm: Date.now(), ultimoAcesso: null });
    registrar('usuarios', `Acesso liberado para ${_uEd.login}`);
  } else {
    await DB.mesclar(`${CAMINHOS.usuarios}/${_uEd.id}`, dados);
    registrar('usuarios', `Usuário ${_uEd.login} alterado`);
  }
  fecharGaveta();
  toast(`Usuário ${dados.nome} salvo`);
}

// ── Meu perfil ────────────────────────────────────────────────
function abrirPerfil() {
  const u = usuarioAtual();
  if (!u) return;
  abrirGaveta({
    sobre: '@' + (u.login || u.usuario), titulo: u.nome,
    meta: `${tagGrupo(u.grupoId)}${u.admin ? '<span class="tag" style="color:var(--amber)"><i class="fa-solid fa-crown"></i>Administrador</span>' : ''}`,
    corpo: `<div class="form-col">
      <div class="alert x"><i class="fa-solid fa-circle-info"></i><div>Nome, cargo e senha são do Dados LAMIC: altere por lá.</div></div>
      <div class="sec-t"><i class="fa-solid fa-circle-info"></i>Acesso</div>
      <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-sitemap"></i><div>Setores visíveis<div class="s">${esc(resumoSetores(u))}</div></div></div></div>
      <div class="casc-r"><div class="lft"><i class="fa-solid fa-clock"></i><div>Último acesso<div class="s">${dataHora(u.ultimoAcesso)}</div></div></div></div></div>
    </div>`,
    rodape: `<button class="btn perigo-txt" style="margin-right:auto" onclick="sair()"><i class="fa-solid fa-arrow-right-from-bracket"></i>Sair</button>
      <button class="btn" onclick="fecharGaveta()">Fechar</button>`
  });
}
