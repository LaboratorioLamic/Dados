// ═══════════════════════════════════════════════════════════════
// importar.js — Tela Importar / Exportar — COMERCIAL LAMIC
// Fase 2: migração da planilha. Demais importações nas fases 3 e 5.
// ═══════════════════════════════════════════════════════════════

const mig = { passo: 0, planilha: null, sistema: null, nomePlanilha: '', nomeSistema: '', analise: null, erro: '', modo: 'substituir', progresso: 0 };

function renderImportar() {
  const el = document.getElementById('s-importar');
  const podeImp = pode('importar', 'importar');
  el.innerHTML = `
    <div class="h-row"><div><h2>Importar / Exportar</h2><p>Toda importação mostra o resultado antes de gravar.</p></div></div>
    <div class="card" id="mig-card">${podeImp ? htmlMigracao() : vazio('fa-lock', 'Seu grupo não tem permissão para importar.')}</div>
    ${podeImp ? `<div class="card" id="sinc-card" style="margin-top:14px">${htmlSinc()}</div>` : ''}
    ${usuarioAtual()?.admin ? htmlBackup() : ''}
    <div class="sec-t" style="margin:22px 0 12px"><i class="fa-solid fa-layer-group"></i>Outras importações e exportações</div>
    <div class="cards">
      ${[['fa-truck-medical', '#00a8cc', 'Laboratórios de apoio', 'Pardini 4114 e Alvaro 2656: custos negociados e vínculos', pode('custos') ? "custosAba='apoio';irPara('custos')" : ''],
         ['fa-book-medical', '#1d7044', 'Catálogo e instruções', 'Nome, material, prazo e instruções dos exames', pode('instrucoes') ? "ins.imp.passo=1;irPara('instrucoes')" : ''],
         ['fa-file-csv', '#16a34a', 'Lista de exames (CSV)', 'Material, nome, prazo e setor pelo mnemônico; inativa os fora da lista', pode('exames', 'editar') ? "irPara('exames');abrirImportExames()" : ''],
         ['fa-code-compare', '#6366f1', 'Divergências com o Unilab', 'Relatório (CSV) dos preços diferentes em todas as tabelas', pode('importar', 'exportar') || pode('tabelas', 'exportar') ? 'exportarDivergenciasUnilab()' : ''],
         ['fa-file-export', '#2a9d8f', 'Preços das tabelas', 'Importar abas da planilha e exportar no layout do Unilab', pode('tabelas') ? "tabAba='tabelas';irPara('tabelas')" : ''],
         ['fa-building-user', '#8b5cf6', 'Laboratórios apoiados', 'Aba Negociados da Lamic-to-Lab', pode('tabelas') ? "tabAba='labs';irPara('tabelas')" : ''],
         ['fa-file-pdf', '#e63946', 'Tabela em PDF', 'Para balcão, convênios e laboratórios: botão PDF em cada tabela', pode('tabelas', 'exportar') ? "tabAba='tabelas';irPara('tabelas')" : '']].map(([ic, c, t, d, acao]) =>
        `<div class="card tcard ${acao ? 'clicavel' : 'desab'}" ${acao ? `onclick="${acao}"` : ''}><div class="tc-h"><span class="tc-ic" style="--c:${c}"><i class="fa-solid ${ic}"></i></span><div><div class="tc-n">${t}</div><div class="tc-s">${d}</div></div>${acao ? '<i class="fa-solid fa-chevron-right muted" style="margin-left:auto"></i>' : ''}</div></div>`).join('')}
    </div>`;
  if (podeImp) popsSinc();
}

const PASSOS_MIG = ['Arquivos', 'Conferir', 'Gravar', 'Concluído'];

function htmlMigracao() {
  const passos = `<div class="steps">${PASSOS_MIG.map((s, i) => `<div class="step ${i < mig.passo ? 'done' : i === mig.passo ? 'cur' : ''}"><span class="c">${i < mig.passo ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>${s}</div>`).join('')}</div>`;
  const cab = `<div class="sec-card-h"><span class="tc-ic" style="--c:#1d7044"><i class="fa-solid fa-file-excel"></i></span><div><h3>Migração da planilha</h3><div class="sub">Aba PARTICULAR da planilha "LAMIC - Comercial - Preços"</div></div></div>`;
  let corpo = '', rodape = '';

  if (mig.passo === 0) {
    const arq = (id, tipo, nome, titulo, dica, obrig) => `
      <label class="drop ${nome ? 'ok' : ''}" for="${id}">
        <input type="file" id="${id}" accept=".csv,text/csv" onchange="lerArquivoMig(this, '${tipo}')">
        <i class="fa-solid ${nome ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i>
        <b>${titulo}</b> ${obrig ? '<span class="badge-s bad">obrigatório</span>' : '<span class="badge-s off">opcional</span>'}
        <div class="drop-s">${nome ? esc(nome) : dica}</div></label>`;
    corpo = `
      <div class="alert x"><i class="fa-solid fa-circle-info"></i><div><b>Como gerar o arquivo da planilha:</b> no Google Planilhas, abra a aba <b>PARTICULAR</b> → Arquivo → Fazer download → <b>Valores separados por vírgula (.csv)</b>.</div></div>
      <div class="drops">
        ${arq('mig-planilha', 'planilha', mig.nomePlanilha, 'Planilha · aba PARTICULAR (.csv)', 'Clique para escolher o arquivo', true)}
        ${arq('mig-sistema', 'sistema', mig.nomeSistema, 'Tabela do sistema · PARTICULAR.csv', 'Preço de referência do sistema e exames fora dele', false)}
      </div>
      ${mig.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(mig.erro)}</div></div>` : ''}`;
    rodape = `<span class="muted" style="font-size:12px">Nada é gravado nesta etapa</span><button class="btn pri" ${mig.planilha ? '' : 'disabled'} onclick="analisarMig()">Analisar<i class="fa-solid fa-arrow-right"></i></button>`;
  }

  if (mig.passo === 1) {
    const r = mig.analise.resumo, existentes = Object.keys(ESTADO.exames).length;
    const kp = (ic, cor, rot, v, s = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}" style="color:${cor}"></i>${rot}</div><div class="v">${num(v, 0)}</div>${s ? `<div class="d muted">${s}</div>` : ''}</div>`;
    const naoAchados = Object.entries(r.setoresNaoAchados);
    corpo = `
      <div class="sumgrid">
        ${kp('fa-list', 'var(--text-muted)', 'Exames', r.unicos, r.duplicados.length ? `${r.duplicados.length} duplicados ignorados` : `${r.lidas} linhas lidas`)}
        ${kp('fa-circle-check', 'var(--green)', 'Com custo', r.comCusto)}
        ${kp('fa-circle-question', 'var(--gray)', 'Sem custo', r.unicos - r.comCusto, 'entram como pendência')}
        ${kp('fa-tags', 'var(--amber)', 'Sem setor', r.semSetor)}
        ${kp('fa-truck-medical', 'var(--cyan)', 'De apoio', r.apoio)}
        ${kp('fa-syringe', 'var(--amber)', 'Com aplicação', r.aplicacao, 'vacinas: coluna L')}
        ${kp('fa-magnifying-glass-dollar', 'var(--amber)', 'A auditar', r.auditar)}
        ${r.comSistema ? kp('fa-code-compare', 'var(--amber)', 'Preço divergente', r.divergentes, 'planilha × sistema') : ''}
        ${kp('fa-plug-circle-xmark', 'var(--red)', 'Fora do sistema', r.fora, r.comSistema ? `${r.inativosSistema} com efetua = N` : 'pela coluna X')}
      </div>
      ${r.comSistema && r.soNoSistema ? `<div class="alert x"><i class="fa-solid fa-circle-info"></i><div>${num(r.soNoSistema, 0)} mnemônicos existem só no sistema e <b>não</b> são importados agora: entram depois, em "Sincronizar com o Unilab".</div></div>` : ''}
      ${!r.comSistema ? `<div class="alert a"><i class="fa-solid fa-triangle-exclamation"></i><div>Sem a tabela do sistema, o preço de referência fica vazio e "fora do sistema" usa a coluna X da planilha.</div></div>` : ''}
      ${naoAchados.length ? `<div class="alert a"><i class="fa-solid fa-tags"></i><div>Setores da planilha não encontrados no cadastro (exames entram sem setor): ${naoAchados.map(([n, q]) => `<b>${esc(n)}</b> (${q})`).join(', ')}. Cadastre-os em Configurações → Setores antes, se quiser.</div></div>` : ''}
      <div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-eye"></i>Amostra</div>
      <div class="tbl-wrap card-in"><table><thead><tr><th>MN</th><th>Descrição</th><th>Setor</th><th class="num">Custo</th><th class="num">Praticado</th><th class="num">Sistema</th></tr></thead>
        <tbody>${Object.values(mig.analise.exames).slice(0, 8).map(e => `<tr><td class="mn">${esc(e.mn)}</td><td class="desc">${esc(e.descricao)}</td><td>${tagSetor(e.setorId)}</td>
          <td class="num">${e.custoTeste != null ? fmt(e.custoTeste) : '—'}</td><td class="num">${fmt(e.precoPraticado)}</td><td class="num">${e.precoSistema != null ? fmt(e.precoSistema) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-database"></i>Como gravar</div>
      <div class="opt-cards" id="mig-modo">
        ${[['substituir', 'Substituir todos os exames', existentes ? `apaga os ${existentes} exames atuais e grava os da planilha` : 'base vazia: grava todos os exames', 'fa-arrows-rotate'],
           ['novos', 'Somente exames novos', existentes ? 'mantém os exames já cadastrados e inclui os que faltam' : 'base vazia: mesmo efeito', 'fa-plus']].map(([v, t, d, ic]) =>
          `<button type="button" class="oc ${mig.modo === v ? 'on' : ''}" onclick="mig.modo='${v}';marcarOc('mig-modo', this)"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`).join('')}
      </div>`;
    rodape = `<button class="btn" onclick="mig.passo=0;desenharMig()"><i class="fa-solid fa-arrow-left"></i>Voltar</button><button class="btn pri" onclick="gravarMig()"><i class="fa-solid fa-check"></i>Gravar exames</button>`;
  }

  if (mig.passo === 2) {
    corpo = `<div class="done-box"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--cyan)"></i><h3>Gravando exames…</h3>
      <div class="barra"><div style="width:${mig.progresso}%"></div></div><p>${mig.progresso}%</p></div>`;
  }

  if (mig.passo === 3) {
    corpo = `<div class="done-box"><i class="fa-solid fa-circle-check"></i><h3>Migração concluída</h3><p>${num(mig.gravados, 0)} exames gravados · registrado no histórico</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:18px;flex-wrap:wrap">
        <button class="btn" onclick="irPara('pendencias')"><i class="fa-solid fa-triangle-exclamation"></i>Ver pendências</button>
        <button class="btn pri" onclick="irPara('exames')"><i class="fa-solid fa-flask-vial"></i>Ir para exames</button></div></div>`;
    rodape = `<button class="btn" onclick="reiniciarMig()"><i class="fa-solid fa-rotate-left"></i>Nova migração</button><span></span>`;
  }
  return cab + passos + `<div class="wz-body">${corpo}</div>` + (rodape ? `<div class="wz-f">${rodape}</div>` : '');
}

const desenharMig = () => { const c = document.getElementById('mig-card'); if (c) c.innerHTML = htmlMigracao(); };
function reiniciarMig() { Object.assign(mig, { passo: 0, planilha: null, sistema: null, nomePlanilha: '', nomeSistema: '', analise: null, erro: '', progresso: 0 }); desenharMig(); }

function lerArquivoMig(input, tipo) {
  const f = input.files[0];
  if (!f) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    if (tipo === 'planilha') { mig.planilha = leitor.result; mig.nomePlanilha = f.name; }
    else { mig.sistema = leitor.result; mig.nomeSistema = f.name; }
    mig.erro = ''; desenharMig();
  };
  leitor.onerror = () => { mig.erro = 'Não foi possível ler o arquivo.'; desenharMig(); };
  // O sistema do laboratório gera ISO-8859-1; o Google Planilhas, UTF-8
  leitor.readAsText(f, tipo === 'sistema' ? 'ISO-8859-1' : 'UTF-8');
}

function analisarMig() {
  try {
    const sistema = mig.sistema ? analisarSistema(mig.sistema) : null;
    mig.analise = analisarPlanilha(mig.planilha, sistema);
    mig.passo = 1; mig.erro = '';
    if (Object.keys(ESTADO.exames).length) mig.modo = 'novos';
  } catch (e) { mig.erro = e.message; }
  desenharMig();
}

async function gravarMig() {
  const existentes = Object.keys(ESTADO.exames).length;
  let exames = mig.analise.exames;
  const substituir = mig.modo === 'substituir';
  if (substituir && existentes) {
    const ok = await confirmar({ titulo: `Substituir ${existentes} exames?`, texto: 'Ajustes feitos no sistema (preços, custos, etapas) serão perdidos. O histórico dos exames é mantido.', botao: 'Substituir', perigo: true });
    if (!ok) return;
  }
  if (!substituir) exames = Object.fromEntries(Object.entries(exames).filter(([k]) => !ESTADO.exames[k]));
  mig.passo = 2; mig.progresso = 0; desenharMig();
  try {
    await gravarExamesEmLote(exames, substituir, (feitos, total) => { mig.progresso = Math.round(feitos / total * 100); desenharMig(); });
    mig.gravados = Object.keys(exames).length;
    registrar('exames', `Migração da planilha: ${mig.gravados} exames (${substituir ? 'substituição' : 'somente novos'})`, { arquivo: mig.nomePlanilha, sistema: mig.nomeSistema || null });
    mig.passo = 3;
  } catch (e) {
    console.error(e);
    mig.passo = 1; mig.erro = '';
    toast('Falha ao gravar: ' + e.message, 'erro');
  }
  desenharMig();
}


// ─── Backup completo ───────────────────────────────────────────
// Baixa o banco inteiro num .json e restaura a partir dele. A restauração grava nó por nó
// (só os nós presentes no arquivo); antes de gravar, baixa automaticamente um backup do estado atual.
function htmlBackup() {
  return `<div class="card" style="margin-top:14px"><div class="sec-card-h"><span class="tc-ic" style="--c:#0f766e"><i class="fa-solid fa-database"></i></span>
    <div><h3>Backup completo</h3><div class="sub">Todo o nó /comercial do banco num arquivo .json: baixar e restaurar sem perder nada</div></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <button class="btn pri" onclick="baixarBackupCompleto()"><i class="fa-solid fa-download"></i>Baixar backup</button>
      <label class="btn" style="cursor:pointer"><i class="fa-solid fa-upload"></i>Restaurar backup
        <input type="file" accept=".json,application/json" style="display:none" onchange="restaurarBackupCompleto(this)"></label>
    </div></div>`;
}

async function lerBancoCompleto() {
  const tudo = await DB.ler('/');
  if (!tudo || typeof tudo !== 'object') throw new Error('Banco vazio ou sem permissão de leitura.');
  return tudo;
}

function salvarJson(obj, nome) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const nomeBackup = (pref) => `${pref}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;

async function baixarBackupCompleto() {
  try {
    const dados = await lerBancoCompleto();
    salvarJson({ _backup: { sistema: 'comercial-lamic', versao: 1, data: new Date().toISOString() }, dados }, nomeBackup('comercial_backup'));
    toast(`Backup baixado: ${Object.keys(dados).length} nó(s).`);
  } catch (e) { toast(e.message || 'Erro ao gerar backup.', 'erro'); }
}

async function restaurarBackupCompleto(inp) {
  const arq = inp.files[0]; inp.value = '';
  if (!arq) return;
  let dados;
  try {
    const j = JSON.parse(await arq.text());
    dados = j && j._backup && j.dados ? j.dados : j;   // aceita também export direto do Firebase
    // export do banco inteiro do applamic: usa só o nó comercial
    if (dados && dados.comercial && typeof dados.comercial === 'object' && (dados.usuarios || dados.logins)) dados = dados.comercial;
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error();
  } catch { return toast('Arquivo inválido: não é um backup .json.', 'erro'); }
  const nos = Object.keys(dados);
  const ok = await confirmar({ titulo: 'Restaurar backup', perigo: true, botao: 'Restaurar',
    texto: `O arquivo tem <b>${nos.length}</b> nó(s): ${nos.map(esc).join(', ')}.<br><br>Esses nós serão <b>substituídos</b> pelo conteúdo do arquivo. Nós que não estão no arquivo ficam como estão.<br>Antes de gravar, um backup do estado atual será baixado automaticamente.` });
  if (!ok) return;
  try {
    salvarJson({ _backup: { sistema: 'comercial-lamic', versao: 1, data: new Date().toISOString(), motivo: 'antes da restauração' }, dados: await lerBancoCompleto() }, nomeBackup('comercial_antes_restaurar'));
    for (const n of nos) await DB.gravar(n, dados[n]);
    toast(`Backup restaurado: ${nos.length} nó(s). Recarregando…`);
    setTimeout(() => location.reload(), 1500);
  } catch (e) { toast('Erro ao restaurar: ' + (e.message || e), 'erro'); }
}
