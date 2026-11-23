// ═══════════════════════════════════════════════════════════════
// tabunilab.js — Particular: importação do CSV da tabela do Unilab
// ═══════════════════════════════════════════════════════════════
//
// código;índice;porte;ch;filme;mnemonico;efetua;vlrporte (ISO-8859-1, ";")
// Exames existentes: grava o preço no Unilab e a situação (efetua S/N). Preço diferente
// do praticado → rascunho (proposta), aplicado direto (quem aprova) ou mantido.
// Mnemônicos novos → exames novos (sem custo e sem setor: entram em Pendências).

const pui = { texto: null, nome: '', analise: null, erro: '', precos: 'rascunho', novos: true, novosN: false, fora: true };

function abrirImportUnilabParticular() {
  Object.assign(pui, { texto: null, nome: '', analise: null, erro: '', precos: 'rascunho', novos: pode('exames', 'criar'), novosN: false, fora: true });
  abrirGaveta({ sobre: 'Importar do Unilab', titulo: 'Particular', corpo: '<div id="pui-corpo"></div>', rodape: '<div id="pui-rodape" style="display:contents"></div>' });
  desenharImportUnilab();
  garantirCatalogo();          // nome, material e prazo dos exames novos
}

function lerArquivoUnilab(input) {
  const f = input.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const bytes = new Uint8Array(rd.result);
    let txt = new TextDecoder('utf-8').decode(bytes);
    if (txt.includes('�')) txt = new TextDecoder('iso-8859-1').decode(bytes);
    pui.texto = txt; pui.nome = f.name;
    analisarImportUnilab();
  };
  rd.readAsArrayBuffer(f);
}

async function analisarImportUnilab() {
  pui.erro = ''; pui.analise = null;
  try {
    await garantirCatalogo();
    pui.analise = analiseUnilabParticular(analisarSistema(pui.texto));
  } catch (e) { pui.erro = e.message; }
  desenharImportUnilab();
}

// Mnemônico (maiúsculas) → chave do exame
function mapaMnemonicos() {
  const porMn = {};
  Object.entries(ESTADO.exames).forEach(([k, e]) => { porMn[String(e.mn).trim().toUpperCase()] = k; });
  return porMn;
}

// Compara a tabela Particular do Unilab (analisarSistema) com os exames cadastrados
// Exames com preço do Unilab em alguma tabela além da Particular (+ chaves de outros arquivos da mesma sincronização)
function emOutrasTabelasUnilab(extras = []) {
  const s = new Set(extras);
  Object.values(ESTADO.tabelas || {}).forEach(t => Object.keys(t.sistema || {}).forEach(k => s.add(k)));
  return s;
}
function analiseUnilabParticular(sis, extras = []) {
  const porMn = mapaMnemonicos();
  const a = { linhas: Object.keys(sis).length, atualizar: [], iguais: 0, divergentes: [], novosS: [], novosN: [], inativos: 0, fora: [] };
  Object.values(sis).forEach(s => {
    const k = porMn[s.mn.toUpperCase()];
    if (!k) { (s.efetua && s.ch > 0 ? a.novosS : a.novosN).push(s); return; }
    const e = ESTADO.exames[k];
    // só entra se algo muda: preço no Unilab, efetua S/N ou marca de fora do sistema
    if (precoDifere(e.precoSistema, s.efetua ? s.ch : null) || !!e.inativoNoSistema === !!s.efetua || e.foraDoSistema) a.atualizar.push({ k, s });
    else a.iguais++;
    if (!s.efetua) a.inativos++;
    if (s.efetua && s.ch > 0 && Math.abs((e.precoPraticado || 0) - s.ch) > 0.004) a.divergentes.push({ k, e, de: e.precoPraticado || null, para: s.ch });
  });
  // fora do catálogo = não existe em nenhuma tabela do Unilab (Particular nem demais); fora só da Particular não conta
  const noUnilab = emOutrasTabelasUnilab(extras);
  a.fora = Object.keys(porMn).filter(m => !sis[m]).map(m => porMn[m]).filter(k => ESTADO.exames[k].ativo !== false && !ESTADO.exames[k].foraDoSistema && !noUnilab.has(k));
  // marcados como fora, mas presentes em outra tabela do Unilab: desmarca
  a.desmarcar = Object.keys(porMn).filter(m => !sis[m]).map(m => porMn[m]).filter(k => ESTADO.exames[k].foraDoSistema && noUnilab.has(k));
  if (!a.linhas) throw new Error('Nenhum exame encontrado no arquivo.');
  return a;
}

function desenharImportUnilab() {
  const c = document.getElementById('pui-corpo'), r = document.getElementById('pui-rodape');
  if (!c) return;
  const a = pui.analise, aprova = pode('tabelas', 'aprovar'), cria = pode('exames', 'criar');
  const kp = (ic, cor, rot, v, s = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}" style="color:${cor}"></i>${rot}</div><div class="v">${num(v, 0)}</div>${s ? `<div class="d muted">${s}</div>` : ''}</div>`;
  const op = (v, t, d, ic, desab) => `<button type="button" class="oc ${pui.precos === v ? 'on' : ''}" ${desab ? 'disabled' : ''} onclick="pui.precos='${v}';desenharImportUnilab()"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`;
  const sw = (campo, t, d, ic, desab) => `<div class="casc-r"><div class="lft"><i class="fa-solid ${ic}"></i><div>${t}<div class="s">${d}</div></div></div>${chave(pui[campo] && !desab, `pui.${campo}=!pui.${campo};this.classList.toggle('on')`, desab)}</div>`;
  c.innerHTML = `
    <div class="alert x"><i class="fa-solid fa-circle-info"></i><div>No Unilab, exporte a tabela <b>Particular</b> (PARTICULAR.csv: <span class="mn">código;índice;porte;ch;filme;mnemonico;efetua;vlrporte</span>). Nada é gravado antes de confirmar.</div></div>
    <label class="drop ${pui.nome ? 'ok' : ''}" for="pui-arq"><input type="file" id="pui-arq" accept=".csv,text/csv" onchange="lerArquivoUnilab(this)">
      <i class="fa-solid ${pui.nome ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i><b>Tabela do Unilab (.csv)</b><div class="drop-s">${pui.nome ? esc(pui.nome) : 'Clique para escolher'}</div></label>
    ${pui.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(pui.erro)}</div></div>` : ''}
    ${a ? `<div class="sumgrid" style="margin-top:14px">
        ${kp('fa-list', 'var(--text-muted)', 'Linhas no arquivo', a.linhas)}
        ${kp('fa-arrows-rotate', 'var(--cyan)', 'Mudam no Unilab', a.atualizar.length, `${num(a.iguais, 0)} iguais: ignorados`)}
        ${kp('fa-code-compare', 'var(--amber)', 'Preço diferente', a.divergentes.length, 'Unilab × praticado')}
        ${kp('fa-plus', 'var(--green)', 'Novos (efetua S)', a.novosS.length, 'com preço no Unilab')}
        ${kp('fa-ban', 'var(--gray)', 'Novos (efetua N)', a.novosN.length, 'não efetuados pela Particular')}
        ${kp('fa-plug-circle-xmark', 'var(--red)', 'Fora do catálogo', a.fora.length, 'em nenhuma tabela do Unilab')}
      </div>
      ${a.divergentes.length ? `<div class="sec-t"><i class="fa-solid fa-code-compare"></i>Preços diferentes (${a.divergentes.length})</div>
        <div class="tbl-wrap card-in" style="max-height:220px;overflow-y:auto"><table><thead><tr><th>MN</th><th class="desc">Exame</th><th class="num">Praticado</th><th class="num">Unilab</th></tr></thead>
          <tbody>${a.divergentes.slice(0, 300).map(x => `<tr><td class="mn">${esc(x.e.mn)}</td><td class="desc" title="${esc(x.e.descricao)}">${esc(x.e.descricao)}</td><td class="num">${fmt(x.de)}</td><td class="num"><b>${fmt(x.para)}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="opt-cards" style="margin-top:10px">
          ${op('rascunho', 'Levar ao meu rascunho', 'Revise na tabela e envie para aprovação', 'fa-pen')}
          ${op('aplicar', 'Aplicar direto', aprova ? 'Vira o preço praticado agora (fica no histórico)' : 'Só para quem tem permissão de aprovar', 'fa-stamp', !aprova)}
          ${op('manter', 'Manter o praticado', 'Só registra o preço do Unilab (aparece como divergência)', 'fa-lock')}
        </div>` : ''}
      <div class="sec-t"><i class="fa-solid fa-sliders"></i>Ao importar</div>
      <div class="casc">
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-desktop"></i><div>Atualizar o preço no Unilab de ${a.atualizar.length} exame(s)<div class="s">só os que mudaram (preço ou efetua S/N); ${num(a.iguais, 0)} iguais ficam como estão</div></div></div><span class="badge-s ok">sempre</span></div>
        ${sw('novos', `Cadastrar os ${a.novosS.length} exames novos`, cria ? 'preço = valor do Unilab; nome, material e prazo do catálogo de instruções; sem custo e sem setor' : 'seu grupo não pode criar exames', 'fa-plus', !cria || !a.novosS.length)}
        ${sw('novosN', `Cadastrar também os ${a.novosN.length} com efetua = N`, 'entram inativos, sem preço', 'fa-ban', !cria || !a.novosN.length)}
        ${sw('fora', `Marcar ${a.fora.length} exame(s) como fora do catálogo`, 'ativos na base que não estão em nenhuma tabela do Unilab', 'fa-plug-circle-xmark', !a.fora.length)}
      </div>` : ''}`;
  r.innerHTML = `<button class="btn" style="margin-right:auto" onclick="fecharGaveta()">Cancelar</button>
    <button class="btn pri" ${a ? '' : 'disabled'} onclick="gravarImportUnilab()"><i class="fa-solid fa-check"></i>Importar</button>`;
}

// Monta em upd as gravações da Particular; op = { precos: rascunho|aplicar|manter, novos, novosN, fora }
function gravacoesUnilabParticular(a, op, upd) {
  const u = usuarioAtual(), agora = DB.agora(), cat = ESTADO.catalogo || {};
  const cria = pode('exames', 'criar');
  const hist = (k, descricao) => { upd[`historicoExames/${k}/${DB.novaChave('historicoExames')}`] = { descricao, usuario: u.nome, usuarioId: u.id, em: agora }; };
  // existentes: preço no Unilab e situação
  a.atualizar.forEach(({ k, s }) => {
    upd[`${CAMINHOS.exames}/${k}/precoSistema`] = s.efetua ? s.ch : null;
    upd[`${CAMINHOS.exames}/${k}/inativoNoSistema`] = s.efetua ? null : true;
    upd[`${CAMINHOS.exames}/${k}/foraDoSistema`] = null;
  });
  if (op.fora) a.fora.forEach(k => { upd[`${CAMINHOS.exames}/${k}/foraDoSistema`] = true; });
  (a.desmarcar || []).forEach(k => { upd[`${CAMINHOS.exames}/${k}/foraDoSistema`] = null; });
  // novos
  const novos = cria ? [...(op.novos ? a.novosS : []), ...(op.novosN ? a.novosN : [])] : [];
  novos.forEach(s => {
    const k = chaveExame(s.mn), c = cat[k] || {};
    upd[`${CAMINHOS.exames}/${k}`] = {
      mn: s.mn, descricao: c.nome || s.mn, origem: 'interno', ativo: s.efetua, material: c.material || null, prazoDias: c.prazoDias ?? null, prazo: c.prazoDias != null ? null : c.prazo || null,
      precoPraticado: s.efetua && s.ch > 0 ? s.ch : null, precoSistema: s.efetua ? s.ch : null, inativoNoSistema: s.efetua ? null : true,
      custoTeste: null, criadoEm: agora, atualizadoEm: agora, atualizadoPor: u.nome
    };
    hist(k, `Exame cadastrado pela importação do Unilab (${s.efetua ? fmt(s.ch) : 'efetua N'})`);
  });
  // preços diferentes
  let nAplic = 0;
  if (op.precos === 'aplicar' && pode('tabelas', 'aprovar')) a.divergentes.forEach(x => {
    upd[`${CAMINHOS.exames}/${x.k}/precoPraticado`] = x.para;
    upd[`${CAMINHOS.exames}/${x.k}/atualizadoEm`] = agora;
    upd[`${CAMINHOS.exames}/${x.k}/atualizadoPor`] = u.nome;
    hist(x.k, `Particular: ${fmt(x.de)} → ${fmt(x.para)} (importação do Unilab)`);
    nAplic++;
  });
  return { novos, nAplic };
}

async function gravarImportUnilab() {
  const a = pui.analise, upd = {};
  const { novos, nAplic } = gravacoesUnilabParticular(a, pui, upd);
  let nRasc = 0;
  await DB.mesclar('/', upd);
  if (pui.precos === 'rascunho' && a.divergentes.length) {
    await carregarRascunho('particular');
    const atual = { ...rasc('particular') };
    a.divergentes.forEach(x => { atual[x.k] = x.para; });
    nRasc = await substituirRasc('particular', atual);
  }
  registrar('exames', `Unilab (Particular) importado: ${a.atualizar.length} atualizados, ${novos.length} novos, ${nAplic} preços aplicados, ${nRasc} no rascunho`, { arquivo: pui.nome });
  fecharGaveta();
  tabAba = 'tabelas'; tabSel = 'particular'; grade.alvo = null;
  if (nRasc) grade.proxFiltro = 'ed';
  renderTabelas();
  toast(`Unilab importado: ${novos.length} novo(s)${nAplic ? ` · ${nAplic} preço(s) aplicados` : ''}${nRasc ? ` · ${nRasc} no rascunho` : ''}`);
}
