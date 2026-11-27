// ════════════════════════════════════════════════════════════════
// temperatura-backup.js — backup completo da Temperatura (Configurações › Temperatura)
//
// Formato (JSON): { formato: 'temperatura-backup', versao: 1, geradoEm, origem,
//   unidades:     { rhId: { nome } },                        // referência
//   equipamentos: { id: { ...equipamento, vinculo? } },     // vinculo: { tipo:'ativo'|'ambiente', id?, codigo?, codigoSufixo?, nome, desuso? }
//   leituras:     { rhId: { 'AAAA-MM': { chave: leitura } } },
//   feriados:     { fixos: {MM-DD:{nome}}, datas: {AAAA-MM-DD:{nome}} } } // só entram os que faltam
// Importa também o temperatura.json do sistema antigo (convertido por temperatura-legado.js).
// Permissão: administrador do portal ou temperatura.configurar + temperatura.importar.
// ════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const R = 'temperatura';
  const CAT = 'Rede de Frio', SETOR = 'Rede de Frio';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const toast = (m, t) => typeof showToast === 'function' && showToast(m, t);
  const login = () => (typeof _authPerfilDados !== 'undefined' && _authPerfilDados?.login) || '';
  const admin = () => (typeof _authPerfilDados !== 'undefined' && _authPerfilDados?.grupo === 'admin');
  const pode = () => admin() || (_tCan('configurarTemperatura') && _tCan('importarLeituras'));
  const baixar = (obj, nome) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const hoje = () => new Date().toISOString().slice(0, 10);
  let ctx = null;   // { arquivo, bruto, legado, manual, conv, backup, existentes, modo }

  // ── exportar ──────────────────────────────────────────────────
  async function exportar() {
    if (!(admin() || _tCan('configurarTemperatura'))) { toast('Sem permissão.', 'error'); return; }
    toast('Lendo a Temperatura…', 'info');
    let raiz;
    try { raiz = (await rootDb.ref(R).once('value')).val() || {}; } catch (e) { toast('Sem permissão para ler o backup completo.', 'error'); return; }
    const fer = (await rootDb.ref('feriados').once('value').catch(() => null))?.val() || {};
    const equipamentos = {};
    Object.values(raiz.equipamentos || {}).forEach(e => {
      if (!e) return;
      const at = e.ativoId ? _tAtivo(e.ativoId) : null, am = _tAmbiente(e.ambienteId);
      equipamentos[e.id] = { ...e, vinculo: at ? { tipo: 'ativo', id: at.id, codigo: at.codigo, nome: at.nome } : am ? { tipo: 'ambiente', id: am.id, nome: am.nome } : null };
    });
    const unidades = Object.fromEntries(Object.entries(tempState.rh || {}).map(([id, u]) => [id, { nome: u?.nome || '' }]));
    const nLeit = Object.values(raiz.leituras || {}).reduce((n, u) => n + Object.values(u || {}).reduce((k, m) => k + Object.keys(m || {}).length, 0), 0);
    baixar({ formato: 'temperatura-backup', versao: 1, geradoEm: new Date().toISOString(), origem: 'dados-lamic', unidades, equipamentos,
      leituras: raiz.leituras || {}, feriados: { fixos: fer.fixos || {}, datas: fer.datas || {} } }, `temperatura-backup-completo-${hoje()}.json`);
    toast(`Backup baixado: ${Object.keys(equipamentos).length} equipamento(s), ${nLeit} leitura(s).`, 'success');
  }

  // ── importar: leitura do arquivo e prévia ─────────────────────
  async function abrirArquivo(inp) {
    const f = inp.files?.[0]; inp.value = ''; if (!f) return;
    if (!pode()) { toast('Precisa ser administrador ou ter Configurar + Importar na Temperatura.', 'error'); return; }
    let j;
    try { j = JSON.parse(await f.text()); } catch { toast('Arquivo JSON inválido.', 'error'); return; }
    const legado = typeof tempEhLegado === 'function' && tempEhLegado(j);
    if (!legado && j?.formato !== 'temperatura-backup') { toast('Não é um backup da Temperatura (nem o temperatura.json antigo).', 'error'); return; }
    ctx = { arquivo: f.name, bruto: j, legado, manual: {}, modo: 'manter' };
    await preparar();
  }

  async function preparar() {
    if (ctx.legado) { ctx.conv = tempConverterLegado(ctx.bruto, tempState.rh, ctx.manual); ctx.backup = ctx.conv.backup; }
    else ctx.backup = ctx.bruto;
    const b = ctx.backup;
    // leituras existentes das unidades do arquivo (para conflitos)
    ctx.existentes = {};
    for (const u of Object.keys(b.leituras || {})) {
      try { ctx.existentes[u] = (await rootDb.ref(`${R}/leituras/${u}`).once('value')).val() || {}; } catch { ctx.existentes[u] = {}; }
    }
    desenhar();
  }

  function analise() {
    const b = ctx.backup, porUn = {};
    let eqNovos = 0, eqExist = 0, atCriar = 0, atReusar = 0, amCriar = 0, amReusar = 0, semOrg = 0, novas = 0, conf = 0;
    Object.values(b.equipamentos || {}).forEach(e => {
      if (tempState.equipamentos[e.id]) eqExist++; else eqNovos++;
      (porUn[e.unidadeId] = porUn[e.unidadeId] || { eq: 0, leit: 0 }).eq++;
      const v = e.vinculo, orgUn = _tOrgDaUnidadeRh(e.unidadeId);
      if (!v) return;
      if (!orgUn) { semOrg++; return; }
      const r = resolverVinculo(e, orgUn, true);
      if (v.tipo === 'ativo') r.criar ? atCriar++ : atReusar++;
      else r.criar ? amCriar++ : amReusar++;
    });
    Object.entries(b.leituras || {}).forEach(([u, meses]) => Object.entries(meses || {}).forEach(([ym, regs]) => Object.keys(regs || {}).forEach(k => {
      (porUn[u] = porUn[u] || { eq: 0, leit: 0 }).leit++;
      if (ctx.existentes[u]?.[ym]?.[k]) conf++; else novas++;
    })));
    const ferAtual = tempState.feriados || {};
    const ferNovos = [...Object.keys(b.feriados?.fixos || {}).filter(k => !ferAtual.fixos?.[k]).map(k => 'fixos/' + k),
      ...Object.keys(b.feriados?.datas || {}).filter(k => !ferAtual.datas?.[k]).map(k => 'datas/' + k)];
    return { porUn, eqNovos, eqExist, atCriar, atReusar, amCriar, amReusar, semOrg, novas, conf, ferNovos };
  }

  // Acha ou (simulando) cria o ativo/ambiente do vínculo. simular=true não altera nada.
  function resolverVinculo(e, orgUnId, simular, novos) {
    const v = e.vinculo; if (!v) return {};
    const orgUn = orgState.unidades?.[orgUnId];
    if (v.tipo === 'ambiente') {
      const ex = (v.id && orgState.ambientes?.[v.id]) || Object.values(orgState.ambientes || {}).find(a => a && a.unidadeId === orgUnId && norm(a.nome) === norm(v.nome))
        || Object.values(novos?.ambientes || {}).find(a => a.unidadeId === orgUnId && norm(a.nome) === norm(v.nome));
      return ex ? { ambienteId: ex.id } : { criar: true };
    }
    const codigo = String(v.codigo || `${orgUn?.sigla || 'UN'}-${v.codigoSufixo || e.codigo}`).toUpperCase();
    const ex = (v.id && state.ativos.find(a => a && a.id === v.id)) || state.ativos.find(a => a && String(a.codigo).toUpperCase() === codigo);
    return ex ? { ativoId: ex.id } : { criar: true, codigo };
  }

  function desenhar() {
    const a = analise(), b = ctx.backup;
    let ov = document.getElementById('temp-ov');
    if (!ov) { ov = document.createElement('div'); ov.id = 'temp-ov'; ov.className = 'temp-ov'; document.body.appendChild(ov); }
    ov.onclick = (ev) => { if (ev.target === ov) fechar(); };
    const rhOpts = (sel) => `<option value="">— escolher —</option>` + Object.entries(tempState.rh || {}).filter(([, u]) => u?.nome)
      .sort((x, y) => x[1].nome.localeCompare(y[1].nome, 'pt-BR', { numeric: true })).map(([id, u]) => `<option value="${esc(id)}" ${id === sel ? 'selected' : ''}>${esc(u.nome)}</option>`).join('');
    const mapa = ctx.legado ? `<div class="temp-cfg-card" style="margin:10px 0"><h4><i class="fas fa-right-left"></i> Unidades do sistema antigo → unidades do RH</h4>
      <div class="temp-tw"><table><thead><tr><th>Antiga</th><th>Equip.</th><th>Dias</th><th>Unidade no RH</th><th>No Manutenção</th></tr></thead><tbody>
      ${ctx.conv.unidades.map(u => `<tr><td>${esc(u.idAntigo)} — ${esc(u.nomeAntigo)}</td><td>${u.equipamentos}</td><td>${u.dias}</td>
        <td><select onchange="tempBackup.mapear('${esc(u.idAntigo)}', this.value)">${rhOpts(u.rhId)}</select>${u.rhId ? '' : ' <span class="temp-tag amb">fica de fora</span>'}</td>
        <td>${u.rhId ? (_tOrgDaUnidadeRh(u.rhId) ? '<i class="fas fa-check temp-ic-grn"></i>' : '<span class="temp-tag amb" title="Sem par em Configurações › Unidades: ativos/salas não serão criados">sem par</span>') : ''}</td></tr>`).join('')}
      </tbody></table></div></div>` : '';
    ov.innerHTML = `<div class="temp-modal"><div class="temp-mh"><h3><i class="fas fa-database temp-ic-cy"></i> Importar backup completo — prévia</h3><button class="temp-x" onclick="tempBackup.fechar()">&times;</button>
      <div class="temp-mh-row"><span><i class="fas fa-file-code"></i> ${esc(ctx.arquivo)}</span><span class="temp-tag">${ctx.legado ? 'Sistema antigo (convertido)' : 'Backup Dados LAMIC'}</span></div>
      <div class="temp-mh-row"><label>Conflito (mesma leitura/equipamento) <span class="temp-seg"><button type="button" class="${ctx.modo === 'manter' ? 'on' : ''}" onclick="tempBackup.modo('manter')">Manter atual</button><button type="button" class="${ctx.modo === 'sobrescrever' ? 'on' : ''}" onclick="tempBackup.modo('sobrescrever')">Sobrescrever</button></span></label></div></div>
      <div class="temp-mb">${mapa}
        <div class="temp-kpis" style="margin:10px 0">
          <div class="temp-kpi"><div class="v">${a.eqNovos}</div><div class="l">Equipamentos novos${a.eqExist ? ` · ${a.eqExist} já existem` : ''}</div></div>
          <div class="temp-kpi grn"><div class="v">${a.novas}</div><div class="l">Leituras novas</div></div>
          <div class="temp-kpi amb"><div class="v">${a.conf}</div><div class="l">Leituras em conflito</div></div>
          <div class="temp-kpi"><div class="v">${a.atCriar + a.amCriar}</div><div class="l">Vínculos a criar (${a.atCriar} ativo, ${a.amCriar} sala)</div></div>
        </div>
        <p class="temp-fx">Reaproveitados: ${a.atReusar} ativo(s), ${a.amReusar} sala(s). Feriados novos: ${a.ferNovos.length}.${a.semOrg ? ` <b class="temp-ic-amb">${a.semOrg} equipamento(s) em unidade sem par no Manutenção: entram sem vínculo.</b>` : ''}
        Ativos criados vão para a categoria e o setor "${CAT}" da unidade. Antes, baixe o backup completo do Manutenção (Configurações › Backup).</p>
        <div class="temp-tw"><table><thead><tr><th>Unidade</th><th>Equipamentos</th><th>Leituras</th></tr></thead><tbody>
        ${Object.entries(a.porUn).map(([u, v]) => `<tr><td>${esc(tempState.rh?.[u]?.nome || b.unidades?.[u]?.nome || u)}</td><td>${v.eq}</td><td>${v.leit}</td></tr>`).join('') || '<tr><td colspan="3" class="miss">Nada para importar.</td></tr>'}
        </tbody></table></div>
        <div class="temp-msg" id="temp-bk-prog" style="margin-top:8px"></div></div>
      <div class="temp-mf">${ctx.legado ? '<button class="temp-btn" onclick="tempBackup.baixarConvertido()"><i class="fas fa-download"></i>Baixar convertido</button>' : ''}<div class="temp-sp"></div>
        <button class="temp-btn" onclick="tempBackup.fechar()">Cancelar</button>
        <button class="temp-btn pri" id="temp-bk-ok" onclick="tempBackup.executar()"><i class="fas fa-check"></i>Importar</button></div></div>`;
    ov.classList.add('open');
  }

  // ── importar: gravação ────────────────────────────────────────
  async function executar() {
    if (!pode()) return;
    const ok = typeof uiConfirmar === 'function' ? await uiConfirmar({ tipo: 'aviso', titulo: 'Importar backup da Temperatura?', confirmar: 'Importar',
      mensagem: `Modo de conflito: ${ctx.modo === 'manter' ? 'manter o que já existe' : 'sobrescrever'}. Pode levar alguns minutos.` }) : true;
    if (!ok) return;
    const btn = document.getElementById('temp-bk-ok'); if (btn) btn.disabled = true;
    const prog = (t) => { const el = document.getElementById('temp-bk-prog'); if (el) el.textContent = t; };
    const b = ctx.backup, eu = login(), agora = new Date().toISOString(), sobrescrever = ctx.modo === 'sobrescrever';
    const orgUp = {}, novos = { ambientes: {}, setores: {} }, tempUp = {};
    let nAt = 0, nAm = 0, nEq = 0, nLe = 0;
    try {
      // 1) vínculos (ativos/salas) e equipamentos
      for (const e of Object.values(b.equipamentos || {})) {
        if (!e?.id || !e.unidadeId) continue;
        if (tempState.equipamentos[e.id] && !sobrescrever) continue;
        const orgUnId = _tOrgDaUnidadeRh(e.unidadeId);
        let ativoId = e.ativoId && state.ativos.some(a => a?.id === e.ativoId) ? e.ativoId : null;
        let ambienteId = e.ambienteId && orgState.ambientes?.[e.ambienteId] ? e.ambienteId : null;
        if (!ativoId && !ambienteId && e.vinculo && orgUnId) {
          const r = resolverVinculo(e, orgUnId, false, novos);
          if (r.ativoId) ativoId = r.ativoId;
          else if (r.ambienteId) ambienteId = r.ambienteId;
          else if (e.vinculo.tipo === 'ambiente') {
            ambienteId = _orgUid('amb_');
            novos.ambientes[ambienteId] = { id: ambienteId, nome: e.vinculo.nome || e.codigo, unidadeId: orgUnId, setorIds: [], ativo: true, criadoEm: agora, atualizadoEm: agora, atualizadoPor: currentSession?.nomeCompleto || '' };
            orgUp[`${ORG_KEY}/ambientes/${ambienteId}`] = novos.ambientes[ambienteId]; nAm++;
          } else {
            let st = Object.values(orgState.setores || {}).find(s => s && s.unidadeId === orgUnId && norm(s.nome) === norm(SETOR)) || novos.setores[orgUnId];
            if (!st) {
              const id = _orgUid('st_');
              st = novos.setores[orgUnId] = { id, nome: SETOR, unidadeId: orgUnId, ativo: true, criadoEm: agora, atualizadoEm: agora, atualizadoPor: currentSession?.nomeCompleto || '' };
              orgUp[`${ORG_KEY}/setores/${id}`] = st;
            }
            if (!state.categorias.includes(CAT)) state.categorias.push(CAT);
            ativoId = uid();
            state.ativos.push({ id: ativoId, nome: e.vinculo.nome || e.codigo, codigo: r.codigo, setor: st.nome, setorId: st.id, categoria: CAT, tipo: 'Equipamento',
              marca: '-', modelo: '-', serie: '-', nota: `Criado pela importação da Temperatura (${e.codigo}).`,
              statusUso: e.vinculo.desuso ? 'em_desuso' : 'em_uso', pausaOTs: [], pausaOcorrencias: [], _historico: [] });
            nAt++;
          }
        }
        const { vinculo, ...limpo } = e;
        tempUp[`${R}/equipamentos/${e.id}`] = { ...limpo, ativoId: ativoId || null, ambienteId: ambienteId || null, atualizadoEm: Date.now(), atualizadoPor: eu };
        nEq++;
      }
      // 2) leituras (regras: registro novo grava com o login de quem importa; sobrescrever exige editadoPor)
      Object.entries(b.leituras || {}).forEach(([u, meses]) => Object.entries(meses || {}).forEach(([ym, regs]) => Object.entries(regs || {}).forEach(([k, l]) => {
        if (!l || l.atual == null) return;
        const ex = ctx.existentes[u]?.[ym]?.[k];
        if (ex && !sobrescrever) return;
        const reg = { ...l, importado: true, login: ex ? (ex.login || eu) : eu, loginOriginal: l.login || null };
        if (ex) { reg.editadoPor = eu; reg.editadoEm = Date.now(); } else { delete reg.editadoPor; delete reg.editadoEm; }
        tempUp[`${R}/leituras/${u}/${ym}/${k}`] = reg; nLe++;
      })));
      // 3) grava: org, ativos, temperatura (equipamentos antes das leituras), feriados
      prog('Gravando ativos e salas…');
      if (Object.keys(orgUp).length && !(await window.dbUpdate(orgUp))) throw new Error('Falha ao gravar setores/salas no Manutenção.');
      if (nAt) saveState();
      const chaves = Object.keys(tempUp).sort((x, y) => (x.includes('/equipamentos/') ? 0 : 1) - (y.includes('/equipamentos/') ? 0 : 1));
      for (let i = 0; i < chaves.length; i += 400) {
        await rootDb.ref().update(Object.fromEntries(chaves.slice(i, i + 400).map(c => [c, tempUp[c]])));
        prog(`Temperatura: ${Math.min(i + 400, chaves.length)}/${chaves.length}`);
      }
      const fer = tempState.feriados || {}, ferUp = {};
      Object.entries(b.feriados?.fixos || {}).forEach(([k, v]) => { if (!fer.fixos?.[k]) ferUp[`feriados/fixos/${k}`] = { nome: v?.nome || 'Feriado', por: eu, em: Date.now() }; });
      Object.entries(b.feriados?.datas || {}).forEach(([k, v]) => { if (!fer.datas?.[k]) ferUp[`feriados/datas/${k}`] = { nome: v?.nome || 'Feriado', por: eu, em: Date.now() }; });
      let ferMsg = '';
      if (Object.keys(ferUp).length) { try { await rootDb.ref().update(ferUp); ferMsg = `, ${Object.keys(ferUp).length} feriado(s)`; } catch { ferMsg = ' (feriados não gravados: sem permissão)'; } }
      toast(`Importado: ${nEq} equipamento(s), ${nLe} leitura(s), ${nAt} ativo(s), ${nAm} sala(s)${ferMsg}.`, 'success');
      fechar();
    } catch (e) {
      console.error('[temperatura-backup]', e);
      prog('Erro: ' + (e.code || e.message) + '. O que já foi gravado fica; rode de novo em "Manter atual" para completar.');
      toast('Erro na importação: ' + (e.code || e.message), 'error');
      if (btn) btn.disabled = false;
    }
  }

  function fechar() { document.getElementById('temp-ov')?.classList.remove('open'); ctx = null; }

  window.tempBackup = {
    exportar, abrirArquivo, executar, fechar,
    modo(m) { ctx.modo = m; desenhar(); },
    mapear(idAnt, rhId) { if (rhId) ctx.manual[idAnt] = rhId; else delete ctx.manual[idAnt]; preparar(); },
    baixarConvertido() { baixar(ctx.backup, `temperatura-backup-convertido-${hoje()}.json`); },
    // card para Configurações › Temperatura
    cardHtml() {
      const pImp = pode();
      return `<div class="temp-cfg-card"><h4><i class="fas fa-database"></i> Backup completo <span class="temp-sp"></span>
        <button class="temp-btn" onclick="tempBackup.exportar()"><i class="fas fa-file-export"></i>Exportar</button>
        ${pImp ? `<button class="temp-btn" onclick="document.getElementById('temp-bk-file').click()"><i class="fas fa-file-import"></i>Importar</button>
        <input type="file" id="temp-bk-file" accept=".json,application/json" style="display:none" onchange="tempBackup.abrirArquivo(this)">` : ''}</h4>
        <p class="temp-fx">Equipamentos (com o ativo ou a sala vinculados), todas as leituras e os feriados, em JSON. Importar aceita este backup ou o <b>temperatura.json</b> do sistema antigo (converte na hora, com prévia e opção de baixar convertido). ${pImp ? '' : 'Importar: administrador ou Configurar + Importar.'}</p></div>`;
    },
  };
})();
