// Reverte o cadastro feito por docs/cadastrar-controles-imu.js (controles VITROS na área IMU).
// Apaga os registros criados pelo script — identificados por criadoPor.migracao — e o marcador da migração:
//   v2 'controlesVitrosIMU2': materiais de controle + lotes de controle
//   v1 'controlesVitrosIMU' : produtos (kit) + lotes de insumo + conjunto de preparo
// Só apaga o que não tem vínculos: lançamento de CQ, preparo registrado, teste usando, conjunto contendo.
// Havendo vínculo, para sem gravar nada. Cada exclusão fica em gestao-cq-exclusoes-v1 com cópia do registro.
// Colar no console (F12) do app aberto e logado com permissão de configurar o CQ.
// 1º: roda em prévia (nada é gravado). 2º: cqReverterControlesIMU({ gravar: true }).
async function cqReverterControlesIMU({ gravar = false } = {}) {
  const C = CQ_KEYS.config;
  const MIG = ['controlesVitrosIMU2', 'controlesVitrosIMU'];
  const pare = msg => { console.error('[reverter] ' + msg); return null; };
  if (!_cqConfigReady) return pare('Cadastros do CQ ainda não carregados. Abra a aba Controle de Qualidade e tente de novo.');
  if (!_cqCan('configurar')) return pare('Sem permissão de configurar o CQ.');
  if (window._dbConnected === false) return pare('Sem conexão com o banco.');

  const cfg = cqState.config;
  const daMig = r => MIG.includes(r?.criadoPor?.migracao);
  const cru = r => (typeof _cqLoteCru === 'function' ? _cqLoteCru(r) : r);
  const alvo = {
    materiais: Object.values(cfg.materiais || {}).filter(daMig),
    lotesControle: Object.values(cfg.lotesControle || {}).filter(daMig),
    insumoProdutos: Object.values(cfg.insumoProdutos || {}).filter(daMig),
    insumos: Object.values(cfg.insumos || {}).map(cru).filter(daMig),
    conjuntosPreparo: Object.values(cfg.conjuntosPreparo || {}).filter(daMig),
  };
  const total = Object.values(alvo).reduce((s, l) => s + l.length, 0);
  const flags = {};
  for (const m of MIG) flags[m] = await window.dbGet(`${C}/migracoes/${m}`);
  if (!total && !Object.values(flags).some(Boolean)) return pare('Nada a reverter: nenhum registro criado pelo script e nenhum marcador de migração.');

  // Vínculos que impedem a exclusão
  const uso = (await window.dbGet(CQ_KEYS.uso)) || {};
  const ids = c => new Set(alvo[c].map(r => r.id));
  const mats = ids('materiais'), lcs = ids('lotesControle'), prods = ids('insumoProdutos'), ins = ids('insumos'), cjs = ids('conjuntosPreparo');
  const testes = Object.values(cfg.testes || {});
  const nomeT = t => `${_cqNomeTeste(t)} · ${_cqEquipTeste(t)}`;
  const vinc = [];
  alvo.lotesControle.forEach(l => {
    if (uso.lotesControle?.[l.id]) vinc.push(`Lote de controle ${l.lote}: possui lançamentos de CQ`);
    const n = Object.keys(l.preparos || {}).length;
    if (n) vinc.push(`Lote de controle ${l.lote}: ${n} preparo(s) registrado(s)`);
    testes.filter(t => Object.values(t.lotesAtivos || {}).includes(l.id)).forEach(t => vinc.push(`Lote de controle ${l.lote}: em uso no teste ${nomeT(t)}`));
  });
  alvo.materiais.forEach(m => {
    if (uso.materiais?.[m.id]) vinc.push(`Material ${m.nome}: possui lançamentos de CQ`);
    testes.filter(t => t.materialId === m.id || Object.values(t.controlesQual || {}).some(c => c?.materialId === m.id)).forEach(t => vinc.push(`Material ${m.nome}: usado no teste ${nomeT(t)}`));
    Object.values(cfg.lotesControle || {}).filter(l => l.materialId === m.id && !lcs.has(l.id)).forEach(l => vinc.push(`Material ${m.nome}: tem o lote ${l.lote}, cadastrado fora do script`));
    Object.values(cfg.conjuntosPreparo || {}).filter(c => !cjs.has(c.id) && (c.itens || []).some(x => x?.materialId === m.id)).forEach(c => vinc.push(`Material ${m.nome}: está no conjunto ${c.nome}`));
  });
  alvo.insumos.forEach(i => {
    if (uso.insumos?.[i.id]) vinc.push(`Lote de insumo ${i.lote}: possui lançamentos de CQ`);
    const n = Object.keys(i.preparos || {}).length;
    if (n) vinc.push(`Lote de insumo ${i.lote}: ${n} preparo(s) registrado(s)`);
  });
  alvo.insumoProdutos.forEach(p => {
    testes.filter(t => t.insumoProdutoId === p.id).forEach(t => vinc.push(`Produto ${p.nome}: controlado pelo teste ${nomeT(t)}`));
    Object.values(cfg.insumos || {}).map(cru).filter(i => i.produtoId === p.id && !ins.has(i.id)).forEach(i => vinc.push(`Produto ${p.nome}: tem o lote ${i.lote}, cadastrado fora do script`));
    Object.values(cfg.conjuntosPreparo || {}).filter(c => !cjs.has(c.id) && (c.itens || []).some(x => x?.produtoId === p.id)).forEach(c => vinc.push(`Produto ${p.nome}: está no conjunto ${c.nome}`));
  });
  alvo.conjuntosPreparo.forEach(c => {
    const n = [...Object.values(cfg.insumos || {}).map(cru), ...Object.values(cfg.lotesControle || {})]
      .reduce((s, r) => s + Object.values(r?.preparos || {}).filter(p => p?.conjunto?.id === c.id).length, 0);
    if (n) vinc.push(`Conjunto ${c.nome}: já usado em troca (${n} preparo(s))`);
  });

  const rot = { materiais: 'Material', lotesControle: 'Lote de controle', insumoProdutos: 'Produto', insumos: 'Lote de insumo', conjuntosPreparo: 'Conjunto' };
  const resumo = (c, r) => c === 'lotesControle' ? `${cfg.materiais[r.materialId]?.nome || '?'} — lote ${r.lote}` : c === 'insumos' ? `${cfg.insumoProdutos[r.produtoId]?.nome || '?'} — lote ${r.lote}` : r.nome;
  console.table(Object.entries(alvo).flatMap(([c, l]) => l.map(r => ({ excluir: rot[c], registro: resumo(c, r), migracao: r.criadoPor.migracao, criadoEm: _cqFmtDH(r.criadoEm) }))));
  Object.entries(flags).filter(([, v]) => v).forEach(([m]) => console.log(`[reverter] Marcador migracoes/${m} será removido.`));
  if (vinc.length) { vinc.forEach(v => console.warn('[reverter] ' + v)); return pare(`${vinc.length} vínculo(s) impedem a reversão. Resolva-os (exclua preparos, desvincule testes) e rode de novo. Nada foi gravado.`); }
  if (!gravar) { console.log(`[reverter] PRÉVIA — ${total} registro(s) seriam excluídos. Nada foi gravado. Para confirmar: cqReverterControlesIMU({ gravar: true })`); return alvo; }

  const ass = _cqAssinatura({ migracao: 'reverterControlesIMU' });
  const motivo = 'Reversão do cadastro feito por docs/cadastrar-controles-imu.js';
  const up = {};
  Object.entries(alvo).forEach(([c, l]) => l.forEach(r => {
    up[`${C}/${c}/${r.id}`] = null;
    up[`${CQ_KEYS.exclusoes}/${_cqTk()}${Math.random().toString(36).slice(2, 5)}`] = { colecao: c, id: r.id, resumo: resumo(c, r), motivo, registro: r, ...ass };
  }));
  Object.entries(flags).filter(([, v]) => v).forEach(([m]) => { up[`${C}/migracoes/${m}`] = null; });
  if (!(await window.dbUpdate(up))) return pare('Falha ao gravar. Nada foi alterado (envio único).');
  Object.entries(alvo).forEach(([c, l]) => l.forEach(r => { delete cfg[c][r.id]; }));
  if (typeof _cqHidratarInsumos === 'function') _cqHidratarInsumos();
  if (typeof cqRender === 'function') cqRender();
  console.log(`[reverter] Concluído: ${total} registro(s) excluído(s). O script de cadastro pode ser rodado de novo.`);
  return true;
}
cqReverterControlesIMU();
