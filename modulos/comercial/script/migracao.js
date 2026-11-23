// ═══════════════════════════════════════════════════════════════
// migracao.js — Leitura da aba PARTICULAR da planilha (CSV) e
// conversão em exames — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════
//
// Colunas usadas (aba PARTICULAR):
//   A Neg (TRUE = apoio SEM negociação → negociado = não)
//   B Setor · C Mnemônico · D Descrição · F PART (defasada: não usada)
//   G FINAL (preço praticado) · H CB (a auditar) · L Coleta (vacinas: aplicação)
//   N Teste (custo do teste) · X "X" = fora do sistema

const COL = { neg: 0, setor: 1, mn: 2, desc: 3, sistema: 5, final: 6, cb: 7, coleta: 11, teste: 13, fora: 23 };

function lerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const prim = texto.slice(0, texto.indexOf('\n') > 0 ? texto.indexOf('\n') : texto.length);
  const sep = (prim.match(/;/g) || []).length > (prim.match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

// " R$  1.234,56 " · "- 6,50 " · "-R$ 10,27" · "⚠️" → número ou null
function numeroBR(s) {
  s = String(s ?? '').replace(/R\$|\s| /g, '');
  if (!/\d/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/[^\d,.]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(s);
  return isNaN(v) ? null : (neg ? -v : v);
}
const verdadeiro = s => ['TRUE', 'VERDADEIRO', '1', 'SIM'].includes(String(s ?? '').trim().toUpperCase());

function acharSetor(nome) {
  const n = normalizar(nome);
  if (!n) return null;
  const ss = lista(ESTADO.setores);
  return ss.find(s => normalizar(s.nome) === n)
    || ss.find(s => normalizar(s.nome).startsWith(n) || n.startsWith(normalizar(s.nome)))
    || null;
}

// Tabela do sistema (PARTICULAR.csv: ISO-8859-1, ";")
// código;índice;porte;ch;filme;mnemonico;efetua;vlrporte → { MN: { ch, efetua } }
function analisarSistema(texto) {
  const linhas = lerCSV(texto);
  const cab = (linhas[0] || []).map(normalizar);
  const iMn = cab.indexOf('mnemonico'), iCh = cab.indexOf('ch'), iEf = cab.indexOf('efetua');
  if (iMn < 0 || iCh < 0 || iEf < 0) throw new Error('Arquivo do sistema inválido: cabeçalho esperado "código;índice;porte;ch;filme;mnemonico;efetua;vlrporte".');
  const mapa = {};
  linhas.slice(1).forEach(l => {
    const mn = (l[iMn] || '').trim();
    if (mn) mapa[mn.toUpperCase()] = { mn, ch: numeroBR(l[iCh]) || 0, efetua: (l[iEf] || '').trim().toUpperCase() === 'S' };
  });
  return mapa;
}

// Analisa o CSV da planilha (e, opcionalmente, a tabela do sistema) → { exames, resumo }
function analisarPlanilha(texto, sistema = null) {
  const linhas = lerCSV(texto);
  const iCab = linhas.slice(0, 10).findIndex(l => normalizar(l[COL.mn]) === 'mnemonico' && normalizar(l[COL.desc]).startsWith('descri'));
  if (iCab < 0) throw new Error('Cabeçalho não encontrado: confira se o arquivo é a aba PARTICULAR (coluna C "MNEMÔNICO", D "DESCRIÇÃO").');
  const exames = {}, duplicados = [], setoresNaoAchados = {}, avisos = [];
  let lidas = 0;
  linhas.slice(iCab + 1).forEach(l => {
    const mn = (l[COL.mn] || '').trim(), desc = (l[COL.desc] || '').trim();
    if (!mn || !desc || /^(📑|mn$)/i.test(mn)) return;
    lidas++;
    const chave = chaveExame(mn);
    if (exames[chave]) { duplicados.push(mn); return; }
    const setorNome = (l[COL.setor] || '').trim();
    const setor = acharSetor(setorNome);
    if (setorNome && !setor) setoresNaoAchados[setorNome] = (setoresNaoAchados[setorNome] || 0) + 1;
    const apoio = setor?.categoria === 'apoio';
    const teste = numeroBR(l[COL.teste]);
    const custo = teste ? Math.round(Math.abs(teste) * 100) / 100 : null;
    const ex = {
      mn, descricao: desc, setorId: setor?.id || null, origem: apoio ? 'apoio' : 'interno', ativo: true,
      precoPraticado: numeroBR(l[COL.final]) || null,
      custoTeste: custo, custoOrigem: custo != null ? 'planilha' : null,
      auditar: verdadeiro(l[COL.cb]) || null,
      foraDoSistema: String(l[COL.fora] || '').trim().toUpperCase() === 'X' || null,
      negociado: apoio ? !verdadeiro(l[COL.neg]) : null
    };
    // Preço de referência do sistema: vem do PARTICULAR.csv (a coluna F da planilha está defasada)
    if (sistema) {
      const s = sistema[mn.toUpperCase()];
      ex.foraDoSistema = !s || null;
      ex.precoSistema = s && s.efetua ? s.ch : null;
      if (s && !s.efetua) ex.inativoNoSistema = true;
    }
    // Serviços (vacinas): a coluna L é o custo de aplicação
    const coleta = Math.abs(numeroBR(l[COL.coleta]) || 0);
    const padraoColeta = lista(ESTADO.custosFixos).find(f => f.etapa === 'coleta')?.valor;
    if (setor?.categoria === 'servico' && coleta && padraoColeta != null && Math.abs(coleta - padraoColeta) > 0.004)
      ex.extras = [{ nome: 'Aplicação', valor: Math.round(coleta * 100) / 100 }];
    Object.keys(ex).forEach(k => (ex[k] === null || ex[k] === undefined) && delete ex[k]);
    exames[chave] = ex;
  });
  if (!lidas) throw new Error('Nenhum exame encontrado no arquivo.');
  const lst = Object.values(exames);
  const resumo = {
    lidas, unicos: lst.length, duplicados,
    comCusto: lst.filter(e => e.custoTeste != null).length,
    semSetor: lst.filter(e => !e.setorId).length,
    semPreco: lst.filter(e => !e.precoPraticado).length,
    apoio: lst.filter(e => e.origem === 'apoio').length,
    auditar: lst.filter(e => e.auditar).length,
    fora: lst.filter(e => e.foraDoSistema).length,
    aplicacao: lst.filter(e => e.extras).length,
    comSistema: !!sistema,
    divergentes: lst.filter(e => e.precoSistema != null && e.precoPraticado && Math.abs(e.precoSistema - e.precoPraticado) > 0.004).length,
    inativosSistema: lst.filter(e => e.inativoNoSistema).length,
    soNoSistema: sistema ? (() => { const mns = new Set(lst.map(e => e.mn.toUpperCase())); return Object.keys(sistema).filter(k => !mns.has(k)).length; })() : 0,
    setoresNaoAchados, avisos
  };
  return { exames, resumo };
}

// Grava em lotes; aoProgresso(feitos, total)
async function gravarExamesEmLote(exames, substituir, aoProgresso) {
  if (substituir) await DB.remover(CAMINHOS.exames);
  const chaves = Object.keys(exames), LOTE = 300, agora = Date.now(), u = usuarioAtual();
  for (let i = 0; i < chaves.length; i += LOTE) {
    const upd = {};
    chaves.slice(i, i + LOTE).forEach(k => {
      upd[`${CAMINHOS.exames}/${k}`] = { ...exames[k], criadoEm: agora, atualizadoEm: agora, atualizadoPor: u.nome };
    });
    await DB.mesclar('/', upd);
    aoProgresso?.(Math.min(chaves.length, i + LOTE), chaves.length);
  }
}
