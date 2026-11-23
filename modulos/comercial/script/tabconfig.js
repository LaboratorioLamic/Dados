// ═══════════════════════════════════════════════════════════════
// tabconfig.js — Cadastro de tabelas de preço (perfil de custo, piso),
// importação da planilha / Unilab e exportação no formato do Unilab
// ═══════════════════════════════════════════════════════════════

// ── Cadastro / configuração ───────────────────────────────────
let _tbEd = null;

function abrirConfigTabela(id) {
  const t = id ? ESTADO.tabelas[id] : null;
  _tbEd = {
    id: id || null, nome: t?.nome || '', tipo: t?.tipo || 'convenio', cor: t?.cor || PALETA[4], icone: t?.icone || 'fa-id-card',
    descontoRef: t?.descontoRef ?? 0.2, piso: t?.piso ?? parametro('margemMinima'), margemSug: t?.margemSugerida ?? null, tolDesc: t?.toleranciaDesc != null ? +(t.toleranciaDesc * 100).toFixed(2) : null, tolMarg: t?.toleranciaMargem != null ? +(t.toleranciaMargem * 100).toFixed(2) : null, ativa: t ? t.ativa !== false : true,
    perfil: { ...(t?.perfil || {}) }, inicial: 'vazia', copiar: ''
  };
  iniciarRegras(t, { piso: parametro('margemMinima'), descontoRef: 0.2, descontoMax: null, margemSugerida: null });
  _rgRedesenhar = desenharConfigTabela;
  const editar = id ? pode('tabelas', 'editar') : pode('tabelas', 'criar');
  abrirGaveta({
    sobre: id ? 'Configurar tabela' : 'Nova tabela', titulo: t ? t.nome : 'Cadastrar tabela de preço',
    corpo: '<div id="tb-ed"></div>',
    rodape: `${id && pode('tabelas', 'excluir') ? `<button class="btn perigo-txt" onclick="excluirTabela('${id}')" title="Excluir tabela"><i class="fa-solid fa-trash"></i></button>` : ''}
      <span style="margin-right:auto"></span><button class="btn" onclick="fecharGaveta()">Cancelar</button>
      ${editar ? `<button class="btn pri" onclick="gravarConfigTabela()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>` : ''}`
  });
  desenharConfigTabela();
}

function desenharConfigTabela() {
  const e = _tbEd, fixos = lista(ESTADO.custosFixos, (a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const oc = (grupo, v, t, d, ic, on) => `<button type="button" class="oc ${on ? 'on' : ''}" onclick="${grupo}='${v}';desenharConfigTabela()"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`;
  const modo = f => e.perfil[f.id] === false ? 'nao' : typeof e.perfil[f.id] === 'number' ? 'valor' : 'padrao';
  document.getElementById('tb-ed').innerHTML = `<div class="form-col">
    <div class="set-prev"><span class="tc-ic" style="--c:${e.cor};width:46px;height:46px;font-size:19px"><i class="fa-solid ${e.icone}"></i></span>
      <div><div style="font-weight:600">${e.nome ? esc(e.nome) : '<span class="muted">Nome da tabela</span>'}</div><div class="hint">${TIPOS_TABELA[e.tipo].nome} · piso ${_rg.piso.fx ? 'progressivo' : pct(_rg.piso.v || 0, 1)}</div></div></div>
    ${campo('tb-nome', 'Nome', e.nome, { tipo: 'text', ph: 'Ex.: Cartão Saúde', aoMudar: "_tbEd.nome=this.value;document.querySelector('.set-prev b, .set-prev div div').textContent=this.value" })}
    <div class="field"><label>Tipo</label><div class="opt-cards">${Object.entries(TIPOS_TABELA).map(([k, x]) => oc('_tbEd.tipo', k, x.nome, x.desc, x.icone, e.tipo === k)).join('')}</div></div>
    ${_rg.piso.fx || _rg.descontoRef.fx ? htmlRegra('piso') + htmlRegra('descontoRef') : `<div class="fgrid sem-pad">${htmlRegra('piso')}${htmlRegra('descontoRef')}</div>`}
    ${_rg.descontoMax.fx || _rg.margemSugerida.fx ? htmlRegra('descontoMax') + htmlRegra('margemSugerida') : `<div class="fgrid sem-pad">${htmlRegra('descontoMax')}${htmlRegra('margemSugerida')}</div>`}
    <div class="fgrid sem-pad">
    ${campo('tb-toldesc', 'Tolerância de desconto', e.tolDesc ?? '', { icone: 'fa-sliders', suf: 'p.p.', passo: '0.1', ph: 'Sem tolerância',
      dica: 'pontos acima do desconto de referência e do máximo que ainda não geram alerta (ex.: preço arredondado) · vazio = alerta a partir de qualquer excesso',
      aoMudar: "_tbEd.tolDesc=this.value.trim()===''?null:parseFloat(this.value.replace(',','.'))" })}
    ${campo('tb-tolmarg', 'Tolerância de margem', e.tolMarg ?? '', { icone: 'fa-sliders', suf: 'p.p.', passo: '0.1', ph: 'Sem tolerância',
      dica: 'pontos abaixo da sugestão de margem ainda aceitos: o preço sugerido arredonda para baixo quando a margem fica dentro · vazio = sempre para cima',
      aoMudar: "_tbEd.tolMarg=this.value.trim()===''?null:parseFloat(this.value.replace(',','.'))" })}
    </div>
    <div class="field"><label><i class="fa-solid fa-calculator"></i>Perfil de custo</label>
      <div class="casc">${fixos.map(f => `<div class="casc-r"><div class="lft"><i class="fa-solid ${f.icone || 'fa-coins'}"></i><div>${esc(f.nome)}<div class="s">padrão ${fmt(f.valor)}${f.etapa ? ` · só com ${f.etapa}` : ''}</div></div></div>
        <div style="display:flex;gap:6px;align-items:center">
          <div class="seg">${[['padrao', 'Padrão'], ['nao', 'Não cobra'], ['valor', 'Valor']].map(([m, r]) => `<button class="${modo(f) === m ? 'on' : ''}" onclick="perfilTabela('${f.id}','${m}')">${r}</button>`).join('')}</div>
          ${modo(f) === 'valor' ? `<div class="price-in"><span>R$</span><input type="number" step="0.01" min="0" value="${e.perfil[f.id].toFixed(2)}" oninput="_tbEd.perfil['${f.id}']=Math.max(0,parseFloat(this.value)||0)"></div>` : ''}</div></div>`).join('')}</div>
      <span class="hint">Ex.: laboratórios apoiados não pagam atendimento nem coleta (amostra chega coletada).</span></div>
    <div class="field"><label><i class="fa-solid fa-palette"></i>Cor</label><div class="swatches">${PALETA.map(c => `<button type="button" class="sw ${e.cor === c ? 'on' : ''}" style="--c:${c}" onclick="_tbEd.cor='${c}';desenharConfigTabela()"></button>`).join('')}</div></div>
    <div class="field"><label><i class="fa-solid fa-icons"></i>Ícone</label><div class="icon-grid pequeno">${ICONES_TABELA.map(ic => `<button type="button" class="ig ${e.icone === ic ? 'on' : ''}" style="--c:${e.cor}" onclick="_tbEd.icone='${ic}';desenharConfigTabela()"><i class="fa-solid ${ic}"></i></button>`).join('')}</div></div>
    ${!e.id ? `<div class="field"><label><i class="fa-solid fa-table-list"></i>Preços iniciais</label><div class="opt-cards">
        ${oc('_tbEd.inicial', 'vazia', 'Tabela vazia', 'Inclua os exames depois, na edição ou importando', 'fa-file', e.inicial === 'vazia')}
        ${oc('_tbEd.inicial', 'desconto', 'Particular com desconto', 'Todos os exames com preço: Particular − desconto de referência, arredondado', 'fa-percent', e.inicial === 'desconto')}
        ${tabelasLista().length ? oc('_tbEd.inicial', 'copiar', 'Copiar de outra tabela', 'Mesmos exames e preços', 'fa-copy', e.inicial === 'copiar') : ''}</div>
        ${e.inicial === 'copiar' ? '<div id="pop-tbcopia" class="block" style="margin-top:8px"></div>' : ''}</div>` : ''}
    <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-eye"></i><div>Tabela ativa<div class="s">inativa fica esmaecida e fora dos laboratórios</div></div></div>${chave(e.ativa, '_tbEd.ativa=!_tbEd.ativa;this.classList.toggle(\'on\')')}</div></div>
  </div>`;
  if (!e.id && e.inicial === 'copiar') {
    criarPop('pop-tbcopia', {
      rotulo: 'Copiar de', titulo: 'Tabela de origem', icone: 'fa-copy', padrao: e.copiar || tabelasLista()[0]?.id,
      opcoes: () => tabelasLista().map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, qtd: Object.keys(t.precos || {}).length })),
      aoMudar: v => { _tbEd.copiar = v; }
    });
    _tbEd.copiar = valorPop('pop-tbcopia');
  }
}

function perfilTabela(id, m) {
  if (m === 'padrao') delete _tbEd.perfil[id];
  else if (m === 'nao') _tbEd.perfil[id] = false;
  else _tbEd.perfil[id] = ESTADO.custosFixos[id]?.valor ?? 0;
  desenharConfigTabela();
}

async function gravarConfigTabela() {
  const e = _tbEd;
  e.nome = valorCampo('tb-nome').trim();
  if (!e.nome) return toast('Informe o nome', 'erro');
  if (lista(ESTADO.tabelas).some(t => t.id !== e.id && normalizar(t.nome) === normalizar(e.nome)) || normalizar(e.nome) === 'particular') return toast('Já existe uma tabela com esse nome', 'erro');
  const erro = validarRegras();
  if (erro) return toast(erro, 'erro');
  if (e.tolDesc != null && (isNaN(e.tolDesc) || e.tolDesc < 0 || e.tolDesc >= 100)) return toast('Tolerância de desconto inválida', 'erro');
  if (e.tolMarg != null && (isNaN(e.tolMarg) || e.tolMarg < 0 || e.tolMarg >= 100)) return toast('Tolerância de margem inválida', 'erro');
  const dados = { nome: e.nome, tipo: e.tipo, cor: e.cor, icone: e.icone, ...dadosRegras(), toleranciaDesc: e.tolDesc ? Math.round(e.tolDesc * 100) / 10000 : null, toleranciaMargem: e.tolMarg ? Math.round(e.tolMarg * 100) / 10000 : null,
    ativa: e.ativa, perfil: Object.keys(e.perfil).length ? e.perfil : null, atualizadoEm: DB.agora() };
  let id = e.id;
  if (id) {
    await DB.mesclar(`${CAMINHOS.tabelas}/${id}`, dados);
    registrar('tabelas', `Tabela ${e.nome} configurada`, { depois: dados });
  } else {
    id = DB.novaChave(CAMINHOS.tabelas);
    let precos = null;
    if (e.inicial === 'desconto') {
      precos = {};
      examesVisiveis().filter(x => x.ativo !== false && x.precoPraticado > 0).forEach(x => { precos[x.id] = Math.round(x.precoPraticado * (1 - calcular(x, null, dados).descRef)); });
    }
    if (e.inicial === 'copiar' && e.copiar) precos = { ...(ESTADO.tabelas[e.copiar]?.precos || {}) };
    dados.ordem = Math.max(0, ...lista(ESTADO.tabelas).map(t => t.ordem || 0)) + 1;
    await DB.gravar(`${CAMINHOS.tabelas}/${id}`, { ...dados, precos, criadoEm: DB.agora() });
    ESTADO.tabelas[id] = ESTADO.tabelas[id] || { ...dados, precos };
    registrar('tabelas', `Tabela ${e.nome} criada${precos ? ` com ${Object.keys(precos).length} preços` : ''}`, { depois: dados });
  }
  fecharGaveta();
  tabAba = 'tabelas'; tabSel = id; grade.alvo = null;
  renderTabelas();
  toast(`Tabela ${e.nome} salva`);
}

async function excluirTabela(id) {
  const t = ESTADO.tabelas[id], n = Object.keys(t.precos || {}).length;
  const labs = lista(ESTADO.laboratorios).filter(l => l.tabelaId === id);
  if (labs.length) return toast(`Tabela usada por ${labs.length} laboratório(s): troque a referência antes`, 'erro');
  const convs = lista(ESTADO.conveniados).filter(c => c.tabelaId === id);
  if (convs.length) return toast(`Tabela base de ${convs.length} conveniado(s): troque a tabela base antes`, 'erro');
  const ok = await confirmar({ titulo: `Excluir ${t.nome}?`, texto: `${n} preço(s) serão apagados. Propostas pendentes desta tabela ficam sem efeito.`, botao: 'Excluir', perigo: true });
  if (!ok) return;
  await DB.remover(`${CAMINHOS.tabelas}/${id}`);
  await DB.remover(`rascunhos/${id}`);
  registrar('tabelas', `Tabela ${t.nome} excluída (${n} preços)`, { antes: { ...t, precos: null, sistema: null } });
  fecharGaveta();
  tabSel = 'particular';
  renderTabelas();
  toast(`${t.nome} excluída`);
}

// ── Importação ────────────────────────────────────────────────
// Aceita: aba da planilha (cartões/convênios: 📑MN + 💲 FINAL; Lamic-to-Lab: 📑MN,
// 💲 Cheia, 💲 L2L = preço no Unilab, 💲 Proposta = rascunho) ou o CSV do Unilab.
const tbi = { id: null, texto: null, nome: '', analise: null, erro: '', modo: 'substituir', usarSistema: '' }; // usarSistema: '' (só referência) | 'novos' | 'todos'

function abrirImportTabela(id) {
  Object.assign(tbi, { id, texto: null, nome: '', analise: null, erro: '', modo: Object.keys(ESTADO.tabelas[id]?.precos || {}).length ? 'mesclar' : 'substituir', usarSistema: '' });
  abrirGaveta({ sobre: 'Importar preços', titulo: ESTADO.tabelas[id].nome, corpo: '<div id="tbi-corpo"></div>', rodape: '<div id="tbi-rodape" style="display:contents"></div>' });
  desenharImportTabela();
}

function lerArquivoTabela(input) {
  const f = input.files[0];
  if (!f) return;
  const rd = new FileReader();
  // CSV do Unilab vem em ISO-8859-1; do Google Planilhas, UTF-8
  rd.onload = () => {
    const bytes = new Uint8Array(rd.result);
    let txt = new TextDecoder('utf-8').decode(bytes);
    if (txt.includes('�')) txt = new TextDecoder('iso-8859-1').decode(bytes);
    tbi.texto = txt; tbi.nome = f.name;
    analisarImportTabela();
  };
  rd.readAsArrayBuffer(f);
}

function analisarImportTabela() {
  tbi.erro = ''; tbi.analise = null;
  try {
    const L = lerCSV(tbi.texto), t = ESTADO.tabelas[tbi.id];
    const porMn = {};
    Object.entries(ESTADO.exames).forEach(([k, e]) => { porMn[String(e.mn).trim().toUpperCase()] = k; });
    const a = { precos: {}, sistema: {}, proposta: {}, semExame: new Set(), inativos: 0, tipo: '' };
    const cab0 = (L[0] || []).map(normalizar);
    const iH = L.slice(0, 8).findIndex(l => l.some(c => c.trim() === '📑MN'));
    if (iH >= 0) {
      // Aba da planilha
      const H = L[iH].map(c => c.trim()), iMn = H.indexOf('📑MN');
      const iPreco = H.findIndex(c => /FINAL/i.test(c)) >= 0 ? H.findIndex(c => /FINAL/i.test(c)) : H.findIndex(c => /Cheia/i.test(c));
      const iSist = H.findIndex(c => /L2L/i.test(c)), iProp = H.findIndex(c => /Proposta/i.test(c)), iOff = H.indexOf('Off');
      if (iPreco < 0) throw new Error('Coluna de preço não encontrada (esperado "💲 FINAL" ou "💲 Cheia").');
      a.tipo = iProp >= 0 ? 'Aba Lamic-to-Lab' : 'Aba da planilha';
      L.slice(iH + 1).forEach(l => {
        const mn = (l[iMn] || '').trim();
        if (!mn) return;
        const k = porMn[mn.toUpperCase()], p = numeroBR(l[iPreco]), s = iSist >= 0 ? numeroBR(l[iSist]) : null, pr = iProp >= 0 ? numeroBR(l[iProp]) : null;
        if (!(p > 0) && !(s > 0) && !(pr > 0)) return;
        if (!k) { a.semExame.add(mn); return; }
        if (iOff >= 0 && verdadeiro(l[iOff])) a.inativos++;
        if (p > 0) a.precos[k] = Math.round(p * 100) / 100;
        if (s > 0) a.sistema[k] = Math.round(s * 100) / 100;
        if (pr > 0) a.proposta[k] = Math.round(pr * 100) / 100;
      });
      // Abas de cartões/convênios trazem a tabela do Unilab ao lado (código;índice;porte;ch;…)
      const iBloco = cab0.findIndex((c, i) => c === 'mnemonico' && cab0[i - 2] === 'ch');
      if (iSist < 0 && iBloco > 1) {
        L.slice(1).forEach(l => {
          const mn = (l[iBloco] || '').trim(), k = porMn[mn.toUpperCase()];
          if (k && String(l[iBloco + 1]).trim().toUpperCase() === 'S') { const v = numeroBR(l[iBloco - 2]); if (v > 0) a.sistema[k] = v; }
        });
        a.blocoUnilab = true;
      }
    } else if (cab0.includes('mnemonico') && cab0.includes('ch')) {
      // CSV do Unilab: só o preço publicado
      const sis = analisarSistema(tbi.texto);
      a.tipo = 'Tabela do Unilab';
      Object.values(sis).forEach(s => {
        if (!s.efetua || !(s.ch > 0)) return;
        const k = porMn[s.mn.toUpperCase()];
        if (k) a.sistema[k] = s.ch; else a.semExame.add(s.mn);
      });
      a.unilab = true;
    } else throw new Error('Formato não reconhecido: envie a aba da planilha (.csv) ou a tabela do Unilab (código;índice;porte;ch;…).');
    a.semExame = [...a.semExame];
    const atuais = t.precos || {};
    a.nPrecos = Object.keys(a.precos).length; a.nSistema = Object.keys(a.sistema).length; a.nProposta = Object.keys(a.proposta).length;
    a.mudam = Object.entries(a.precos).filter(([k, v]) => atuais[k] != null && Math.abs(atuais[k] - v) > 0.004).length;
    a.iguais = Object.entries(a.precos).filter(([k, v]) => !precoDifere(atuais[k], v)).length;
    const sis0 = t.sistema || {};
    a.sisMudam = [...new Set([...Object.keys(a.sistema), ...Object.keys(sis0)])].filter(k => precoDifere(sis0[k], a.sistema[k])).length;
    a.novos = Object.keys(a.precos).filter(k => atuais[k] == null).length;
    a.saem = Object.keys(atuais).filter(k => a.precos[k] == null).length;
    a.abaixo = Object.entries(a.precos).filter(([k, v]) => calcular(ESTADO.exames[k], v, t).status === 'r').length;
    a.propDif = Object.entries(a.proposta).filter(([k, v]) => Math.abs(v - (a.precos[k] ?? atuais[k] ?? -1)) > 0.004).length;
    // proposta igual ao preço que fica na tabela não vai ao rascunho
    a.proposta = Object.fromEntries(Object.entries(a.proposta).filter(([k, v]) => Math.abs(v - (a.precos[k] ?? atuais[k] ?? -1)) > 0.004));
    if (!a.nPrecos && !a.nSistema && !a.nProposta) throw new Error('Nenhum preço encontrado no arquivo.');
    tbi.analise = a;
  } catch (e) { tbi.erro = e.message; }
  desenharImportTabela();
}

// Unilab × tabela atual: o que muda nos preços e na referência do Unilab
function resumoUnilabTbi(a, t) {
  const atuais = t.precos || {}, s0 = t.sistema || {}, ks = Object.keys(a.sistema);
  return {
    precoMuda: ks.filter(k => atuais[k] != null && precoDifere(atuais[k], a.sistema[k])).length,
    precoEntra: ks.filter(k => atuais[k] == null).length,
    precoIgual: ks.filter(k => atuais[k] != null && !precoDifere(atuais[k], a.sistema[k])).length,
    refNova: ks.filter(k => s0[k] == null).length,
    refNovaComPreco: ks.filter(k => s0[k] == null && atuais[k] != null).length,
    refMuda: ks.filter(k => s0[k] != null && precoDifere(s0[k], a.sistema[k])).length,
    refSai: Object.keys(s0).filter(k => a.sistema[k] == null).length,
    semUnilab: Object.keys(atuais).filter(k => a.sistema[k] == null).length
  };
}

function desenharImportTabela() {
  const c = document.getElementById('tbi-corpo'), r = document.getElementById('tbi-rodape');
  if (!c) return;
  const a = tbi.analise, t = ESTADO.tabelas[tbi.id];
  const kp = (ic, cor, rot, v, s = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}" style="color:${cor}"></i>${rot}</div><div class="v">${num(v, 0)}</div>${s ? `<div class="d muted">${s}</div>` : ''}</div>`;
  c.innerHTML = `
    <div class="alert x"><i class="fa-solid fa-circle-info"></i><div>Envie a <b>aba desta tabela</b> da planilha (Arquivo → Fazer download → .csv) ou o <b>CSV do Unilab</b> desta tabela. Nada é gravado antes de confirmar.</div></div>
    <label class="drop ${tbi.nome ? 'ok' : ''}" for="tbi-arq"><input type="file" id="tbi-arq" accept=".csv,text/csv" onchange="lerArquivoTabela(this)">
      <i class="fa-solid ${tbi.nome ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i><b>Arquivo .csv</b><div class="drop-s">${tbi.nome ? esc(tbi.nome) : 'Clique para escolher'}</div></label>
    ${tbi.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(tbi.erro)}</div></div>` : ''}
    ${a ? `<div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-magnifying-glass"></i>${esc(a.tipo)}</div>
      <div class="sumgrid">
        ${a.nPrecos ? kp('fa-tag', 'var(--cyan)', 'Preços', a.nPrecos, `${a.novos} novos · ${a.mudam} mudam · ${a.iguais} iguais`) : ''}
        ${a.nPrecos && a.saem ? kp('fa-circle-minus', 'var(--gray)', 'Saem da tabela', a.saem, 'só no modo substituir') : ''}
        ${a.nSistema ? kp('fa-desktop', 'var(--text-muted)', 'Preço no Unilab', a.nSistema, `${(r => [r.refNova && `${r.refNova} novos${r.refNovaComPreco ? ` (${r.refNovaComPreco} já na tabela)` : ''}`, r.refMuda && `${r.refMuda} mudam`, r.refSai && `${r.refSai} saem`].filter(Boolean).join(' · ') || 'nada muda')(resumoUnilabTbi(a, t))} · ${a.blocoUnilab ? 'bloco Unilab da aba' : a.unilab ? 'efetua = S' : 'coluna 💲 L2L'}`) : ''}
        ${a.nProposta ? kp('fa-pen', 'var(--amber)', 'Proposta', a.nProposta, `${a.propDif} diferentes do preço → rascunho`) : ''}
        ${a.nPrecos ? kp('fa-circle-xmark', 'var(--red)', 'Abaixo do piso', a.abaixo, `piso ${pct(t.piso ?? parametro('margemMinima'), 0)}`) : ''}
        ${kp('fa-circle-question', 'var(--amber)', 'Não cadastrados', a.semExame.length, 'mnemônico fora da base')}
      </div>
      ${a.semExame.length ? `<div class="hint">Ignorados: ${a.semExame.slice(0, 15).map(esc).join(', ')}${a.semExame.length > 15 ? '…' : ''}</div>` : ''}
      ${a.inativos ? `<div class="hint" style="margin-top:4px">${a.inativos} exame(s) marcados como inativos na planilha (coluna Off) foram incluídos.</div>` : ''}
      ${a.nPrecos ? `<div class="sec-t" style="margin-top:14px"><i class="fa-solid fa-database"></i>Como gravar</div>
        <div class="opt-cards" id="tbi-modo">
          ${[['substituir', 'Substituir a tabela', 'Exames que não estão no arquivo saem da tabela', 'fa-arrows-rotate'], ['mesclar', 'Atualizar e incluir', 'Mantém os exames que não estão no arquivo', 'fa-code-merge']].map(([v, tt, d, ic]) =>
            `<button type="button" class="oc ${tbi.modo === v ? 'on' : ''}" onclick="tbi.modo='${v}';marcarOc('tbi-modo', this)"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${tt}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`).join('')}</div>` : ''}
      ${a.unilab ? (() => {
        const r = resumoUnilabTbi(a, t), nNovos = r.precoEntra, nMudam = r.precoMuda;
        return `<div class="sec-t" style="margin-top:14px"><i class="fa-solid fa-tag"></i>Preços da tabela</div>
        <div class="opt-cards" id="tbi-usar">
          ${(() => {
            const j = (...p) => p.filter(Boolean).join(' · ') || 'nada muda';
            const ref = [r.refNova && `${r.refNova} referência(s) nova(s)${r.refNovaComPreco ? ` (${r.refNovaComPreco} já com preço)` : ''}`, r.refMuda && `${r.refMuda} referência(s) mudam`];
            return [['', 'Só referência do Unilab', `Os preços da tabela não mudam: ${j(...ref)}`, 'fa-lock'],
              ['novos', 'Incluir os que faltam', `${j(nNovos && `${nNovos} entram na tabela`, ...ref)}`, 'fa-plus'],
              ['todos', 'Alterar preço na tabela', `Preços passam a ser os do Unilab: ${j(nMudam && `${nMudam} mudam`, nNovos && `${nNovos} entram`, r.precoIgual && `${r.precoIgual} já iguais`, ...ref)}`, 'fa-arrows-rotate']];
          })().map(([v, tt, d, ic]) =>
            `<button type="button" class="oc ${tbi.usarSistema === v ? 'on' : ''}" onclick="tbi.usarSistema='${v}';marcarOc('tbi-usar', this)"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${tt}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`).join('')}</div>`;
      })() : ''}
      ${a.propDif ? `<div class="alert a" style="margin-top:12px"><i class="fa-solid fa-pen"></i><div>A coluna <b>Proposta</b> vai para o <b>seu rascunho</b> (${a.propDif} preços): revise na tabela e envie para aprovação.</div></div>` : ''}` : ''}`;
  r.innerHTML = `<button class="btn" style="margin-right:auto" onclick="fecharGaveta()">Cancelar</button>
    <button class="btn pri" ${a ? '' : 'disabled'} onclick="gravarImportTabela()"><i class="fa-solid fa-check"></i>Importar</button>`;
}

async function gravarImportTabela() {
  const a = tbi.analise, id = tbi.id, t = ESTADO.tabelas[id];
  if (a.nPrecos && tbi.modo === 'substituir' && Object.keys(t.precos || {}).length) {
    const ok = await confirmar({ titulo: 'Substituir os preços?', texto: `${esc(t.nome)} fica igual ao arquivo: ${a.novos} entram, ${a.mudam} mudam e ${a.saem} saem. Os ${a.iguais} iguais não são regravados.`, botao: 'Substituir', perigo: true });
    if (!ok) return;
  }
  // grava só o que muda: preços iguais aos atuais não são reescritos
  const upd = {}, P = `${CAMINHOS.tabelas}/${id}/precos`, atuais = t.precos || {};
  let nGrav = 0;
  const gravaPreco = (k, v) => { if (precoDifere(atuais[k], v)) { upd[`${P}/${k}`] = v; nGrav++; } };
  if (a.nPrecos) {
    Object.entries(a.precos).forEach(([k, v]) => gravaPreco(k, v));
    if (tbi.modo === 'substituir') Object.keys(atuais).forEach(k => { if (a.precos[k] == null) gravaPreco(k, null); });
  }
  // Unilab → preço da tabela: só os que faltam, ou todos (publica direto, sem aprovação)
  if (a.unilab && tbi.usarSistema === 'todos') {
    const r = resumoUnilabTbi(a, t), li = (n, txt) => n ? `<span><b>${num(n, 0)}</b><i>${txt}</i></span>` : '';
    const ok = await confirmar({ titulo: 'Alterar os preços da tabela?', botao: 'Alterar preços', perigo: true,
      texto: `${esc(t.nome)} passa a usar os valores do Unilab, publicados agora (sem proposta).
        <span class="fx-conf fx-lista">${li(r.precoMuda, 'preço(s) mudam')}${li(r.precoEntra, 'exame(s) entram na tabela')}${li(r.precoIgual, 'preço(s) já iguais: não regravados')}
          ${li(r.refNovaComPreco, 'com preço na tabela e sem Unilab antes: recebem a referência')}${li(r.refMuda, 'referência(s) do Unilab mudam')}
          ${li(r.semUnilab, 'na tabela e fora do arquivo: continuam como estão')}</span>` });
    if (ok !== true) return;
  }
  if (a.unilab && tbi.usarSistema) Object.entries(a.sistema).forEach(([k, v]) => {
    if (a.precos[k] != null) return;
    if (tbi.usarSistema === 'todos' || t.precos?.[k] == null) { gravaPreco(k, v); a.precos[k] = v; }
  });
  let nSis = 0;
  if (a.nSistema) {
    const s0 = t.sistema || {};
    [...new Set([...Object.keys(a.sistema), ...Object.keys(s0)])].forEach(k => {
      if (precoDifere(s0[k], a.sistema[k])) { upd[`${CAMINHOS.tabelas}/${id}/sistema/${k}`] = a.sistema[k] ?? null; nSis++; }
    });
  }
  upd[`${CAMINHOS.tabelas}/${id}/importadoEm`] = DB.agora();
  upd[`${CAMINHOS.tabelas}/${id}/arquivo`] = tbi.nome;
  await DB.mesclar('/', upd);
  // atualiza o estado local antes de montar o rascunho (o ouvinte chega depois)
  ESTADO.tabelas[id] = { ...t, precos: tbi.modo === 'substituir' && a.nPrecos ? { ...a.precos } : { ...atuais, ...a.precos }, sistema: a.nSistema ? a.sistema : t.sistema };
  let nr = 0;
  if (Object.keys(a.proposta).length) {
    await carregarRascunho(id);
    nr = await substituirRasc(id, { ...rasc(id), ...a.proposta });
  }
  registrar('tabelas', `${t.nome}: importação de ${tbi.nome} (${nGrav} preço(s) alterados, ${nSis} no Unilab${nr ? `, ${nr} no rascunho` : ''}; iguais ignorados)`, { modo: tbi.modo });
  fecharGaveta();
  grade.alvo = null;
  if (nr) grade.proxFiltro = 'ed';
  renderTabelas();
  toast(nGrav || nSis || nr ? `${t.nome}: ${nGrav} preço(s) alterados · ${nSis} no Unilab${nr ? ` · ${nr} no rascunho` : ''}` : `${t.nome}: nada mudou, tudo já estava igual`);
}

// ── Exportação no formato do Unilab ───────────────────────────
// ISO-8859-1, ";", CRLF em todas as linhas; ordem alfabética sem diferenciar maiúsculas
function csvUnilab(linhas) {
  const ch = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const txt = ['código;índice;porte;ch;filme;mnemonico;efetua;vlrporte',
    ...linhas.sort((a, b) => { const x = a.mn.toLowerCase(), y = b.mn.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; })
      .map(l => l.preco > 0 ? `;0;UNIL;${ch(l.preco)};0;${l.mn};S;1` : `;0;;0;0;${l.mn};N;0`)].join('\r\n') + '\r\n';
  const bytes = new Uint8Array(txt.length);
  for (let i = 0; i < txt.length; i++) { const c = txt.charCodeAt(i); bytes[i] = c < 256 ? c : 63; }
  return new Blob([bytes], { type: 'text/csv;charset=iso-8859-1' });
}

function exportarTabelaUnilab(alvo) {
  const cx = ctxAlvo(alvo);
  const linhas = examesVisiveis().filter(e => cx.salvo(e.id) != null && (cx.base ? e.ativo !== false : true))
    .map(e => ({ mn: String(e.mn).trim(), preco: cx.salvo(e.id) }));
  if (!linhas.length) return toast('Tabela sem preços para exportar', 'erro');
  const pend = Object.keys(rasc(alvo)).length;
  baixarArquivo(`${normalizar(cx.nome).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}.csv`, csvUnilab(linhas));
  registrar('tabelas', `${cx.nome}: exportada para o Unilab (${linhas.length} exames)`);
  toast(`${linhas.length} exames exportados${pend ? ' · rascunho não incluído' : ''}`);
}
