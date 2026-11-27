// temperatura-calc.js — regras de pendência da Temperatura, usadas pelo portal (sino)
// e pela aba Temperatura do Manutenção (seeds/manutencao → ../../js/temperatura-calc.js).
// Sem dependências: só funções puras sobre os dados do banco.
//
// Banco (applamic, nó raiz "temperatura"):
//   equipamentos/{id}: { unidadeId (id em rh_unidades), codigo, min, max, ativo, criadoEm, ... }
//   leituras/{unidadeId}/{AAAA-MM}/{equipId}_{DD}_{turno}: { atual, ... }
//   acesso/{login}: { unidades: { unidadeId: true }, em }  // gerado pelos setores visíveis do grupo (Manutenção)
// Feriados: nó raiz "feriados" (fixos/{MM-DD}, datas/{AAAA-MM-DD}). Domingo não conta.
(function (g) {
  'use strict';
  const CORTE = { manha: 12, tarde: 17 };
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (a, m, d) => `${a}-${p2(m + 1)}-${p2(d)}`;
  const ym = (a, m) => `${a}-${p2(m + 1)}`;
  const chave = (equipId, dataIso, turno) => `${equipId}_${dataIso.slice(8, 10)}_${turno}`;
  const feriado = (fer, dataIso) => (fer && (fer.datas?.[dataIso] || fer.fixos?.[dataIso.slice(5)])) || null;
  const diaUtil = (fer, a, m, d) => new Date(a, m, d).getDay() !== 0 && !feriado(fer, iso(a, m, d));
  function atrasado(dataIso, turno, agora) {
    const hoje = iso(agora.getFullYear(), agora.getMonth(), agora.getDate());
    if (dataIso < hoje) return true;
    if (dataIso > hoje) return false;
    return agora.getHours() >= CORTE[turno];
  }
  // equips: lista de equipamentos ativos da unidade; leituras: objeto do mês ({chave: leitura})
  function pendencias({ equips, leituras, feriados, ano, mes, agora }) {
    const out = [];
    const hoje = iso(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    (equips || []).filter((e) => e && e.obrigatorio !== false).forEach((e) => {   // sob rotina (caixas) não gera pendência
      const desde = e.criadoEm ? new Date(e.criadoEm) : null;
      const desdeIso = desde ? iso(desde.getFullYear(), desde.getMonth(), desde.getDate()) : '';
      for (let d = 1; d <= ultimo; d++) {
        const di = iso(ano, mes, d);
        if (di > hoje) break;
        if (di < desdeIso || !diaUtil(feriados, ano, mes, d)) continue;
        const faltam = ['manha', 'tarde'].filter((t) => { const l = leituras?.[chave(e.id, di, t)]; return l?.atual == null && !l?.abono; });   // abono = sem leitura justificada (manutenção etc.)
        if (faltam.length) out.push({ iso: di, equip: e, faltam, atrasado: faltam.some((t) => atrasado(di, t, agora)) });
      }
    });
    return out.sort((x, y) => y.iso.localeCompare(x.iso) || String(x.equip.codigo).localeCompare(String(y.equip.codigo)));
  }
  // unidades que o usuário vê: admin = todas; senão a do cadastro (RH) + as do índice de acesso
  // (unidades dos setores visíveis do grupo no Manutenção)
  function unidadesVisiveis({ todas, admin, minha, acesso }) {
    if (admin) return todas.slice();
    const ids = new Set(minha ? [minha] : []);
    Object.entries(acesso?.unidades || {}).forEach(([id, v]) => { if (v) ids.add(id); });
    return todas.filter((u) => ids.has(u.id));
  }
  g.TempCalc = { CORTE, iso, ym, chave, feriado, diaUtil, atrasado, pendencias, unidadesVisiveis };
})(typeof window !== 'undefined' ? window : globalThis);
