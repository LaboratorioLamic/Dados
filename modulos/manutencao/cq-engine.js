// ═══════════════════════════════════════════════════════════════
// cq-engine.js — Motor estatístico do Controle de Qualidade — LAMIC
// Funções puras (sem DOM e sem Firebase): estatística, regras de
// Westgard, alvos, validade de lotes, CEQ, Sigma e incerteza.
// Usado no navegador (window.CQEngine) e nos testes em Node.
// Referências: CLSI C24-Ed4, Westgard (regras múltiplas e Sigma Rules),
// ISO 15189:2022 (7.3.7) e ISO/TS 20914 (incerteza).
// ═══════════════════════════════════════════════════════════════

(function (root) {
  'use strict';

  const E = {};

  // ── NÚMEROS ──────────────────────────────────────────────────
  // Aceita vírgula ou ponto como separador decimal ("4,5", "4.5",
  // "1.234,5", "1,234.5"). Um único ponto seguido de exatamente três
  // dígitos ("1.234") é ambíguo (milhar ou decimal) e retorna null.
  E.parseNumero = function (str) {
    if (typeof str === 'number') return Number.isFinite(str) ? str : null;
    if (str === null || str === undefined) return null;
    let s = String(str).trim().replace(/\s+/g, '');
    if (!s) return null;
    if (!/^[+-]?[\d.,]+$/.test(s)) return null;
    const sinal = s[0] === '-' ? -1 : 1;
    s = s.replace(/^[+-]/, '');
    const nVirg = (s.match(/,/g) || []).length;
    const nPont = (s.match(/\./g) || []).length;
    if (nVirg && nPont) {
      const ultVirg = s.lastIndexOf(','), ultPont = s.lastIndexOf('.');
      if (ultVirg > ultPont) {               // 1.234,5
        if (nVirg > 1) return null;
        s = s.replace(/\./g, '').replace(',', '.');
      } else {                                // 1,234.5
        if (nPont > 1) return null;
        s = s.replace(/,/g, '');
      }
    } else if (nVirg) {
      if (nVirg > 1) return null;
      s = s.replace(',', '.');
    } else if (nPont > 1) {
      return null;
    } else if (nPont === 1) {
      const [int, dec] = s.split('.');
      if (dec.length === 3 && int.replace(/^0+/, '') !== '') return null;
    }
    if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
    const v = Number(s) * sinal;
    return Number.isFinite(v) ? v : null;
  };

  E.arred = function (v, dec) {
    if (v === null || v === undefined || !Number.isFinite(v)) return null;
    const f = Math.pow(10, dec === undefined ? 4 : dec);
    return Math.round(v * f) / f;
  };

  // Formatação pt-BR com número fixo de casas decimais
  E.fmtNum = function (v, dec) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2 });
  };

  // ── TEMPO E CHAVES ──────────────────────────────────────────
  // Datas analíticas são strings locais "YYYY-MM-DDTHH:mm" da unidade.
  E.chaveTempo = function (dataHora) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(dataHora || ''));
    return m ? m[1] + m[2] + m[3] + m[4] + m[5] : null;
  };

  E.chaveCorrida = function (dataHora, sufixo) {
    const t = E.chaveTempo(dataHora);
    if (!t) return null;
    const suf = sufixo || Math.random().toString(36).slice(2, 7);
    return `${t}_${suf}`;
  };

  // Aceita "2026-10-02T14:30", "202610021430_xxxx" ou "202610"
  E.mesDe = function (x) {
    const s = String(x || '');
    let m = /^(\d{4})-(\d{2})/.exec(s);
    if (m) return m[1] + m[2];
    m = /^(\d{6})/.exec(s);
    return m ? m[1] : null;
  };

  E.dataDeChave = function (chave) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(String(chave || ''));
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null;
  };

  // Lista de n meses terminando em yyyymm (inclusive), do mais recente ao mais antigo
  E.mesesAnteriores = function (yyyymm, n) {
    let ano = Number(String(yyyymm).slice(0, 4)), mes = Number(String(yyyymm).slice(4, 6));
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(`${ano}${String(mes).padStart(2, '0')}`);
      mes--;
      if (mes === 0) { mes = 12; ano--; }
    }
    return out;
  };

  // Meses entre dois yyyymm (inclusive), em ordem crescente
  E.mesesEntre = function (de, ate) {
    const out = [];
    let ano = Number(String(de).slice(0, 4)), mes = Number(String(de).slice(4, 6));
    const fim = String(ate);
    for (let i = 0; i < 600; i++) {
      const k = `${ano}${String(mes).padStart(2, '0')}`;
      if (k > fim) break;
      out.push(k);
      mes++;
      if (mes === 13) { mes = 1; ano++; }
    }
    return out;
  };

  E.diasEntre = function (deISO, ateISO) {
    const a = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10));
    const b = Date.UTC(+ateISO.slice(0, 4), +ateISO.slice(5, 7) - 1, +ateISO.slice(8, 10));
    return Math.round((b - a) / 86400000);
  };

  E.somarDias = function (dataISO, dias) {
    const d = new Date(Date.UTC(+dataISO.slice(0, 4), +dataISO.slice(5, 7) - 1, +dataISO.slice(8, 10)));
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };

  // ── ESTATÍSTICA ─────────────────────────────────────────────
  // DP amostral (n-1) pelo algoritmo de Welford (estável numericamente)
  E.estatisticas = function (valores) {
    const vs = (valores || []).filter(v => typeof v === 'number' && Number.isFinite(v));
    const n = vs.length;
    if (!n) return { n: 0, media: null, dp: null, cv: null, min: null, max: null };
    let media = 0, m2 = 0, min = Infinity, max = -Infinity;
    vs.forEach((x, i) => {
      const d = x - media;
      media += d / (i + 1);
      m2 += d * (x - media);
      if (x < min) min = x;
      if (x > max) max = x;
    });
    const dp = n > 1 ? Math.sqrt(m2 / (n - 1)) : null;
    const cv = dp !== null && media !== 0 ? Math.abs(dp / media) * 100 : null;
    return { n, media, dp, cv, min, max };
  };

  // Combina grupos {n, media, dp} (ex.: meses) numa estatística cumulativa
  E.combinar = function (grupos) {
    const gs = (grupos || []).filter(g => g && g.n > 0 && Number.isFinite(g.media));
    const n = gs.reduce((s, g) => s + g.n, 0);
    if (!n) return { n: 0, media: null, dp: null, cv: null };
    const media = gs.reduce((s, g) => s + g.n * g.media, 0) / n;
    if (n < 2) return { n, media, dp: null, cv: null };
    const ss = gs.reduce((s, g) => s + (g.n - 1) * Math.pow(g.dp || 0, 2) + g.n * Math.pow(g.media - media, 2), 0);
    const dp = Math.sqrt(ss / (n - 1));
    return { n, media, dp, cv: media !== 0 ? Math.abs(dp / media) * 100 : null };
  };

  // DP agrupado (dentro de grupos, ex.: lotes diferentes) — imprecisão intermediária
  E.dpAgrupado = function (grupos) {
    const gs = (grupos || []).filter(g => g && g.n > 1 && Number.isFinite(g.dp));
    const gl = gs.reduce((s, g) => s + (g.n - 1), 0);
    if (!gl) return null;
    return Math.sqrt(gs.reduce((s, g) => s + (g.n - 1) * g.dp * g.dp, 0) / gl);
  };

  // CV agrupado (%) — usado para incerteza quando os níveis/lotes têm médias diferentes
  E.cvAgrupado = function (grupos) {
    const gs = (grupos || []).filter(g => g && g.n > 1 && Number.isFinite(g.cv));
    const gl = gs.reduce((s, g) => s + (g.n - 1), 0);
    if (!gl) return null;
    return Math.sqrt(gs.reduce((s, g) => s + (g.n - 1) * g.cv * g.cv, 0) / gl);
  };

  E.zScore = function (v, media, dp) {
    if (![v, media, dp].every(x => typeof x === 'number' && Number.isFinite(x)) || dp <= 0) return null;
    return (v - media) / dp;
  };

  // Faixa do fabricante (média ± k·DP) → DP provisório
  E.dpDeFaixa = function (min, max, k) {
    if (![min, max].every(Number.isFinite) || max <= min) return null;
    return (max - min) / (2 * (k || 2));
  };

  // Estabelece média e DP a partir dos dados do laboratório (CLSI C24-Ed4:
  // ao menos 20 resultados em dias diferentes; DP pode ser estimado pelo
  // CV histórico do lote anterior quando há poucos pontos).
  E.estabelecerAlvo = function (valores, opts) {
    const o = Object.assign({ minPontos: 20, minAceitavel: 10, dpModo: 'dados', cvReferencia: null, excluir3dp: true }, opts || {});
    const avisos = [];
    let vs = (valores || []).filter(v => typeof v === 'number' && Number.isFinite(v));
    let excluidos = 0;
    if (o.excluir3dp && vs.length >= 10) {
      const s0 = E.estatisticas(vs);
      if (s0.dp) {
        const filtrados = vs.filter(v => Math.abs(v - s0.media) <= 3 * s0.dp);
        excluidos = vs.length - filtrados.length;
        vs = filtrados;
      }
    }
    const s = E.estatisticas(vs);
    if (s.n < o.minAceitavel) {
      return { ok: false, n: s.n, media: s.media, dp: s.dp, cv: s.cv, excluidos,
               avisos: [`São necessários ao menos ${o.minAceitavel} resultados (há ${s.n}).`] };
    }
    if (excluidos) avisos.push(`${excluidos} resultado(s) além de ±3 DP excluído(s) do cálculo.`);
    let dp = s.dp, origem = s.n >= o.minPontos ? 'estabelecido' : 'provisorio';
    if (s.n < o.minPontos) avisos.push(`Menos de ${o.minPontos} resultados: alvo provisório, recalcular ao completar ${o.minPontos}.`);
    if (o.dpModo === 'cv_historico' && Number.isFinite(o.cvReferencia) && o.cvReferencia > 0) {
      dp = Math.abs(s.media) * o.cvReferencia / 100;
      avisos.push(`DP estimado pelo CV histórico (${E.fmtNum(o.cvReferencia, 2)}%).`);
    } else if (Number.isFinite(o.cvReferencia) && s.cv !== null && s.cv > o.cvReferencia * 1.5) {
      avisos.push(`CV observado (${E.fmtNum(s.cv, 2)}%) muito acima do histórico (${E.fmtNum(o.cvReferencia, 2)}%).`);
    }
    const cv = dp !== null && s.media ? Math.abs(dp / s.media) * 100 : null;
    return { ok: dp !== null && dp > 0, n: s.n, media: s.media, dp, cv, origem, excluidos, avisos };
  };

  // Validade efetiva de um frasco/lote: a menor entre a validade do
  // fabricante e a estabilidade após abertura (RDC 978 art. 102).
  E.validadeEfetiva = function (info, hoje) {
    const i = info || {};
    const cands = [];
    if (i.validade) cands.push({ data: String(i.validade).slice(0, 10), motivo: 'validade' });
    if (i.abertoEm && Number(i.estabilidadeDias) > 0) {
      cands.push({ data: E.somarDias(String(i.abertoEm).slice(0, 10), Number(i.estabilidadeDias)), motivo: 'estabilidade' });
    }
    if (!cands.length) return { dataLimite: null, motivo: null, vencido: false, diasRestantes: null };
    cands.sort((a, b) => a.data.localeCompare(b.data));
    const lim = cands[0];
    const dias = E.diasEntre(String(hoje).slice(0, 10), lim.data);
    return { dataLimite: lim.data, motivo: lim.motivo, vencido: dias < 0, diasRestantes: dias };
  };

  // ── REGRAS DE CONTROLE ──────────────────────────────────────
  E.REGRAS = {
    '1_2s':    { label: '1-2s',        tipoErro: 'aleatorio',  janela: 1,  descricao: 'Um controle além de ±2 DP' },
    '1_2.5s':  { label: '1-2,5s',      tipoErro: 'aleatorio',  janela: 1,  descricao: 'Um controle além de ±2,5 DP' },
    '1_3s':    { label: '1-3s',        tipoErro: 'aleatorio',  janela: 1,  descricao: 'Um controle além de ±3 DP' },
    '1_3.5s':  { label: '1-3,5s',      tipoErro: 'aleatorio',  janela: 1,  descricao: 'Um controle além de ±3,5 DP' },
    '2_2s':    { label: '2-2s',        tipoErro: 'sistematico', janela: 2, descricao: 'Dois controles consecutivos além de 2 DP do mesmo lado' },
    'R_4s':    { label: 'R-4s',        tipoErro: 'aleatorio',  janela: 1,  descricao: 'Na mesma corrida, um controle acima de +2 DP e outro abaixo de −2 DP' },
    '2of3_2s': { label: '2 de 3 2s',   tipoErro: 'sistematico', janela: 3, descricao: 'Dois de três controles além de 2 DP do mesmo lado' },
    '3_1s':    { label: '3-1s',        tipoErro: 'sistematico', janela: 3, descricao: 'Três controles consecutivos além de 1 DP do mesmo lado' },
    '4_1s':    { label: '4-1s',        tipoErro: 'sistematico', janela: 4, descricao: 'Quatro controles consecutivos além de 1 DP do mesmo lado' },
    '6x':      { label: '6x',          tipoErro: 'sistematico', janela: 6, descricao: 'Seis controles consecutivos do mesmo lado da média' },
    '8x':      { label: '8x',          tipoErro: 'sistematico', janela: 8, descricao: 'Oito controles consecutivos do mesmo lado da média' },
    '9x':      { label: '9x',          tipoErro: 'sistematico', janela: 9, descricao: 'Nove controles consecutivos do mesmo lado da média' },
    '10x':     { label: '10x',         tipoErro: 'sistematico', janela: 10, descricao: 'Dez controles consecutivos do mesmo lado da média' },
    '12x':     { label: '12x',         tipoErro: 'sistematico', janela: 12, descricao: 'Doze controles consecutivos do mesmo lado da média' },
    '7T':      { label: '7T',          tipoErro: 'sistematico', janela: 7, descricao: 'Sete controles consecutivos em tendência (subindo ou descendo)' },
  };
  E.ORDEM_REGRAS = ['1_2s', '1_2.5s', '1_3s', '1_3.5s', '2_2s', 'R_4s', '2of3_2s', '3_1s', '4_1s', '6x', '8x', '9x', '10x', '12x', '7T'];

  const R = 'rejeicao', A = 'alerta';
  E.PRESETS = {
    westgard_n2: { label: 'Westgard clássico (2 níveis)',  niveis: 2, N: 2, corridas: 1, regras: { '1_2s': A, '1_3s': R, '2_2s': R, 'R_4s': R, '4_1s': R, '10x': R } },
    westgard_n3: { label: 'Westgard clássico (3 níveis)',  niveis: 3, N: 3, corridas: 1, regras: { '1_2s': A, '1_3s': R, '2of3_2s': R, 'R_4s': R, '3_1s': R, '12x': R } },
    sigma6_n2:   { label: 'Sigma ≥ 6 (2 níveis)',          niveis: 2, N: 2, corridas: 1, regras: { '1_3s': R } },
    sigma5_n2:   { label: 'Sigma 5 (2 níveis)',            niveis: 2, N: 2, corridas: 1, regras: { '1_3s': R, '2_2s': R, 'R_4s': R } },
    sigma4_n2:   { label: 'Sigma 4 (2 níveis)',            niveis: 2, N: 4, corridas: 1, regras: { '1_3s': R, '2_2s': R, 'R_4s': R, '4_1s': R } },
    sigma3_n2:   { label: 'Sigma < 4 (2 níveis)',          niveis: 2, N: 4, corridas: 2, regras: { '1_3s': R, '2_2s': R, 'R_4s': R, '4_1s': R, '8x': R } },
    sigma6_n3:   { label: 'Sigma ≥ 6 (3 níveis)',          niveis: 3, N: 3, corridas: 1, regras: { '1_3s': R } },
    sigma5_n3:   { label: 'Sigma 5 (3 níveis)',            niveis: 3, N: 3, corridas: 1, regras: { '1_3s': R, '2of3_2s': R, 'R_4s': R } },
    sigma4_n3:   { label: 'Sigma 4 (3 níveis)',            niveis: 3, N: 3, corridas: 1, regras: { '1_3s': R, '2of3_2s': R, 'R_4s': R, '3_1s': R } },
    sigma3_n3:   { label: 'Sigma < 4 (3 níveis)',          niveis: 3, N: 6, corridas: 2, regras: { '1_3s': R, '2of3_2s': R, 'R_4s': R, '3_1s': R, '6x': R } },
    unica_1_3s:  { label: 'Regra única 1-3s',              niveis: 0, N: 2, corridas: 1, regras: { '1_3s': R } },
    unica_1_25s: { label: 'Regra única 1-2,5s',            niveis: 0, N: 2, corridas: 1, regras: { '1_2.5s': R } },
  };

  // Maior histórico (em corridas) exigido pelas regras ativas
  E.janelaMax = function (regras) {
    let j = 1;
    Object.entries(regras || {}).forEach(([k, sev]) => {
      if (sev && sev !== 'off' && E.REGRAS[k]) j = Math.max(j, E.REGRAS[k].janela);
    });
    return j;
  };

  // Seleciona o histórico usado pelas regras entre corridas.
  // resultados: [{ corridaKey, nivel, z, estado, decisao, invalidado, excluido }]
  // Exclui invalidados, excluídos, rejeitados (por padrão), lote em
  // estabelecimento ('P') e resultados sem alvo; mantém só as últimas
  // `janelaMax` corridas anteriores a `antesDe` e posteriores a `reinicio`.
  E.prepararHistorico = function (resultados, opts) {
    const o = Object.assign({ incluirRejeitados: false, antesDe: null, reinicio: null, janelaMax: 12 }, opts || {});
    const validos = (resultados || []).filter(r => {
      if (!r || typeof r.z !== 'number' || !Number.isFinite(r.z)) return false;
      if (r.invalidado || r.excluido) return false;
      if (r.estado === 'P' || r.estado === 'X') return false;
      if (!o.incluirRejeitados && (r.decisao === 'R' || (r.estado === 'R' && !r.decisao))) return false;
      if (o.antesDe && !(r.corridaKey < o.antesDe)) return false;
      if (o.reinicio && !(r.corridaKey > o.reinicio)) return false;
      return true;
    });
    validos.sort((a, b) => a.corridaKey < b.corridaKey ? -1 : a.corridaKey > b.corridaKey ? 1 : (a.nivel - b.nivel));
    const corridas = [];
    validos.forEach(r => { if (corridas[corridas.length - 1] !== r.corridaKey) corridas.push(r.corridaKey); });
    const manter = new Set(corridas.slice(-o.janelaMax));
    return validos.filter(r => manter.has(r.corridaKey)).map(r => ({ chave: r.corridaKey, nivel: r.nivel, z: r.z }));
  };

  const ESCOPO_ORDEM = { resultado: 0, intra_corrida: 1, entre_corridas_nivel: 2, entre_corridas_niveis: 3 };
  const ESCOPO_TXT = {
    resultado: '', intra_corrida: 'na corrida', entre_corridas_nivel: 'entre corridas, mesmo nível',
    entre_corridas_niveis: 'entre corridas e níveis',
  };

  function _fz(z) { return (z >= 0 ? '+' : '') + E.fmtNum(z, 2); }

  // Avalia a corrida atual contra as regras configuradas.
  // atual:     [{ nivel, z }]  (z = null quando o nível não tem alvo)
  // historico: [{ chave, nivel, z }] em ordem crescente (ver prepararHistorico)
  // regras:    { '1_3s': 'rejeicao' | 'alerta' | 'off', ... }
  // opcoes:    { gatilho12s: false, chaveAtual: 'atual' }
  E.avaliarCorrida = function (params) {
    const p = params || {};
    const regras = p.regras || {};
    const op = Object.assign({ gatilho12s: false, chaveAtual: '__atual__' }, p.opcoes || {});
    const atual = (p.atual || []).filter(r => r && r.nivel !== undefined);
    const atualValido = atual.filter(r => typeof r.z === 'number' && Number.isFinite(r.z));
    const semAlvo = atual.filter(r => !(typeof r.z === 'number' && Number.isFinite(r.z))).map(r => r.nivel);
    const historico = (p.historico || []).filter(h => h && typeof h.z === 'number' && Number.isFinite(h.z));
    const ativa = k => regras[k] && regras[k] !== 'off' && E.REGRAS[k];
    const violacoes = [];

    const add = (regra, escopo, itens) => {
      const niveis = Array.from(new Set(itens.filter(i => i.atual).map(i => i.nivel))).sort((a, b) => a - b);
      const zs = itens.map(i => i.z);
      const def = E.REGRAS[regra];
      let texto = `${def.label}: ${def.descricao.toLowerCase()}`;
      if (escopo === 'resultado') texto = `${def.label}: nível ${niveis.join(', ')} com z = ${itens.filter(i => i.atual).map(i => _fz(i.z)).join(' / ')}`;
      else if (ESCOPO_TXT[escopo]) texto += ` (${ESCOPO_TXT[escopo]})`;
      violacoes.push({
        regra, severidade: regras[regra], escopo, niveis, tipoErro: def.tipoErro, texto,
        chaves: Array.from(new Set(itens.map(i => i.chave))), zs,
      });
    };

    const deveAvaliar = !op.gatilho12s || atualValido.some(r => Math.abs(r.z) > 2);
    if (deveAvaliar && atualValido.length) {
      const atuaisMarcados = atualValido.map(r => ({ chave: op.chaveAtual, nivel: r.nivel, z: r.z, atual: true }))
        .sort((a, b) => a.nivel - b.nivel);
      const niveis = Array.from(new Set(atuaisMarcados.map(r => r.nivel)));

      // Séries por nível e combinada (corrida, depois nível)
      const seqNivel = {};
      niveis.forEach(n => {
        seqNivel[n] = historico.filter(h => h.nivel === n).map(h => ({ ...h, atual: false }))
          .concat(atuaisMarcados.filter(a => a.nivel === n));
      });
      const seqComb = historico.map(h => ({ ...h, atual: false })).concat(atuaisMarcados);

      // 1-ks
      [['1_2s', 2], ['1_2.5s', 2.5], ['1_3s', 3], ['1_3.5s', 3.5]].forEach(([k, lim]) => {
        if (!ativa(k)) return;
        const fora = atuaisMarcados.filter(a => Math.abs(a.z) > lim);
        if (fora.length) add(k, 'resultado', fora);
      });

      // 2-2s: na corrida (níveis diferentes) e entre corridas no mesmo nível
      if (ativa('2_2s')) {
        const pos = atuaisMarcados.filter(a => a.z > 2), neg = atuaisMarcados.filter(a => a.z < -2);
        if (pos.length >= 2) add('2_2s', 'intra_corrida', pos);
        if (neg.length >= 2) add('2_2s', 'intra_corrida', neg);
        niveis.forEach(n => {
          const s = seqNivel[n];
          if (s.length < 2) return;
          const t = s.slice(-2);
          if (t.every(x => x.z > 2) || t.every(x => x.z < -2)) add('2_2s', 'entre_corridas_nivel', t);
        });
      }

      // R-4s: apenas dentro da corrida
      if (ativa('R_4s')) {
        const pos = atuaisMarcados.filter(a => a.z > 2), neg = atuaisMarcados.filter(a => a.z < -2);
        if (pos.length && neg.length) add('R_4s', 'intra_corrida', [pos[0], neg[0]]);
      }

      // Sequências do mesmo lado além de um limite (n-ks) e do mesmo lado da média (nx)
      const mesmaDirecao = (t, lim) => t.every(x => x.z > lim) || t.every(x => x.z < -lim);
      const cauda = (regra, n, lim) => {
        let achou = false;
        niveis.forEach(nv => {
          const s = seqNivel[nv];
          if (s.length < n) return;
          const t = s.slice(-n);
          if (mesmaDirecao(t, lim)) { add(regra, 'entre_corridas_nivel', t); achou = true; }
        });
        if (!achou && seqComb.length >= n) {
          const t = seqComb.slice(-n);
          if (t.some(x => x.atual) && mesmaDirecao(t, lim)) {
            const corridas = new Set(t.map(x => x.chave));
            add(regra, corridas.size > 1 ? 'entre_corridas_niveis' : 'intra_corrida', t);
          }
        }
      };
      if (ativa('3_1s')) cauda('3_1s', 3, 1);
      if (ativa('4_1s')) cauda('4_1s', 4, 1);
      [['6x', 6], ['8x', 8], ['9x', 9], ['10x', 10], ['12x', 12]].forEach(([k, n]) => { if (ativa(k)) cauda(k, n, 0); });

      // 2 de 3 além de 2 DP do mesmo lado (série combinada)
      if (ativa('2of3_2s') && seqComb.length >= 2) {
        const t = seqComb.slice(-3);
        [1, -1].forEach(sinal => {
          const fora = t.filter(x => sinal * x.z > 2);
          if (fora.length >= 2 && fora.some(x => x.atual)) {
            const corridas = new Set(fora.map(x => x.chave));
            add('2of3_2s', corridas.size > 1 ? 'entre_corridas_niveis' : 'intra_corrida', fora);
          }
        });
      }

      // 7T: tendência de 7 valores no mesmo nível
      if (ativa('7T')) {
        niveis.forEach(nv => {
          const s = seqNivel[nv];
          if (s.length < 7) return;
          const t = s.slice(-7);
          let sobe = true, desce = true;
          for (let i = 1; i < t.length; i++) {
            if (!(t[i].z > t[i - 1].z)) sobe = false;
            if (!(t[i].z < t[i - 1].z)) desce = false;
          }
          if (sobe || desce) add('7T', 'entre_corridas_nivel', t);
        });
      }
    }

    // Mantém, por regra, o escopo mais específico (unindo os níveis do mesmo escopo)
    const porRegra = {};
    violacoes.forEach(v => {
      const atualR = porRegra[v.regra];
      if (!atualR || ESCOPO_ORDEM[v.escopo] < ESCOPO_ORDEM[atualR.escopo]) porRegra[v.regra] = { ...v };
      else if (atualR.escopo === v.escopo) {
        atualR.niveis = Array.from(new Set(atualR.niveis.concat(v.niveis))).sort((a, b) => a - b);
        atualR.chaves = Array.from(new Set(atualR.chaves.concat(v.chaves)));
      }
    });
    const finais = E.ORDEM_REGRAS.filter(k => porRegra[k]).map(k => porRegra[k]);

    const porNivel = {};
    atual.forEach(r => { porNivel[r.nivel] = { status: semAlvo.includes(r.nivel) ? 'sem_alvo' : 'aceito', regras: [] }; });
    finais.forEach(v => v.niveis.forEach(n => {
      const pn = porNivel[n];
      if (!pn) return;
      pn.regras.push(v.regra);
      if (v.severidade === 'rejeicao') pn.status = 'rejeitado';
      else if (v.severidade === 'alerta' && pn.status === 'aceito') pn.status = 'alerta';
    }));

    let status = 'aceito';
    if (finais.some(v => v.severidade === 'rejeicao')) status = 'rejeitado';
    else if (semAlvo.length) status = 'sem_alvo';
    else if (finais.some(v => v.severidade === 'alerta')) status = 'alerta';
    return { status, violacoes: finais, porNivel, semAlvo };
  };

  // ── RESULTADOS: FORMATO COMPACTO NO BANCO ───────────────────
  const MAPA = {
    corridaKey: 'c', nivel: 'n', loteControleId: 'l', valor: 'v', valorOriginal: 'vo', alvoId: 'a',
    media: 'm', dp: 's', z: 'z', estado: 'e', regras: 'r', decisao: 'd', loteReagenteId: 'lr',
    loteCalibradorId: 'lk', invalidacao: 'i', excluido: 'x', correcoes: 'k', testeId: 't',
    obtido: 'q', esperado: 'qe', naoRealizado: 'nr',
  };
  const MAPA_INV = Object.fromEntries(Object.entries(MAPA).map(([k, v]) => [v, k]));

  E.compactarResultado = function (obj) {
    const out = {};
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v) && !v.length) return;
      out[MAPA[k] || k] = v;
    });
    return out;
  };

  E.expandirResultado = function (raw, resKey) {
    const out = {};
    Object.entries(raw || {}).forEach(([k, v]) => { out[MAPA_INV[k] || k] = v; });
    if (resKey) out.id = resKey;
    if (out.regras && !Array.isArray(out.regras)) out.regras = Object.values(out.regras);
    out.invalidado = !!out.invalidacao;
    return out;
  };

  // ── QUALITATIVO / SEMIQUANTITATIVO ──────────────────────────
  // escala: lista ordenada (ex.: ['Não reagente','1+','2+','3+'] ou ['1:2','1:4',...])
  E.avaliarQualitativo = function (p) {
    const o = Object.assign({ tolerancia: 1 }, p || {});
    if (!o.obtido || !o.esperado) return { status: 'sem_alvo', concordante: null, passos: null };
    if (Array.isArray(o.escala) && o.escala.length) {
      const ie = o.escala.indexOf(o.esperado), io = o.escala.indexOf(o.obtido);
      if (ie >= 0 && io >= 0) {
        const passos = io - ie;
        if (passos === 0) return { status: 'aceito', concordante: true, passos };
        // Mudança de categoria reagente/não reagente nunca é tolerada
        const cruzaCorte = (ie === 0) !== (io === 0) && o.primeiroNegativo !== false;
        if (Math.abs(passos) <= o.tolerancia && !cruzaCorte) return { status: 'alerta', concordante: false, passos };
        return { status: 'rejeitado', concordante: false, passos };
      }
    }
    const ok = String(o.obtido).trim().toLowerCase() === String(o.esperado).trim().toLowerCase();
    return { status: ok ? 'aceito' : 'rejeitado', concordante: ok, passos: null };
  };

  // Lista de resultados possíveis digitada uma por linha (ou separada por ";"), sem repetições
  E.parseEscala = function (txt) {
    const vistos = new Set();
    return String(txt || '').split(/[\n;]/).map(s => s.trim().replace(/\s+/g, ' ')).filter(s => {
      const k = s.toLowerCase();
      if (!s || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  };

  // Critérios de avaliação dos controles qualitativos (equivalentes às regras de Westgard)
  E.REGRAS_QUAL = {
    QL_DISC: { label: 'Discordante', descricao: 'Resultado diferente do esperado para o controle' },
    QL_1CAT: { label: '±1 categoria', descricao: 'Diferença de uma categoria/diluição em relação ao esperado (semiquantitativo)' },
    FIS_ESP: { label: 'Parâmetro físico', descricao: 'Tempo, temperatura ou pressão do ciclo de esterilização fora da especificação do programa' },
  };
  E.rotuloRegra = function (k) { return (E.REGRAS[k] || E.REGRAS_QUAL[k])?.label || k; };

  // Avalia uma corrida qualitativa/semiquantitativa (todos os níveis do teste).
  // atual: [{ nivel, obtido, esperado, rotulo }]
  // tipo: 'qualitativo' (concordância exata) ou 'semiquantitativo' (escala ordenada com tolerância)
  // Retorna o mesmo formato de avaliarCorrida para reaproveitar liberação, NC e trilha.
  E.avaliarCorridaQualitativa = function (p) {
    const o = p || {};
    const semi = o.tipo === 'semiquantitativo';
    const ordem = { aceito: 0, sem_alvo: 1, alerta: 2, rejeitado: 3 };
    const porNivel = {}, violacoes = [];
    let status = null;
    (o.atual || []).forEach(a => {
      const r = E.avaliarQualitativo({
        obtido: a.obtido, esperado: a.esperado, escala: semi ? o.escala : null,
        tolerancia: semi ? (Number.isFinite(o.tolerancia) ? o.tolerancia : 1) : 0,
      });
      const regras = r.status === 'rejeitado' ? ['QL_DISC'] : r.status === 'alerta' ? ['QL_1CAT'] : [];
      porNivel[a.nivel] = { status: r.status, regras, concordante: r.concordante, passos: r.passos };
      if (regras.length) {
        violacoes.push({
          regra: regras[0], severidade: r.status === 'rejeitado' ? 'rejeicao' : 'alerta', escopo: 'intra', niveis: [a.nivel],
          tipoErro: null, chaves: [], zs: [],
          texto: `${a.rotulo || 'Nível ' + a.nivel}: obtido “${a.obtido}”, esperado “${a.esperado}”`,
        });
      }
      if (status === null || ordem[r.status] > ordem[status]) status = r.status;
    });
    return { status: status || 'sem_alvo', violacoes, porNivel, semAlvo: status === 'sem_alvo' || status === null };
  };

  // Resumo de conformidade de controles qualitativos por nível (indicador do período)
  E.conformidadeQualitativa = function (resultados) {
    const por = {};
    (resultados || []).forEach(r => {
      if (!r || r.invalidado || r.excluido || r.obtido === undefined || r.obtido === null || r.obtido === '') return;
      const x = (por[r.nivel] = por[r.nivel] || { n: 0, conformes: 0, alertas: 0, discordantes: 0 });
      x.n++;
      if (r.estado === 'A') x.conformes++;
      else if (r.estado === 'W') x.alertas++;
      else if (r.estado === 'R') x.discordantes++;
    });
    Object.values(por).forEach(x => { x.pctConforme = x.n ? x.conformes / x.n * 100 : null; });
    return por;
  };

  // ── CONTROLE EXTERNO (ENSAIO DE PROFICIÊNCIA) ───────────────
  // limiteTipo: '%' (erro relativo), 'abs' (erro absoluto) ou 'dp' (|z| máximo)
  E.avaliarCEQ = function (p) {
    const o = p || {};
    const v = o.valor, alvo = o.alvo;
    if (!Number.isFinite(v) || !Number.isFinite(alvo)) return { erroAbs: null, erroPct: null, z: null, adequado: null };
    const erroAbs = v - alvo;
    const erroPct = alvo !== 0 ? erroAbs / alvo * 100 : null;
    const z = Number.isFinite(o.dpGrupo) && o.dpGrupo > 0 ? erroAbs / o.dpGrupo : null;
    let adequado = null;
    if (Number.isFinite(o.limite)) {
      if (o.limiteTipo === 'abs') adequado = Math.abs(erroAbs) <= o.limite;
      else if (o.limiteTipo === 'dp') adequado = z !== null ? Math.abs(z) <= o.limite : null;
      else adequado = erroPct !== null ? Math.abs(erroPct) <= o.limite : null;
    } else if (Number.isFinite(o.faixaMin) && Number.isFinite(o.faixaMax)) {
      adequado = v >= o.faixaMin && v <= o.faixaMax;
    }
    return { erroAbs, erroPct, z, adequado };
  };

  // ── DESEMPENHO: SIGMA, PROBABILIDADES E INCERTEZA ───────────
  // Função de distribuição acumulada da normal padrão (Abramowitz-Stegun 7.1.26)
  E.phi = function (x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  };

  // Sigma = (ETa% − |viés%|) / CV%
  E.sigma = function (p) {
    const o = p || {};
    if (![o.eta, o.cv].every(Number.isFinite) || o.cv <= 0) return null;
    return (o.eta - Math.abs(Number.isFinite(o.vies) ? o.vies : 0)) / o.cv;
  };

  // Westgard Sigma Rules: regras e número de controles por nível de Sigma
  E.recomendarRegras = function (sigma, nNiveis) {
    const n3 = nNiveis === 3;
    if (!Number.isFinite(sigma)) return null;
    let k, texto;
    if (sigma >= 6)      { k = n3 ? 'sigma6_n3' : 'sigma6_n2'; texto = n3 ? '1-3s com N=3, R=1' : '1-3s com N=2, R=1'; }
    else if (sigma >= 5) { k = n3 ? 'sigma5_n3' : 'sigma5_n2'; texto = n3 ? '1-3s/2de3 2s/R-4s com N=3, R=1' : '1-3s/2-2s/R-4s com N=2, R=1'; }
    else if (sigma >= 4) { k = n3 ? 'sigma4_n3' : 'sigma4_n2'; texto = n3 ? '1-3s/2de3 2s/R-4s/3-1s com N=3, R=1' : '1-3s/2-2s/R-4s/4-1s com N=4, R=1 (ou N=2, R=2)'; }
    else                 { k = n3 ? 'sigma3_n3' : 'sigma3_n2'; texto = n3 ? '1-3s/2de3 2s/R-4s/3-1s/6x com N=6, R=2' : '1-3s/2-2s/R-4s/4-1s/8x com N=4, R=2 (ou N=2, R=4)'; }
    const preset = E.PRESETS[k];
    return { preset: k, N: preset.N, corridas: preset.corridas, texto,
             avisoMetodo: sigma < 3 ? 'Desempenho abaixo de 3 Sigma: avaliar melhoria do método; o CQ estatístico isolado não garante a qualidade.' : null,
             fonte: 'Westgard Sigma Rules' };
  };

  // Probabilidade de rejeição de uma regra 1-ks com N controles,
  // com erro sistemático deltaSE (em DP) e fator de erro aleatório fatorRE.
  E.probRejeicao1ks = function (k, N, deltaSE, fatorRE) {
    const d = deltaSE || 0, f = fatorRE || 1;
    const pDentro = E.phi((k - d) / f) - E.phi((-k - d) / f);
    return 1 - Math.pow(pDentro, N);
  };

  // Gerador pseudoaleatório com semente (mulberry32) e normal (Box-Muller)
  E.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    const u = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let extra = null;
    const normal = () => {
      if (extra !== null) { const v = extra; extra = null; return v; }
      let u1 = 0;
      while (u1 === 0) u1 = u();
      const u2 = u();
      const r = Math.sqrt(-2 * Math.log(u1));
      extra = r * Math.sin(2 * Math.PI * u2);
      return r * Math.cos(2 * Math.PI * u2);
    };
    return { u, normal };
  };

  // Monte Carlo: probabilidade de falsa rejeição (pfr, processo estável)
  // e de detecção (ped) de um erro sistemático deltaSE em `corridasErro` corridas.
  E.simularDesempenho = function (p) {
    const o = Object.assign({ regras: { '1_3s': 'rejeicao' }, niveis: 2, iter: 2000, deltaSE: 2, corridasErro: 1, aquecimento: 15, seed: 12345 }, p || {});
    const g = E.rng(o.seed);
    const jan = E.janelaMax(o.regras);
    const soRejeicao = Object.fromEntries(Object.entries(o.regras).filter(([, s]) => s === 'rejeicao'));
    const run = (hist, desloc, idx) => {
      const atual = [];
      for (let n = 1; n <= o.niveis; n++) atual.push({ nivel: n, z: g.normal() + desloc });
      const r = E.avaliarCorrida({ atual, historico: hist, regras: soRejeicao, opcoes: { chaveAtual: `k${String(idx).padStart(6, '0')}` } });
      return { r, atual };
    };
    const acrescentar = (hist, atual, idx) => {
      atual.forEach(a => hist.push({ chave: `k${String(idx).padStart(6, '0')}`, nivel: a.nivel, z: a.z }));
      const corridas = Array.from(new Set(hist.map(h => h.chave)));
      const manter = new Set(corridas.slice(-jan));
      return hist.filter(h => manter.has(h.chave));
    };
    // pfr: série longa estável
    let hist = [], rejeitadas = 0, total = 0, idx = 0;
    for (let i = 0; i < o.iter; i++) {
      const { r, atual } = run(hist, 0, idx);
      total++;
      if (r.status === 'rejeitado') rejeitadas++;
      else hist = acrescentar(hist, atual, idx);
      idx++;
    }
    const pfr = rejeitadas / total;
    // ped: aquecimento estável seguido de erro sistemático
    let detectados = 0;
    for (let i = 0; i < o.iter; i++) {
      let h = [];
      for (let w = 0; w < o.aquecimento; w++) {
        const { r, atual } = run(h, 0, idx);
        if (r.status !== 'rejeitado') h = acrescentar(h, atual, idx);
        idx++;
      }
      for (let c = 0; c < o.corridasErro; c++) {
        const { r, atual } = run(h, o.deltaSE, idx);
        idx++;
        if (r.status === 'rejeitado') { detectados++; break; }
        h = acrescentar(h, atual, idx - 1);
      }
    }
    return { pfr, ped: detectados / o.iter, deltaSE: o.deltaSE };
  };

  // Erro sistemático crítico (em DP) a ser detectado: ΔSEcrit = Sigma − 1,65
  E.deltaSECritico = function (sigma) { return Number.isFinite(sigma) ? sigma - 1.65 : null; };

  // Incerteza de medição (ISO/TS 20914) a partir do CV de longo prazo do CIQ.
  // Valores em %: cvRw (imprecisão intermediária) e uCalRel (incerteza do calibrador).
  E.incertezaMedicao = function (p) {
    const o = Object.assign({ k: 2, uCalRel: 0 }, p || {});
    if (!Number.isFinite(o.cvRw) || o.cvRw <= 0) return null;
    const uc = Math.sqrt(o.cvRw * o.cvRw + (o.uCalRel || 0) * (o.uCalRel || 0));
    const U = o.k * uc;
    const res = { uRw: o.cvRw, uCal: o.uCalRel || 0, uc, U, k: o.k };
    if (Number.isFinite(o.mau)) res.atendeMAU = uc <= o.mau;
    return res;
  };

  // ── INTEGRIDADE ─────────────────────────────────────────────
  // JSON canônico (chaves ordenadas) para selos de integridade de relatórios
  E.canonico = function (obj) {
    const ord = v => {
      if (Array.isArray(v)) return v.map(ord);
      if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = ord(v[k]); return o; }, {});
      return v;
    };
    return JSON.stringify(ord(obj));
  };

  E.hashSHA256 = async function (obj) {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) return null;
    const dados = new TextEncoder().encode(typeof obj === 'string' ? obj : E.canonico(obj));
    const buf = await c.subtle.digest('SHA-256', dados);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  root.CQEngine = E;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
