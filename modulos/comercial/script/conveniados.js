// ═══════════════════════════════════════════════════════════════
// conveniados.js — Conveniados: cadastro e valores diferenciados
// por exame sobre uma tabela base
// ═══════════════════════════════════════════════════════════════
//
// conveniados/{id}: nome, razaoSocial, cnpj, codConvenio, tabelaId (tabela base:
//   vazio = Particular, ou o id de uma tabela de preço), ativo, obs,
//   precos/{chave}: valor diferenciado
// Exame sem valor diferenciado segue o preço da tabela base. A grade, o rascunho e
// as propostas são os mesmos das tabelas (alvo 'conv:{id}', ver tabelas.js).

const conveniadosLista = () => lista(ESTADO.conveniados, porNome);

function desenharPaneConv() {
  const el = document.getElementById('tabelas-conv');
  const cs = conveniadosLista();
  if (!convSel && cs.length) convSel = (cs.find(c => c.ativo !== false) || cs[0]).id;
  if (!cs.length) {
    el.innerHTML = `<div class="card">${vazio('fa-handshake', `<b>Nenhum conveniado cadastrado</b><br>Cadastre o conveniado, escolha a tabela base e inclua só os exames com valor diferenciado.`)}</div>`;
    return;
  }
  el.innerHTML = `<div class="cards" id="conv-cards">${cs.map(c => htmlCardAlvo(ctxAlvo('conv:' + c.id), c.id === convSel, `selecionarConv('${c.id}')`)).join('')}</div>
    <div class="card" style="margin-top:14px" id="conv-detalhe"></div>`;
  abrirGrade('conv:' + convSel, 'conv-detalhe');
}

function selecionarConv(id) {
  if (id === convSel) return;
  convSel = id;
  const ids = conveniadosLista().map(c => c.id);
  document.querySelectorAll('#conv-cards .tcard').forEach((b, i) => b.classList.toggle('on', ids[i] === id));
  abrirGrade('conv:' + id, 'conv-detalhe');
}

// ── Cadastro ──────────────────────────────────────────────────
let _convEd = null;
function abrirConveniado(id) {
  const c = id ? ESTADO.conveniados[id] : null;
  const tabs = tabelasLista().filter(t => t.tipo !== 'lab');
  _convEd = { id: id || null, ativo: c ? c.ativo !== false : true };
  const n = c ? Object.keys(c.precos || {}).length : 0;
  abrirGaveta({
    sobre: id ? 'Conveniado' : 'Novo conveniado', titulo: c ? c.nome : 'Cadastrar conveniado',
    corpo: `<div class="form-col">
      ${campo('cv-nome', 'Nome', c?.nome || '', { tipo: 'text', ph: 'Ex.: Associação dos Servidores' })}
      ${campo('cv-razao', 'Razão social', c?.razaoSocial || '', { tipo: 'text', ph: 'Como no contrato' })}
      <div class="fgrid sem-pad">
        ${campo('cv-cnpj', 'CNPJ', c?.cnpj || '', { tipo: 'text', ph: '00.000.000/0000-00', aoMudar: 'this.value=mascaraCnpj(this.value)' })}
        ${campo('cv-conv', 'Cód. do convênio', c?.codConvenio || '', { tipo: 'text', ph: 'No Unilab', dica: 'código do convênio no sistema' })}
      </div>
      <div class="field"><label>Tabela base</label><div id="pop-cvtab" class="block"></div><span class="hint">Preço dos exames sem valor diferenciado, perfil de custo e piso de margem</span></div>
      <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-eye"></i><div>Conveniado ativo<div class="s">inativo fica esmaecido na lista</div></div></div>${chave(_convEd.ativo, '_convEd.ativo=!_convEd.ativo;this.classList.toggle(\'on\')')}</div></div>
      <div class="just" style="margin:0"><label for="cv-obs">Observações</label><textarea id="cv-obs" placeholder="Contato, vigência, condição de pagamento…">${esc(c?.obs || '')}</textarea></div>
    </div>`,
    rodape: `${id && pode('tabelas', 'excluir') ? `<button class="btn perigo-txt" onclick="excluirConveniado('${id}')" title="Excluir conveniado"><i class="fa-solid fa-trash"></i></button>` : ''}
      <span style="margin-right:auto">${n ? `<span class="hint">${n} valor(es) diferenciado(s)</span>` : ''}</span>
      <button class="btn" onclick="fecharGaveta()">Cancelar</button><button class="btn pri" onclick="gravarConveniado()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>`
  });
  criarPop('pop-cvtab', {
    rotulo: 'Tabela', titulo: 'Tabela base', icone: 'fa-table-list', padrao: '',
    opcoes: () => [{ valor: '', rotulo: 'Particular', icone: 'fa-user', cor: '#00a8cc', desc: `preço praticado · mínimo ${textoRegra(null, 'piso')}` },
      ...tabs.map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, desc: `piso ${textoRegra(t, 'piso')} · ${resumoPerfil(t)}` }))]
  });
  POPS['pop-cvtab'].valor = c?.tabelaId && ESTADO.tabelas[c.tabelaId] ? c.tabelaId : ''; desenharBotaoPop('pop-cvtab');
}

async function gravarConveniado() {
  const nome = valorCampo('cv-nome').trim();
  if (!nome) return toast('Informe o nome', 'erro');
  const cnpj = valorCampo('cv-cnpj').trim();
  if (cnpj && cnpj.replace(/\D/g, '').length !== 14) return toast('CNPJ deve ter 14 dígitos', 'erro');
  const repetido = lista(ESTADO.conveniados).find(c => c.id !== _convEd.id && normalizar(c.nome) === normalizar(nome));
  if (repetido) return toast(`Já existe o conveniado ${repetido.nome}`, 'erro');
  const dados = { nome, razaoSocial: valorCampo('cv-razao').trim() || null, cnpj: cnpj || null, codConvenio: valorCampo('cv-conv').trim() || null,
    tabelaId: valorPop('pop-cvtab') || null, ativo: _convEd.ativo, obs: valorCampo('cv-obs').trim() || null, atualizadoEm: DB.agora() };
  let id = _convEd.id;
  if (id) await DB.mesclar(`${CAMINHOS.conveniados}/${id}`, dados);
  else {
    id = DB.novaChave(CAMINHOS.conveniados);
    await DB.gravar(`${CAMINHOS.conveniados}/${id}`, { ...dados, criadoEm: DB.agora() });
    ESTADO.conveniados[id] = ESTADO.conveniados[id] || { ...dados };
  }
  registrar('conveniados', `Conveniado ${nome} ${_convEd.id ? 'alterado' : 'cadastrado'}`, { depois: dados });
  fecharGaveta();
  convSel = id; tabAba = 'conv'; grade.alvo = null;
  renderTela();
  toast(`${nome} salvo`);
}

async function excluirConveniado(id) {
  const c = ESTADO.conveniados[id], n = Object.keys(c.precos || {}).length;
  const ok = await confirmar({ titulo: `Excluir ${c.nome}?`, texto: n ? `Os ${n} valores diferenciados também serão apagados.` : 'O cadastro será apagado.', botao: 'Excluir', perigo: true });
  if (!ok) return;
  await DB.remover(`${CAMINHOS.conveniados}/${id}`);
  await DB.remover(`rascunhos/conv:${id}`);
  registrar('conveniados', `Conveniado ${c.nome} excluído`, { antes: { ...c, precos: null }, valores: n });
  fecharGaveta();
  if (convSel === id) convSel = null;
  renderTabelas();
  toast(`${c.nome} excluído`);
}

// ── Exportação: lista de valores diferenciados ────────────────
function exportarConveniado(id) {
  const cx = ctxAlvo('conv:' + id), c = ESTADO.conveniados[id];
  const linhas = Object.entries(c.precos || {}).filter(([k]) => ESTADO.exames[k])
    .map(([k, v]) => ({ e: ESTADO.exames[k], v, ref: cx.ref?.valor(k) ?? null }))
    .sort((a, b) => a.e.mn.localeCompare(b.e.mn, 'pt-BR', { sensitivity: 'base' }));
  if (!linhas.length) return toast('Nenhum valor diferenciado para exportar', 'erro');
  const dec = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  const csv = [['Mnemônico', 'Exame', cx.ref?.nome || 'Tabela', 'Valor diferenciado', 'Desconto'].join(';'),
    ...linhas.map(x => [x.e.mn, `"${String(x.e.descricao || '').replace(/"/g, '""')}"`, dec(x.ref), dec(x.v), x.ref ? pct(1 - x.v / x.ref).replace('%', '') + '%' : ''].join(';'))].join('\r\n') + '\r\n';
  baixarArquivo(`Conveniado - ${c.nome}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  registrar('conveniados', `Lista de ${c.nome} exportada (${linhas.length} exames)`);
}
