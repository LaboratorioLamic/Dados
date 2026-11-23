// ═══════════════════════════════════════════════════════════════
// cq-planilha.js — Exportação e importação do CQ em Excel (.xlsx) — LAMIC
// Exporta cadastros, alvos, corridas, resultados e não conformidades.
// Importa cadastros (analitos, materiais, lotes, insumos, testes, alvos)
// e resultados históricos, que viram corridas avaliadas pelo mesmo motor
// (CQEngine) dos lançamentos, com trilha "importado da planilha".
// A importação é tudo ou nada: com qualquer erro, nada é gravado.
// Registros já existentes são ignorados (não são alterados).
// Biblioteca: SheetJS, carregada sob demanda do cdnjs.
// ═══════════════════════════════════════════════════════════════

const CQ_XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const CQ_XLSX_SRI = 'sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==';
const CQ_PL_HORA_PADRAO = '08:00';

const CQ_PL_COLS = {
  'Áreas': ['Sigla', 'Nome', 'CNES', 'Fuso horário', 'Ativa'],
  'Setores': ['Área', 'Setor', 'Ativo'],
  'Analitos': ['Código', 'Nome', 'Tipo', 'Unidade de medida', 'Casas decimais', 'ETa', 'Tipo do ETa', 'Fonte do ETa', 'Referência do ETa',
    'Resultados possíveis', 'Tolerância (categorias)', 'Equipamentos', 'Sistemas sem equipamento', 'Ativo', 'Áreas'],
  'Materiais': ['Nome', 'Fabricante', 'Tipo', 'Fornecedor', 'Registro ANVISA', 'Código de referência', 'Matriz', 'Estabilidade após abertura (dias)', 'Armazenamento', 'Níveis',
    'Equipamentos / sistemas', 'Analitos', 'Ativo', 'Áreas'],
  'Lotes de controle': ['Material', 'Fabricante', 'Lote', 'Validade', 'Níveis', 'Situação', 'Link da bula', 'Observações', 'Áreas'],
  'Insumos': ['Tipo', 'Produto', 'Lote', 'Validade', 'Fabricante', 'Registro ANVISA', 'Situação', 'Equipamentos / sistemas', 'Analitos', 'Áreas'],
  'Testes': ['Área', 'Setor', 'Analito', 'Unidade de medida', 'Equipamento / sistema', 'Código do equipamento', 'Método', 'Níveis', 'Material',
    'Lote N1', 'Lote N2', 'Lote N3', 'Conjunto de regras', 'Regras', 'Frequência', 'Vezes ao dia', 'Início de uso',
    'N1 rótulo', 'N1 material', 'N1 esperado', 'N2 rótulo', 'N2 material', 'N2 esperado', 'N3 rótulo', 'N3 material', 'N3 esperado',
    'Insumo controlado', 'Produto do insumo', 'Exigir lote do insumo', 'Ativo'],
  'Alvos': ['Área', 'Setor', 'Analito', 'Unidade de medida', 'Equipamento / sistema', 'Código do equipamento', 'Método', 'Lote', 'Nível', 'Média', 'DP', 'CV (%)',
    'Origem', 'Vigente desde', 'N pontos', 'Justificativa'],
  'Resultados': ['Área', 'Setor', 'Data/hora', 'Analito', 'Unidade de medida', 'Equipamento / sistema', 'Código do equipamento', 'Método', 'Nível', 'Valor', 'Resultado',
    'Lote do controle', 'Lote do reagente / insumo', 'Lote do calibrador', 'Decisão', 'Comentário da decisão', 'Operador',
    'Nº da corrida', 'Esperado', 'Média', 'DP', 'z', 'Situação', 'Regras violadas', 'Lançado por', 'Lançado em', 'Invalidado'],
  'Corridas': ['Área', 'Setor', 'Nº', 'Data/hora', 'Equipamento / sistema', 'Situação', 'Operador', 'Lançado por', 'Lançado em', 'Estação', 'Testes', 'Observação'],
  'Não conformidades': ['Área', 'Setor', 'Número', 'Situação', 'Tipo', 'Teste', 'Corrida', 'Data da corrida', 'Violações', 'Causa', 'Investigação', 'Ações',
    'Impacto em pacientes', 'Conclusão', 'Aberta em', 'Aberta por'],
};
// Abas lidas na importação (as demais são só de consulta)
const CQ_PL_IMPORTAVEIS = ['Analitos', 'Materiais', 'Lotes de controle', 'Insumos', 'Testes', 'Alvos', 'Resultados'];

const CQ_PL_INSTRUCOES = [
  ['Planilha do Controle de Qualidade — LAMIC'],
  [''],
  ['Importação: são lidas as abas Analitos, Materiais, Lotes de controle, Insumos, Testes, Alvos e Resultados. As demais abas são apenas consulta.'],
  ['Mantenha os nomes das abas e os títulos das colunas. Linhas em branco são ignoradas.'],
  ['Registros que já existem no sistema são ignorados (não são alterados). Para alterar um cadastro use o formulário do sistema.'],
  ['A importação é tudo ou nada: se houver qualquer erro, nada é gravado e a lista de erros é exibida.'],
  ['Áreas não são importadas: cadastre-as em Configurações › Controle de Qualidade e use a sigla na coluna Área.'],
  ['Testes › Setor: nome do setor dentro da unidade (Ativos › Unidades e setores). Vazio: o setor do equipamento. Nas demais abas a coluna Setor é apenas consulta.'],
  ['Analitos, Materiais, Lotes de controle e Insumos › Áreas: siglas das áreas que usam o cadastro, separadas por ";". Vazio: áreas dos testes importados que o usam ou, sem uso, a área ativa.'],
  ['Cadastro existente com outra área na coluna Áreas (ou usado por teste/resultado de outra área) recebe a associação a essa área.'],
  [''],
  ['Datas: dd/mm/aaaa ou células de data do Excel. Data/hora: dd/mm/aaaa hh:mm (sem hora, assume ' + CQ_PL_HORA_PADRAO + ').'],
  ['Listas: separe por ";" (ex.: Níveis "1;2"; Analitos "Glicose;Ureia"; Resultados possíveis "Positivo;Negativo").'],
  ['Níveis do material: "1:Normal; 2:Patológico". Sim/Não: Sim, Não (vazio = Sim em "Ativo").'],
  ['Regras (testes quantitativos): nome do conjunto (ex.: Westgard clássico (2 níveis)) ou, na coluna Regras, "1-3s:rejeição; 2-2s:rejeição; 1-2s:alerta".'],
  ['Testes qualitativos: preencha N1/N2/N3 rótulo, material e esperado (o esperado deve constar nos resultados possíveis do analito).'],
  ['Equipamento: informe o código do ativo cadastrado no sistema; sem código, o texto vira o nome do sistema analítico (bancada/manual).'],
  ['Analitos › Equipamentos: códigos (ou nomes) de ativos, separados por ";". Materiais e Insumos › Equipamentos / sistemas: códigos ou nomes de ativos e/ou nomes de sistemas sem equipamento dos analitos, separados por ";" (vazio = qualquer).'],
  ['O equipamento/sistema de um teste deve estar vinculado ao analito; se não estiver, a importação acrescenta o vínculo ao analito.'],
  [''],
  ['Resultados: cada linha é um nível de um teste. Linhas com a mesma área, data/hora e equipamento formam uma corrida.'],
  ['Quantitativos usam a coluna Valor; qualitativos, a coluna Resultado. Lote do controle vazio = lote em uso no teste; sem lote em uso (ou lote não cadastrado) o resultado entra sem alvo, com observação na corrida.'],
  ['As regras são aplicadas na ordem cronológica, considerando o histórico já gravado. Resultados já existentes (mesmo teste e data/hora) são ignorados.'],
  ['Decisão (opcional): Liberado, Rejeitado ou Liberado com justificativa. Vazio: aceitos são liberados conforme a política da área; os demais ficam aguardando avaliação.'],
  ['Decisões de rejeição importadas não abrem não conformidade automaticamente; registre-as no sistema se necessário.'],
  ['Colunas Nº da corrida, Esperado, Média, DP, z, Situação, Regras violadas, Lançado por/em e Invalidado são apenas de consulta.'],
];

// ── BIBLIOTECA ───────────────────────────────────────────────
let _cqXlsxPromise = null;
function _cqXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_cqXlsxPromise) return _cqXlsxPromise;
  _cqXlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CQ_XLSX_URL;
    s.integrity = CQ_XLSX_SRI;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('Biblioteca de planilhas indisponível.')));
    s.onerror = () => { _cqXlsxPromise = null; reject(new Error('Não foi possível carregar a biblioteca de planilhas (verifique a internet).')); };
    document.head.appendChild(s);
  });
  return _cqXlsxPromise;
}

// ── CONVERSÕES ───────────────────────────────────────────────
function _cqPlNorm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function _cqPlTxt(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return _cqPlDataHora(v) || '';
  return String(v).trim();
}
function _cqPlLista(v) { return _cqPlTxt(v).split(/[;\n]/).map(s => s.trim()).filter(Boolean); }
function _cqPlSimNao(v, padrao) {
  const s = _cqPlNorm(v);
  if (!s) return padrao;
  if (['sim', 's', 'x', 'true', 'verdadeiro', '1', 'yes'].includes(s)) return true;
  if (['nao', 'n', 'false', 'falso', '0', 'no'].includes(s)) return false;
  return null;
}
const _cqP2 = n => String(n).padStart(2, '0');
// Data (Date, número serial do Excel ou texto) → "YYYY-MM-DD"
function _cqPlData(v) {
  const dh = _cqPlDataHora(v, '00:00');
  return dh ? dh.slice(0, 10) : null;
}
// Data/hora → "YYYY-MM-DDTHH:mm" (hora padrão quando ausente)
function _cqPlDataHora(v, horaPadrao) {
  const hp = horaPadrao || CQ_PL_HORA_PADRAO;
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    const d = new Date(v.getTime() + 30000);   // o SheetJS pode deixar alguns segundos de diferença
    return `${d.getFullYear()}-${_cqP2(d.getMonth() + 1)}-${_cqP2(d.getDate())}T${_cqP2(d.getHours())}:${_cqP2(d.getMinutes())}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(Math.round((v - 25569) * 86400000 / 60000) * 60000);
    return d.toISOString().slice(0, 16);
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(s);
  let y, mo, d, h, mi;
  if (m) { [, d, mo, y, h, mi] = m; }
  else {
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(s);
    if (!m) return null;
    [, y, mo, d, h, mi] = m;
  }
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null;
  if (h !== undefined && (+h > 23 || +mi > 59)) return null;
  return `${y}-${_cqP2(mo)}-${_cqP2(d)}T${h !== undefined ? `${_cqP2(h)}:${mi}` : hp}`;
}
function _cqPlFmtData(s) { return s ? _cqFmtData(s) : ''; }
function _cqPlFmtDH(s) { return s ? _cqFmtDH(s) : ''; }
function _cqPlSN(b) { return b === false ? 'Não' : 'Sim'; }
// Valor de um mapa {chave: {label}} ou {chave: 'label'} a partir de chave ou rótulo
function _cqPlMapa(mapa, v, padrao) {
  const s = _cqPlNorm(v);
  if (!s) return padrao;
  const hit = Object.entries(mapa).find(([k, x]) => _cqPlNorm(k) === s || _cqPlNorm(typeof x === 'string' ? x : x?.label) === s);
  return hit ? hit[0] : null;
}
function _cqPlNiveisMaterial(txt) {
  const out = {};
  for (const parte of _cqPlLista(txt)) {
    const m = /^(\d)\s*(?:[:=-]\s*(.*))?$/.exec(parte);
    if (!m || +m[1] < 1 || +m[1] > 3) return null;
    out[m[1]] = { nome: (m[2] || '').trim() };
  }
  return out;
}
function _cqPlNiveis(txt) {
  const ns = _cqPlLista(String(txt).replace(/,/g, ';')).map(Number);
  if (ns.some(n => !Number.isInteger(n) || n < 1 || n > 3)) return null;
  return [...new Set(ns)].sort();
}
const CQ_PL_SEV = { rejeicao: 'rejeição', alerta: 'alerta' };
function _cqPlRegrasTxt(regras) {
  return CQEngine.ORDEM_REGRAS.filter(k => regras?.[k] && regras[k] !== 'off').map(k => `${CQEngine.rotuloRegra(k)}:${CQ_PL_SEV[regras[k]] || regras[k]}`).join('; ');
}
function _cqPlRegrasParse(txt) {
  const out = {};
  for (const parte of _cqPlLista(txt)) {
    const [r, sev] = parte.split(':').map(x => (x || '').trim());
    const k = CQEngine.ORDEM_REGRAS.find(x => _cqPlNorm(x) === _cqPlNorm(r) || _cqPlNorm(CQEngine.rotuloRegra(x)) === _cqPlNorm(r) || _cqPlNorm(x.replace('_', '-')) === _cqPlNorm(r));
    const s = _cqPlNorm(sev || 'rejeicao');
    if (!k || !['rejeicao', 'alerta'].includes(s)) return null;
    out[k] = s;
  }
  return out;
}

// ── CHAVES NATURAIS ──────────────────────────────────────────
function _cqPlAtivos() { return (typeof state !== 'undefined' && Array.isArray(state?.ativos)) ? state.ativos.filter(Boolean) : []; }
function _cqPlAtivo(id) { return id ? _cqPlAtivos().find(a => a.id === id) || null : null; }
function _cqPlGrupo(t) { return t.ativoId ? 'a:' + t.ativoId : 'm:' + _cqPlNorm(t.sistemaAnalitico || 'Bancada / manual'); }
function _cqPlRefAtivo(id) { const a = _cqPlAtivo(id); return a ? (a.codigo || a.nome || id) : ''; }
// Ativo pelo código ou, sem correspondência de código, pelo nome (único)
function _cqPlAtivoPorRef(ref) {
  const ats = _cqPlAtivos();
  const r = _cqPlNorm(ref);
  const porCod = ats.filter(a => _cqPlNorm(a.codigo) === r);
  if (porCod.length === 1) return porCod[0];
  const porNome = ats.filter(a => _cqPlNorm(a.nome) === r);
  return porNome.length === 1 ? porNome[0] : null;
}
function _cqPlRefsEquip(eqs) { return _cqArr(eqs).map(k => k.startsWith('a:') ? _cqPlRefAtivo(k.slice(2)) : k.slice(2)).join('; '); }
// Lista "EQ-01; Bancada X" → chaves 'a:…' | 'm:…' (sistemas: os informados nos analitos). Retorna { equips } ou { erro }
function _cqPlLerEquips(txt, W) {
  const equips = [];
  for (const ref of _cqPlLista(txt)) {
    const at = _cqPlAtivoPorRef(ref);
    const sis = at ? null : Object.values(W.analitos).flatMap(a => _cqArr(a.sistemas)).find(x => _cqPlNorm(x) === _cqPlNorm(ref));
    if (!at && !sis) return { erro: `Equipamento/sistema "${ref}" não encontrado (ativo cadastrado ou sistema de algum analito).` };
    const k = at ? 'a:' + at.id : 'm:' + sis;
    if (!equips.some(x => _cqEquipChave(x) === _cqEquipChave(k))) equips.push(k);
  }
  return { equips };
}
function _cqPlChaveTeste(t) { return `${t.unidadeId}|${t.analitoId}|${_cqPlGrupo(t)}|${_cqPlNorm(t.metodo)}`; }

// ── EXPORTAÇÃO ───────────────────────────────────────────────
function cqPlanilhaExportarForm() {
  if (!_cqCan('configurar')) { showToast('Sem permissão.', 'error'); return; }
  const uns = _cqUnidadesVisiveis();
  const mesAtual = _cqHoje().slice(0, 7);
  const ini = CQEngine.mesesAnteriores(mesAtual.replace('-', ''), 12).pop();
  _cqPrompt({
    titulo: 'Exportar dados do CQ para Excel', subtitulo: 'Cadastros, alvos, corridas, resultados e não conformidades',
    corpo: `<div class="form-field"><label class="field-label">Área</label><select id="cq-pl-un" class="field-select">
        <option value="">Todas as áreas visíveis</option>${uns.map(u => `<option value="${u.id}">${_cqEsc(u.sigla)} — ${_cqEsc(u.nome)}</option>`).join('')}</select></div>
      <div class="form-row"><div class="form-field"><label class="field-label">Corridas de (mês)</label><input type="month" id="cq-pl-de" class="field-input" value="${ini.slice(0, 4)}-${ini.slice(4)}"></div>
        <div class="form-field"><label class="field-label">até</label><input type="month" id="cq-pl-ate" class="field-input" value="${mesAtual}"></div></div>
      <div class="cq-nota">Cadastros e alvos são exportados por completo; o período limita corridas, resultados e não conformidades.</div>`,
    confirmar: 'Exportar',
    onConfirm: async () => {
      const de = _cqVal('cq-pl-de').replace('-', ''), ate = _cqVal('cq-pl-ate').replace('-', '');
      if (!/^\d{6}$/.test(de) || !/^\d{6}$/.test(ate) || de > ate) { showToast('Período inválido.', 'error'); return false; }
      const uid = _cqVal('cq-pl-un');
      try {
        const XLSX = await _cqXlsx();
        const dados = await _cqPlExportarDados({ unidades: uid ? [uid] : uns.map(u => u.id), de, ate });
        _cqPlEscrever(XLSX, dados, `cq-dados-${uid ? cqState.config.unidades[uid]?.sigla || 'area' : 'todas'}-${de}-${ate}.xlsx`);
        showToast('Planilha exportada.', 'success');
        return true;
      } catch (err) {
        console.error('[cq-planilha.js] Exportação:', err);
        showToast(err?.message || 'Falha ao exportar.', 'error');
        return false;
      }
    },
  });
}

async function cqPlanilhaModelo() {
  try {
    const XLSX = await _cqXlsx();
    const dados = {};
    CQ_PL_IMPORTAVEIS.forEach(a => { dados[a] = []; });
    _cqPlEscrever(XLSX, dados, 'cq-modelo-importacao.xlsx');
  } catch (err) {
    console.error('[cq-planilha.js] Modelo:', err);
    showToast(err?.message || 'Falha ao gerar o modelo.', 'error');
  }
}

function _cqPlEscrever(XLSX, dados, nome) {
  const wb = XLSX.utils.book_new();
  const inst = XLSX.utils.aoa_to_sheet(CQ_PL_INSTRUCOES);
  inst['!cols'] = [{ wch: 140 }];
  XLSX.utils.book_append_sheet(wb, inst, 'Instruções');
  Object.entries(dados).forEach(([aba, linhas]) => {
    const header = CQ_PL_COLS[aba];
    const ws = linhas.length ? XLSX.utils.json_to_sheet(linhas, { header }) : XLSX.utils.aoa_to_sheet([header]);
    ws['!cols'] = header.map(h => ({ wch: Math.min(45, Math.max(12, h.length + 2, ...linhas.slice(0, 200).map(l => String(l[h] ?? '').length + 1))) }));
    XLSX.utils.book_append_sheet(wb, ws, aba);
  });
  XLSX.writeFile(wb, nome);
}

// Monta as linhas de cada aba (sem dependência da biblioteca)
async function _cqPlExportarDados({ unidades, de, ate }) {
  const cfg = cqState.config;
  const un = id => cfg.unidades[id]?.sigla || id;
  const an = id => cfg.analitos[id];
  const mat = id => cfg.materiais[id];
  const lote = id => cfg.lotesControle[id];
  const ins = id => cfg.insumos[id];
  const setorNome = id => id ? (_orgSetor(id)?.nome || '') : '';
  const refTeste = t => ({
    'Área': un(t.unidadeId), 'Setor': setorNome(_cqSetorDoTeste(t)), 'Analito': an(t.analitoId)?.nome || '', 'Unidade de medida': an(t.analitoId)?.unidadeMedida || '',
    'Equipamento / sistema': _cqEquipTeste(t), 'Código do equipamento': t.ativoId ? (_cqPlAtivo(t.ativoId)?.codigo || t.ativoSnap?.codigo || '') : '', 'Método': t.metodo || '',
  });
  const ordenar = (arr, f) => arr.sort((a, b) => f(a).localeCompare(f(b)));
  const d = {};

  d['Áreas'] = ordenar(Object.values(cfg.unidades).filter(u => unidades.includes(u.id)), u => u.sigla || '')
    .map(u => ({ 'Sigla': u.sigla, 'Nome': u.nome, 'CNES': u.cnes || '', 'Fuso horário': u.fuso || '', 'Ativa': _cqPlSN(u.ativa) }));
  d['Setores'] = unidades.flatMap(u => _cqSetoresDaUnidade(u).map(s => ({ 'Área': un(u), 'Setor': s.nome, 'Ativo': _cqPlSN(s.ativo) })));
  // Cadastros das unidades exportadas (os antigos sem unidade entram sempre)
  const noEscopo = r => !_cqUnidadesRec(r).length || _cqUnidadesRec(r).some(u => unidades.includes(u));
  const siglas = r => _cqUnidadesRec(r).map(un).join('; ');
  d['Analitos'] = ordenar(Object.values(cfg.analitos).filter(noEscopo), a => a.nome || '').map(a => ({
    'Código': a.codigo || '', 'Nome': a.nome, 'Tipo': CQ_TIPOS_ANALITO[a.tipo || 'quantitativo'], 'Unidade de medida': a.unidadeMedida || '',
    'Casas decimais': a.tipo && a.tipo !== 'quantitativo' ? '' : (a.decimais ?? 0),
    'ETa': a.eta?.valor ?? '', 'Tipo do ETa': a.eta ? (a.eta.tipo === 'abs' ? 'absoluto' : '%') : '', 'Fonte do ETa': a.eta?.fonte || '', 'Referência do ETa': a.eta?.referencia || '',
    'Resultados possíveis': _cqArr(a.escala).join('; '), 'Tolerância (categorias)': a.toleranciaPassos ?? '',
    'Equipamentos': _cqArr(a.ativoIds).map(_cqPlRefAtivo).filter(Boolean).join('; '), 'Sistemas sem equipamento': _cqArr(a.sistemas).join('; '), 'Ativo': _cqPlSN(a.ativo), 'Áreas': siglas(a),
  }));
  d['Materiais'] = ordenar(Object.values(cfg.materiais).filter(noEscopo), m => m.nome || '').map(m => ({
    'Nome': m.nome, 'Fabricante': m.fabricante || '', 'Tipo': CQ_TIPOS_MATERIAL[m.tipo] || m.tipo || '', 'Fornecedor': m.fornecedor || '', 'Registro ANVISA': m.regAnvisa || '',
    'Código de referência': m.codigoReferencia || '', 'Matriz': m.matriz || '', 'Estabilidade após abertura (dias)': m.estabilidadeAbertoDias ?? '', 'Armazenamento': m.armazenamento || '',
    'Níveis': Object.entries(m.niveis || {}).map(([n, x]) => x?.nome ? `${n}:${x.nome}` : n).join('; '), 'Equipamentos / sistemas': _cqPlRefsEquip(m.equips), 'Analitos': _cqArr(m.analitoIds).map(a => an(a)?.nome || a).join('; '), 'Ativo': _cqPlSN(m.ativo), 'Áreas': siglas(m),
  }));
  d['Lotes de controle'] = ordenar(Object.values(cfg.lotesControle).filter(noEscopo), l => `${mat(l.materialId)?.nome || ''}|${l.lote}`).map(l => ({
    'Material': mat(l.materialId)?.nome || '', 'Fabricante': mat(l.materialId)?.fabricante || '', 'Lote': l.lote, 'Validade': _cqPlFmtData(l.validade),
    'Níveis': _cqArr(l.niveis).join(';'), 'Situação': CQ_STATUS_LOTE[l.status || 'em_uso']?.label || l.status, 'Link da bula': l.bulaUrl || '', 'Observações': l.observacoes || '', 'Áreas': siglas(l),
  }));
  d['Insumos'] = ordenar(Object.values(cfg.insumos).filter(noEscopo), i => `${i.nome}|${i.lote}`).map(i => ({
    'Tipo': CQ_TIPOS_INSUMO[i.tipo] || i.tipo, 'Produto': i.nome, 'Lote': i.lote, 'Validade': _cqPlFmtData(i.validade), 'Fabricante': i.fabricante || '',
    'Registro ANVISA': i.regAnvisa || '', 'Situação': CQ_STATUS_LOTE[i.status || 'em_uso']?.label || i.status, 'Equipamentos / sistemas': _cqPlRefsEquip(_cqEquipsInsumo(i)), 'Analitos': _cqArr(i.analitoIds).map(a => an(a)?.nome || a).join('; '), 'Áreas': siglas(i),
  }));
  const testes = ordenar(Object.values(cfg.testes).filter(t => unidades.includes(t.unidadeId)), t => `${un(t.unidadeId)}|${_cqEquipTeste(t)}|${_cqNomeTeste(t)}`);
  d['Testes'] = testes.map(t => {
    const qual = _cqTesteQual(t);
    const r = { ...refTeste(t), 'Níveis': _cqNiveisTeste(t).join(';'), 'Material': qual ? '' : mat(t.materialId)?.nome || '',
      'Conjunto de regras': qual ? '' : (CQEngine.PRESETS[t.regrasPreset]?.label || 'Personalizado'), 'Regras': qual ? '' : _cqPlRegrasTxt(t.regras),
      'Frequência': CQ_FREQ[t.frequencia?.tipo] || '', 'Vezes ao dia': t.frequencia?.vezesDia || 1, 'Início de uso': _cqPlFmtData(t.inicioUso),
      'Insumo controlado': qual ? (CQ_TIPOS_INSUMO[t.insumoTipo] || '') : '', 'Produto do insumo': qual ? _cqNomeProdutoTeste(t) : '',
      'Exigir lote do insumo': qual && t.insumoTipo ? _cqPlSN(!!t.exigirInsumo) : '', 'Ativo': _cqPlSN(t.ativo) };
    [1, 2, 3].forEach(n => {
      r[`Lote N${n}`] = lote(t.lotesAtivos?.[n])?.lote || '';
      const c = qual ? _cqControleQual(t, n) : null;
      r[`N${n} rótulo`] = c?.rotulo || '';
      r[`N${n} material`] = c?.materialId ? mat(c.materialId)?.nome || '' : '';
      r[`N${n} esperado`] = c?.esperado || '';
    });
    return r;
  });

  // Alvos (todas as versões) das unidades
  const alvosPorU = {};
  await Promise.all(unidades.map(async u => { alvosPorU[u] = (await window.dbGet(`${CQ_KEYS.alvos}/${u}`)) || {}; }));
  d['Alvos'] = [];
  testes.filter(t => !_cqTesteQual(t)).forEach(t => {
    Object.values(alvosPorU[t.unidadeId]?.[t.id] || {}).filter(a => a && typeof a === 'object')
      .sort((a, b) => (a.vigenteDesde || '').localeCompare(b.vigenteDesde || '') || Number(a.nivel) - Number(b.nivel))
      .forEach(a => d['Alvos'].push({ ...refTeste(t), 'Lote': lote(a.loteControleId)?.lote || '', 'Nível': Number(a.nivel), 'Média': a.media, 'DP': a.dp,
        'CV (%)': a.media ? CQEngine.arred(Math.abs(a.dp / a.media) * 100, 2) : '', 'Origem': CQ_ORIGEM_ALVO[a.origem]?.label || a.origem || '',
        'Vigente desde': _cqPlFmtDH(a.vigenteDesde), 'N pontos': a.nPontos ?? '', 'Justificativa': a.revogado ? `[revogado] ${a.justificativa || ''}` : (a.justificativa || '') }));
  });

  // Corridas, resultados e NCs do período
  const meses = [];
  for (let m = de; m <= ate; m = _cqPlProxMes(m)) meses.push(m);
  d['Corridas'] = []; d['Resultados'] = []; d['Não conformidades'] = [];
  for (const u of unidades) {
    const porMes = await Promise.all(meses.map(async m => ({ m, corr: (await window.dbGet(`${CQ_KEYS.corridas}/${u}/${m}`)) || {}, res: (await window.dbGet(`${CQ_KEYS.resultados}/${u}/${m}`)) || {} })));
    porMes.forEach(({ m, corr, res }) => {
      Object.entries(corr).sort(([a], [b]) => a.localeCompare(b)).forEach(([ck, c]) => {
        if (!c || typeof c !== 'object') return;
        d['Corridas'].push({ 'Área': un(u), 'Setor': [...new Set(_cqSetoresDeRegistro(c).filter(Boolean))].map(setorNome).join('; '), 'Nº': c.numero || '', 'Data/hora': _cqPlFmtDH(c.dataHora), 'Equipamento / sistema': c.ativoSnap?.nome || c.sistemaAnalitico || '',
          'Situação': CQ_CORRIDA_STATUS[c.status]?.label || c.status || '', 'Operador': c.operadorNome || '', 'Lançado por': c.lancadoPorNome || '', 'Lançado em': _cqPlFmtDH(c.lancadoEm),
          'Estação': c.estacao || '', 'Testes': Object.keys(c.testes || {}).map(tid => cfg.testes[tid] ? _cqNomeTeste(cfg.testes[tid]) : tid).join('; '),
          'Observação': [c.importacao ? `Importada de ${c.importacao.arquivo}` : '', c.retroativo?.justificativa ? `Retroativo: ${c.retroativo.justificativa}` : '', c.repeticaoDe ? 'Repetição' : '', c.observacao || ''].filter(Boolean).join(' · ') });
        Object.entries(c.testes || {}).forEach(([tid, ct]) => {
          const t = cfg.testes[tid];
          if (!t || ct.naoRealizado) return;
          Object.values(ct.niveis || {}).forEach(rk => {
            const raw = res?.[tid]?.[rk];
            if (!raw) return;
            const r = CQEngine.expandirResultado(raw, rk);
            d['Resultados'].push({ ...refTeste(t), 'Data/hora': _cqPlFmtDH(c.dataHora), 'Nível': r.nivel, 'Valor': r.valor ?? '', 'Resultado': r.obtido ?? '',
              'Lote do controle': lote(r.loteControleId)?.lote || r.loteTexto || '', 'Lote do reagente / insumo': ins(r.loteReagenteId)?.lote || '', 'Lote do calibrador': ins(r.loteCalibradorId)?.lote || '',
              'Decisão': CQ_DECISAO[ct.decisao?.acao]?.label || '', 'Comentário da decisão': ct.decisao?.comentario || '', 'Operador': c.operadorNome || '',
              'Nº da corrida': c.numero || '', 'Esperado': r.esperado ?? '', 'Média': r.media ?? '', 'DP': r.dp ?? '', 'z': Number.isFinite(r.z) ? CQEngine.arred(r.z, 2) : '',
              'Situação': CQ_STATUS[CQ_SIGLA_ESTADO[r.estado]]?.label || '', 'Regras violadas': _cqArr(r.regras).map(x => CQEngine.rotuloRegra(x)).join(', '),
              'Lançado por': c.lancadoPorNome || '', 'Lançado em': _cqPlFmtDH(c.lancadoEm), 'Invalidado': r.invalidado ? 'Sim' : '' });
          });
        });
      });
    });
    const anos = [...new Set(meses.map(m => m.slice(0, 4)))];
    for (const ano of anos) {
      const ncs = (await window.dbGet(`${CQ_KEYS.acoes}/${u}/${ano}`)) || {};
      Object.values(ncs).filter(nc => nc && nc.mes >= de && nc.mes <= ate).sort((a, b) => (a.numero || '').localeCompare(b.numero || '')).forEach(nc => {
        const i = nc.impacto || {};
        d['Não conformidades'].push({ 'Área': un(u), 'Setor': setorNome(_cqSetorDoTeste(cfg.testes[nc.testeId])), 'Número': nc.numero, 'Situação': CQ_NC_STATUS[nc.status]?.label || nc.status, 'Tipo': CQ_NC_TIPO[nc.tipo] || nc.tipo,
          'Teste': nc.testeNome || '', 'Corrida': nc.corridaNumero || '', 'Data da corrida': _cqPlFmtDH(nc.dataHoraCorrida), 'Violações': _cqArr(nc.violacoes).join('; '),
          'Causa': nc.causa || '', 'Investigação': nc.investigacao?.texto || '', 'Ações': Object.values(nc.acoes || {}).map(a => a.tipo + (a.descricao ? ` — ${a.descricao}` : '')).join('; '),
          'Impacto em pacientes': [i.reprocessadas ? `reprocessadas: ${CQ_SNNA[i.reprocessadas] || i.reprocessadas}` : '', i.laudosAfetados ? `laudos afetados: ${CQ_SNNA[i.laudosAfetados] || i.laudosAfetados}` : '', i.justificativa || ''].filter(Boolean).join(' · '),
          'Conclusão': nc.conclusao?.texto || nc.cancelamento?.motivo || '', 'Aberta em': _cqPlFmtDH(nc.criadoEm), 'Aberta por': nc.criadoPor?.porNome || '' });
      });
    }
  }
  return d;
}
function _cqPlProxMes(m) {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(4, 6));
  return mo === 12 ? `${y + 1}01` : `${y}${_cqP2(mo + 1)}`;
}

// ── IMPORTAÇÃO ───────────────────────────────────────────────
let _cqPlPlano = null;

// Consultas que enxergam também os cadastros novos do plano (W)
function _cqPlQual(W, t) { return (W.analitos[t?.analitoId]?.tipo || 'quantitativo') !== 'quantitativo'; }
function _cqPlNomeTeste(W, t) {
  const a = W.analitos[t?.analitoId];
  if (!a) return 'Analito removido';
  return _cqPlQual(W, t) && t.metodo ? `${a.nome} · ${t.metodo}` : a.nome;
}

function cqPlanilhaImportarEscolher() {
  if (!_cqCan('configurar')) { showToast('Sem permissão.', 'error'); return; }
  let inp = document.getElementById('cq-pl-arquivo');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'cq-pl-arquivo';
    inp.accept = '.xlsx,.xls,.ods';
    inp.style.display = 'none';
    inp.onchange = e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) cqPlanilhaImportarArquivo(f); };
    document.body.appendChild(inp);
  }
  inp.click();
}

async function cqPlanilhaImportarArquivo(file) {
  let abas;
  try {
    const XLSX = await _cqXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    abas = {};
    wb.SheetNames.forEach(nome => {
      const alvo = CQ_PL_IMPORTAVEIS.find(a => _cqPlNorm(a) === _cqPlNorm(nome));
      if (alvo) abas[alvo] = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '', raw: true });
    });
  } catch (err) {
    console.error('[cq-planilha.js] Leitura:', err);
    showToast(err?.message || 'Não foi possível ler a planilha.', 'error');
    return;
  }
  if (!Object.values(abas).some(l => l.length)) { showToast('Nenhuma linha encontrada nas abas importáveis.', 'error'); return; }
  showToast('Analisando a planilha…', 'info');
  let plano;
  try { plano = await _cqPlPlanejar(abas, { arquivo: file.name }); }
  catch (err) {
    console.error('[cq-planilha.js] Análise:', err);
    showToast('Falha ao analisar a planilha.', 'error');
    return;
  }
  _cqPlMostrarPlano(plano);
}

function _cqPlMostrarPlano(plano) {
  _cqPlPlano = plano;
  const r = plano.resumo;
  const linhas = Object.entries(r).filter(([, x]) => x.novos || x.existentes || x.erros)
    .map(([aba, x]) => `<tr><td>${_cqEsc(aba)}</td><td>${x.novos}</td><td>${x.existentes}</td><td>${x.erros ? `<b class="cq-txt-vermelho">${x.erros}</b>` : 0}</td></tr>`).join('');
  const temErro = plano.erros.length > 0;
  const nada = !Object.values(r).some(x => x.novos);
  _cqPrompt({
    titulo: 'Importar planilha', subtitulo: plano.arquivo,
    corpo: `<table class="ot-list-table cq-table cq-table-sm"><thead><tr><th class="ot-list-th">Aba</th><th class="ot-list-th">Novos</th><th class="ot-list-th">Já existentes (ignorados)</th><th class="ot-list-th">Erros</th></tr></thead><tbody>${linhas}</tbody></table>
      ${plano.corridas.length ? `<div class="cq-nota">Resultados formam <b>${plano.corridas.length}</b> corrida(s): ${plano.contagem.aceito} aceito(s), ${plano.contagem.alerta} alerta(s), ${plano.contagem.rejeitado} rejeitado(s); ${plano.contagem.pendentes} teste(s) ficarão aguardando avaliação.</div>` : ''}
      ${temErro ? `<div class="cq-alerta-box">${CQ_ICO.alerta} Corrija os erros e importe de novo — nada será gravado.</div>
        <div class="cq-pl-erros">${plano.erros.slice(0, 80).map(e => `<div><b>${_cqEsc(e.aba)}${e.linha ? ', linha ' + e.linha : ''}:</b> ${_cqEsc(e.msg)}</div>`).join('')}${plano.erros.length > 80 ? `<div>… e mais ${plano.erros.length - 80} erro(s).</div>` : ''}</div>` : ''}
      ${!temErro && plano.avisos.length ? `<div class="cq-pl-erros">${plano.avisos.slice(0, 30).map(a => `<div>${_cqEsc(a)}</div>`).join('')}</div>` : ''}
      ${!temErro && !nada ? `<div class="form-field"><label class="field-label">Motivo / origem dos dados <span class="required">*</span></label>
        <input type="text" id="cq-pl-motivo" class="field-input" maxlength="200" placeholder="Ex.: migração do histórico da planilha de microbiologia 2025"></div>` : ''}
      ${!temErro && nada ? '<div class="cq-nota">Não há registros novos para importar.</div>' : ''}`,
    confirmar: temErro || nada ? 'Fechar' : 'Importar',
    onConfirm: async () => {
      if (temErro || nada) return true;
      const motivo = _cqVal('cq-pl-motivo');
      if (!motivo) { showToast('Informe o motivo / origem dos dados.', 'error'); return false; }
      return _cqPlGravar(plano, motivo);
    },
  });
}

// Analisa as abas e monta o plano (nada é gravado aqui)
async function _cqPlPlanejar(abas, { arquivo }) {
  const W = {};
  CQ_COLECOES.forEach(c => { W[c] = { ...cqState.config[c] }; });
  const plano = { arquivo, resumo: {}, erros: [], avisos: [], novos: {}, vinculos: {}, vincUnidades: {}, alvos: [], corridas: [], contagem: { aceito: 0, alerta: 0, rejeitado: 0, sem_alvo: 0, pendentes: 0 } };
  CQ_COLECOES.forEach(c => { plano.novos[c] = {}; });
  const res = aba => (plano.resumo[aba] = plano.resumo[aba] || { novos: 0, existentes: 0, erros: 0 });
  const erro = (aba, linha, msg) => { plano.erros.push({ aba, linha, msg }); res(aba).erros++; };
  const criar = (col, rec, txt) => {
    rec.criadoEm = _cqAgora();
    rec.criadoPor = _cqAssinatura();
    rec.importacao = { arquivo };
    _cqTrilhaAdd(rec, 'criacao', `${txt} (importado da planilha ${arquivo})`, []);
    W[col][rec.id] = rec;
    plano.novos[col][rec.id] = rec;
  };
  const linhasDe = aba => (abas[aba] || []).map((row, i) => {
    const o = {};
    Object.entries(row).forEach(([k, v]) => { o[_cqPlNorm(k)] = v; });
    // Planilhas exportadas antes da troca de "Unidade" por "Área" continuam valendo
    if (o.area === undefined && o.unidade !== undefined) o.area = o.unidade;
    if (o.areas === undefined && o.unidades !== undefined) o.areas = o.unidades;
    return { n: i + 2, g: h => o[_cqPlNorm(h)], vazia: !Object.values(row).some(v => _cqPlTxt(v) !== '') };
  }).filter(l => !l.vazia);

  const visiveis = _cqUnidadesVisiveis();
  const unidadePor = sigla => visiveis.find(u => _cqPlNorm(u.sigla) === _cqPlNorm(sigla)) || null;
  // Coluna Unidades dos cadastros compartilháveis (siglas separadas por ";")
  const lerUnidades = (l, aba) => {
    const ids = [];
    for (const sg of _cqPlLista(l.g('Áreas'))) {
      const u = unidadePor(sg);
      if (!u) { erro(aba, l.n, `Área "${sg}" não encontrada ou sem acesso.`); return null; }
      if (!ids.includes(u.id)) ids.push(u.id);
    }
    return ids;
  };
  // Garante que o cadastro está na unidade u: novo recebe u; existente com unidades recebe o vínculo
  // (existente antigo, sem unidade, já aparece em todas e não é alterado)
  const garantirUnidade = (col, id, u) => {
    const rec = id && u ? W[col]?.[id] : null;
    if (!rec || _cqUnidadesRec(rec).includes(u)) return;
    // Lote de insumo só fica em unidades do produto dele
    if (col === 'insumos' && _cqLoteCru(rec).produtoId) garantirUnidade('insumoProdutos', _cqLoteCru(rec).produtoId, u);
    if (plano.novos[col][id]) { const us = [..._cqUnidadesRec(rec), u]; rec.unidadeIds = us; plano.novos[col][id].unidadeIds = us; return; }
    if (!_cqUnidadesRec(rec).length) return;
    const novo = { ...rec, unidadeIds: [..._cqUnidadesRec(rec), u] };
    W[col][id] = novo;
    const k = `${col}/${id}`;
    plano.vincUnidades[k] = { col, id, unidadeIds: novo.unidadeIds, add: [...(plano.vincUnidades[k]?.add || []), u] };
  };
  const analitoPor = (nome, um) => {
    const c = Object.values(W.analitos).filter(a => _cqPlNorm(a.nome) === _cqPlNorm(nome));
    if (c.length <= 1 || !_cqPlTxt(um)) return c.length === 1 ? c[0] : (c.length ? 'ambiguo' : null);
    const f = c.filter(a => _cqPlNorm(a.unidadeMedida) === _cqPlNorm(um));
    return f.length === 1 ? f[0] : (f.length ? 'ambiguo' : null);
  };
  const materialPor = (nome, fab) => {
    let c = Object.values(W.materiais).filter(m => _cqPlNorm(m.nome) === _cqPlNorm(nome));
    if (c.length > 1 && _cqPlTxt(fab)) c = c.filter(m => _cqPlNorm(m.fabricante) === _cqPlNorm(fab));
    return c.length === 1 ? c[0] : (c.length ? 'ambiguo' : null);
  };
  const lotePor = (materialId, num) => Object.values(W.lotesControle).find(l => l.materialId === materialId && _cqPlNorm(l.lote) === _cqPlNorm(num)) || null;
  const ativoPor = (codigo, nome) => {
    const ats = _cqPlAtivos();
    if (_cqPlTxt(codigo)) return ats.find(a => _cqPlNorm(a.codigo) === _cqPlNorm(codigo)) || 'nao_encontrado';
    const c = ats.filter(a => _cqPlNorm(a.nome) === _cqPlNorm(nome));
    return c.length === 1 ? c[0] : null;
  };
  // Teste a partir das colunas de referência (Unidade, Analito, Equipamento / sistema, Código, Método)
  const testePor = (l, aba) => {
    const u = unidadePor(l.g('Área'));
    if (!u) { erro(aba, l.n, `Área "${_cqPlTxt(l.g('Área'))}" não encontrada ou sem acesso.`); return null; }
    const a = analitoPor(l.g('Analito'), l.g('Unidade de medida'));
    if (!a || a === 'ambiguo') { erro(aba, l.n, a ? `Analito "${_cqPlTxt(l.g('Analito'))}" ambíguo: informe a unidade de medida.` : `Analito "${_cqPlTxt(l.g('Analito'))}" não encontrado.`); return null; }
    const equip = _cqPlTxt(l.g('Equipamento / sistema')), cod = _cqPlTxt(l.g('Código do equipamento')), met = _cqPlNorm(l.g('Método'));
    const c = Object.values(W.testes).filter(t => t.unidadeId === u.id && t.analitoId === a.id && (
      t.ativoId ? (cod ? _cqPlNorm(_cqPlAtivo(t.ativoId)?.codigo || t.ativoSnap?.codigo) === _cqPlNorm(cod) : _cqPlNorm(_cqEquipTeste(t)) === _cqPlNorm(equip))
        : !cod && _cqPlNorm(t.sistemaAnalitico || 'Bancada / manual') === _cqPlNorm(equip || 'Bancada / manual')));
    const f = c.length > 1 || met ? c.filter(t => _cqPlNorm(t.metodo) === met) : c;
    if (f.length !== 1) { erro(aba, l.n, f.length ? 'Teste ambíguo: informe o método.' : `Teste não encontrado (${u.sigla} · ${a.nome} · ${equip || cod || 'sem equipamento'}${met ? ' · ' + _cqPlTxt(l.g('Método')) : ''}).`); return null; }
    return f[0];
  };

  // ── Analitos
  linhasDe('Analitos').forEach(l => {
    const A = 'Analitos';
    const nome = _cqPlTxt(l.g('Nome'));
    if (!nome) return erro(A, l.n, 'Informe o nome.');
    const tipo = _cqPlMapa(CQ_TIPOS_ANALITO, l.g('Tipo'), 'quantitativo');
    if (!tipo) return erro(A, l.n, `Tipo inválido "${_cqPlTxt(l.g('Tipo'))}".`);
    const ativo = _cqPlSimNao(l.g('Ativo'), true);
    if (ativo === null) return erro(A, l.n, 'Ativo: use Sim ou Não.');
    const ativoIds = [];
    for (const ref of _cqPlLista(l.g('Equipamentos'))) {
      const at = _cqPlAtivoPorRef(ref);
      if (!at) return erro(A, l.n, `Equipamento "${ref}" não encontrado.`);
      if (!ativoIds.includes(at.id)) ativoIds.push(at.id);
    }
    const sistemas = [...new Map(_cqPlLista(l.g('Sistemas sem equipamento')).map(x => [_cqPlNorm(x), x])).values()];
    const unidadeIds = lerUnidades(l, A);
    if (!unidadeIds) return;
    const base = { id: _cqUid(), codigo: _cqPlTxt(l.g('Código')), nome, tipo, limitesDecisao: [], ativoIds, sistemas, ativo, unidadeIds };
    if (tipo === 'quantitativo') {
      const um = _cqPlTxt(l.g('Unidade de medida'));
      if (!um) return erro(A, l.n, 'Informe a unidade de medida.');
      const exQ = Object.values(W.analitos).find(x => _cqPlNorm(x.nome) === _cqPlNorm(nome) && (x.tipo || 'quantitativo') === 'quantitativo' && _cqPlNorm(x.unidadeMedida) === _cqPlNorm(um));
      if (exQ) { unidadeIds.forEach(u => garantirUnidade('analitos', exQ.id, u)); res(A).existentes++; return; }
      const etaTxt = _cqPlTxt(l.g('ETa')), eta = etaTxt ? CQEngine.parseNumero(etaTxt) : null;
      if (etaTxt && (eta === null || eta <= 0)) return erro(A, l.n, 'ETa inválido.');
      if (eta !== null && !_cqPlTxt(l.g('Fonte do ETa'))) return erro(A, l.n, 'Informe a fonte do ETa.');
      const dec = _cqPlTxt(l.g('Casas decimais')) === '' ? 2 : Number(l.g('Casas decimais'));
      if (!Number.isInteger(dec) || dec < 0 || dec > 4) return erro(A, l.n, 'Casas decimais: 0 a 4.');
      criar('analitos', { ...base, unidadeMedida: um, decimais: dec, escala: null, toleranciaPassos: null, cvMeta: null,
        eta: eta !== null ? { valor: eta, tipo: _cqPlNorm(l.g('Tipo do ETa')).startsWith('abs') ? 'abs' : '%', fonte: _cqPlTxt(l.g('Fonte do ETa')), referencia: _cqPlTxt(l.g('Referência do ETa')) } : null }, 'Analito cadastrado');
    } else {
      const exQl = Object.values(W.analitos).find(x => _cqPlNorm(x.nome) === _cqPlNorm(nome) && (x.tipo || 'quantitativo') !== 'quantitativo');
      if (exQl) { unidadeIds.forEach(u => garantirUnidade('analitos', exQl.id, u)); res(A).existentes++; return; }
      const escala = CQEngine.parseEscala(_cqPlTxt(l.g('Resultados possíveis')));
      if (escala.length < 2) return erro(A, l.n, 'Informe ao menos dois resultados possíveis, separados por ";".');
      const tol = Number(_cqPlTxt(l.g('Tolerância (categorias)')) || 0);
      criar('analitos', { ...base, unidadeMedida: '', decimais: 0, escala, eta: null, cvMeta: null,
        toleranciaPassos: tipo === 'semiquantitativo' ? Math.min(2, Math.max(0, tol || 0)) : null }, 'Analito cadastrado');
    }
    res(A).novos++;
  });

  // ── Materiais
  linhasDe('Materiais').forEach(l => {
    const A = 'Materiais';
    const nome = _cqPlTxt(l.g('Nome')), fab = _cqPlTxt(l.g('Fabricante'));
    if (!nome || !fab) return erro(A, l.n, 'Informe nome e fabricante.');
    const unidadeIds = lerUnidades(l, A);
    if (!unidadeIds) return;
    const exM = Object.values(W.materiais).find(m => _cqPlNorm(m.nome) === _cqPlNorm(nome) && _cqPlNorm(m.fabricante) === _cqPlNorm(fab));
    if (exM) { unidadeIds.forEach(u => garantirUnidade('materiais', exM.id, u)); res(A).existentes++; return; }
    const tipo = _cqPlMapa(CQ_TIPOS_MATERIAL, l.g('Tipo'), 'comercial');
    if (!tipo) return erro(A, l.n, `Tipo inválido "${_cqPlTxt(l.g('Tipo'))}".`);
    const niveis = _cqPlNiveisMaterial(l.g('Níveis'));
    if (!niveis || !Object.keys(niveis).length) return erro(A, l.n, 'Níveis inválidos (ex.: "1:Normal; 2:Patológico").');
    const est = _cqPlTxt(l.g('Estabilidade após abertura (dias)'));
    if (est !== '' && !(Number(est) >= 0)) return erro(A, l.n, 'Estabilidade inválida.');
    const ativo = _cqPlSimNao(l.g('Ativo'), true);
    if (ativo === null) return erro(A, l.n, 'Ativo: use Sim ou Não.');
    const eqM = _cqPlLerEquips(l.g('Equipamentos / sistemas'), W);
    if (eqM.erro) return erro(A, l.n, eqM.erro);
    const ansM = [];
    for (const nomeAn of _cqPlLista(l.g('Analitos'))) {
      const a = analitoPor(nomeAn);
      if (!a || a === 'ambiguo') return erro(A, l.n, `Analito "${nomeAn}" ${a ? 'ambíguo' : 'não encontrado'}.`);
      if (!ansM.includes(a.id)) ansM.push(a.id);
    }
    criar('materiais', { id: _cqUid(), nome, fabricante: fab, fornecedor: _cqPlTxt(l.g('Fornecedor')), tipo, regAnvisa: _cqPlTxt(l.g('Registro ANVISA')),
      matriz: _cqPlTxt(l.g('Matriz')), codigoReferencia: _cqPlTxt(l.g('Código de referência')), estabilidadeAbertoDias: est === '' ? null : Number(est),
      armazenamento: _cqPlTxt(l.g('Armazenamento')), niveis, equips: eqM.equips, analitoIds: ansM, ativo, unidadeIds }, 'Material cadastrado');
    res(A).novos++;
  });

  // ── Lotes de controle
  linhasDe('Lotes de controle').forEach(l => {
    const A = 'Lotes de controle';
    const m = materialPor(l.g('Material'), l.g('Fabricante'));
    if (!m || m === 'ambiguo') return erro(A, l.n, m ? 'Material ambíguo: informe o fabricante.' : `Material "${_cqPlTxt(l.g('Material'))}" não encontrado.`);
    const num = _cqPlTxt(l.g('Lote')), validade = _cqPlData(l.g('Validade'));
    if (!num) return erro(A, l.n, 'Informe o lote.');
    if (!validade) return erro(A, l.n, 'Validade inválida.');
    const unidadeIds = lerUnidades(l, A);
    if (!unidadeIds) return;
    unidadeIds.forEach(u => garantirUnidade('materiais', m.id, u));
    const exL = lotePor(m.id, num);
    if (exL) { unidadeIds.forEach(u => garantirUnidade('lotesControle', exL.id, u)); res(A).existentes++; return; }
    const niveis = _cqPlTxt(l.g('Níveis')) ? _cqPlNiveis(l.g('Níveis')) : Object.keys(m.niveis || {}).map(Number);
    if (!niveis || !niveis.length || niveis.some(n => !m.niveis?.[n])) return erro(A, l.n, 'Níveis do lote inválidos para o material.');
    const status = _cqPlMapa(CQ_STATUS_LOTE, l.g('Situação'), 'em_uso');
    if (!status) return erro(A, l.n, 'Situação inválida.');
    criar('lotesControle', { id: _cqUid(), materialId: m.id, lote: num, validade, niveis, status, bulaUrl: _cqPlTxt(l.g('Link da bula')), observacoes: _cqPlTxt(l.g('Observações')), unidadeIds }, 'Lote cadastrado');
    res(A).novos++;
  });

  // ── Insumos
  linhasDe('Insumos').forEach(l => {
    const A = 'Insumos';
    const nome = _cqPlTxt(l.g('Produto')), num = _cqPlTxt(l.g('Lote')), validade = _cqPlData(l.g('Validade'));
    if (!nome || !num) return erro(A, l.n, 'Informe produto e lote.');
    if (!validade) return erro(A, l.n, 'Validade inválida.');
    const unidadeIds = lerUnidades(l, A);
    if (!unidadeIds) return;
    const exI = Object.values(W.insumos).find(i => _cqPlNorm(i.nome) === _cqPlNorm(nome) && _cqPlNorm(i.lote) === _cqPlNorm(num));
    if (exI) { unidadeIds.forEach(u => garantirUnidade('insumos', exI.id, u)); res(A).existentes++; return; }
    const tipo = _cqPlMapa(CQ_TIPOS_INSUMO, l.g('Tipo'), 'reagente');
    if (!tipo) return erro(A, l.n, `Tipo inválido "${_cqPlTxt(l.g('Tipo'))}".`);
    const status = _cqPlMapa(CQ_STATUS_LOTE, l.g('Situação'), 'em_uso');
    if (!status) return erro(A, l.n, 'Situação inválida.');
    const fab = _cqPlTxt(l.g('Fabricante'));
    const ans = [];
    for (const nomeAn of _cqPlLista(l.g('Analitos'))) {
      const a = analitoPor(nomeAn);
      if (!a || a === 'ambiguo') return erro(A, l.n, `Analito "${nomeAn}" ${a ? 'ambíguo' : 'não encontrado'}.`);
      ans.push(a.id);
    }
    const eqI = _cqPlLerEquips(l.g('Equipamentos / sistemas') || l.g('Equipamento'), W);
    if (eqI.erro) return erro(A, l.n, eqI.erro);
    const equips = eqI.equips;
    // Produto: mesmo tipo e nome (e fabricante, quando os dois informam); a linha cria o produto se não existir
    let prod = Object.values(W.insumoProdutos).find(p => p.tipo === tipo && _cqPlNorm(p.nome) === _cqPlNorm(nome) && (!fab || !p.fabricante || _cqPlNorm(p.fabricante) === _cqPlNorm(fab)));
    if (prod) unidadeIds.forEach(u => garantirUnidade('insumoProdutos', prod.id, u));
    else {
      prod = { id: _cqUid(), tipo, nome, fabricante: fab, regAnvisa: _cqPlTxt(l.g('Registro ANVISA')), equips, analitoIds: ans, preparoInterno: false, preparo: null, unidadeIds: [...unidadeIds], ativo: true };
      criar('insumoProdutos', prod, 'Produto cadastrado');
    }
    const lote = { id: _cqUid(), produtoId: prod.id, lote: num, validade, status, observacoes: '', unidadeIds };
    criar('insumos', lote, 'Lote de insumo cadastrado');
    // Cópia de trabalho com os campos do produto (as próximas abas procuram lotes por nome, tipo e analitos)
    W.insumos[lote.id] = { ...lote, ...Object.fromEntries(CQ_CAMPOS_PRODUTO.map(k => [k, prod[k] ?? null])) };
    res(A).novos++;
  });

  // ── Testes
  linhasDe('Testes').forEach(l => {
    const A = 'Testes';
    const u = unidadePor(l.g('Área'));
    if (!u) return erro(A, l.n, `Área "${_cqPlTxt(l.g('Área'))}" não encontrada ou sem acesso.`);
    const a = analitoPor(l.g('Analito'), l.g('Unidade de medida'));
    if (!a || a === 'ambiguo') return erro(A, l.n, a ? 'Analito ambíguo: informe a unidade de medida.' : `Analito "${_cqPlTxt(l.g('Analito'))}" não encontrado.`);
    const equip = _cqPlTxt(l.g('Equipamento / sistema')), cod = _cqPlTxt(l.g('Código do equipamento'));
    const at = ativoPor(cod, equip);
    if (at === 'nao_encontrado') return erro(A, l.n, `Equipamento com código "${cod}" não encontrado.`);
    if (!at && !equip) return erro(A, l.n, 'Informe o equipamento (código) ou o sistema analítico.');
    const niveis = _cqPlNiveis(l.g('Níveis'));
    if (!niveis || !niveis.length) return erro(A, l.n, 'Níveis inválidos (ex.: "1;2").');
    const qual = (a.tipo || 'quantitativo') !== 'quantitativo';
    const ativo = _cqPlSimNao(l.g('Ativo'), true);
    if (ativo === null) return erro(A, l.n, 'Ativo: use Sim ou Não.');
    const inicio = _cqPlTxt(l.g('Início de uso')) ? _cqPlData(l.g('Início de uso')) : _cqHoje();
    if (!inicio) return erro(A, l.n, 'Início de uso inválido.');
    const freqTipo = _cqPlMapa(CQ_FREQ, l.g('Frequência'), qual ? 'por_lote' : 'por_corrida');
    if (!freqTipo) return erro(A, l.n, 'Frequência inválida.');
    let setorId = '';
    const setorTxt = _cqPlTxt(l.g('Setor'));
    if (setorTxt) {
      if (!_cqSetoresDaUnidade(u.id).length) return erro(A, l.n, `A área ${u.sigla} não tem setores cadastrados (Ativos › Unidades e setores).`);
      const ss = _orgSetoresPorNome(setorTxt, u.id);
      if (!ss.length) return erro(A, l.n, `Setor "${setorTxt}" não encontrado na área ${u.sigla}.`);
      // Igual ao do equipamento: não grava (segue o equipamento)
      if (!at || _orgSetorDoAtivo(at)?.id !== ss[0].id) setorId = ss[0].id;
    }
    const rec = {
      id: _cqUid(), unidadeId: u.id, analitoId: a.id, ativoId: at ? at.id : null,
      ativoSnap: at ? { nome: at.nome || '', codigo: at.codigo || '', serie: at.serie || '', modelo: at.modelo || '' } : null,
      sistemaAnalitico: at ? '' : equip, metodo: _cqPlTxt(l.g('Método')), inicioUso: inicio, niveis, ...(setorId ? { setorId } : {}),
      frequencia: { tipo: freqTipo, vezesDia: Math.max(1, Number(_cqPlTxt(l.g('Vezes ao dia'))) || 1) }, ativo, versaoConfig: 1, etaOverride: null, lotesAtivos: {},
    };
    if (Object.values(W.testes).some(t => _cqPlChaveTeste(t) === _cqPlChaveTeste(rec))) { res(A).existentes++; return; }
    // O equipamento/sistema do teste precisa estar no analito: acrescenta o vínculo quando falta
    const an = W.analitos[a.id];
    const temEq = at ? _cqArr(an.ativoIds).includes(at.id) : _cqArr(an.sistemas).some(x => _cqPlNorm(x) === _cqPlNorm(equip));
    if (!temEq) {
      const novo = { ...an, ativoIds: at ? [..._cqArr(an.ativoIds), at.id] : _cqArr(an.ativoIds), sistemas: at ? _cqArr(an.sistemas) : [..._cqArr(an.sistemas), equip] };
      W.analitos[a.id] = novo;
      if (plano.novos.analitos[a.id]) plano.novos.analitos[a.id] = novo;
      else plano.vinculos[a.id] = { ativoIds: novo.ativoIds, sistemas: novo.sistemas, add: [...(plano.vinculos[a.id]?.add || []), at ? at.nome : equip] };
    }
    if (qual) {
      const escala = _cqArr(a.escala);
      rec.materialId = ''; rec.regrasPreset = 'qualitativo'; rec.regras = {}; rec.opcoesRegras = {}; rec.controlesQual = {};
      for (const n of niveis) {
        const esp = escala.find(e => _cqPlNorm(e) === _cqPlNorm(l.g(`N${n} esperado`)));
        if (!esp) return erro(A, l.n, `N${n} esperado deve ser um dos resultados possíveis do analito.`);
        const nomeMat = _cqPlTxt(l.g(`N${n} material`));
        let m = null;
        if (nomeMat) {
          m = materialPor(nomeMat);
          if (!m || m === 'ambiguo') return erro(A, l.n, `N${n} material "${nomeMat}" ${m ? 'ambíguo' : 'não encontrado'}.`);
          const numLote = _cqPlTxt(l.g(`Lote N${n}`));
          if (numLote) {
            const lt = lotePor(m.id, numLote);
            if (!lt) return erro(A, l.n, `Lote N${n} "${numLote}" não encontrado para ${m.nome}.`);
            rec.lotesAtivos[n] = lt.id;
          }
        }
        rec.controlesQual[n] = { rotulo: _cqPlTxt(l.g(`N${n} rótulo`)) || (m ? `Nível ${n}` : 'Sem material'), materialId: m ? m.id : '', esperado: esp };
      }
      const insTipo = _cqPlTxt(l.g('Insumo controlado')) ? _cqPlMapa(CQ_TIPOS_INSUMO, l.g('Insumo controlado'), '') : '';
      if (insTipo === null) return erro(A, l.n, 'Insumo controlado inválido.');
      rec.insumoTipo = insTipo || '';
      rec.insumoProduto = insTipo ? (_cqPlTxt(l.g('Produto do insumo')) || rec.metodo) : '';
      const prodsT = insTipo ? Object.values(W.insumoProdutos).filter(p => p.tipo === insTipo && _cqPlNorm(p.nome) === _cqPlNorm(rec.insumoProduto)) : [];
      rec.insumoProdutoId = prodsT.length === 1 ? prodsT[0].id : '';
      rec.exigirInsumo = !!insTipo && _cqPlSimNao(l.g('Exigir lote do insumo'), false) === true;
    } else {
      const m = materialPor(l.g('Material'));
      if (!m || m === 'ambiguo') return erro(A, l.n, `Material "${_cqPlTxt(l.g('Material'))}" ${m ? 'ambíguo' : 'não encontrado'}.`);
      if (niveis.some(n => !m.niveis?.[n])) return erro(A, l.n, 'Nível inexistente no material.');
      rec.materialId = m.id;
      for (const n of niveis) {
        const numLote = _cqPlTxt(l.g(`Lote N${n}`));
        if (!numLote) continue;
        const lt = lotePor(m.id, numLote);
        if (!lt) return erro(A, l.n, `Lote N${n} "${numLote}" não encontrado para ${m.nome}.`);
        rec.lotesAtivos[n] = lt.id;
      }
      const regrasTxt = _cqPlTxt(l.g('Regras'));
      const presetTxt = _cqPlTxt(l.g('Conjunto de regras'));
      const preset = presetTxt ? Object.keys(CQEngine.PRESETS).find(k => _cqPlNorm(k) === _cqPlNorm(presetTxt) || _cqPlNorm(CQEngine.PRESETS[k].label) === _cqPlNorm(presetTxt)) : null;
      if (presetTxt && !preset && _cqPlNorm(presetTxt) !== 'personalizado') return erro(A, l.n, `Conjunto de regras "${presetTxt}" não reconhecido.`);
      let regras;
      if (regrasTxt) { regras = _cqPlRegrasParse(regrasTxt); if (!regras) return erro(A, l.n, 'Regras inválidas (ex.: "1-3s:rejeição; 2-2s:rejeição").'); }
      else regras = { ...CQEngine.PRESETS[preset || (niveis.length >= 3 ? 'westgard_n3' : 'westgard_n2')].regras };
      if (!Object.values(regras).includes('rejeicao')) return erro(A, l.n, 'Defina ao menos uma regra de rejeição.');
      const presetFinal = preset && CQEngine.canonico(CQEngine.PRESETS[preset].regras) === CQEngine.canonico(regras) ? preset
        : (!regrasTxt ? (preset || (niveis.length >= 3 ? 'westgard_n3' : 'westgard_n2')) : 'personalizado');
      Object.assign(rec, { regrasPreset: presetFinal, regras, opcoesRegras: { gatilho12s: false, incluirRejeitados: false } });
    }
    garantirUnidade('analitos', rec.analitoId, u.id);
    garantirUnidade('materiais', rec.materialId, u.id);
    Object.values(rec.controlesQual || {}).forEach(c => garantirUnidade('materiais', c.materialId, u.id));
    Object.values(rec.lotesAtivos).forEach(lid => garantirUnidade('lotesControle', lid, u.id));
    criar('testes', rec, 'Teste cadastrado');
    res(A).novos++;
  });

  const nVinc = Object.keys(plano.vinculos).length;
  if (nVinc) plano.avisos.push(`${nVinc} analito(s) existente(s) receberão o vínculo com o equipamento/sistema dos testes importados.`);

  // ── Alvos (lidos do banco para as unidades envolvidas)
  const alvosBanco = {};
  const alvosDe = async u => {
    if (!(u in alvosBanco)) alvosBanco[u] = (await window.dbGet(`${CQ_KEYS.alvos}/${u}`)) || {};
    return alvosBanco[u];
  };
  const linhasAlvos = linhasDe('Alvos');
  for (const l of linhasAlvos) {
    const A = 'Alvos';
    const t = testePor(l, A);
    if (!t) continue;
    if (_cqPlQual(W, t)) { erro(A, l.n, 'Teste qualitativo não usa alvo (média/DP).'); continue; }
    const lt = lotePor(t.materialId, _cqPlTxt(l.g('Lote')));
    if (!lt) { erro(A, l.n, `Lote "${_cqPlTxt(l.g('Lote'))}" não encontrado para o material do teste.`); continue; }
    const nivel = Number(_cqPlTxt(l.g('Nível')));
    if (!_cqNiveisTeste(t).includes(nivel)) { erro(A, l.n, 'Nível inválido para o teste.'); continue; }
    const media = CQEngine.parseNumero(l.g('Média')), dp = CQEngine.parseNumero(l.g('DP'));
    if (media === null || dp === null || dp <= 0) { erro(A, l.n, 'Média e DP inválidos (DP > 0).'); continue; }
    const desde = _cqPlDataHora(l.g('Vigente desde'), '00:00');
    if (!desde) { erro(A, l.n, 'Vigente desde inválido.'); continue; }
    const origem = _cqPlMapa(CQ_ORIGEM_ALVO, l.g('Origem'), 'estabelecido');
    if (!origem) { erro(A, l.n, 'Origem inválida.'); continue; }
    const just = _cqPlTxt(l.g('Justificativa'));
    if (!just) { erro(A, l.n, 'Informe a justificativa.'); continue; }
    const existentes = [...Object.values((await alvosDe(t.unidadeId))[t.id] || {}), ...plano.alvos.filter(x => x.testeId === t.id).map(x => x.alvo)];
    if (existentes.some(a => a.loteControleId === lt.id && Number(a.nivel) === nivel && a.vigenteDesde === desde && a.media === media && a.dp === dp)) { res(A).existentes++; continue; }
    const anterior = existentes.filter(a => a.loteControleId === lt.id && Number(a.nivel) === nivel && (a.vigenteDesde || '') <= desde && !a.revogado)
      .sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''))[0];
    const nP = _cqPlTxt(l.g('N pontos'));
    plano.alvos.push({ u: t.unidadeId, testeId: t.id, alvo: {
      id: _cqUid(), loteControleId: lt.id, nivel, media, dp, origem, nPontos: nP ? Number(nP) || null : null, vigenteDesde: desde, substitui: anterior?.id || null,
      justificativa: just, faixaFabricante: null, aprovado: _cqAssinatura({ importado: true }), criadoEm: _cqAgora(), importacao: { arquivo },
    } });
    res(A).novos++;
  }

  // ── Resultados → corridas
  const linhasRes = linhasDe('Resultados');
  if (linhasRes.length && !_cqCan('lancar')) erro('Resultados', null, 'Sem permissão para lançar resultados de CQ.');
  else if (linhasRes.length) await _cqPlPlanejarResultados(linhasRes, { W, plano, erro, res, testePor, lotePor, alvosDe, arquivo, garantirUnidade });

  // Cadastros novos sem unidade informada nem uso: unidade ativa
  const uAtiva = _cqUnidadeAtivaId();
  CQ_COLECOES_UNIDADE.forEach(c => Object.values(plano.novos[c]).forEach(rec => { if (!_cqUnidadesRec(rec).length && uAtiva) rec.unidadeIds = [uAtiva]; }));
  Object.values(plano.novos.insumos).forEach(rec => _cqUnidadesRec(rec).forEach(u => garantirUnidade('insumoProdutos', rec.produtoId, u)));
  const nVincU = Object.keys(plano.vincUnidades).length;
  if (nVincU) plano.avisos.push(`${nVincU} cadastro(s) existente(s) serão associados a outra(s) área(s): ${Object.values(plano.vincUnidades).slice(0, 8).map(v => `${_cqResumoCadastro(v.col, W[v.col][v.id])} → ${_cqSiglasUnidades(v.add)}`).join('; ')}${nVincU > 8 ? '…' : ''}.`);
  return plano;
}

async function _cqPlPlanejarResultados(linhas, ctx) {
  const { W, plano, erro, res, testePor, lotePor, alvosDe, garantirUnidade } = ctx;
  const A = 'Resultados';
  const grupos = new Map();      // `${u}|${dh}|${grupo}` → { u, dh, grupo, testes: Map(testeId → {t, niveis:{}, decisao, comentario, lr, lk, operador}) }
  const vistos = new Set();
  const semLote = [];            // linhas importadas sem lote do controle identificado
  const insumoPor = (num, t, calibrador) => {
    const c = Object.values(W.insumos).filter(i => _cqPlNorm(i.lote) === _cqPlNorm(num) && (calibrador ? i.tipo === 'calibrador' : i.tipo !== 'calibrador'));
    if (c.length <= 1) return c[0] || null;
    const f = c.filter(i => _cqArr(i.analitoIds).includes(t.analitoId) || (t.insumoProduto && _cqPlNorm(i.nome) === _cqPlNorm(t.insumoProduto)));
    return f.length === 1 ? f[0] : 'ambiguo';
  };
  for (const l of linhas) {
    const t = testePor(l, A);
    if (!t) continue;
    const dh = _cqPlDataHora(l.g('Data/hora'));
    if (!dh) { erro(A, l.n, 'Data/hora inválida.'); continue; }
    if (dh > _cqNowLocal(cqState.config.unidades[t.unidadeId]?.fuso)) { erro(A, l.n, 'Data/hora no futuro.'); continue; }
    const nivel = Number(_cqPlTxt(l.g('Nível')));
    if (!_cqNiveisTeste(t).includes(nivel)) { erro(A, l.n, `Nível "${_cqPlTxt(l.g('Nível'))}" não pertence ao teste.`); continue; }
    const chave = `${t.id}|${dh}|${nivel}`;
    if (vistos.has(chave)) { erro(A, l.n, 'Resultado duplicado na planilha (mesmo teste, data/hora e nível).'); continue; }
    vistos.add(chave);
    let valor = null, obtido = null;
    if (_cqPlQual(W, t)) {
      const escala = _cqArr(W.analitos[t.analitoId]?.escala);
      obtido = escala.find(e => _cqPlNorm(e) === _cqPlNorm(l.g('Resultado')));
      if (!obtido) { erro(A, l.n, `Resultado "${_cqPlTxt(l.g('Resultado'))}" fora da lista do analito.`); continue; }
    } else {
      valor = CQEngine.parseNumero(l.g('Valor'));
      if (valor === null) { erro(A, l.n, `Valor inválido "${_cqPlTxt(l.g('Valor'))}".`); continue; }
    }
    // Lote do controle: informado ou o lote em uso no nível
    // Sem lote identificável o resultado é importado mesmo assim, sem alvo, com observação (rastreabilidade incompleta)
    let loteId = t.lotesAtivos?.[nivel] || null;
    let obsLote = null;
    const numLote = _cqPlTxt(l.g('Lote do controle'));
    const matNivel = _cqPlQual(W, t) ? _cqControleQual(t, nivel)?.materialId : t.materialId;
    if (numLote) {
      const lt = matNivel ? lotePor(matNivel, numLote) : null;
      if (lt) loteId = lt.id;
      else { loteId = null; obsLote = `Lote do controle "${numLote}" não cadastrado no sistema`; }
    }
    if (!loteId && matNivel && !obsLote) obsLote = 'Lote do controle não informado na planilha';
    if (obsLote) semLote.push(l.n);
    const pegaIns = (col, cal) => {
      const num = _cqPlTxt(l.g(col));
      if (!num) return { id: null };
      const i = insumoPor(num, t, cal);
      if (!i || i === 'ambiguo') { erro(A, l.n, `${col} "${num}" ${i ? 'ambíguo' : 'não encontrado'}.`); return null; }
      return { id: i.id };
    };
    const lr = pegaIns('Lote do reagente / insumo', false); if (!lr) continue;
    const lk = pegaIns('Lote do calibrador', true); if (!lk) continue;
    const decTxt = _cqPlTxt(l.g('Decisão'));
    const decisao = decTxt ? _cqPlMapa(CQ_DECISAO, decTxt, null) : null;
    if (decTxt && !decisao) { erro(A, l.n, `Decisão "${decTxt}" inválida (Liberado, Rejeitado ou Liberado com justificativa).`); continue; }
    const gk = `${t.unidadeId}|${dh}|${_cqPlGrupo(t)}`;
    const g = grupos.get(gk) || { u: t.unidadeId, dh, ativoId: t.ativoId || null, sistema: t.ativoId ? '' : (t.sistemaAnalitico || 'Bancada / manual'), testes: new Map(), linhas: [] };
    grupos.set(gk, g);
    const tt = g.testes.get(t.id) || { t, niveis: {}, decisao: null, comentario: '', lr: null, lk: null, operador: '', linha: l.n };
    g.testes.set(t.id, tt);
    if (decisao) {
      if (tt.decisao && tt.decisao !== decisao) { erro(A, l.n, 'Decisões diferentes para o mesmo teste na mesma corrida.'); continue; }
      tt.decisao = decisao;
    }
    tt.comentario = tt.comentario || _cqPlTxt(l.g('Comentário da decisão'));
    tt.lr = tt.lr || lr.id; tt.lk = tt.lk || lk.id;
    tt.operador = tt.operador || _cqPlTxt(l.g('Operador'));
    tt.niveis[nivel] = { valor, obtido, loteId, loteTexto: obsLote ? numLote || null : null, obsLote, linha: l.n };
    if (numLote && loteId) garantirUnidade('lotesControle', loteId, t.unidadeId);
    garantirUnidade('insumos', lr.id, t.unidadeId);
    garantirUnidade('insumos', lk.id, t.unidadeId);
  }
  if (plano.erros.length) return;
  if (semLote.length) plano.avisos.push(`${semLote.length} resultado(s) sem lote do controle identificado (linha(s) ${semLote.slice(0, 15).join(', ')}${semLote.length > 15 ? '…' : ''}): serão importados sem alvo, com observação na corrida.`);

  // Resultados já gravados (dedupe e histórico das regras)
  const porU = {};
  grupos.forEach(g => { (porU[g.u] = porU[g.u] || new Set()).add(CQEngine.mesDe(g.dh)); });
  const hist = {};            // testeId → resultados expandidos
  const existentes = new Set();   // `${testeId}|${chaveTempo}`
  for (const [u, mesesSet] of Object.entries(porU)) {
    const ms = [...mesesSet].sort();
    let m = CQEngine.mesesAnteriores(ms[0], 7).pop();
    const fim = ms[ms.length - 1];
    const meses = [];
    while (m <= fim) { meses.push(m); m = _cqPlProxMes(m); }
    const dados = await Promise.all(meses.map(mm => window.dbGet(`${CQ_KEYS.resultados}/${u}/${mm}`)));
    dados.forEach(porTeste => Object.entries(porTeste || {}).forEach(([tid, rs]) => Object.entries(rs || {}).forEach(([rk, raw]) => {
      if (!raw || typeof raw !== 'object') return;
      const r = CQEngine.expandirResultado(raw, rk);
      (hist[tid] = hist[tid] || []).push(r);
      existentes.add(`${tid}|${String(r.corridaKey || rk).slice(0, 12)}`);
    })));
    await alvosDe(u);
  }

  const pol = u => _cqPolitica(u);
  const podeLiberar = _cqCan('liberar');
  const ordenados = [...grupos.values()].sort((a, b) => a.dh.localeCompare(b.dh));
  for (const g of ordenados) {
    const ck = CQEngine.chaveCorrida(g.dh);
    const mes = CQEngine.mesDe(g.dh);
    const testesHdr = {}, resultados = {}, resumo = [];
    for (const [tid, tt] of g.testes) {
      const t = tt.t;
      if (existentes.has(`${tid}|${CQEngine.chaveTempo(g.dh)}`)) { res(A).existentes += Object.keys(tt.niveis).length; continue; }
      const qual = _cqPlQual(W, t);
      const porNivel = {}, atual = [];
      let r;
      if (qual) {
        Object.entries(tt.niveis).forEach(([n, x]) => {
          const c = _cqControleQual(t, n) || {};
          porNivel[n] = { obtido: x.obtido, esperado: c.esperado || null, loteId: c.materialId ? x.loteId : null, obsLote: x.obsLote, loteTexto: x.loteTexto };
          atual.push({ nivel: Number(n), obtido: x.obtido, esperado: c.esperado || '', rotulo: c.rotulo || `Nível ${n}` });
        });
        const an = W.analitos[t.analitoId];
        r = CQEngine.avaliarCorridaQualitativa({ atual, tipo: an?.tipo, escala: _cqArr(an?.escala), tolerancia: an?.toleranciaPassos });
      } else {
        const alvosT = [...Object.values((await alvosDe(g.u))[tid] || {}), ...plano.alvos.filter(x => x.testeId === tid).map(x => x.alvo)];
        Object.entries(tt.niveis).forEach(([n, x]) => {
          const alvo = alvosT.filter(a => a.loteControleId === x.loteId && Number(a.nivel) === Number(n) && (a.vigenteDesde || '') <= g.dh && !a.revogado)
            .sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''))[0] || null;
          const z = alvo ? CQEngine.zScore(x.valor, alvo.media, alvo.dp) : null;
          porNivel[n] = { valor: x.valor, alvo, z, loteId: x.loteId, obsLote: x.obsLote, loteTexto: x.loteTexto };
          atual.push({ nivel: Number(n), z });
        });
        const h = CQEngine.prepararHistorico(hist[tid] || [], { antesDe: ck, reinicio: t.reinicioHistorico || null, janelaMax: CQEngine.janelaMax(t.regras || {}),
          incluirRejeitados: !!t.opcoesRegras?.incluirRejeitados });
        r = CQEngine.avaliarCorrida({ atual, historico: h, regras: t.regras || {}, opcoes: { gatilho12s: !!t.opcoesRegras?.gatilho12s } });
      }
      // Decisão informada na planilha; sem decisão, aceitos seguem a política da unidade
      let acao = tt.decisao;
      if (acao === 'liberado' && r.status === 'rejeitado') acao = 'liberado_com_violacao';
      let decisao = null;
      if (acao) decisao = { acao, comentario: tt.comentario || 'Decisão importada da planilha', importado: true, ..._cqAssinatura() };
      else if (r.status === 'aceito' && pol(g.u).liberarAceitosAoSalvar && podeLiberar) decisao = { acao: 'liberado', auto: true, comentario: 'Liberado na importação (sem violações)', ..._cqAssinatura() };
      const sigla = decisao ? CQ_DECISAO[decisao.acao].sigla : null;
      const niveisMap = {};
      Object.entries(porNivel).forEach(([n, p]) => {
        const rk = `${ck}_n${n}`;
        niveisMap[n] = rk;
        const est = CQ_ESTADO_SIGLA[r.porNivel[n]?.status || 'sem_alvo'];
        const obj = qual
          ? { corridaKey: ck, nivel: Number(n), loteControleId: p.loteId, obtido: p.obtido, esperado: p.esperado, estado: est, regras: r.porNivel[n]?.regras || [], decisao: sigla, loteReagenteId: tt.lr || null, loteTexto: p.loteTexto, observacao: p.obsLote }
          : { corridaKey: ck, nivel: Number(n), loteControleId: p.loteId, valor: p.valor, alvoId: p.alvo?.id || null, media: p.alvo?.media ?? null, dp: p.alvo?.dp ?? null,
              z: p.z === null ? null : CQEngine.arred(p.z, 4), estado: est, regras: r.porNivel[n]?.regras || [], decisao: sigla, loteReagenteId: tt.lr || null, loteCalibradorId: tt.lk || null, loteTexto: p.loteTexto, observacao: p.obsLote };
        resultados[`${tid}/${rk}`] = CQEngine.compactarResultado(obj);
        (hist[tid] = hist[tid] || []).push(obj);
      });
      testesHdr[tid] = {
        niveis: niveisMap, lr: tt.lr || null, lk: tt.lk || null, posCalibracao: false, trocaLoteReagente: false, trocaLoteCalibrador: false, versaoConfig: t.versaoConfig || 1,
        avaliacao: { status: r.status, violacoes: r.violacoes.map(v => ({ regra: v.regra, severidade: v.severidade, escopo: v.escopo, niveis: v.niveis, texto: v.texto })) },
        decisao, operadorNome: tt.operador || null,
        observacao: [...new Set(Object.entries(porNivel).filter(([, p]) => p.obsLote).map(([n, p]) => `N${n}: ${p.obsLote}`))].join('; ') || null,
      };
      plano.contagem[r.status] = (plano.contagem[r.status] || 0) + 1;
      if (!decisao) plano.contagem.pendentes++;
      res(A).novos += Object.keys(tt.niveis).length;
      resumo.push(`${_cqPlNomeTeste(W, t)}: ${CQ_STATUS[r.status]?.label}`);
    }
    if (!Object.keys(testesHdr).length) continue;
    const operadores = [...new Set(Object.values(testesHdr).map(x => x.operadorNome).filter(Boolean))];
    const semLoteCorr = Object.values(testesHdr).some(x => x.observacao);
    plano.corridas.push({ u: g.u, ck, mes, dh: g.dh, ativoId: g.ativoId, sistema: g.sistema, testes: testesHdr, resultados, resumo, operador: operadores.join(', '),
      observacao: semLoteCorr ? 'Importada com resultado(s) sem lote do controle identificado (rastreabilidade incompleta; quantitativos ficam sem alvo)' : null });
  }
  const rejeitadosDecididos = plano.corridas.reduce((s, c) => s + Object.values(c.testes).filter(x => x.decisao?.acao === 'rejeitado' || x.decisao?.acao === 'liberado_com_violacao').length, 0);
  if (rejeitadosDecididos) plano.avisos.push(`${rejeitadosDecididos} decisão(ões) de rejeição/liberação com violação importada(s) sem abertura automática de não conformidade.`);
}

// Grava o plano (um único dbUpdate)
async function _cqPlGravar(plano, motivo) {
  if (!_cqPodeGravar()) return false;
  const updates = {};
  const testesNovos = plano.novos.testes || {};
  CQ_COLECOES.forEach(c => Object.values(plano.novos[c] || {}).forEach(rec => {
    rec.atualizadoEm = _cqAgora();
    rec.importacao = { ...rec.importacao, motivo };
    updates[`${CQ_KEYS.config}/${c}/${rec.id}`] = rec;
  }));
  Object.entries(plano.vinculos || {}).forEach(([id, v]) => {
    const p = `${CQ_KEYS.config}/analitos/${id}`;
    updates[`${p}/ativoIds`] = v.ativoIds;
    updates[`${p}/sistemas`] = v.sistemas;
    updates[`${p}/trilha/${_cqTk()}`] = _cqTrilhaEntry('edicao', `Equipamento/sistema vinculado pela importação da planilha ${plano.arquivo}: ${v.add.join(', ')}`);
  });
  Object.values(plano.vincUnidades || {}).forEach(v => {
    const p = `${CQ_KEYS.config}/${v.col}/${v.id}`;
    updates[`${p}/unidadeIds`] = v.unidadeIds;
    updates[`${p}/trilha/${_cqTk()}${v.id.slice(-3)}`] = _cqTrilhaEntry('edicao', `Associado à(s) área(s) ${_cqSiglasUnidades(v.add)} pela importação da planilha ${plano.arquivo}`);
  });
  plano.alvos.forEach(({ u, testeId, alvo }) => {
    alvo.importacao = { ...alvo.importacao, motivo };
    updates[`${CQ_KEYS.alvos}/${u}/${testeId}/${alvo.id}`] = alvo;
    const lote = (plano.novos.lotesControle[alvo.loteControleId] || cqState.config.lotesControle[alvo.loteControleId])?.lote;
    const ent = _cqTrilhaEntry('alvo', `Alvo N${alvo.nivel} lote ${lote} importado: média ${alvo.media}, DP ${alvo.dp} (${CQ_ORIGEM_ALVO[alvo.origem]?.label}) — ${alvo.justificativa}`);
    if (testesNovos[testeId]) testesNovos[testeId].trilha[_cqTk() + alvo.id.slice(-3)] = ent;
    else updates[`${CQ_KEYS.config}/testes/${testeId}/trilha/${_cqTk()}${alvo.id.slice(-3)}`] = ent;
  });

  // Numeração das corridas: reserva um bloco por unidade
  const porU = {};
  plano.corridas.forEach(c => { (porU[c.u] = porU[c.u] || []).push(c); });
  for (const [u, lista] of Object.entries(porU)) {
    const un = cqState.config.unidades[u];
    const ano = _cqHoje(un?.fuso).slice(0, 4);
    const fim = await window.dbTransaction(`${CQ_KEYS.seq}/${u}/corridas/${ano}`, v => (Number(v) || 0) + lista.length);
    if (!fim) { showToast('Não foi possível numerar as corridas. Nada foi importado.', 'error'); return false; }
    const sig = (un?.sigla || 'UN').toUpperCase();
    lista.forEach((c, i) => { c.numero = `${sig}-${ano}-${String(fim - lista.length + 1 + i).padStart(6, '0')}`; });
  }
  const ass = _cqAssinatura();
  const agoraMs = Date.now();
  const ultimoNovo = {};
  plano.corridas.forEach(c => {
    Object.entries(c.resultados).forEach(([p, r]) => { updates[`${CQ_KEYS.resultados}/${c.u}/${c.mes}/${p}`] = r; });
    const testes = {};
    Object.entries(c.testes).forEach(([tid, ct]) => { const { operadorNome, ...resto } = ct; testes[tid] = resto; });
    const hdr = {
      numero: c.numero, unidadeId: c.u, ativoId: c.ativoId, ativoSnap: c.ativoId ? (() => { const a = _cqPlAtivo(c.ativoId); return a ? { nome: a.nome || '', codigo: a.codigo || '', serie: a.serie || '' } : null; })() : null,
      sistemaAnalitico: c.ativoId ? null : c.sistema, dataHora: c.dh,
      operadorId: null, operadorNome: c.operador || ass.porNome, lancadoPorId: ass.porId, lancadoPorNome: ass.porNome, lancadoEm: ass.em, servTs: window.dbServerTs(), estacao: ass.estacao,
      retroativo: { horas: Math.max(0, Math.round((agoraMs - Date.parse(`${c.dh}:00`)) / 3600000)), justificativa: `Importação de planilha: ${motivo}` },
      importacao: { arquivo: plano.arquivo, motivo, porId: ass.porId, porNome: ass.porNome, em: ass.em },
      flags: { posManutPrev: false, posManutCorr: false, reinicioEquip: false, verificacao: false, otRef: null },
      repeticaoDe: null, setorIds: _cqSetoresDosTestes(Object.keys(testes)).filter(Boolean), testes, trilha: {},
    };
    if (c.observacao) hdr.observacao = c.observacao;
    hdr.status = _cqStatusCorrida(hdr);
    hdr.trilha[_cqTk()] = _cqTrilhaEntry('criacao', `Corrida ${c.numero} importada da planilha ${plano.arquivo} — ${c.resumo.join('; ')}`, [], { unidadeId: c.u });
    updates[`${CQ_KEYS.corridas}/${c.u}/${c.mes}/${c.ck}`] = hdr;
    const pend = _cqResumoPendencia({ ...hdr, key: c.ck, mes: c.mes });
    if (pend) updates[`${CQ_KEYS.indices}/${c.u}/pendentes/${c.ck}`] = pend;
    Object.entries(c.testes).forEach(([tid, ct]) => {
      const atual = ultimoNovo[`${c.u}|${tid}`] || cqState.indices[c.u]?.ultimo?.[tid];
      if (!atual || (atual.dataHora || '') <= c.dh) {
        ultimoNovo[`${c.u}|${tid}`] = { dataHora: c.dh, corridaKey: c.ck, mes: c.mes, status: ct.avaliacao.status, decisao: ct.decisao ? CQ_DECISAO[ct.decisao.acao].sigla : null, lr: ct.lr || null, lk: ct.lk || null };
      }
      _cqMarcarUso(updates, 'testes', tid);
      const t = cqState.config.testes[tid] || testesNovos[tid];
      _cqMarcarUso(updates, 'analitos', t?.analitoId);
      _cqMarcarUso(updates, 'materiais', t?.materialId);
      _cqMarcarUso(updates, 'insumos', ct.lr);
      _cqMarcarUso(updates, 'insumos', ct.lk);
    });
    Object.values(c.resultados).forEach(r => {
      _cqMarcarUso(updates, 'lotesControle', r.l);
      _cqMarcarUso(updates, 'materiais', (plano.novos.lotesControle[r.l] || cqState.config.lotesControle[r.l])?.materialId);
    });
  });
  Object.entries(ultimoNovo).forEach(([k, v]) => {
    const [u, tid] = k.split('|');
    if (cqState.indices[u]?.ultimo?.[tid]?.corridaKey !== v.corridaKey) updates[`${CQ_KEYS.indices}/${u}/ultimo/${tid}`] = v;
  });

  const ok = await window.dbUpdate(updates);
  if (!ok) { showToast('Falha ao gravar a importação. Nada foi salvo.', 'error'); return false; }
  _cqInvalidarCaches();
  // Corridas importadas costumam ser de meses anteriores: a lista abre no mês mais recente importado da unidade ativa
  const uAtiva = _cqUnidadeAtivaId();
  const mesesAtiva = [...new Set(plano.corridas.filter(c => c.u === uAtiva).map(c => c.mes))].sort();
  if (mesesAtiva.length && typeof _cqCorrFiltro !== 'undefined') {
    const ult = mesesAtiva[mesesAtiva.length - 1];
    if (!_cqCorrFiltro.per || !_cqPerMeses(_cqCorrFiltro.per, 24).includes(ult)) _cqCorrFiltro.per = { modo: 'intervalo', de: ult, ate: ult };
  }
  const nCad = CQ_COLECOES.reduce((s, c) => s + Object.keys(plano.novos[c] || {}).length, 0);
  let onde = '';
  if (plano.corridas.length) {
    const ms = [...new Set(plano.corridas.map(c => c.mes))].sort();
    onde = ` Período: ${_cqFmtMes(ms[0])}${ms.length > 1 ? ` a ${_cqFmtMes(ms[ms.length - 1])}` : ''}.`;
    const outras = [...new Set(plano.corridas.filter(c => c.u !== uAtiva).map(c => cqState.config.unidades[c.u]?.sigla || c.u))];
    if (outras.length) onde += ` Corridas de outra(s) área(s): ${outras.join(', ')} — selecione-a(s) para ver.`;
  }
  showToast(`Importação concluída: ${nCad} cadastro(s), ${plano.alvos.length} alvo(s), ${plano.corridas.length} corrida(s).${onde}`, 'success');
  _cqPlPlano = null;
  cqRender();
  cqRenderConfig();
  return true;
}
