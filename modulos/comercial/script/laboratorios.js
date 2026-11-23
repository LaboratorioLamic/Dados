// ═══════════════════════════════════════════════════════════════
// laboratorios.js — Laboratórios apoiados: cadastro, valores
// diferenciados por exame (fora da tabela Lamic-to-Lab), importação
// da aba Negociados e exportação para lançamento no Unilab
// ═══════════════════════════════════════════════════════════════
//
// laboratorios/{id}: nome, razaoSocial, cnpj, codConvenio, tabelaId (referência,
//   normalmente a Lamic-to-Lab), ativo, obs, precos/{chave}: valor diferenciado
// O login do laboratório no site L2L fica em l2l/acessos/{id} (Configurações → Apoiados)

function desenharPaneLabs() {
  const el = document.getElementById('tabelas-labs');
  const labs = lista(ESTADO.laboratorios, porNome);
  if (!labSel && labs.length) labSel = (labs.find(l => l.ativo !== false) || labs[0]).id;
  if (!labs.length) {
    el.innerHTML = `<div class="card">${vazio('fa-building-user', `<b>Nenhum laboratório apoiado cadastrado</b><br>Cadastre manualmente ou importe a aba <b>Negociados</b> da planilha Lamic-to-Lab.`)}</div>`;
    return;
  }
  el.innerHTML = `${!tabelaLabPadrao() ? '<div class="alert a"><i class="fa-solid fa-triangle-exclamation"></i><div>Nenhuma tabela do tipo "Laboratórios apoiados" ativa: a margem usa os custos da Particular.</div></div>' : ''}
    <div class="cards" id="lab-cards">${labs.map(l => htmlCardAlvo(ctxAlvo('lab:' + l.id), l.id === labSel, `selecionarLab('${l.id}')`)).join('')}</div>
    <div class="card" style="margin-top:14px" id="lab-detalhe"></div>`;
  abrirGrade('lab:' + labSel, 'lab-detalhe');
}

function selecionarLab(id) {
  if (id === labSel) return;
  labSel = id;
  const ids = lista(ESTADO.laboratorios, porNome).map(l => l.id);
  document.querySelectorAll('#lab-cards .tcard').forEach((b, i) => b.classList.toggle('on', ids[i] === id));
  abrirGrade('lab:' + id, 'lab-detalhe');
}

// ── Cadastro ──────────────────────────────────────────────────
let _labEd = null;
function abrirLaboratorio(id) {
  const l = id ? ESTADO.laboratorios[id] : null;
  const tabs = tabelasLista().filter(t => t.tipo === 'lab');
  _labEd = { id: id || null, ativo: l ? l.ativo !== false : true };
  const n = l ? Object.keys(l.precos || {}).length : 0;
  abrirGaveta({
    sobre: id ? 'Laboratório apoiado' : 'Novo laboratório', titulo: l ? l.nome : 'Cadastrar laboratório',
    corpo: `<div class="form-col">
      ${campo('lb-nome', 'Nome', l?.nome || '', { tipo: 'text', ph: 'Ex.: Lab. São Matheus' })}
      ${campo('lb-razao', 'Razão social', l?.razaoSocial || '', { tipo: 'text', ph: 'Como no contrato' })}
      <div class="fgrid sem-pad">
        ${campo('lb-cnpj', 'CNPJ', l?.cnpj || '', { tipo: 'text', ph: '00.000.000/0000-00', aoMudar: 'this.value=mascaraCnpj(this.value)' })}
        ${campo('lb-conv', 'Cód. do convênio', l?.codConvenio || '', { tipo: 'text', ph: 'No Unilab', dica: 'código do convênio no sistema' })}
      </div>
      <div class="field"><label>Tabela de referência</label><div id="pop-lbtab" class="block"></div><span class="hint">Valor padrão, perfil de custo e piso de margem</span></div>
      <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-eye"></i><div>Laboratório ativo<div class="s">inativo fica esmaecido na lista</div></div></div>${chave(_labEd.ativo, '_labEd.ativo=!_labEd.ativo;this.classList.toggle(\'on\')')}</div></div>
      <div class="just" style="margin:0"><label for="lb-obs">Observações</label><textarea id="lb-obs" placeholder="Contato, condição de pagamento…">${esc(l?.obs || '')}</textarea></div>
    </div>`,
    rodape: `${id && pode('tabelas', 'excluir') ? `<button class="btn perigo-txt" onclick="excluirLaboratorio('${id}')" title="Excluir laboratório"><i class="fa-solid fa-trash"></i></button>` : ''}
      <span style="margin-right:auto">${n ? `<span class="hint">${n} valor(es) diferenciado(s)</span>` : ''}</span>
      <button class="btn" onclick="fecharGaveta()">Cancelar</button><button class="btn pri" onclick="gravarLaboratorio()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>`
  });
  criarPop('pop-lbtab', {
    rotulo: 'Tabela', titulo: 'Tabela de referência', icone: 'fa-table-list', padrao: '',
    opcoes: () => [...tabs.map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, desc: `piso ${textoRegra(t, 'piso')} · ${resumoPerfil(t)}` })),
      ...(tabs.length ? [] : [{ valor: '', rotulo: 'Nenhuma tabela de laboratórios', icone: 'fa-ban', cor: 'var(--gray)' }])]
  });
  POPS['pop-lbtab'].valor = l?.tabelaId || tabelaLabPadrao()?.id || ''; desenharBotaoPop('pop-lbtab');
}

const mascaraCnpj = v => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};

async function gravarLaboratorio() {
  const nome = valorCampo('lb-nome').trim();
  if (!nome) return toast('Informe o nome', 'erro');
  const cnpj = valorCampo('lb-cnpj').trim();
  if (cnpj && cnpj.replace(/\D/g, '').length !== 14) return toast('CNPJ deve ter 14 dígitos', 'erro');
  const repetido = lista(ESTADO.laboratorios).find(l => l.id !== _labEd.id && normalizar(l.nome) === normalizar(nome));
  if (repetido) return toast(`Já existe o laboratório ${repetido.nome}`, 'erro');
  const dados = { nome, razaoSocial: valorCampo('lb-razao').trim() || null, cnpj: cnpj || null, codConvenio: valorCampo('lb-conv').trim() || null,
    tabelaId: valorPop('pop-lbtab') || null, ativo: _labEd.ativo, obs: valorCampo('lb-obs').trim() || null, atualizadoEm: DB.agora() };
  let id = _labEd.id;
  if (id) await DB.mesclar(`${CAMINHOS.laboratorios}/${id}`, dados);
  else {
    id = DB.novaChave(CAMINHOS.laboratorios);
    await DB.gravar(`${CAMINHOS.laboratorios}/${id}`, { ...dados, criadoEm: DB.agora() });
    ESTADO.laboratorios[id] = ESTADO.laboratorios[id] || { ...dados };
  }
  // o login do L2L mostra o nome do laboratório
  if (ESTADO.acessosL2L[id] && ESTADO.acessosL2L[id].nome !== nome) await DB.mesclar(`${CAMINHOS.acessosL2L}/${id}`, { nome });
  registrar('laboratorios', `Laboratório ${nome} ${_labEd.id ? 'alterado' : 'cadastrado'}`, { depois: dados });
  fecharGaveta();
  labSel = id; tabAba = 'labs';
  renderTela();
  toast(`${nome} salvo`);
}

async function excluirLaboratorio(id) {
  const l = ESTADO.laboratorios[id], n = Object.keys(l.precos || {}).length;
  const ok = await confirmar({ titulo: `Excluir ${l.nome}?`, texto: n ? `Os ${n} valores diferenciados também serão apagados.` : 'O cadastro será apagado.', botao: 'Excluir', perigo: true });
  if (!ok) return;
  await DB.remover(`${CAMINHOS.laboratorios}/${id}`);
  await DB.remover(`rascunhos/lab:${id}`);
  await DB.remover(`${CAMINHOS.acessosL2L}/${id}`);
  registrar('laboratorios', `Laboratório ${l.nome} excluído`, { antes: { ...l, precos: null }, valores: n });
  fecharGaveta();
  if (labSel === id) labSel = null;
  renderTabelas();
  toast(`${l.nome} excluído`);
}

// ── Exportação: lista para lançar no Unilab ───────────────────
function exportarLaboratorio(id) {
  const cx = ctxAlvo('lab:' + id), l = ESTADO.laboratorios[id];
  const linhas = Object.entries(l.precos || {}).filter(([k]) => ESTADO.exames[k])
    .map(([k, v]) => ({ e: ESTADO.exames[k], v, ref: cx.ref?.valor(k) ?? null }))
    .sort((a, b) => a.e.mn.localeCompare(b.e.mn, 'pt-BR', { sensitivity: 'base' }));
  if (!linhas.length) return toast('Nenhum valor diferenciado para exportar', 'erro');
  const dec = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  const csv = [['Mnemônico', 'Exame', cx.ref?.nome || 'Tabela', 'Valor diferenciado', 'Desconto'].join(';'),
    ...linhas.map(x => [x.e.mn, `"${String(x.e.descricao || '').replace(/"/g, '""')}"`, dec(x.ref), dec(x.v), x.ref ? pct(1 - x.v / x.ref).replace('%', '') + '%' : ''].join(';'))].join('\r\n') + '\r\n';
  baixarArquivo(`Lab - ${l.nome}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  registrar('laboratorios', `Lista de ${l.nome} exportada (${linhas.length} exames)`);
}

function baixarArquivo(nome, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome.replace(/[\\/:*?"<>|]/g, '-');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── Importação da aba Negociados (migração) ───────────────────
// Colunas: Mnemonico · Exame · Nome · Prazo · Valor · Apoiado
const neg = { texto: null, nome: '', analise: null, erro: '' };

function abrirImportNegociados() {
  Object.assign(neg, { texto: null, nome: '', analise: null, erro: '' });
  abrirGaveta({ sobre: 'Laboratórios apoiados', titulo: 'Importar aba Negociados', corpo: '<div id="neg-corpo"></div>', rodape: '<div id="neg-rodape" style="display:contents"></div>' });
  desenharNeg();
}

function desenharNeg() {
  const c = document.getElementById('neg-corpo'), r = document.getElementById('neg-rodape');
  if (!c) return;
  const a = neg.analise;
  c.innerHTML = `
    <div class="alert x"><i class="fa-solid fa-circle-info"></i><div>Na planilha <b>Tabela LAMIC-TO-LAB</b>, abra a aba <b>Negociados</b> → Arquivo → Fazer download → <b>.csv</b>. Laboratórios que ainda não existem são cadastrados pelo nome; complete razão social, CNPJ e convênio depois.</div></div>
    <label class="drop ${neg.nome ? 'ok' : ''}" for="neg-arq"><input type="file" id="neg-arq" accept=".csv,text/csv" onchange="lerArquivoNeg(this)">
      <i class="fa-solid ${neg.nome ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i><b>Aba Negociados (.csv)</b><div class="drop-s">${neg.nome ? esc(neg.nome) : 'Clique para escolher o arquivo'}</div></label>
    ${neg.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(neg.erro)}</div></div>` : ''}
    ${a ? `<div class="sumgrid" style="margin-top:14px">
        <div class="imp"><div class="l"><i class="fa-solid fa-list"></i>Valores</div><div class="v">${a.total}</div></div>
        <div class="imp"><div class="l"><i class="fa-solid fa-building-user"></i>Laboratórios</div><div class="v">${a.labs.length}</div><div class="d muted">${a.labs.filter(l => !l.id).length} novos</div></div>
        <div class="imp"><div class="l"><i class="fa-solid fa-circle-question" style="color:var(--amber)"></i>Exame não cadastrado</div><div class="v">${a.semExame.length}</div></div>
        <div class="imp"><div class="l"><i class="fa-solid fa-circle-xmark" style="color:var(--red)"></i>Abaixo do piso</div><div class="v">${a.abaixo}</div></div>
      </div>
      <div class="tbl-wrap card-in"><table><thead><tr><th>Laboratório</th><th class="num">Valores</th><th class="num">Já cadastrados</th><th></th></tr></thead>
        <tbody>${a.labs.map(l => `<tr><td>${esc(l.nome)}</td><td class="num">${l.n}</td><td class="num">${l.existentes}</td><td>${l.id ? '<span class="badge-s ok">existe</span>' : '<span class="badge-s base">novo</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${a.semExame.length ? `<div class="hint" style="margin-top:8px">Ignorados (mnemônico não cadastrado): ${a.semExame.slice(0, 12).map(esc).join(', ')}${a.semExame.length > 12 ? '…' : ''}</div>` : ''}
      <div class="alert x" style="margin-top:12px"><i class="fa-solid fa-pen"></i><div>Os valores são gravados direto (migração) e registrados no histórico de cada exame. Valor já existente no laboratório é substituído.</div></div>` : ''}`;
  r.innerHTML = `<button class="btn" style="margin-right:auto" onclick="fecharGaveta()">Cancelar</button>
    <button class="btn pri" ${a && a.validos ? '' : 'disabled'} onclick="gravarNeg()"><i class="fa-solid fa-check"></i>Importar ${a ? a.validos : ''} valores</button>`;
}

function lerArquivoNeg(input) {
  const f = input.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { neg.texto = rd.result; neg.nome = f.name; analisarNeg(); };
  rd.readAsText(f, 'UTF-8');
}

function analisarNeg() {
  neg.erro = ''; neg.analise = null;
  try {
    const L = lerCSV(neg.texto), cab = (L[0] || []).map(normalizar);
    const iMn = cab.indexOf('mnemonico'), iLab = cab.indexOf('apoiado');
    let iVal = cab.indexOf('valor');
    if (iVal < 0) iVal = 4;                    // coluna E (sem título na planilha)
    if (iMn < 0 || iLab < 0) throw new Error('Cabeçalho esperado: Mnemonico · Exame · Nome · Prazo · Valor · Apoiado.');
    const porMn = {};
    Object.entries(ESTADO.exames).forEach(([k, e]) => { porMn[String(e.mn).trim().toUpperCase()] = k; });
    const labs = {}, semExame = new Set(), t = tabelaLabPadrao();
    let total = 0, validos = 0, abaixo = 0;
    L.slice(1).forEach(l => {
      const mn = (l[iMn] || '').trim(), nome = (l[iLab] || '').trim(), v = numeroBR(l[iVal]);
      if (!mn || !nome || !(v > 0)) return;
      total++;
      const k = porMn[mn.toUpperCase()];
      if (!k) { semExame.add(mn); return; }
      const chaveLab = normalizar(nome);
      const lab = labs[chaveLab] ??= { nome, id: lista(ESTADO.laboratorios).find(x => normalizar(x.nome) === chaveLab)?.id || null, precos: {}, n: 0, existentes: 0 };
      if (lab.id && ESTADO.laboratorios[lab.id]?.precos?.[k] != null) lab.existentes++;
      lab.precos[k] = Math.round(v * 100) / 100; lab.n++; validos++;
      if (calcular(ESTADO.exames[k], v, t).status === 'r') abaixo++;
    });
    if (!total) throw new Error('Nenhum valor encontrado no arquivo.');
    neg.analise = { total, validos, abaixo, semExame: [...semExame], labs: Object.values(labs).sort((a, b) => b.n - a.n) };
  } catch (e) { neg.erro = e.message; }
  desenharNeg();
}

async function gravarNeg() {
  const a = neg.analise, u = usuarioAtual(), agora = DB.agora(), upd = {}, t = tabelaLabPadrao();
  a.labs.forEach(l => {
    const id = l.id || DB.novaChave(CAMINHOS.laboratorios);
    if (!l.id) upd[`${CAMINHOS.laboratorios}/${id}`] = { nome: l.nome, tabelaId: t?.id || null, ativo: true, criadoEm: agora, precos: l.precos };
    else Object.entries(l.precos).forEach(([k, v]) => { upd[`${CAMINHOS.laboratorios}/${id}/precos/${k}`] = v; });
    Object.entries(l.precos).forEach(([k, v]) => {
      upd[`historicoExames/${k}/${DB.novaChave('historicoExames')}`] = { descricao: `${l.nome}: valor diferenciado ${fmt(v)} (importado da aba Negociados)`, usuario: u.nome, usuarioId: u.id, em: agora };
    });
    l.idFinal = id;
  });
  await DB.mesclar('/', upd);
  a.labs.forEach(l => { if (!l.id && !ESTADO.laboratorios[l.idFinal]) ESTADO.laboratorios[l.idFinal] = upd[`${CAMINHOS.laboratorios}/${l.idFinal}`]; });
  registrar('laboratorios', `Aba Negociados importada: ${a.validos} valores em ${a.labs.length} laboratórios`, { arquivo: neg.nome });
  fecharGaveta();
  tabAba = 'labs'; labSel = a.labs[0]?.idFinal || labSel;
  renderTabelas();
  toast(`${a.validos} valores importados`);
}
