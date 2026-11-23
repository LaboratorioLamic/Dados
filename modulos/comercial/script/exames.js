// ═══════════════════════════════════════════════════════════════
// exames.js — Lista de exames — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

const EX_POR_PAG = 50;
const exF = { q: '', status: '', pag: 1, ordem: 'mn', dir: 1, inativos: false };

const tagSetor = id => {
  const s = ESTADO.setores[id];
  return s ? `<span class="tag"><i class="fa-solid ${s.icone}" style="color:${s.cor}"></i>${esc(s.nome)}</span>`
    : '<span class="warn-i"><i class="fa-solid fa-triangle-exclamation"></i>sem setor</span>';
};
// Filtro "Controle interno" da lista de exames
const CTRL_EXAME = {
  vsis: { rotulo: 'Valor não atualizado', icone: 'fa-clock-rotate-left', cor: 'var(--red)', desc: 'Valor pendente de atualização no sistema', f: e => valorDesatualizado(e.id) },
  sist: { rotulo: 'Fora do sistema',      icone: 'fa-plug-circle-xmark',       cor: 'var(--text-muted)', desc: 'Mnemônico não existe no catálogo',     f: e => !!e.foraDoSistema },
  efet: { rotulo: 'Não efetua na Particular', icone: 'fa-ban',                 cor: 'var(--text-muted)', desc: 'Efetua = N na tabela Particular do Unilab', f: e => !!e.inativoNoSistema },
  nneg: { rotulo: 'Apoio não negociado',  icone: 'fa-handshake-slash',         cor: 'var(--red)',        desc: 'Exame de apoio sem valor negociado',   f: e => e.origem === 'apoio' && !negociadoExame(e) },
  scus: { rotulo: 'Sem custo',            icone: 'fa-circle-question',         cor: 'var(--amber)',      desc: 'Custo do teste não informado (margem desconhecida)', f: e => calcular(e).semCusto },
  rasc: { rotulo: 'No meu rascunho',     icone: 'fa-pen-to-square',           cor: 'var(--cyan)',       desc: 'Preço alterado na ficha, ainda não enviado', f: e => emRascExame(e.id) }
};
const iconesExame = e =>
  (e.origem !== 'apoio' ? '' : negociadoExame(e) ? ' <i class="fa-solid fa-handshake flag" style="color:var(--green)" title="Apoio com negociação"></i>'
    : ' <i class="fa-solid fa-handshake-slash flag" style="color:var(--red)" title="Apoio sem valor negociado"></i>') +
  (valorDesatualizado(e.id) ? ' <i class="fa-solid fa-clock-rotate-left flag" style="color:var(--red)" title="Valor não atualizado no sistema"></i>' : '') +
  (e.foraDoSistema ? ' <i class="fa-solid fa-plug-circle-xmark flag" style="color:var(--text-muted)" title="Fora do sistema"></i>' : '') +
  (emRascExame(e.id) ? ' <i class="fa-solid fa-pen-to-square flag" style="color:var(--cyan)" title="Preço no seu rascunho, ainda não enviado"></i>' : '');

function opcoesSetorPop(rotuloTodos, extras = [], contar = null) {
  const n = id => contar ? contar(id) : null;
  return [
    { valor: '', rotulo: rotuloTodos, icone: 'fa-layer-group', desc: 'Sem filtro de setor', qtd: contar ? contar('') : null },
    ...extras,
    ...Object.keys(CATEGORIAS).flatMap(cat => lista(ESTADO.setores, porNome).filter(s => s.categoria === cat)
      .map(s => ({ valor: s.id, rotulo: s.nome, icone: s.icone, cor: s.cor, qtd: n(s.id), grupo: CATEGORIAS[cat].nome })))
  ];
}

function renderExames() {
  const el = document.getElementById('s-exames');
  el.innerHTML = `
    <div class="h-row"><div><h2>Exames</h2><p>Clique em um exame para ver a composição do preço</p></div>
      <div style="display:flex;gap:8px">${pode('exames', 'editar') ? `<button class="btn" onclick="abrirImportExames()"><i class="fa-solid fa-file-csv"></i>Importar CSV</button>` : ''}${pode('exames', 'editar') || pode('tabelas', 'editar') ? `<button class="btn" id="ex-rasc" onclick="abrirRascunhoExames()" title="Rascunho de exames"><i class="fa-solid fa-pen-to-square"></i>Rascunho<b class="gx-n" id="ex-rasc-n" hidden></b></button>` : ''}${pode('tabelas') ? `<button class="btn" onclick="tabAba='propostas';irPara('tabelas')"><i class="fa-solid fa-stamp"></i>Propostas</button>` : ''}${pode('exames', 'criar') ? `<button class="btn pri" onclick="abrirDadosExame()"><i class="fa-solid fa-plus"></i>Novo exame</button>` : ''}</div></div>
    <div class="subnav" data-grupo="exst">
      <button data-p="ativos" class="${exF.inativos ? '' : 'on'}"><i class="fa-solid fa-play"></i>Ativos<span class="n-sub neutro" id="ex-n-ativos"></span></button>
      <button data-p="inativos" class="${exF.inativos ? 'on' : ''}"><i class="fa-solid fa-pause"></i>Inativos<span class="n-sub neutro" id="ex-n-inativos"></span></button>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="q-ex" value="${esc(exF.q)}" placeholder="Buscar mnemônico ou descrição…" oninput="exF.q=this.value;exF.pag=1;desenharExames()"></div>
        <div id="pop-exsetor"></div>
        <div id="pop-exorigem"></div>
        <div id="pop-exctrl"></div>
      </div>
      <div class="chips" id="ex-chips"></div>
      <div class="tbl-wrap" style="margin-top:10px"><table><thead id="ex-head"></thead><tbody id="ex-body"></tbody></table></div>
      <div class="foot" id="ex-foot"></div>
    </div>`;
  iniciarSubnav();
  SUBNAV_GANCHO.exst = p => { exF.inativos = p === 'inativos'; exF.pag = 1; exF.status = ''; renderExames(); };
  const vis = examesVisiveis().filter(e => exF.inativos ? e.ativo === false : e.ativo !== false);
  criarPop('pop-exsetor', {
    rotulo: 'Setor', titulo: 'Filtrar por setor', icone: 'fa-filter', busca: 'Buscar setor…', limpavel: true,
    opcoes: () => opcoesSetorPop('Todos os setores',
      [{ valor: '__sem', rotulo: 'Sem setor', icone: 'fa-triangle-exclamation', cor: 'var(--amber)', desc: 'Pendente de classificação', qtd: vis.filter(e => !ESTADO.setores[e.setorId]).length }],
      id => id ? vis.filter(e => e.setorId === id).length : vis.length),
    aoMudar: () => { exF.pag = 1; desenharExames(); }
  });
  criarPop('pop-exorigem', {
    rotulo: 'Origem', titulo: 'Onde o exame é feito', icone: 'fa-route', limpavel: true,
    opcoes: () => [
      { valor: '', rotulo: 'Todas', icone: 'fa-layer-group', desc: 'Internos e apoio', qtd: vis.length },
      { valor: 'interno', rotulo: 'Interno', icone: 'fa-microscope', cor: 'var(--green)', desc: 'Executado no LAMIC', qtd: vis.filter(e => e.origem !== 'apoio').length },
      { valor: 'apoio', rotulo: 'Apoio', icone: 'fa-truck-medical', cor: 'var(--cyan)', desc: 'Enviado a laboratório de apoio', qtd: vis.filter(e => e.origem === 'apoio').length }],
    aoMudar: () => { exF.pag = 1; desenharExames(); }
  });
  criarPop('pop-exctrl', {
    rotulo: 'Controle interno', titulo: 'Controle interno', icone: 'fa-clipboard-check', limpavel: true,
    opcoes: () => [
      { valor: '', rotulo: 'Todos', icone: 'fa-layer-group', desc: 'Sem filtro de controle', qtd: vis.length },
      ...Object.entries(CTRL_EXAME).map(([valor, o]) => ({ valor, rotulo: o.rotulo, icone: o.icone, cor: o.cor, desc: o.desc, qtd: vis.filter(o.f).length }))],
    aoMudar: () => { exF.pag = 1; desenharExames(); }
  });
  desenharExames();
  atualizarBotaoRascExames();
}

function linhasExames() {
  const fs = valorPop('pop-exsetor'), fo = valorPop('pop-exorigem'), fc = CTRL_EXAME[valorPop('pop-exctrl')]?.f;
  return examesVisiveis()
    .filter(e => (exF.inativos ? e.ativo === false : e.ativo !== false))
    .filter(e => fs === '__sem' ? !ESTADO.setores[e.setorId] : !fs || e.setorId === fs)
    .filter(e => !fo || (fo === 'apoio' ? e.origem === 'apoio' : e.origem !== 'apoio'))
    .filter(e => !fc || fc(e))
    .filter(e => contem(e.mn + ' ' + e.descricao, exF.q))
    .map(e => ({ e, c: calcular(e) }));
}

function desenharExames() {
  if (!document.getElementById('ex-body')) return;
  const todas = linhasExames();
  // contagem por status (antes do filtro de status)
  const cont = { '': todas.length };
  todas.forEach(({ c }) => { cont[c.status] = (cont[c.status] || 0) + 1; });
  const nInat = examesVisiveis().filter(e => e.ativo === false).length;
  document.getElementById('ex-n-ativos').textContent = num(examesVisiveis().length - nInat, 0);
  document.getElementById('ex-n-inativos').textContent = num(nInat, 0);
  document.getElementById('ex-chips').innerHTML =
    `<button class="chip ${!exF.status ? 'on' : ''}" onclick="exF.status='';exF.pag=1;desenharExames()"><i class="fa-solid fa-list"></i>Todos <b>${cont['']}</b></button>` +
    ['r', 'a', 'g', 'x', 'p'].filter(k => cont[k] || exF.status === k).map(k => `<button class="chip ${exF.status === k ? 'on' : ''}" onclick="exF.status='${k}';exF.pag=1;desenharExames()"><span class="d" style="background:${STATUS[k].cor}"></span>${STATUS[k].nome} <b>${cont[k] || 0}</b></button>`).join('');

  const linhas = todas.filter(({ c }) => !exF.status || c.status === exF.status);
  const val = {
    mn: x => x.e.mn.toUpperCase(), desc: x => normalizar(x.e.descricao), setor: x => normalizar(ESTADO.setores[x.e.setorId]?.nome || 'zzz'),
    custo: x => x.c.custo ?? -1, sug: x => x.c.sugerido ?? -1, preco: x => x.e.precoPraticado ?? -1, margem: x => x.c.margem ?? -9
  }[exF.ordem];
  linhas.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * exF.dir; });
  const n = Math.max(1, Math.ceil(linhas.length / EX_POR_PAG));
  if (exF.pag > n) exF.pag = n;
  const pagina = linhas.slice((exF.pag - 1) * EX_POR_PAG, exF.pag * EX_POR_PAG);

  const th = (r, k, cls) => thOrdem(r, k, exF.ordem, exF.dir, 'ordenarExames', cls), edita = pode('exames', 'editar');
  document.getElementById('ex-head').innerHTML = `<tr>${th('MN', 'mn')}${th('Descrição', 'desc')}${th('Setor', 'setor')}${th('Custo total', 'custo', 'num')}${th('Sugerido', 'sug', 'num')}${th('Praticado', 'preco', 'num')}${th('Margem', 'margem', 'num')}<th>Status</th>${edita ? '<th></th>' : ''}</tr>`;
  document.getElementById('ex-body').innerHTML = pagina.map(({ e, c }) => `
    <tr class="row" onclick="abrirFicha('${e.id}')">
      <td class="mn">${esc(e.mn)}${iconesExame(e)}</td>
      <td class="desc" title="${esc(e.descricao)}">${esc(e.descricao)}</td>
      <td>${tagSetor(e.setorId)}</td>
      <td class="num">${celulaCusto(c)}</td>
      <td class="num">${c.sugerido ? fmt(c.sugerido) : '—'}</td>
      <td class="num">${e.precoPraticado ? fmt(e.precoPraticado) : '—'}${pendenciasExame(e, c).includes('div') ? ` <i class="fa-solid fa-code-compare flag" style="color:var(--amber)" title="Sistema: ${fmt(e.precoSistema)}"></i>` : ''}</td>
      <td class="num" style="color:${c.status === 'r' ? 'var(--red)' : 'inherit'}">${c.margem != null ? pct(c.margem) : '—'}</td>
      <td>${tagStatus(c.status)}</td>
      ${edita ? `<td class="acts">${botaoAtivoExame(e)}</td>` : ''}</tr>`).join('')
    || `<tr><td colspan="9">${Object.keys(ESTADO.exames).length ? vazio(exF.inativos ? 'fa-pause' : 'fa-magnifying-glass', exF.inativos && !nInat ? 'Nenhum exame inativo' : 'Nenhum exame encontrado com esses filtros')
      : vazio('fa-file-import', `<b>Nenhum exame cadastrado</b><br>Faça a migração da planilha em <a href="#" onclick="irPara('importar');return false">Importar / Exportar</a>.`)}</td></tr>`;
  document.getElementById('ex-foot').innerHTML = paginacao(linhas.length, exF.pag, EX_POR_PAG, 'paginaExames');
}

function paginaExames(p) { exF.pag = p; desenharExames(); document.getElementById('s-exames').scrollIntoView({ block: 'start' }); }
function ordenarExames(k) { exF.dir = exF.ordem === k ? -exF.dir : 1; exF.ordem = k; desenharExames(); }

// ── Ativar / inativar ─────────────────────────────────────────
// Botão pause (exame ativo) ou play (exame inativo)
const botaoAtivoExame = e => e.ativo === false
  ? `<button class="bt-play" title="Ativar exame" onclick="event.stopPropagation();alternarAtivoExame('${e.id}')"><i class="fa-solid fa-play"></i></button>`
  : `<button class="bt-pause" title="Inativar exame" onclick="event.stopPropagation();alternarAtivoExame('${e.id}')"><i class="fa-solid fa-pause"></i></button>`;

async function alternarAtivoExame(id) {
  const e = ESTADO.exames[id];
  if (!e || !pode('exames', 'editar')) return;
  const ativar = e.ativo === false;
  const efeitos = ativar
    ? ['Volta para a lista de exames ativos', 'Volta a aparecer nas tabelas de preço, simulador e PDFs', 'Preços e custos continuam como estavam']
    : ['Sai da lista de exames ativos', 'Deixa de aparecer nas tabelas de preço, simulador e PDFs', 'Preços, custos e histórico ficam guardados'];
  const ok = await confirmar({
    titulo: ativar ? 'Ativar exame?' : 'Inativar exame?', icone: ativar ? 'fa-play' : 'fa-pause', tom: ativar ? 'play' : 'pausa', botao: ativar ? 'Ativar' : 'Inativar',
    texto: `<span class="modal-ex"><b>${esc(e.mn)}</b><span>${esc(e.descricao || '')}</span></span>
      <span class="modal-li">${efeitos.map(t => `<span><i class="fa-solid ${ativar ? 'fa-circle-check' : 'fa-circle-minus'}"></i>${t}</span>`).join('')}</span>
      <small>${ativar ? 'Pode ser inativado de novo a qualquer momento.' : 'Pode ser reativado a qualquer momento na aba Inativos.'}</small>`
  });
  if (!ok) return;
  const dados = { ativo: ativar, atualizadoEm: DB.agora(), atualizadoPor: usuarioAtual().nome };
  await DB.mesclar(`${CAMINHOS.exames}/${id}`, dados);
  Object.assign(e, { ...dados, atualizadoEm: Date.now() });
  registrar('exames', `Exame ${e.mn} ${ativar ? 'ativado' : 'inativado'}`);
  toast(`${e.mn} ${ativar ? 'ativado' : 'inativado'}`);
  if (typeof _fxId !== 'undefined' && _fxId === id && document.getElementById('fx-rodape')) abrirFicha(id);
  renderTela();
}
