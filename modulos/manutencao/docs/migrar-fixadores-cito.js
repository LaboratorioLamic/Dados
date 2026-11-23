// Migração única: histórico de "Fixadores Citológicos" (ativo CITO, tarefas de troca) → CQ › Preparos, área CITO.
// Colar no console (F12) do app aberto e logado com permissão de configurar o CQ.
// 1º: roda em prévia (nada é gravado). 2º: cqMigrarFixadores({ gravar: true }) grava tudo num único envio.
async function cqMigrarFixadores({ gravar = false } = {}) {
  const AREA = 'muy9sih2vgx08';                                       // área CITO
  const TAREFAS = { mqaverehvsuyo: 15, mqavnnywlzmyi: 30 };            // validade de uso (dias): quinzenal, mensal
  const CONJUNTOS = { mqaverehvsuyo: 'Bateria Papanicolau (quinzenal)', mqavnnywlzmyi: 'Xilol (mensal)' };
  const TIPO = { 'Hematoxilina': 'corante', 'Orange G6': 'corante', 'EA 36': 'corante' };   // demais: reagente
  const C = CQ_KEYS.config, FLAG = `${C}/migracoes/fixadoresCITO`;
  const pare = msg => { console.error('[migração] ' + msg); return null; };

  if (!_cqConfigReady) return pare('Cadastros do CQ ainda não carregados. Abra a aba Controle de Qualidade e tente de novo.');
  if (!_cqCan('configurar')) return pare('Sem permissão de configurar o CQ.');
  if (window._dbConnected === false) return pare('Sem conexão com o banco.');
  if (!cqState.config.unidades[AREA]) return pare('Área CITO não encontrada.');
  if (await window.dbGet(FLAG)) return pare('Migração já foi feita (veja migracoes/fixadoresCITO). Nada a fazer.');

  const ativos = await window.dbGet('gestao-ativos-v2');
  const tarefas = (ativos?.tarefas || []).filter(t => t && TAREFAS[t.id]);
  if (tarefas.length !== 2) return pare('Tarefas de troca do ativo CITO não encontradas.');
  // Publicações: nó principal + arquivo
  const pubs = new Map();
  (ativos.publicacoes || []).forEach(p => { if (p && TAREFAS[p.tarefaId]) pubs.set(p.id, p); });
  const arq = await window.dbGet('gestao-pubs-arquivo-v1/grupos');
  const varrer = o => { if (!o || typeof o !== 'object') return; if (o.tarefaId && o.dataRealizada) { if (TAREFAS[o.tarefaId]) pubs.set(o.id, o); return; } Object.values(o).forEach(varrer); };
  varrer(arq);
  const lista = [...pubs.values()].sort((a, b) => (a.dataRealizada || '').localeCompare(b.dataRealizada || ''));
  if (!lista.length) return pare('Nenhuma publicação encontrada.');

  const itens = tarefas.flatMap(t => (t.checklistTarefa || []).map(c => ({ t, c })));
  const norm = s => _cqNormBusca(String(s || '').trim());
  const ja = itens.filter(({ c }) => _cqDaUnidade('insumoProdutos', AREA).some(p => norm(p.nome) === norm(c.texto)));
  if (ja.length) return pare(`Já existem na área os produtos: ${ja.map(x => x.c.texto).join(', ')}. Migração cancelada para não duplicar.`);

  const hoje = _cqHoje();
  const ass = _cqAssinatura({ migracao: 'fixadoresCITO' });
  const trilha = texto => ({ [_cqTk() + Math.random().toString(36).slice(2, 5)]: _cqTrilhaEntry('migracao', texto) });
  const origem = t => `tarefa "${t.titulo}" do ativo CITO (Fixadores Citológicos)`;

  // Produtos: um por item do checklist das tarefas
  const prodPorItem = {}, produtos = [];
  itens.forEach(({ t, c }) => {
    const p = { id: _cqUid() + produtos.length, tipo: TIPO[c.texto] || 'reagente', nome: c.texto, fabricante: '', regAnvisa: '', equips: [], analitoIds: [],
      preparoInterno: true, preparo: { especificacao: '', armazenamento: 'Conforme instruções do fabricante', riscos: '', validadeDias: TAREFAS[t.id], liberaSemCIQ: true, avisoDias: 3 },
      unidadeIds: [AREA], ativo: true, criadoEm: ass.em, criadoPor: ass, atualizadoEm: ass.em,
      trilha: trilha(`Produto criado a partir da ${origem(t)}: validade de uso ${TAREFAS[t.id]} dia(s), aviso 3 dias antes`) };
    prodPorItem[c.id] = { p, t, c };
    produtos.push(p);
  });

  // Lotes (produto + número), com os preparos dentro
  const lotes = new Map();
  const loteDe = (p, numero, validade, t) => {
    const k = p.id + '|' + norm(numero);
    if (!lotes.has(k)) {
      const venc = !!validade && validade < hoje;
      const l = { id: _cqUid() + lotes.size, produtoId: p.id, lote: numero, validade, status: venc ? 'encerrado' : 'em_uso', unidadeIds: [AREA], preparoUsoUnico: false,
        observacoes: `Importado do histórico da ${origem(t)}`, preparos: {}, preparoSeq: 0, criadoEm: ass.em, criadoPor: ass, atualizadoEm: ass.em,
        trilha: trilha(`Lote importado do histórico da ${origem(t)}${venc ? ` — validade ${_cqFmtData(validade)} já expirada: encerrado` : ''}`) };
      if (venc) l.encerradoAuto = { em: ass.em, validade, statusAnterior: 'em_uso' };
      lotes.set(k, l);
    }
    return lotes.get(k);
  };

  // Conjuntos de troca
  const conjuntos = tarefas.map(t => ({ id: _cqUid() + 'cj' + t.id.slice(-3), nome: CONJUNTOS[t.id], ativo: true, unidadeIds: [AREA],
    itens: (t.checklistTarefa || []).map(c => ({ produtoId: prodPorItem[c.id].p.id, quantidade: null, unidadeQtd: 'mL' })),
    criadoEm: ass.em, criadoPor: ass, atualizadoEm: ass.em, trilha: trilha(`Conjunto criado a partir da ${origem(t)}`) }));
  const cjDe = tid => conjuntos[tarefas.findIndex(t => t.id === tid)];

  // Preparos: um por item marcado em cada publicação
  const porProduto = {};
  lista.forEach(pub => {
    const cj = cjDe(pub.tarefaId);
    (pub.checklistMarcado || []).forEach(itemId => {
      const x = prodPorItem[itemId];
      if (!x) return;
      const info = pub.checklistLotes?.[itemId] || { lote: x.c.lote, validade: x.c.validade };
      const L = loteDe(x.p, info.lote || 'sem lote', info.validade || null, x.t);
      const dia = pub.dataRealizada.slice(0, 10);
      const seq = ++L.preparoSeq;
      let validade = _cqSomarDias(dia, TAREFAS[x.t.id]);
      if (L.validade && L.validade < validade) validade = L.validade;
      const obs = [pub.notas, L.validade && L.validade < dia ? `Lote já vencido na data da troca (validade ${_cqFmtData(L.validade)})` : ''].filter(Boolean).join(' · ');
      const prep = { id: _cqUid() + seq + itemId.slice(-2), seq, codigo: `${L.lote}-P${String(seq).padStart(2, '0')}`, data: dia, dataHora: pub.dataRealizada.slice(0, 16),
        responsavelId: pub.publicadoPorId || null, responsavel: pub.publicadoPorNome || '', observacoes: obs, validade,
        situacao: 'liberado', avaliacao: { auto: true, acao: 'liberado', motivo: 'Importado do histórico (produto sem corrida de CIQ)', ...ass },
        legado: false, origem: 'historico', importacao: { tarefaId: pub.tarefaId, publicacaoId: pub.id, publicadoEm: pub.dataPublicacao || null },
        conjunto: { id: cj.id, nome: cj.nome, troca: pub.id }, criadoEm: ass.em, criadoPor: ass, corridas: {} };
      L.preparos[prep.id] = prep;
      (porProduto[x.p.id] = porProduto[x.p.id] || []).push({ L, prep });
    });
  });
  // Cada troca substitui a anterior do mesmo produto; a última fica em uso
  Object.values(porProduto).forEach(arr => arr.forEach(({ prep }, i) => {
    const prox = arr[i + 1];
    if (prox) prep.finalizado = { auto: false, motivo: `Substituído pelo preparo ${prox.prep.codigo} na troca de ${_cqFmtData(prox.prep.data)} (histórico)`, ...ass };
  }));

  const prepsTodos = [...lotes.values()].flatMap(L => Object.values(L.preparos).map(p => ({ L, p })));
  console.table(prepsTodos.sort((a, b) => a.p.dataHora.localeCompare(b.p.dataHora)).map(({ L, p }) => ({
    produto: cqState.config.insumoProdutos[L.produtoId]?.nome || produtos.find(x => x.id === L.produtoId)?.nome, lote: L.lote, codigo: p.codigo,
    troca: _cqFmtDH(p.dataHora), validade: _cqFmtData(p.validade), situacao: p.finalizado ? 'finalizado' : 'EM USO', responsavel: p.responsavel, obs: p.observacoes })));
  console.log(`[migração] ${produtos.length} produtos, ${lotes.size} lotes, ${prepsTodos.length} preparos (${lista.length} trocas), ${conjuntos.length} conjuntos — área ${cqState.config.unidades[AREA].sigla}.`);
  [...lotes.values()].filter(L => L.status === 'encerrado').forEach(L => console.warn(`[migração] Lote ${L.lote} (${produtos.find(x => x.id === L.produtoId).nome}) vencido em ${_cqFmtData(L.validade)}: entra encerrado; o preparo em uso dele vai aparecer como troca vencida.`));

  if (!gravar) { console.log('[migração] PRÉVIA — nada foi gravado. Confira a tabela e rode: cqMigrarFixadores({ gravar: true })'); return { produtos, lotes: [...lotes.values()], conjuntos }; }

  const up = {};
  produtos.forEach(p => { up[`${C}/insumoProdutos/${p.id}`] = p; });
  lotes.forEach(L => { up[`${C}/insumos/${L.id}`] = L; });
  conjuntos.forEach(c => { up[`${C}/conjuntosPreparo/${c.id}`] = c; });
  up[FLAG] = { em: ass.em, porNome: ass.porNome, produtos: produtos.length, lotes: lotes.size, preparos: prepsTodos.length, trocas: lista.length, conjuntos: conjuntos.length, versao: CQ_VERSAO };
  if (!(await window.dbUpdate(up))) return pare('Falha ao gravar. Nada foi alterado (envio único).');
  console.log('[migração] Concluída. Veja CQ › Cadastros › Preparos (área CITO).');
  return true;
}
cqMigrarFixadores();
