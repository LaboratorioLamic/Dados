// ═══════════════════════════════════════════════════════════════
// instrucoes.js — Catálogo do exame (nome, material, prazo) e
// instruções com checklist de publicação (Site, Unilab, Revisado) e anexos
// ═══════════════════════════════════════════════════════════════
//
// Planilha "BD - TABELAS CH PARTICULARES", aba Exames (CSV):
//   A Mnemônico · B Material Biológico · C Nome do Exame · D Prazo (dias) · E Prazo (texto)
//   H Site · I Unilab · J Revisado · K Mnemônico (espelho) · L Instrução
//   (A–E e H–L são tabelas independentes: o vínculo é pelo mnemônico)
// A instrução é editada em campos por categoria (Jejum, Orientações…): ver secoes.js

const CHECKS = {
  site:     { nome: 'Site',     icone: 'fa-globe',       acao: 'editar' },
  unilab:   { nome: 'Unilab',   icone: 'fa-desktop',     acao: 'editar' },
  revisado: { nome: 'Revisado', icone: 'fa-user-check',  acao: 'aprovar' }
};
const INS_POR_PAG = 50;
// Subabas Ativos / Inativos seguem o cadastro do exame (exames/{chave}/ativo); item do catálogo sem exame conta como ativo
const insInativo = r => ESTADO.exames[r.id]?.ativo === false;
const catalogoAba = () => lista(ESTADO.catalogo).filter(r => insInativo(r) === ins.inativos);
const ins = { inativos: false, q: '', filtro: '', pag: 1, imp: { passo: 0, texto: null, nome: '', analise: null, erro: '' } };

// ── Anexos (links clicáveis no site L2L) ──────────────────────
// catalogo/{chave}/anexos: [{ nome, url }]. O L2L mostra só o que está neste campo;
// links escritos no texto (<a href="…">nome</a>, formato da planilha) são convertidos.
const RE_LINK_TEXTO = /<a\s[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const temLinkNoTexto = t => /<a\s[^>]*?href\s*=/i.test(t || '');
const urlValida = u => /^https?:\/\/\S+$/i.test(String(u ?? '').trim());
const anexosDe = r => Object.values(r?.anexos || {}).filter(a => a && a.url);
const linkAnexo = a => `<a href="${urlValida(a.url) ? esc(a.url) : '#'}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-paperclip"></i>${esc(a.nome || 'Anexo')}</a>`;

// Tira os links do texto (e o título "Anexos" que sobra no fim) → { texto, anexos }
function extrairAnexos(texto) {
  const anexos = [];
  let t = String(texto || '').replace(RE_LINK_TEXTO, (m, q, url, nome) => {
    url = url.trim().replace(/&amp;/g, '&');
    nome = nome.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (urlValida(url) && !anexos.some(a => a.url === url)) anexos.push({ nome: nome || 'Anexo', url });
    return '';
  });
  if (anexos.length) t = t.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trimEnd().replace(/(^|\n)[ \t]*(?:🔗[ \t]*)?anexos?[ \t]*:?[ \t]*$/i, '').trim();
  return { texto: t, anexos };
}
// O mesmo, campo a campo → { secoes, anexos }
function extrairAnexosSecoes(secoes) {
  const s = {};
  let anexos = [];
  Object.entries(secoes || {}).forEach(([k, t]) => { const x = extrairAnexos(t); s[k] = x.texto; anexos = juntarAnexos(anexos, x.anexos); });
  return { secoes: limparSecoes(s), anexos };
}
const juntarAnexos = (atuais, novos) => [...atuais, ...novos.filter(n => !atuais.some(a => a.url === n.url))];

// ── Importação ────────────────────────────────────────────────
function analisarCatalogo(texto) {
  const linhas = lerCSV(texto);
  if (normalizar(linhas[0]?.[0]) !== 'mnemonico') throw new Error('Arquivo inválido: a coluna A da primeira linha deve ser "Mnemônico" (aba Exames).');
  const cat = {};
  const reg = mn => (cat[chaveExame(mn)] ??= { mn });
  linhas.slice(1).forEach(l => {
    const mn = String(l[0] || '').trim();
    if (mn && normalizar(mn) !== 'mnemonico') {
      const r = reg(mn), dias = parseInt(l[3], 10);
      Object.assign(r, { cadastro: true, nome: String(l[2] || '').trim(), material: String(l[1] || '').trim(), prazoDias: isNaN(dias) ? null : dias, prazo: String(l[4] || '').trim() || null });
    }
    const mn2 = String(l[10] || '').trim();
    if (mn2 && normalizar(mn2) !== 'mnemonico') {
      const r = reg(mn2), x = extrairAnexos(String(l[11] || '').trim());   // links do texto viram anexos
      Object.assign(r, { ...dadosInstrucao(x.texto), anexos: x.anexos.length ? x.anexos : null, site: verdadeiro(l[7]), unilab: verdadeiro(l[8]), revisado: verdadeiro(l[9]) });
    }
  });
  const ls = Object.values(cat);
  if (!ls.length) throw new Error('Nenhum exame encontrado.');
  const exames = new Set(Object.values(ESTADO.exames).map(e => e.mn.toUpperCase()));
  return { cat, resumo: {
    total: ls.length, comCadastro: ls.filter(r => r.cadastro).length, comInstrucao: ls.filter(r => r.instrucao).length, comAnexos: ls.filter(r => r.anexos).length,
    site: ls.filter(r => r.site).length, unilab: ls.filter(r => r.unilab).length, revisado: ls.filter(r => r.revisado).length,
    soInstrucao: ls.filter(r => !r.cadastro).length, semInstrucao: ls.filter(r => r.cadastro && !r.instrucao).length,
    naBase: ls.filter(r => exames.has(r.mn.toUpperCase())).length,
    precosForaDoCatalogo: [...exames].filter(m => !cat[chaveExame(m)]).length
  } };
}

async function gravarCatalogo(cat) {
  const u = usuarioAtual(), agora = Date.now(), dados = {};
  Object.entries(cat).forEach(([k, r]) => {
    const x = { ...r, atualizadoEm: agora, atualizadoPor: u.nome };
    // anexos cadastrados no sistema continuam quando a planilha não traz links
    if (!x.anexos && anexosDe(ESTADO.catalogo?.[k]).length) x.anexos = anexosDe(ESTADO.catalogo[k]);
    Object.keys(x).forEach(c => (x[c] === null || x[c] === undefined) && delete x[c]);
    dados[k] = x;
  });
  await DB.gravar('catalogo', dados);
  registrar('catalogo', `Catálogo importado: ${Object.keys(cat).length} exames`, { arquivo: ins.imp.nome });
}

// ── Tela ──────────────────────────────────────────────────────
async function renderInstrucoes() {
  const el = document.getElementById('s-instrucoes');
  if (!ESTADO.catalogo) {
    el.innerHTML = `<div class="card">${vazio('fa-circle-notch fa-spin', 'Carregando catálogo…')}</div>`;
    await garantirCatalogo();
    if (telaAtual !== 'instrucoes') return;
  }
  const cat = catalogoAba(), n = cat.length, nInat = lista(ESTADO.catalogo).filter(insInativo).length;
  const qtd = k => cat.filter(r => r[k]).length;
  const comLink = pode('instrucoes', 'editar') ? cat.filter(r => temLinkNoTexto(r.instrucao)).length : 0;
  const aMigrar = pode('instrucoes', 'editar') ? pendentesMigracao().length : 0;
  const barra = (rot, v, ic, cor) => `<div class="prog"><div class="prog-l"><i class="fa-solid ${ic}" style="color:${cor}"></i>${rot}<b>${num(v, 0)} / ${num(n, 0)}</b><span>${n ? pct(v / n, 0) : '—'}</span></div><div class="barra"><div style="width:${n ? v / n * 100 : 0}%;background:${cor}"></div></div></div>`;
  el.innerHTML = `
    <div class="h-row"><div><h2>Instruções</h2><p>Catálogo do exame (nome, material, prazo) e instruções de coleta com checklist de publicação</p></div>
      ${pode('instrucoes', 'importar') ? `<button class="btn" onclick="ins.imp.passo=1;ins.imp.erro='';renderInstrucoes()"><i class="fa-solid fa-file-import"></i>Importar planilha</button>` : ''}</div>
    ${ins.imp.passo ? `<div class="card" style="margin-bottom:14px" id="ins-imp">${htmlImportCatalogo()}</div>` : ''}
    ${aMigrar ? `<div class="alert x" style="align-items:center"><i class="fa-solid fa-table-list"></i><div style="flex:1"><b>${num(aMigrar, 0)} instrução(ões) ainda em texto único.</b> A migração separa cada uma nos campos (Jejum, Orientações, Conservação…) pelos títulos do texto.</div>
      <button class="btn sm" onclick="migrarSecoes()"><i class="fa-solid fa-wand-magic-sparkles"></i>Migrar para campos</button></div>` : ''}
    ${comLink && !aMigrar ? `<div class="alert a" style="align-items:center"><i class="fa-solid fa-paperclip"></i><div style="flex:1"><b>${comLink} instrução(ões) com link escrito no texto.</b> O site dos apoiados (L2L) só mostra os links cadastrados no campo Anexos.</div>
      <button class="btn sm" onclick="converterLinksEmAnexos()"><i class="fa-solid fa-wand-magic-sparkles"></i>Converter em anexos</button></div>` : ''}
    <div class="subnav" data-grupo="insst">
      <button data-p="ativos" class="${ins.inativos ? '' : 'on'}"><i class="fa-solid fa-play"></i>Ativos<span class="n-sub neutro">${num(Object.keys(ESTADO.catalogo).length - nInat, 0)}</span></button>
      <button data-p="inativos" class="${ins.inativos ? 'on' : ''}"><i class="fa-solid fa-pause"></i>Inativos<span class="n-sub neutro">${num(nInat, 0)}</span></button>
    </div>
    ${n ? `<div class="card progs">
      ${barra('Com instrução', qtd('instrucao'), 'fa-file-lines', 'var(--cyan)')}
      ${barra('Revisados', qtd('revisado'), CHECKS.revisado.icone, 'var(--green)')}
      ${barra('Publicados no site', qtd('site'), CHECKS.site.icone, '#6366f1')}
      ${barra('Publicados no Unilab', qtd('unilab'), CHECKS.unilab.icone, 'var(--amber)')}
    </div>` : ''}
    <div class="card" style="margin-top:14px">
      <div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="q-ins" value="${esc(ins.q)}" placeholder="Buscar mnemônico, nome ou material…" oninput="ins.q=this.value;ins.pag=1;desenharInstrucoes()"></div></div>
      <div class="chips" id="ins-chips"></div>
      <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>MN</th><th>Nome do exame</th><th>Material</th><th>Prazo</th>${Object.values(CHECKS).map(c => `<th style="text-align:center" title="${c.nome}">${c.nome}</th>`).join('')}<th></th></tr></thead><tbody id="ins-body"></tbody></table></div>
      <div class="foot" id="ins-foot"></div>
    </div>`;
  iniciarSubnav();
  SUBNAV_GANCHO.insst = p => { ins.inativos = p === 'inativos'; ins.pag = 1; ins.filtro = ''; renderInstrucoes(); };
  desenharInstrucoes();
}

const FILTROS_INS = {
  semins:  { nome: 'Sem instrução',  f: r => !r.instrucao },
  naorev:  { nome: 'Não revisado',   f: r => r.instrucao && !r.revisado },
  anexo:   { nome: 'Com anexos',     f: r => anexosDe(r).length },
  semsite: { nome: 'Falta no site',  f: r => r.revisado && !r.site },
  semuni:  { nome: 'Falta no Unilab', f: r => r.revisado && !r.unilab },
  semcad:  { nome: 'Sem cadastro',   f: r => !r.cadastro },
  semnome: { nome: 'Sem nome',       f: r => r.cadastro && !r.nome }
};

function desenharInstrucoes() {
  const body = document.getElementById('ins-body');
  if (!body) return;
  const todos = catalogoAba().filter(r => contem(`${r.mn} ${r.nome || ''} ${r.material || ''}`, ins.q));
  document.getElementById('ins-chips').innerHTML = `<button class="chip ${!ins.filtro ? 'on' : ''}" onclick="ins.filtro='';ins.pag=1;desenharInstrucoes()"><i class="fa-solid fa-list"></i>Todos <b>${todos.length}</b></button>` +
    Object.entries(FILTROS_INS).map(([k, x]) => `<button class="chip ${ins.filtro === k ? 'on' : ''}" onclick="ins.filtro='${k}';ins.pag=1;desenharInstrucoes()">${x.nome} <b>${todos.filter(x.f).length}</b></button>`).join('');
  const ls = todos.filter(r => !ins.filtro || FILTROS_INS[ins.filtro].f(r)).sort((a, b) => a.mn.localeCompare(b.mn));
  const n = Math.max(1, Math.ceil(ls.length / INS_POR_PAG)); if (ins.pag > n) ins.pag = n;
  body.innerHTML = ls.slice((ins.pag - 1) * INS_POR_PAG, ins.pag * INS_POR_PAG).map(r => `
    <tr class="row" onclick="abrirInstrucao('${r.id}')">
      <td class="mn">${esc(r.mn)}</td><td class="desc" title="${esc(r.nome || '')}">${r.nome ? esc(r.nome) : `<span class="warn-i"><i class="fa-solid fa-triangle-exclamation"></i>${r.cadastro ? 'sem nome' : 'sem cadastro'}</span>`}</td>
      <td>${r.material ? `<span class="tag"><i class="fa-solid fa-vial"></i>${esc(r.material)}</span>` : '—'}</td><td>${esc(prazoDe(r) || '—')}</td>
      ${Object.entries(CHECKS).map(([k, c]) => `<td style="text-align:center"><i class="fa-solid ${c.icone} ck-ic ${r[k] ? 'on' : ''}" title="${c.nome}: ${r[k] ? `sim${r[k + 'Por'] ? ' · ' + esc(r[k + 'Por']) : ''}` : 'não'}"></i></td>`).join('')}
      <td>${r.instrucao ? '<i class="fa-solid fa-file-lines muted" title="Tem instrução"></i>' : ''}${anexosDe(r).length ? ` <i class="fa-solid fa-paperclip muted" title="${anexosDe(r).length} anexo(s)"></i>` : ''}</td></tr>`).join('')
    || `<tr><td colspan="8">${Object.keys(ESTADO.catalogo).length ? vazio(ins.inativos && !catalogoAba().length ? 'fa-pause' : 'fa-magnifying-glass', ins.inativos && !catalogoAba().length ? 'Nenhum exame inativo' : 'Nada encontrado') : vazio('fa-book-medical', '<b>Catálogo vazio</b><br>Importe a planilha de instruções (aba Exames, .csv).')}</td></tr>`;
  document.getElementById('ins-foot').innerHTML = paginacao(ls.length, ins.pag, INS_POR_PAG, 'paginaInstrucoes');
}
function paginaInstrucoes(p) { ins.pag = p; desenharInstrucoes(); }

// ── Importação (cartão) ───────────────────────────────────────
function htmlImportCatalogo() {
  const im = ins.imp;
  const cab = `<div class="sec-card-h"><span class="tc-ic" style="--c:#1d7044"><i class="fa-solid fa-file-excel"></i></span><div><h3>Importar catálogo e instruções</h3><div class="sub">Planilha "BD - TABELAS CH PARTICULARES", aba Exames → Arquivo → Fazer download → .csv</div></div>
    <div class="rt"><button class="btn sm" onclick="ins.imp={passo:0};renderInstrucoes()"><i class="fa-solid fa-xmark"></i></button></div></div>`;
  if (im.passo === 1) return cab + `<div class="wz-body">
      <label class="drop ${im.nome ? 'ok' : ''}" for="ins-arq"><input type="file" id="ins-arq" accept=".csv,text/csv" onchange="lerArquivoCatalogo(this)"><i class="fa-solid ${im.nome ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i><b>Aba Exames (.csv)</b><div class="drop-s">${im.nome ? esc(im.nome) : 'Clique para escolher'}</div></label>
      ${im.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(im.erro)}</div></div>` : ''}</div>
    <div class="wz-f"><span class="muted" style="font-size:12px">Nada é gravado nesta etapa</span><button class="btn pri" ${im.texto ? '' : 'disabled'} onclick="analisarArquivoCatalogo()">Analisar<i class="fa-solid fa-arrow-right"></i></button></div>`;
  if (im.passo === 2) {
    const r = im.analise.resumo, atual = Object.keys(ESTADO.catalogo || {}).length;
    const kp = (ic, cor, rot, v, s = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}" style="color:${cor}"></i>${rot}</div><div class="v">${num(v, 0)}</div>${s ? `<div class="d muted">${s}</div>` : ''}</div>`;
    return cab + `<div class="wz-body"><div class="sumgrid">
        ${kp('fa-list', 'var(--text-muted)', 'Exames', r.total, `${r.comCadastro} com cadastro (A–E)`)}
        ${kp('fa-file-lines', 'var(--cyan)', 'Com instrução', r.comInstrucao, `${r.semInstrucao} cadastrados sem instrução`)}
        ${kp('fa-paperclip', 'var(--cyan)', 'Com anexos', r.comAnexos, 'links do texto viram anexos')}
        ${kp('fa-user-check', 'var(--green)', 'Revisados', r.revisado)}
        ${kp('fa-globe', '#6366f1', 'No site', r.site)}
        ${kp('fa-desktop', 'var(--amber)', 'No Unilab', r.unilab)}
        ${kp('fa-link', 'var(--green)', 'Na base de preços', r.naBase)}
        ${kp('fa-triangle-exclamation', 'var(--amber)', 'Só instrução', r.soInstrucao, 'sem cadastro em A–E')}
        ${kp('fa-plug-circle-xmark', 'var(--red)', 'Preços fora do catálogo', r.precosForaDoCatalogo, 'exames com preço sem cadastro')}
      </div>
      <div class="alert ${atual ? 'a' : 'x'}"><i class="fa-solid fa-circle-info"></i><div>${atual ? `O catálogo atual (${num(atual, 0)} exames) será <b>substituído</b>, inclusive checklists marcados no sistema.` : 'Primeira importação do catálogo.'}</div></div></div>
      <div class="wz-f"><button class="btn" onclick="ins.imp.passo=1;renderInstrucoes()"><i class="fa-solid fa-arrow-left"></i>Voltar</button><button class="btn pri" onclick="confirmarCatalogo()"><i class="fa-solid fa-check"></i>Gravar catálogo</button></div>`;
  }
  return cab + `<div class="wz-body"><div class="done-box"><i class="fa-solid fa-circle-check"></i><h3>Catálogo importado</h3><p>${esc(im.resultado || '')}</p></div></div>`;
}

function lerArquivoCatalogo(input) {
  const f = input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { ins.imp.texto = rd.result; ins.imp.nome = f.name; ins.imp.erro = ''; renderInstrucoes(); };
  rd.readAsText(f, 'UTF-8');
}
function analisarArquivoCatalogo() {
  try { ins.imp.analise = analisarCatalogo(ins.imp.texto); ins.imp.passo = 2; ins.imp.erro = ''; }
  catch (e) { ins.imp.erro = e.message; }
  renderInstrucoes();
}
async function confirmarCatalogo() {
  const atual = Object.keys(ESTADO.catalogo || {}).length;
  if (atual && !(await confirmar({ titulo: 'Substituir o catálogo?', texto: `${num(atual, 0)} exames serão substituídos pelos da planilha.`, botao: 'Substituir', perigo: true }))) return;
  await gravarCatalogo(ins.imp.analise.cat);
  ins.imp.resultado = `${num(ins.imp.analise.resumo.total, 0)} exames gravados`;
  ins.imp.passo = 3; ins.imp.texto = null;
  renderInstrucoes();
}

// ── Editor (gaveta) ───────────────────────────────────────────
let _iEd = null;
async function abrirInstrucao(id, voltarFicha = null) {
  await garantirCatalogo();
  const r = ESTADO.catalogo[id] || { mn: ESTADO.exames[id]?.mn || id };
  const editar = pode('instrucoes', 'editar');
  _iEd = { id, voltar: voltarFicha, sec: secoesDe(r), checks: { site: !!r.site, unilab: !!r.unilab, revisado: !!r.revisado }, anexos: anexosDe(r).map(a => ({ nome: a.nome || '', url: a.url || '' })) };
  const quem = k => r[k] && r[`${k}Por`] ? `${esc(r[`${k}Por`])} · ${dataHora(r[`${k}Em`])}` : r[k] ? 'importado da planilha' : 'pendente';
  abrirGaveta({
    sobre: r.mn, titulo: r.nome || 'Instrução do exame',
    meta: `${r.material ? `<span class="tag"><i class="fa-solid fa-vial"></i>${esc(r.material)}</span>` : ''}${prazoDe(r) ? `<span class="tag"><i class="fa-solid fa-clock"></i>${esc(prazoDe(r))}</span>` : ''}`,
    corpo: `<div class="form-col">
      ${campo('in-nome', 'Nome do exame', r.nome || '', { tipo: 'text', desab: !editar })}
      <div class="fgrid sem-pad" style="grid-template-columns:2fr 1fr">
        ${campo('in-mat', 'Material biológico', r.material || '', { tipo: 'text', desab: !editar })}
        ${campo('in-dias', 'Prazo (dias)', diasPrazo(id) ?? '', { passo: '1', desab: !editar, dica: '0 = 24 Horas' })}
      </div>
      ${htmlSecoesIns(editar)}
      <div class="field"><label><i class="fa-solid fa-paperclip"></i>Anexos</label><div id="in-anexos"></div>
        <span class="hint">Links (Drive, PDF, formulário) que aparecem clicáveis para os laboratórios apoiados no L2L.</span></div>
      <div class="sec-t"><i class="fa-solid fa-list-check"></i>Publicação</div>
      <div class="casc">${Object.entries(CHECKS).map(([k, c]) => `<div class="casc-r"><div class="lft"><i class="fa-solid ${c.icone}"></i><div>${c.nome === 'Revisado' ? 'Revisado' : 'Publicado no ' + c.nome}<div class="s">${quem(k)}</div></div></div>${chave(_iEd.checks[k], `_iEd.checks['${k}']=!_iEd.checks['${k}'];this.classList.toggle('on')`, !pode('instrucoes', c.acao))}</div>`).join('')}</div>
    </div>`,
    rodape: `<button class="btn bt-pdf" title="Gerar PDF do exame" onclick="abrirPdfInstrucao()"><i class="fa-solid fa-file-pdf"></i></button>
      ${voltarFicha ? `<button class="btn" onclick="abrirFicha('${voltarFicha}','instrucoes')"><i class="fa-solid fa-arrow-left"></i>Ficha do exame</button>` : ''}
      <span style="margin-right:auto"></span><button class="btn" onclick="fecharGaveta()">${editar ? 'Cancelar' : 'Fechar'}</button>
      ${editar || pode('instrucoes', 'aprovar') ? `<button class="btn pri" onclick="gravarInstrucao()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>` : ''}`
  });
  desenharSecoesIns();
  desenharAnexosIns();
}

// ── Anexos no editor ──────────────────────────────────────────
function desenharAnexosIns() {
  const el = document.getElementById('in-anexos');
  if (!el) return;
  const ed = pode('instrucoes', 'editar');
  el.innerHTML = (_iEd.anexos.map((a, i) => `<div class="anx-r">
      <div class="inp"><span class="pre"><i class="fa-solid fa-tag"></i></span><input class="txt" value="${esc(a.nome)}" placeholder="Nome do anexo" ${ed ? '' : 'disabled'} oninput="_iEd.anexos[${i}].nome=this.value"></div>
      <div class="inp"><span class="pre"><i class="fa-solid fa-link"></i></span><input class="txt" value="${esc(a.url)}" placeholder="https://…" ${ed ? '' : 'disabled'} oninput="_iEd.anexos[${i}].url=this.value"></div>
      ${urlValida(a.url) ? `<a class="icon-btn" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="Abrir o link"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
      ${ed ? `<button type="button" class="icon-btn" title="Remover anexo" onclick="_iEd.anexos.splice(${i},1);desenharAnexosIns()"><i class="fa-solid fa-trash"></i></button>` : ''}</div>`).join('')
    || '<div class="muted" style="font-size:12.5px">Nenhum anexo cadastrado</div>')
    + (ed ? `<div class="anx-ac"><button type="button" class="btn sm" onclick="adicionarAnexoIns()"><i class="fa-solid fa-plus"></i>Adicionar anexo</button>
      <button type="button" class="btn sm" id="in-extrair" onclick="extrairAnexosDoTexto()"><i class="fa-solid fa-wand-magic-sparkles"></i>Converter links do texto</button></div>` : '');
  atualizarExtrairAnexos();
}
function adicionarAnexoIns() {
  _iEd.anexos.push({ nome: '', url: '' });
  desenharAnexosIns();
  [...document.querySelectorAll('#in-anexos .anx-r')].pop()?.querySelector('input')?.focus();
}
// O botão de converter só aparece enquanto o texto tem <a href="…">
function atualizarExtrairAnexos() {
  const b = document.getElementById('in-extrair');
  if (b) b.style.display = Object.values(_iEd.sec).some(temLinkNoTexto) ? '' : 'none';
}
function extrairAnexosDoTexto() {
  const x = extrairAnexosSecoes(_iEd.sec);
  if (!x.anexos.length) return toast('Nenhum link válido no texto', 'aviso');
  _iEd.sec = x.secoes;
  _iEd.anexos = juntarAnexos(_iEd.anexos.filter(a => a.nome || a.url), x.anexos);
  desenharSecoesIns();
  desenharAnexosIns();
  toast(`${x.anexos.length} link(s) do texto viraram anexos`);
}

// Todas as instruções com link no texto de uma vez
async function converterLinksEmAnexos() {
  const alvo = lista(ESTADO.catalogo).filter(r => temLinkNoTexto(r.instrucao));
  if (!alvo.length) return;
  const ok = await confirmar({ titulo: 'Converter links em anexos?', texto: `${alvo.length} instrução(ões): os links saem do texto e passam para o campo Anexos. O restante do texto não muda.`, botao: 'Converter' });
  if (!ok) return;
  const upd = {}, u = usuarioAtual();
  let n = 0;
  alvo.forEach(r => {
    const x = extrairAnexosSecoes(secoesDe(r));
    if (!x.anexos.length) return;
    const anexos = juntarAnexos(anexosDe(r), x.anexos);
    Object.assign(upd, { [`${r.id}/secoes`]: Object.keys(x.secoes).length ? x.secoes : null, [`${r.id}/instrucao`]: juntarSecoes(x.secoes) || null, [`${r.id}/anexos`]: anexos, [`${r.id}/atualizadoEm`]: DB.agora(), [`${r.id}/atualizadoPor`]: u.nome });
    n += x.anexos.length;
  });
  if (!n) return toast('Nenhum link válido encontrado', 'aviso');
  await DB.mesclar('catalogo', upd);
  registrar('catalogo', `Links do texto convertidos em anexos: ${n} em ${Object.keys(upd).length / 5} instruções`);
  toast(`${n} anexo(s) criados`);
}

async function gravarInstrucao() {
  const r = ESTADO.catalogo[_iEd.id] || {}, u = usuarioAtual(), dados = { mn: r.mn || ESTADO.exames[_iEd.id]?.mn || _iEd.id, cadastro: true };
  if (pode('instrucoes', 'editar')) {
    const anexos = _iEd.anexos.map(a => ({ nome: String(a.nome || '').trim(), url: String(a.url || '').trim() })).filter(a => a.nome || a.url);
    const ruim = anexos.find(a => !urlValida(a.url));
    if (ruim) return toast(`Anexo ${ruim.nome || 'sem nome'}: o link precisa começar com http:// ou https://`, 'erro');
    anexos.forEach(a => { a.nome ||= 'Anexo'; });
    const dias = parseInt(valorCampo('in-dias'), 10), sec = limparSecoes(_iEd.sec);
    Object.assign(dados, { nome: valorCampo('in-nome').trim() || null, material: valorCampo('in-mat').trim() || null, prazoDias: isNaN(dias) ? null : Math.max(0, dias),
      prazo: isNaN(dias) ? (r.prazo ?? null) : null, secoes: Object.keys(sec).length ? sec : null, instrucao: juntarSecoes(sec) || null, anexos: anexos.length ? anexos : null });
    // texto mudou → volta a precisar de revisão
    if (!mesmasSecoes(sec, secoesDe(r)) && r.revisado && _iEd.checks.revisado) _iEd.checks.revisado = false;
  }
  Object.entries(_iEd.checks).forEach(([k, v]) => {
    if (!pode('instrucoes', CHECKS[k].acao) || !!r[k] === v) return;
    Object.assign(dados, { [k]: v, [`${k}Por`]: v ? u.nome : null, [`${k}Em`]: v ? DB.agora() : null });
  });
  dados.atualizadoEm = DB.agora(); dados.atualizadoPor = u.nome;
  await DB.mesclar(`catalogo/${_iEd.id}`, dados);
  // o exame guarda o mesmo prazo em dias
  if (dados.prazoDias != null && ESTADO.exames[_iEd.id]) await DB.mesclar(`${CAMINHOS.exames}/${_iEd.id}`, { prazoDias: dados.prazoDias, prazo: null });
  toast(`Instrução de ${dados.mn} salva${dados.revisado === false && r.revisado ? ' · precisa de nova revisão' : ''}`);
  if (_iEd.voltar) abrirFicha(_iEd.voltar, 'instrucoes'); else fecharGaveta();
}

// Seção da ficha do exame
async function desenharCatalogoFicha(id) {
  const el = document.getElementById('fx-cat');
  if (!el) return;
  await garantirCatalogo();
  if (_fxId !== id || !document.getElementById('fx-cat')) return;
  const r = ESTADO.catalogo[id];
  el.innerHTML = !r ? `<div class="muted" style="font-size:12.5px"><i class="fa-solid fa-triangle-exclamation" style="color:var(--amber)"></i> Exame fora do catálogo de instruções. ${pode('instrucoes', 'editar') ? `<a href="#" onclick="abrirInstrucao('${id}','${id}');return false">Cadastrar</a>` : ''}</div>`
    : `<div class="casc">
      <div class="casc-r"><div class="lft"><i class="fa-solid fa-vial"></i><div>${esc(r.material || '—')}<div class="s">${esc(r.nome || '')}</div></div></div><span class="tag"><i class="fa-solid fa-clock"></i>${esc(prazoDe(r) || '—')}</span></div>
      <div class="casc-r"><div class="lft">${Object.entries(CHECKS).map(([k, c]) => `<span class="badge-s ${r[k] ? 'ok' : 'off'}"><i class="fa-solid ${r[k] ? 'fa-check' : c.icone}"></i>${c.nome}</span>`).join(' ')}</div>
        <span class="fx-ins-ac"><button class="btn sm bt-pdf" title="Gerar PDF do exame" onclick="abrirPdfInstrucao('${id}')"><i class="fa-solid fa-file-pdf"></i></button>
          <button class="btn sm" onclick="abrirInstrucao('${id}','${id}')"><i class="fa-solid fa-book-medical"></i>Abrir</button></span></div></div>
      ${Object.keys(secoesDe(r)).length ? htmlSecoesFicha(r) : '<div class="muted" style="font-size:12.5px;margin-top:8px">Sem instrução cadastrada.</div>'}
      ${anexosDe(r).length ? `<div class="fx-sc"><div class="fx-sc-c" style="--c:var(--cyan)"><div class="fx-sc-h"><span class="ic"><i class="fa-solid fa-paperclip"></i></span><b>Anexos</b></div>
        <div class="fx-sc-b on"><div class="anx-links">${anexosDe(r).map(linkAnexo).join('')}</div></div></div></div>` : ''}`;
}

// Seções da instrução em cartões compactos (texto em tópicos quando tem várias linhas)
function htmlSecoesFicha(r) {
  const sec = secoesDe(r);
  return `<div class="fx-sc">${Object.entries(sec).map(([k, t]) => {
    const S = SECOES[k], ls = String(t).split('\n').map(l => l.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean);
    const corpo = ls.length > 1 ? `<ul>${ls.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : `<p>${esc(ls[0] || '')}</p>`;
    return `<div class="fx-sc-c" style="--c:${S.cor}"><div class="fx-sc-h"><span class="ic"><i class="fa-solid ${S.icone}"></i></span><b>${S.nome}</b>
      <button type="button" title="Copiar ${S.nome}" onclick="copiarTexto(${esc(JSON.stringify(`${S.nome}:\n${semEmoji(t)}`))},'${S.nome} copiado')"><i class="fa-solid fa-copy"></i></button></div>
      <div class="fx-sc-b" onclick="this.classList.toggle('on')" title="Clique para expandir">${corpo}</div></div>`;
  }).join('')}</div>`;
}
