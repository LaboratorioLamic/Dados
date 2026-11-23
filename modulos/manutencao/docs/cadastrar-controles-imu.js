// Cadastro único: controles VITROS (HBsAg, Anti-HCV, Anti-HBs) como MATERIAIS DE CONTROLE (com níveis e preparo
// por nível), seus LOTES DE CONTROLE e o CONJUNTO de troca dos três, na área IMU.
// Se a versão anterior deste script (que cadastrou os controles como reagentes/kit) já foi rodada, os produtos,
// lotes e o conjunto criados por ela são excluídos no mesmo envio — só se não tiverem lançamentos nem preparos.
// Colar no console (F12) do app aberto e logado com permissão de configurar o CQ.
// 1º: roda em prévia (nada é gravado). 2º: cqCadastrarControlesIMU({ gravar: true }).
// Fonte: rótulos das caixas + IFU Ortho-Clinical Diagnostics (Control Storage, Preparation and Handling):
// fechado 2–8 °C até a validade; reconstituído 2–8 °C por 5 dias ou ≤ -20 °C por 4 semanas.
async function cqCadastrarControlesIMU({ gravar = true } = {}) {
  const SIGLA = 'IMU';
  const C = CQ_KEYS.config, FLAG = `${C}/migracoes/controlesVitrosIMU2`, FLAG_ANTIGA = `${C}/migracoes/controlesVitrosIMU`;
  const pare = msg => { console.error('[cadastro] ' + msg); return null; };
  const FAB = 'Ortho-Clinical Diagnostics';
  const ARM = 'Fechado: 2 a 8 °C até a validade. Reconstituído: 2 a 8 °C por 5 dias ou ≤ -20 °C por 4 semanas.';
  const RISCO = 'Derivado de sangue humano — tratar como potencialmente infectante (GHS07).';
  const instrucao = vol => `Reconstituir cada frasco com ${String(vol).replace('.', ',')} mL de água reagente; inverter suavemente até dissolver por completo. Um frasco por nível.`;
  const MATERIAIS = [
    { nome: 'VITROS HBsAg Controls', ref: '680 0598', vol: 1.6, niveis: { 1: { nome: 'Positivo' }, 2: { nome: 'Negativo' } },
      lote: '1400', validade: '2027-12-03', fabricacao: '2025-12-20', sn: '0168', nomeAntigo: 'VITROS HBsAg Controls (níveis 1 e 2)' },
    { nome: 'VITROS Anti-HCV Controls', ref: '680 0731', vol: 1.0, niveis: { 1: { nome: 'Negativo' }, 2: { nome: 'Positivo' } },
      lote: '1690', validade: '2026-11-30', fabricacao: '2025-12-11', sn: '0394', nomeAntigo: 'VITROS Anti-HCV Controls (níveis 1 e 2)' },
    { nome: 'VITROS Anti-HBs Controls', ref: '680 0389', vol: 2.0, niveis: { 1: { nome: 'Negativo' }, 2: { nome: 'Positivo' }, 3: { nome: 'Positivo' } },
      lote: '0961', validade: '2027-10-08', fabricacao: '2025-11-14', sn: '0206', nomeAntigo: 'VITROS Anti-HBs Controls (níveis 1, 2 e 3)',
      aviso: 'Estabilidade reconstituída não confirmada na bula consultada (assumidos 5 dias, como nos demais controles VITROS) — conferir a IFU do kit.' },
  ];
  const CONJ_ANTIGO = 'Controles VITROS hepatites (HBsAg, Anti-HCV, Anti-HBs)';
  const CONJ_NOME = 'Controles VITROS hepatites';   // troca conjunta dos 3 controles (um preparo por nível)

  if (!_cqConfigReady) return pare('Cadastros do CQ ainda não carregados. Abra a aba Controle de Qualidade e tente de novo.');
  if (!_cqCan('configurar')) return pare('Sem permissão de configurar o CQ.');
  if (window._dbConnected === false) return pare('Sem conexão com o banco.');
  if (typeof _cqCtlPrepLotes !== 'function') return pare('App desatualizado: recarregue a página (Ctrl+F5) para carregar o preparo de controles por nível.');
  const area = Object.values(cqState.config.unidades || {}).find(u => String(u.sigla || '').trim().toUpperCase() === SIGLA);
  if (!area) return pare(`Área ${SIGLA} não encontrada.`);
  const AREA = area.id;
  // Marcador sem os registros (apagados pela tela, sem o script de reversão): segue e regrava o marcador
  const restantes = Object.values(cqState.config.materiais || {}).filter(m => m?.criadoPor?.migracao === 'controlesVitrosIMU2');
  if (await window.dbGet(FLAG)) {
    if (restantes.length) return pare(`Cadastro já foi feito (${restantes.map(m => m.nome).join(', ')}). Para refazer, rode antes docs/reverter-controles-imu.js.`);
    console.warn('[cadastro] Marcador migracoes/controlesVitrosIMU2 existe, mas os materiais foram apagados: cadastrando de novo.');
  }
  const norm = s => _cqNormBusca(String(s || '').trim());
  const ja = MATERIAIS.filter(x => _cqDaUnidade('materiais', AREA).some(m => norm(m.nome) === norm(x.nome)));
  if (ja.length) return pare(`Já existem materiais na área: ${ja.map(x => x.nome).join(', ')}. Cancelado para não duplicar.`);
  if (Object.values(cqState.config.conjuntosPreparo || {}).some(c => norm(c.nome) === norm(CONJ_NOME) && _cqArr(c.unidadeIds).includes(AREA)))
    return pare(`Já existe o conjunto ${CONJ_NOME} na área. Exclua-o ou rode docs/reverter-controles-imu.js antes.`);

  const hoje = _cqHoje();
  const ass = _cqAssinatura({ migracao: 'controlesVitrosIMU2' });
  const trilha = texto => ({ [_cqTk() + Math.random().toString(36).slice(2, 5)]: _cqTrilhaEntry('migracao', texto) });
  const up = {};

  // 1) Cadastro errado da versão anterior (controles como reagente/kit): exclui se não tiver vínculos
  const remover = [];
  const prodsAntigos = _cqDaUnidade('insumoProdutos', AREA).filter(p => MATERIAIS.some(x => norm(x.nomeAntigo) === norm(p.nome)));
  const conjAntigo = Object.values(cqState.config.conjuntosPreparo || {}).find(c => norm(c.nome) === norm(CONJ_ANTIGO) && _cqArr(c.unidadeIds).includes(AREA));
  if (prodsAntigos.length || conjAntigo) {
    const uso = await window.dbGet(CQ_KEYS.uso) || {};
    for (const p of prodsAntigos) {
      const lotes = _cqLotesDoProduto(p.id);
      const vinc = lotes.filter(l => uso.insumos?.[l.id] || Object.keys(_cqLoteCru(l).preparos || {}).length);
      if (vinc.length) return pare(`O produto antigo ${p.nome} tem lote com lançamento ou preparo (${vinc.map(l => l.lote).join(', ')}). Exclua/finalize manualmente antes; nada foi gravado.`);
      if (Object.values(cqState.config.testes).some(t => t.insumoProdutoId === p.id)) return pare(`O produto antigo ${p.nome} está vinculado a um teste. Desvincule antes; nada foi gravado.`);
      lotes.forEach(l => remover.push({ col: 'insumos', rec: _cqLoteCru(l), resumo: `${p.nome} — lote ${l.lote}` }));
      remover.push({ col: 'insumoProdutos', rec: p, resumo: `${p.nome} (kit)` });
    }
    if (conjAntigo) remover.push({ col: 'conjuntosPreparo', rec: conjAntigo, resumo: conjAntigo.nome });
    const motivo = 'Cadastro errado: controles VITROS cadastrados como reagente/kit; recadastrados como material de controle com preparo por nível';
    remover.forEach(r => {
      up[`${C}/${r.col}/${r.rec.id}`] = null;
      up[`${CQ_KEYS.exclusoes}/${_cqTk()}${Math.random().toString(36).slice(2, 5)}`] = { colecao: r.col, id: r.rec.id, resumo: r.resumo, motivo, registro: r.rec, ...ass };
    });
    if (await window.dbGet(FLAG_ANTIGA)) up[FLAG_ANTIGA] = null;
  }

  // 2) Materiais de controle (níveis + preparo por nível) e lotes
  const materiais = [], lotes = [];
  MATERIAIS.forEach((x, i) => {
    const m = { id: _cqUid() + 'm' + i, nome: x.nome, fabricante: FAB, fornecedor: '', tipo: 'comercial', regAnvisa: '', matriz: 'Plasma humano liofilizado',
      codigoReferencia: `REF ${x.ref}`, estabilidadeAbertoDias: 5, armazenamento: ARM, niveis: x.niveis, equips: [], analitoIds: [], unidadeIds: [AREA], ativo: true,
      preparoInterno: true, preparo: { volume: x.vol, unidadeQtd: 'mL', validadeDias: 5, especificacao: instrucao(x.vol), riscos: RISCO },
      criadoEm: ass.em, criadoPor: ass, atualizadoEm: ass.em,
      trilha: trilha(`Material cadastrado (REF ${x.ref}) a partir do rótulo e da IFU: ${Object.keys(x.niveis).length} níveis, reconstituição ${String(x.vol).replace('.', ',')} mL, validade de uso 5 dia(s) a 2–8 °C${x.aviso ? '. ' + x.aviso : ''}`) };
    const venc = x.validade < hoje;
    const l = { id: _cqUid() + 'l' + i, materialId: m.id, lote: x.lote, validade: x.validade, niveis: Object.keys(x.niveis).map(Number), unidadeIds: [AREA],
      status: venc ? 'encerrado' : 'em_uso', bulaUrl: '', observacoes: `Fabricação ${_cqFmtData(x.fabricacao)} · SN ${x.sn}${x.aviso ? ' · ' + x.aviso : ''}`,
      criadoEm: ass.em, criadoPor: ass, atualizadoEm: ass.em, trilha: trilha(`Lote ${x.lote} cadastrado (validade ${_cqFmtData(x.validade)})`) };
    if (venc) l.encerradoAuto = { em: ass.em, validade: x.validade, statusAnterior: 'em_uso' };
    materiais.push(m); lotes.push(l);
    up[`${C}/materiais/${m.id}`] = m;
    up[`${C}/lotesControle/${l.id}`] = l;
  });
  // 3) Conjunto de troca com os 3 controles: a troca registra um preparo e uma etiqueta por nível de cada um
  const conjunto = { id: _cqUid() + 'cj', nome: CONJ_NOME, ativo: true, unidadeIds: [AREA],
    itens: MATERIAIS.map((x, i) => ({ materialId: materiais[i].id, quantidade: x.vol, unidadeQtd: 'mL' })),
    criadoEm: ass.em, criadoPor: ass, atualizadoEm: ass.em, trilha: trilha(`Conjunto criado: ${MATERIAIS.map(x => x.nome).join(', ')}`) };
  up[`${C}/conjuntosPreparo/${conjunto.id}`] = conjunto;
  up[FLAG] = { em: ass.em, porNome: ass.porNome, materiais: materiais.length, lotes: lotes.length, conjuntos: 1, removidos: remover.length, versao: CQ_VERSAO };

  console.table(MATERIAIS.map((x, i) => ({ material: x.nome, REF: x.ref, lote: x.lote, validade: _cqFmtData(x.validade), niveis: Object.entries(x.niveis).map(([n, v]) => `N${n} ${v.nome}`).join(', '),
    reconst: String(x.vol).replace('.', ',') + ' mL', situacao: lotes[i].status })));
  if (remover.length) console.table(remover.map(r => ({ excluir: r.resumo, colecao: r.col })));
  console.log(`[cadastro] ${materiais.length} materiais, ${lotes.length} lotes, 1 conjunto (${CONJ_NOME})${remover.length ? `, ${remover.length} cadastro(s) antigo(s) excluído(s)` : ''} — área ${area.sigla}.`);
  MATERIAIS.filter(x => x.aviso).forEach(x => console.warn(`[cadastro] ${x.nome}: ${x.aviso}`));

  if (!gravar) { console.log('[cadastro] PRÉVIA — nada foi gravado. Confira e rode: cqCadastrarControlesIMU({ gravar: true })'); return { materiais, lotes, conjunto, remover }; }
  if (!(await window.dbUpdate(up))) return pare('Falha ao gravar. Nada foi alterado (envio único).');
  console.log('[cadastro] Concluído. Veja CQ › Cadastros › Controles/Materiais (área IMU). Preparo por nível: Cadastros › Preparos › "Novo preparo" ou "Trocar conjunto".');
  return true;
}
cqCadastrarControlesIMU();
