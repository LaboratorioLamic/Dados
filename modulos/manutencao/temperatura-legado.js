// ════════════════════════════════════════════════════════════════
// temperatura-legado.js — converte o backup do sistema antigo "Controle de Temperatura"
// (temperatura.json: { config, feriados, unidades: { idAntigo: { mnemonicos, archivedMnemonicos, dados, responsaveis } } })
// para o formato de backup completo da Temperatura (formato "temperatura-backup", versão 1),
// que é importado em Configurações › Temperatura › Backup completo.
//
// A conversão não grava nada. Mnemônico tipo "Ambiente" vira equipamento com vínculo de AMBIENTE (sala);
// os demais tipos (Refrigerador, Congelador, Estufa, Caixa…) ganham vínculo de ATIVO (Rede de Frio).
// Ativos e salas são criados (ou reaproveitados) só na importação.
//
// Console (opcional): tempConverterLegado(json, rhUnidades, { '2': 'idRh' }) → { backup, unidades, semMapa }
// ════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const NOMES_ANTIGOS = {
    1: '01 - Unidade NTO', 2: 'Caixas de Transporte', 3: '03 - Unidade Crato', 5: '05 - Unidade Novo Juazeiro', 6: '06 - Unidade Milagres',
    9: '09 - Unidade Barro', 10: '10 - Unidade Office Cariri', 12: '12 - Unidade Caririaçu', 13: '13 - Unidade Campos Sales',
    14: '14 - Unidade Nova Olinda', 16: '16 - Unidade Araripe', 23: '23 - Unidade Salesianos', 62: '62 - Unidade Clemir Arrais',
    88: '88 - Unidade Unicardio', 97: '97 - Unidade Endoclinic',
  };
  const A = (v) => Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {}).filter(Boolean);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const chaveNome = (s) => norm(s).replace(/^\d+\s*-\s*/, '').replace(/^unidade\s+/, '');
  const num = (s) => (String(s || '').match(/^\s*(\d+)/) || [])[1];

  function ehLegado(j) { return !!(j && j.unidades && typeof j.unidades === 'object' && !j.formato && Object.values(j.unidades).some(u => u && ('mnemonicos' in u || 'dados' in u))); }

  // unidade antiga → id em rh_unidades (pelo número "01", "03"… ou pelo nome). Caixas de Transporte → NTO.
  function mapearUnidade(idAnt, rh, manual) {
    if (manual && manual[idAnt]) return manual[idAnt];
    const nome = NOMES_ANTIGOS[idAnt] || '';
    const lista = Object.entries(rh || {}).filter(([, u]) => u && u.nome);
    const n = num(nome);
    let hit = n ? lista.filter(([, u]) => num(u.nome) && +num(u.nome) === +n) : [];
    if (hit.length === 1) return hit[0][0];
    hit = lista.filter(([, u]) => chaveNome(nome) && (chaveNome(u.nome) === chaveNome(nome) || chaveNome(u.nome).includes(chaveNome(nome))));
    if (hit.length === 1) return hit[0][0];
    if (+idAnt === 2) return mapearUnidade(1, rh, manual);
    return null;
  }

  function tempConverterLegado(j, rh, manual = {}) {
    const backup = { formato: 'temperatura-backup', versao: 1, geradoEm: new Date().toISOString(), origem: 'controle-temperatura-antigo',
      unidades: {}, equipamentos: {}, leituras: {}, feriados: { fixos: {}, datas: {} } };
    const unidades = [], semMapa = [];
    for (const [idAnt, s] of Object.entries(j.unidades || {})) {
      const rhId = mapearUnidade(idAnt, rh, manual);
      const caixa = +idAnt === 2;
      const mns = A(s.mnemonicos).map(m => ({ ...m, arquivado: false })).concat(A(s.archivedMnemonicos).map(m => ({ ...m, arquivado: true })));
      const resp = Object.fromEntries(A(s.responsaveis).map(r => [r.id, r.name || r.nome || '']));
      const dados = A(s.dados);
      unidades.push({ idAntigo: idAnt, nomeAntigo: NOMES_ANTIGOS[idAnt] || '?', rhId, equipamentos: mns.length, dias: dados.length });
      if (!rhId) { semMapa.push(idAnt); continue; }
      backup.unidades[rhId] = { nome: rh?.[rhId]?.nome || '' };
      for (const m of mns) {
        const eqId = `tq_leg_${idAnt}_${m.id}`;
        const dm = dados.filter(d => +d.mnemonicoId === +m.id && /^\d{4}-\d{2}-\d{2}$/.test(d.data || ''));
        const primeira = dm.map(d => d.data).sort()[0];
        const ambiente = norm(m.tipo) === 'ambiente';
        const mn = String(m.mnemonico || m.id).toUpperCase();
        backup.equipamentos[eqId] = {
          id: eqId, unidadeId: rhId, codigo: (caixa ? 'CX-' : '') + mn, tipo: caixa ? `Caixa de transporte · ${m.tipo}` : (m.tipo || ''),
          legenda: m.legenda || '', min: +m.min, max: +m.max, ativoId: null, ambienteId: null, ativo: !m.arquivado,
          obrigatorio: !caixa,   // caixas de transporte: sob rotina, sem pendência nem aviso
          criadoEm: primeira ? new Date(primeira + 'T00:00:00').getTime() : Date.now(),
          legado: { unidade: idAnt, mnemonicoId: m.id },
          // criado/reaproveitado na importação
          vinculo: ambiente ? { tipo: 'ambiente', nome: m.legenda || mn }
            : { tipo: 'ativo', codigoSufixo: (caixa ? 'CX-' : '') + mn, nome: `${m.tipo || 'Equipamento'}${m.legenda ? ' — ' + m.legenda : ''}`, desuso: !!m.arquivado },
        };
        for (const d of dm) {
          for (const t of ['manha', 'tarde']) {
            const at = d[t + 'Atual']; if (at == null || at === '' || isNaN(+at)) continue;
            const mi = d[t + 'Min'], ma = d[t + 'Max'], ym = d.data.slice(0, 7);
            ((backup.leituras[rhId] = backup.leituras[rhId] || {})[ym] = backup.leituras[rhId][ym] || {})[`${eqId}_${d.data.slice(8, 10)}_${t}`] = {
              equipId: eqId, data: d.data, turno: t, min: mi == null || mi === '' ? null : +mi, max: ma == null || ma === '' ? null : +ma, atual: +at,
              nome: resp[d.responsavelId] || '', gravadoEm: new Date(d.data + (t === 'manha' ? 'T08:00:00' : 'T14:00:00')).getTime(), legado: true };
          }
        }
      }
    }
    A(j.feriados).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).forEach(d => { backup.feriados.fixos[d.slice(5)] = { nome: 'Feriado (importado)' }; });
    return { backup, unidades, semMapa };
  }

  window.tempEhLegado = ehLegado;
  window.tempConverterLegado = tempConverterLegado;
  window.TEMP_NOMES_ANTIGOS = NOMES_ANTIGOS;
})();
