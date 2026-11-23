// ═══════════════════════════════════════════════════════════════
// examesimp.js — Importar dados dos exames por CSV — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════
//
// Arquivo "Lista de Exames.csv" (separador ";"):
//   Mnemônico ; Material Biológico ; Nome do Exame ; Prazo de entrega ; Setor
// Só atualiza exames já cadastrados (casados pelo mnemônico). Cada campo tem duas chaves:
// "preencher" (grava onde está vazio) e "alterar" (substitui o valor diferente).
// Opcionalmente inativa os exames ativos cujo mnemônico não aparece no arquivo e
// reativa os inativos que aparecem.

const CAMPOS_EXIMP = {
  material: { nome: 'Material biológico', icone: 'fa-vial', vazio: 'Incluir material biológico vazio', altera: 'Alterar material biológico' },
  nome:     { nome: 'Nome do exame', icone: 'fa-font', vazio: 'Incluir nome do exame vazio', altera: 'Alterar nome do exame' },
  prazo:    { nome: 'Prazo de entrega', icone: 'fa-clock', vazio: 'Preencher exames sem prazo de entrega', altera: 'Alterar prazo de entrega' },
  setor:    { nome: 'Setor', icone: 'fa-layer-group', vazio: 'Incluir em setor caso vazio', altera: 'Alterar setor' }
};
const exImp = { arquivo: '', linhas: null, erro: '', setores: [], gravando: false,
  op: { materialVazio: true, materialAltera: false, nomeVazio: true, nomeAltera: false, prazoVazio: true, prazoAltera: false, setorVazio: true, setorAltera: false, inativarFora: false, reativar: false } };

function abrirImportExames() {
  if (!pode('exames', 'editar')) return;
  Object.assign(exImp, { arquivo: '', linhas: null, erro: '', setores: [], gravando: false });
  exImp.op.inativarFora = exImp.op.reativar = false;   // nunca fica ligado de uma importação para a outra
  abrirGaveta({ sobre: 'Exames', titulo: 'Importar do CSV', corpo: '<div id="eximp-corpo"></div>', rodape: '<div id="eximp-rodape" style="display:contents"></div>' });
  desenharImportExames();
}

// ── Leitura ───────────────────────────────────────────────────
// O sistema do laboratório exporta em ISO-8859-1; o Google Planilhas, em UTF-8
function textoDoArquivo(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch (e) { return new TextDecoder('windows-1252').decode(buffer); }
}

function analisarCsvExames(texto) {
  const linhas = lerCSV(texto), cab = (linhas[0] || []).map(normalizar);
  const col = (...nomes) => cab.findIndex(c => nomes.some(n => c.startsWith(n)));
  const ix = { mn: col('mnemonico'), material: col('material'), nome: col('nome', 'exame', 'descricao'), prazo: col('prazo'), setor: col('setor') };
  if (ix.mn < 0) throw new Error('Arquivo inválido: falta a coluna "Mnemônico" na primeira linha.');
  const vistos = {}, cel = (l, i) => i < 0 ? '' : String(l[i] ?? '').trim().replace(/\s+/g, ' ');
  linhas.slice(1).forEach(l => {
    const mn = cel(l, ix.mn);
    if (!mn) return;
    const dias = parseInt(cel(l, ix.prazo), 10);
    vistos[chaveExame(mn).toUpperCase()] = { mn, material: cel(l, ix.material), nome: cel(l, ix.nome), prazo: /^\d+$/.test(cel(l, ix.prazo)) ? dias : null, setor: cel(l, ix.setor) };
  });
  const ls = Object.values(vistos);
  if (!ls.length) throw new Error('Nenhum mnemônico encontrado no arquivo.');
  return ls;
}

async function lerArquivoImportExames(input) {
  const f = input.files[0];
  if (!f) return;
  Object.assign(exImp, { arquivo: f.name, erro: '', linhas: null, setores: [] });
  try {
    const [buffer] = await Promise.all([f.arrayBuffer(), garantirCatalogo()]);
    exImp.linhas = analisarCsvExames(textoDoArquivo(buffer));
    const cont = {};
    exImp.linhas.forEach(l => { if (l.setor) cont[l.setor] = (cont[l.setor] || 0) + 1; });
    exImp.setores = Object.keys(cont).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(nome => ({ nome, qtd: cont[nome], ...setorParecido(nome) }));
  } catch (e) { exImp.erro = e.message || 'Não foi possível ler o arquivo.'; }
  desenharImportExames();
}

// ── Setor por nome aproximado ─────────────────────────────────
// "01 - Bioquimica - Sangue" ≈ "BIOQUÍMICA - S" · "03 - Urinalise" ≈ "UROANÁLISE"
const _palavrasSetor = s => normalizar(s).replace(/^\d+\s*-\s*/, '').split(/[^a-z0-9]+/).filter(p => p && !['de', 'do', 'da', 'e'].includes(p));
function _distancia(a, b) {
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const at = [i];
    for (let j = 1; j <= b.length; j++) at[j] = Math.min(ant[j] + 1, at[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = at;
  }
  return ant[b.length];
}
function _parecidas(a, b) {
  if (a === b) return 1;
  // abreviação: "pezin" de "pezinho" vale mais que uma sigla de 1 ou 2 letras ("s" de "sangue")
  if (a.startsWith(b) || b.startsWith(a)) return Math.min(a.length, b.length) >= 3 ? 0.9 : 0.6;
  const r = 1 - _distancia(a, b) / Math.max(a.length, b.length);
  return r >= 0.75 ? r : 0;
}
function notaSetor(a, b) {
  const pa = _palavrasSetor(a), pb = _palavrasSetor(b);
  if (!pa.length || !pb.length) return 0;
  const melhor = (p, ls) => Math.max(...ls.map(q => _parecidas(p, q)));
  return (pa.reduce((t, p) => t + melhor(p, pb), 0) + pb.reduce((t, p) => t + melhor(p, pa), 0)) / (pa.length + pb.length);
}
// Vincula sozinho quando a nota passa de 0,6 e não empata com outro setor; abaixo disso fica para o usuário
function setorParecido(nome) {
  const limpo = nome.replace(/^\d+\s*-\s*/, ''), achado = acharSetor(limpo);
  if (achado) return { setorId: achado.id, nota: normalizar(achado.nome) === normalizar(limpo) ? 1 : 0.9 };
  const [a, b] = lista(ESTADO.setores).map(s => ({ id: s.id, n: notaSetor(nome, s.nome) })).sort((x, y) => y.n - x.n);
  return a && a.n >= 0.6 && (!b || a.n - b.n > 0.04) ? { setorId: a.id, nota: a.n } : { setorId: '', nota: 0 };
}

// ── Conferência ───────────────────────────────────────────────
// Material e prazo valem o que aparece na ficha: o catálogo de instruções tem prioridade sobre o exame
function mudancasImportExames() {
  const op = exImp.op, cat = ESTADO.catalogo || {}, porMn = {}, mud = [], semCadastro = [], noArquivo = new Set();
  examesVisiveis().forEach(e => { porMn[e.id.toUpperCase()] = e.id; });
  const vinc = Object.fromEntries(exImp.setores.map(s => [s.nome, s.setorId]));
  const decidir = (campo, vazio, igual) => !igual && (vazio ? op[campo + 'Vazio'] : op[campo + 'Altera']);
  (exImp.linhas || []).forEach(l => {
    const k = porMn[chaveExame(l.mn).toUpperCase()], e = ESTADO.exames[k];
    if (!e) return semCadastro.push(l.mn);
    noArquivo.add(k);
    const c = cat[k], campos = {};
    const mat = c?.material || e.material || '';
    if (l.material && decidir('material', !mat, mat === l.material)) campos.material = { de: mat, para: l.material };
    const nome = e.descricao && e.descricao !== e.mn ? e.descricao : '';
    if (l.nome && decidir('nome', !nome, e.descricao === l.nome)) campos.nome = { de: nome, para: l.nome };
    const dias = c?.prazoDias ?? e.prazoDias ?? null, texto = dias != null ? prazoTexto(dias) : c?.prazo || e.prazo || '';
    if (l.prazo != null && decidir('prazo', !texto, dias === l.prazo)) campos.prazo = { de: texto, para: prazoTexto(l.prazo), dias: l.prazo };
    const sid = vinc[l.setor], atual = ESTADO.setores[e.setorId];
    if (sid && decidir('setor', !atual, e.setorId === sid)) campos.setor = { de: atual?.nome || '', para: ESTADO.setores[sid].nome, id: sid };
    if (Object.keys(campos).length) mud.push({ k, mn: e.mn, campos });
  });
  // ativos que o arquivo não cita (só conta quando o arquivo casou com algum exame)
  const fora = noArquivo.size ? examesVisiveis().filter(e => e.ativo !== false && !noArquivo.has(e.id)).sort((a, b) => String(a.mn).localeCompare(String(b.mn), 'pt-BR')) : [];
  const inativos = [...noArquivo].map(k => ({ id: k, ...ESTADO.exames[k] })).filter(e => e.ativo === false).sort((a, b) => String(a.mn).localeCompare(String(b.mn), 'pt-BR'));
  return { mud, semCadastro, fora, inativar: op.inativarFora ? fora : [], inativos, reativar: op.reativar ? inativos : [] };
}

function desenharImportExames() {
  const c = document.getElementById('eximp-corpo');
  if (!c) return;
  const ok = exImp.linhas && !exImp.erro;
  const sw = (k, t, d) => `<div class="casc-r"><div class="lft"><i class="fa-solid ${k.endsWith('Vazio') ? 'fa-plus' : 'fa-pen'}"></i><div>${t}<div class="s">${d}</div></div></div>${chave(exImp.op[k], `exImp.op.${k}=!exImp.op.${k};this.classList.toggle('on');desenharResumoImportExames()`)}</div>`;
  c.innerHTML = `
    <label class="drop ${ok ? 'ok' : ''}" for="eximp-arq"><input type="file" id="eximp-arq" accept=".csv,text/csv" onchange="lerArquivoImportExames(this)">
      <i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i><b>Lista de exames (.csv)</b>
      <div class="drop-s">${exImp.arquivo ? esc(exImp.arquivo) : 'Colunas: Mnemônico; Material Biológico; Nome do Exame; Prazo de entrega; Setor'}</div></label>
    ${exImp.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(exImp.erro)}</div></div>` : ''}
    ${ok ? `
      <div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-sliders"></i>O que importar</div>
      <div class="casc">${Object.entries(CAMPOS_EXIMP).map(([k, f]) =>
        sw(k + 'Vazio', f.vazio, 'só onde o exame está sem esse dado') + sw(k + 'Altera', f.altera, k === 'setor' ? 'troca o setor do exame pelo setor do arquivo' : `troca o ${f.nome.toLowerCase()} do exame pelo do arquivo, quando diferente`)).join('')}</div>
      <div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-power-off"></i>Ativar e inativar</div>
      <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-play"></i><div>Reativar exames inativos que aparecem no arquivo<div class="s" id="eximp-reat-s"></div></div></div>
        ${chave(exImp.op.reativar, `exImp.op.reativar=!exImp.op.reativar;this.classList.toggle('on');desenharResumoImportExames()`)}</div><div class="casc-r"><div class="lft"><i class="fa-solid fa-pause"></i><div>Inativar mnemônicos que não aparecem no arquivo<div class="s" id="eximp-fora-s"></div></div></div>
        ${chave(exImp.op.inativarFora, `exImp.op.inativarFora=!exImp.op.inativarFora;this.classList.toggle('on');desenharResumoImportExames()`)}</div></div>
      ${exImp.setores.length ? `<div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-link"></i>Setores do arquivo</div>
        <div class="hint" style="margin-bottom:8px">Vínculo feito pelo nome aproximado. Confira os marcados como "aproximado" e escolha à mão os "sem vínculo".</div>
        <div class="casc">${exImp.setores.map((s, i) => `<div class="casc-r"><div class="lft"><i class="fa-solid fa-layer-group"></i><div>${esc(s.nome)}<div class="s">${num(s.qtd, 0)} exame(s) <span id="eximp-st-${i}"></span></div></div></div><div id="pop-eximp-${i}" style="width:210px;flex-shrink:0"></div></div>`).join('')}</div>` : ''}
      <div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-list-check"></i>Conferência</div>
      <div id="eximp-resumo"></div>` : ''}`;
  if (ok) exImp.setores.forEach((s, i) => {
    const id = `pop-eximp-${i}`;
    delete POPS[id];
    criarPop(id, {
      rotulo: 'Setor', titulo: `Setor "${s.nome}"`, icone: 'fa-layer-group', padrao: '', busca: 'Buscar setor…',
      opcoes: () => opcoesSetorPop('Não vincular').map(o => o.valor ? o : { ...o, icone: 'fa-ban', cor: 'var(--gray)', desc: 'Exames deste setor ficam como estão' }),
      aoMudar: v => { s.setorId = v; s.nota = v ? 1 : 0; s.manual = true; marcarVinculoImportExames(i); desenharResumoImportExames(); }
    });
    POPS[id].valor = s.setorId; desenharBotaoPop(id);
    marcarVinculoImportExames(i);
  });
  desenharResumoImportExames();
}

function marcarVinculoImportExames(i) {
  const s = exImp.setores[i], el = document.getElementById(`eximp-st-${i}`);
  if (el) el.innerHTML = !s.setorId ? '<span class="badge-s warn">sem vínculo</span>' : s.manual ? '<span class="badge-s base">manual</span>'
    : s.nota >= 0.99 ? '<span class="badge-s ok">mesmo nome</span>' : '<span class="badge-s warn">aproximado</span>';
}

function desenharResumoImportExames() {
  const r = document.getElementById('eximp-rodape'), el = document.getElementById('eximp-resumo');
  if (!r) return;
  const pronto = exImp.linhas && !exImp.erro, { mud, semCadastro, fora, inativar, inativos, reativar } = pronto ? mudancasImportExames() : { mud: [], semCadastro: [], fora: [], inativar: [], inativos: [], reativar: [] };
  const total = new Set([...mud.map(m => m.k), ...inativar.map(e => e.id), ...reativar.map(e => e.id)]).size, fs = document.getElementById('eximp-fora-s');
  if (fs) fs.textContent = fora.length ? `${num(fora.length, 0)} exame(s) ativo(s) fora da lista; podem ser reativados na aba Inativos` : 'todos os exames ativos estão no arquivo';
  const rs = document.getElementById('eximp-reat-s');
  if (rs) rs.textContent = inativos.length ? `${num(inativos.length, 0)} exame(s) inativo(s) estão no arquivo` : 'nenhum exame inativo no arquivo';
  if (el) {
    const cont = k => mud.filter(m => m.campos[k]).reduce((t, m) => (t[m.campos[k].de ? 'alt' : 'novo']++, t), { novo: 0, alt: 0 });
    const MAX = 150, itens = mud.flatMap(m => Object.entries(m.campos).map(([k, v]) => ({ mn: m.mn, k, v })));
    el.innerHTML = `
      <div class="casc">${Object.entries(CAMPOS_EXIMP).map(([k, f]) => { const n = cont(k); return `<div class="casc-r"><div class="lft"><i class="fa-solid ${f.icone}"></i><div>${f.nome}</div></div>
        <span><span class="badge-s ${n.novo ? 'ok' : 'off'}">${num(n.novo, 0)} preenchido(s)</span> <span class="badge-s ${n.alt ? 'warn' : 'off'}">${num(n.alt, 0)} alterado(s)</span></span></div>`; }).join('')}
        ${exImp.op.reativar ? `<div class="casc-r"><div class="lft"><i class="fa-solid fa-play"></i><div>Inativos no arquivo</div></div><span class="badge-s ${reativar.length ? 'ok' : 'off'}">${num(reativar.length, 0)} reativado(s)</span></div>` : ''}
        ${exImp.op.inativarFora ? `<div class="casc-r"><div class="lft"><i class="fa-solid fa-pause"></i><div>Fora do arquivo</div></div><span class="badge-s ${inativar.length ? 'bad' : 'off'}">${num(inativar.length, 0)} inativado(s)</span></div>` : ''}</div>
      ${reativar.length ? `<div class="alert x" style="margin-top:12px"><i class="fa-solid fa-play"></i><div><b>${num(reativar.length, 0)} exame(s) serão reativados</b>: ${esc(reativar.slice(0, 40).map(e => e.mn).join(', '))}${reativar.length > 40 ? '…' : ''}</div></div>` : ''}
      ${inativar.length ? `<div class="alert a" style="margin-top:12px"><i class="fa-solid fa-pause"></i><div><b>${num(inativar.length, 0)} exame(s) serão inativados</b> por não estarem no arquivo: ${esc(inativar.slice(0, 40).map(e => e.mn).join(', '))}${inativar.length > 40 ? '…' : ''}</div></div>` : ''}
      ${semCadastro.length ? `<div class="alert x" style="margin-top:12px"><i class="fa-solid fa-circle-info"></i><div><b>${num(semCadastro.length, 0)} mnemônico(s) do arquivo não estão cadastrados</b> e são ignorados: ${esc(semCadastro.slice(0, 12).join(', '))}${semCadastro.length > 12 ? '…' : ''}</div></div>` : ''}
      ${itens.length ? `<div class="tbl-wrap" style="margin-top:12px;max-height:320px;overflow:auto"><table><thead><tr><th>MN</th><th>Campo</th><th>Atual</th><th>Novo</th></tr></thead><tbody>${
        itens.slice(0, MAX).map(x => `<tr><td class="mn">${esc(x.mn)}</td><td>${CAMPOS_EXIMP[x.k].nome}</td><td class="muted">${x.v.de ? esc(x.v.de) : '—'}</td><td>${esc(x.v.para)}</td></tr>`).join('')}</tbody></table></div>
        ${itens.length > MAX ? `<div class="hint" style="margin-top:6px">Mostrando ${MAX} de ${num(itens.length, 0)} alterações.</div>` : ''}` : ''}`;
  }
  r.innerHTML = `<span class="muted" style="font-size:12px;margin-right:auto">${pronto ? `${num(exImp.linhas.length, 0)} linha(s) no arquivo` : 'Nada é gravado antes de confirmar'}</span>
    <button class="btn" onclick="fecharGaveta()">Fechar</button>
    <button class="btn pri" ${total && !exImp.gravando ? '' : 'disabled'} onclick="gravarImportExames()"><i class="fa-solid ${exImp.gravando ? 'fa-circle-notch fa-spin' : 'fa-check'}"></i>Atualizar ${total ? num(total, 0) : ''} exame(s)</button>`;
}

async function gravarImportExames() {
  const { mud, inativar, reativar } = mudancasImportExames();
  if (!(mud.length + inativar.length + reativar.length) || exImp.gravando || !pode('exames', 'editar')) return;
  const nAlt = mud.filter(m => Object.values(m.campos).some(v => v.de)).length;
  if (!await confirmar({ titulo: 'Importar dados dos exames?', botao: 'Importar', icone: 'fa-file-import', perigo: inativar.length > 0,
    texto: `<b>${num(mud.length, 0)}</b> exame(s) serão atualizados${nAlt ? `, <b>${num(nAlt, 0)}</b> deles com dados atuais substituídos` : ''}.${
      reativar.length ? `<br><b>${num(reativar.length, 0)}</b> exame(s) inativos serão <b>reativados</b>.` : ''}${
      inativar.length ? `<br><b>${num(inativar.length, 0)}</b> exame(s) fora do arquivo serão <b>inativados</b>: saem das tabelas de preço, do simulador e dos PDFs.` : ''}` })) return;
  exImp.gravando = true; desenharResumoImportExames();
  const u = usuarioAtual(), agora = DB.agora(), cat = ESTADO.catalogo || {}, upd = {}, local = [];
  mud.forEach(({ k, campos: c }) => {
    const ex = {}, ct = {};
    if (c.nome) ex.descricao = c.nome.para;
    if (c.material) { ex.material = c.material.para; ct.material = c.material.para; }
    if (c.prazo) { Object.assign(ex, { prazoDias: c.prazo.dias, prazo: null }); Object.assign(ct, { prazoDias: c.prazo.dias, prazo: null }); }
    if (c.setor) ex.setorId = c.setor.id;   // só o setor: origem, custos e preços ficam como estão
    Object.assign(ex, { atualizadoEm: agora, atualizadoPor: u.nome });
    Object.entries(ex).forEach(([f, v]) => { upd[`${CAMINHOS.exames}/${k}/${f}`] = v; });
    if (cat[k]) Object.entries(ct).forEach(([f, v]) => { upd[`catalogo/${k}/${f}`] = v; });
    upd[`historicoExames/${k}/${DB.novaChave('historicoExames')}`] = { usuario: u.nome, usuarioId: u.id, em: agora,
      descricao: `Importação do CSV: ${Object.entries(c).map(([f, v]) => `${CAMPOS_EXIMP[f].nome.toLowerCase()} ${v.de ? `"${v.de}" → ` : ''}"${v.para}"`).join('; ')}` };
    local.push([k, ex, ct]);
  });
  reativar.forEach(e => {
    const ex = { ativo: true, atualizadoEm: agora, atualizadoPor: u.nome };
    Object.entries(ex).forEach(([f, v]) => { upd[`${CAMINHOS.exames}/${e.id}/${f}`] = v; });
    upd[`historicoExames/${e.id}/${DB.novaChave('historicoExames')}`] = { usuario: u.nome, usuarioId: u.id, em: agora, descricao: 'Reativado pela importação do CSV (mnemônico no arquivo)' };
    local.push([e.id, ex, {}]);
  });
  inativar.forEach(e => {
    const ex = { ativo: false, atualizadoEm: agora, atualizadoPor: u.nome };
    Object.entries(ex).forEach(([f, v]) => { upd[`${CAMINHOS.exames}/${e.id}/${f}`] = v; });
    upd[`historicoExames/${e.id}/${DB.novaChave('historicoExames')}`] = { usuario: u.nome, usuarioId: u.id, em: agora, descricao: 'Inativado pela importação do CSV (mnemônico fora do arquivo)' };
    local.push([e.id, ex, {}]);
  });
  try {
    await DB.mesclar('/', upd);
    local.forEach(([k, ex, ct]) => {
      Object.assign(ESTADO.exames[k], ex, { atualizadoEm: Date.now() });
      if (cat[k]) Object.assign(cat[k], ct);
    });
    registrar('exames', `Importação do CSV: ${mud.length} exame(s) atualizados${reativar.length ? `, ${reativar.length} reativado(s)` : ''}${inativar.length ? `, ${inativar.length} inativado(s)` : ''}`, { arquivo: exImp.arquivo });
    toast(`${num(mud.length, 0)} exame(s) atualizados${reativar.length ? ` · ${num(reativar.length, 0)} reativado(s)` : ''}${inativar.length ? ` · ${num(inativar.length, 0)} inativado(s)` : ''}`);
    fecharGaveta();
    renderTela();
  } catch (e) {
    console.error(e);
    exImp.gravando = false; desenharResumoImportExames();
    toast('Erro ao gravar a importação', 'erro');
  }
}
