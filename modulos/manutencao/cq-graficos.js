// ═══════════════════════════════════════════════════════════════
// cq-graficos.js — Gráficos de Levey-Jennings, histórico e estatística — LAMIC
// SVG desenhado à mão (vetorial, imprimível), no padrão do home.js.
// Média e DP em degrau quando o alvo muda; violações e trocas de
// lote marcadas; estatística do período por nível (PALC 11.7).
// ═══════════════════════════════════════════════════════════════

let _cqGraf = { testeId: '', per: null, modo: 'valor', niveis: null, dados: null, carregando: false };   // per: período do seletor de meses (padrão: últimos 3 meses)

const CQ_COR_ESTADO = { A: '#2a9d8f', W: '#e9a23b', R: '#e63946', X: '#8a94a6', P: '#8a94a6' };
const CQ_COR_NIVEL = ['#00a8cc', '#7b61ff', '#f4a261'];

function cqGraficoSelecionar(testeId) {
  _cqGraf.testeId = testeId;
  _cqGraf.dados = null;
  _cqGraf.niveis = null;
}

function cqRenderGraficos(body) {
  const u = _cqUnidadeAtivaId();
  const testes = _cqTestesDoFiltro(u, { incluirInativos: true }).sort((a, b) => _cqEquipTeste(a).localeCompare(_cqEquipTeste(b)) || _cqNomeTeste(a).localeCompare(_cqNomeTeste(b)));
  // Teste aberto por atalho (corrida, NC) fora do setor filtrado continua disponível
  const tSel = cqState.config.testes[_cqGraf.testeId];
  if (tSel && tSel.unidadeId === u && !testes.some(t => t.id === tSel.id)) testes.unshift(tSel);
  if (_cqGraf.testeId && !testes.some(t => t.id === _cqGraf.testeId)) { _cqGraf.testeId = ''; _cqGraf.dados = null; }
  if (!_cqGraf.per) { const m = CQEngine.mesDe(_cqNowLocal()); _cqGraf.per = { modo: 'intervalo', de: _cqMesSoma(m, -2), ate: m, atalho: 3 }; }
  const t = cqState.config.testes[_cqGraf.testeId];
  const niveis = t ? _cqNiveisTeste(t) : [];
  const qual = !!t && _cqTesteQual(t);
  if (t && !_cqGraf.niveis) _cqGraf.niveis = [...niveis];
  body.innerHTML = `
  <div class="cq-graf">
    <div class="cq-toolbar cq-toolbar-wrap">
      ${_cqGrafTesteHTML(testes, t)}
      ${_cqMpHTML('cq-mp-graf', { get: () => _cqGraf.per, set: v => { _cqGraf.per = v; _cqGraf.dados = null; },
          onchange: () => { const tt = cqState.config.testes[_cqGraf.testeId]; if (tt) { const a = document.getElementById('cq-graf-area'); if (a) a.innerHTML = '<div class="cq-vazio-p">Carregando resultados…</div>'; _cqGrafCarregar(tt); } },
          modos: ['ano', 'intervalo'], atalhos: [1, 3, 6, 12], max: 36 })}
      ${qual ? '' : `<div class="cq-seg">
        <button class="${_cqGraf.modo === 'valor' ? 'active' : ''}" onclick="_cqGraf.modo='valor';cqRender()">Valores</button>
        <button class="${_cqGraf.modo === 'z' ? 'active' : ''}" onclick="_cqGraf.modo='z';cqRender()">Escore z (níveis juntos)</button>
      </div>`}
      ${niveis.length > 1 ? `<div class="cq-cad-equip cq-graf-niv">${_cqMultiHTML('cq-graf-niv', niveis.map(n => {
          const lote = cqState.config.lotesControle[t.lotesAtivos?.[n]];
          return { value: n, label: qual ? _cqRotuloNivel(t, n) : `Nível ${n}`, sub: [qual ? `N${n}` : '', lote ? `lote ${lote.lote}` : 'sem lote em uso'].filter(Boolean).join(' · ') };
        }), (_cqGraf.niveis || []).length === niveis.length ? [] : _cqGraf.niveis, { placeholder: 'Todos os níveis', resumo: 'níveis', filtro: true, ico: CQ_ICO.lista,
          onchange: v => { _cqGraf.niveis = v.length ? v.map(Number).sort() : [...niveis]; _cqGrafDesenhar(); }, vazio: 'Teste sem níveis.' })}</div>` : ''}
      <div class="cq-spacer"></div>
      ${t ? `<button class="btn btn-outline btn-sm" onclick="_cqGraf.dados=null;cqRender()">${CQ_ICO.undo} Atualizar</button>
        <button class="btn btn-outline btn-sm" onclick="cqImprimirGrafico()">${CQ_ICO.print} Imprimir</button>` : ''}
    </div>
    <div id="cq-graf-area">${t ? '<div class="cq-vazio-p">Carregando resultados…</div>' : '<div class="cq-vazio">Selecione um teste para ver o gráfico de Levey-Jennings (quantitativos) ou o histórico de conformidade (qualitativos).</div>'}</div>
  </div>`;
  if (t) _cqGrafCarregar(t);
}

function cqGrafNivel(n, on) {
  const s = new Set(_cqGraf.niveis || []);
  if (on) s.add(n); else s.delete(n);
  _cqGraf.niveis = [...s].sort();
  _cqGrafDesenhar();
}

function _cqGrafPeriodo() {
  // Atalhos (mês atual, 3, 6, 12 meses) acompanham a virada do mês
  const p = _cqGraf.per;
  if (p?.atalho) { const atual = CQEngine.mesDe(_cqNowLocal()); return { de: _cqMesSoma(atual, -(p.atalho - 1)), ate: atual }; }
  return _cqPerFaixa(p, 36);
}
// Seletor do teste (popover com busca, agrupado por equipamento, com a situação da última corrida)
function _cqGrafTesteHTML(testes, t) {
  const ul = (cqState.indices[_cqUnidadeAtivaId()] || {}).ultimo || {};
  const dot = x => { const u = ul[x.id]; if (!u) return 'encerrado'; const s = u.decisao === 'R' ? 'rejeitado' : (u.status || 'aceito'); return { aceito: 'corr-liberada', rejeitado: 'corr-rejeitada' }[s] || 'corr-parcial'; };
  const sub = x => [_cqTesteQual(x) ? x.metodo : [x.metodo, _cqAnalito(x.analitoId)?.unidadeMedida].filter(Boolean).join(' · ')].filter(Boolean).join('');
  const grupos = {};
  testes.forEach(x => { (grupos[_cqEquipTeste(x)] = grupos[_cqEquipTeste(x)] || []).push(x); });
  const item = x => `<button type="button" class="cq-sitpop-op${t?.id === x.id ? ' sel' : ''}" data-b="${_cqEsc(_cqNormBusca(`${_cqAnalito(x.analitoId)?.nome || ''} ${x.metodo || ''} ${_cqEquipTeste(x)}`))}" onclick="cqGrafTesteEscolher('${x.id}')">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-dot st-${dot(x)}"></span></span>
      <span class="cq-sitpop-txt"><b>${_cqEsc(_cqAnalito(x.analitoId)?.nome || _cqNomeTeste(x))}${x.ativo === false ? ' <span class="cq-badge cq-st-semalvo">inativo</span>' : ''}</b>${sub(x) ? `<small>${_cqEsc(sub(x))}</small>` : ''}</span>
      <svg class="cq-sitpop-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg></button>`;
  const rot = t ? `<span class="cq-tp-rot"><b>${_cqEsc(_cqAnalito(t.analitoId)?.nome || _cqNomeTeste(t))}</b><small>${_cqEsc([sub(t), _cqEquipTeste(t)].filter(Boolean).join(' · '))}</small></span>`
    : '<span class="cq-tp-rot"><b class="cq-muted">Selecione o teste</b><small>Levey-Jennings ou histórico de conformidade</small></span>';
  return `<div class="cq-sitpop cq-tp" id="cq-graf-teste-pop">
    <input type="hidden" id="cq-graf-teste" value="${t?.id || ''}">
    <button type="button" class="cq-sitpop-btn" onclick="cqSitPopAbrir('cq-graf-teste');setTimeout(()=>document.getElementById('cq-tp-busca')?.focus(),40)">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${CQ_ICO.grafico}</span></span>${rot}
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-sitpop-menu cq-tp-menu">
      <div class="cq-tp-busca">${CQ_ICO.busca}<input type="text" id="cq-tp-busca" placeholder="Buscar analito, meio ou equipamento…" oninput="cqGrafTesteFiltrar(this.value)" autocomplete="off"></div>
      <div class="cq-tp-lista">${Object.entries(grupos).map(([g, ts]) => `<div class="cq-tp-grupo"><div class="cq-tp-grupo-tit">${CQ_ICO.ativo}${_cqEsc(g)}<span>${ts.length}</span></div>${ts.map(item).join('')}</div>`).join('')
        || '<div class="cq-ms-vazio">Nenhum teste nesta área.</div>'}<div class="cq-ms-vazio cq-tp-nada" hidden>Nenhum teste encontrado.</div></div>
    </div>
  </div>`;
}
function cqGrafTesteFiltrar(q) {
  const n = _cqNormBusca(q || '').trim();
  let algum = false;
  document.querySelectorAll('#cq-graf-teste-pop .cq-tp-grupo').forEach(g => {
    let vis = 0;
    g.querySelectorAll('.cq-sitpop-op').forEach(b => { const ok = !n || b.dataset.b.includes(n); b.hidden = !ok; if (ok) vis++; });
    g.hidden = !vis;
    if (vis) algum = true;
  });
  const nada = document.querySelector('#cq-graf-teste-pop .cq-tp-nada');
  if (nada) nada.hidden = algum;
}
function cqGrafTesteEscolher(id) {
  document.getElementById('cq-graf-teste-pop')?.classList.remove('aberto');
  cqGraficoSelecionar(id);
  cqRender();
}


async function _cqGrafCarregar(t) {
  const u = _cqUnidadeAtivaId();
  const { de, ate } = _cqGrafPeriodo();
  const chave = `${u}|${t.id}|${de}|${ate}`;
  if (_cqGraf.dados?.chave === chave) { _cqGrafDesenhar(); return; }
  const res = await cqResultadosPeriodo(u, t.id, de, ate, { forcar: true });
  if (_cqGraf.testeId !== t.id) return;
  _cqGraf.dados = { chave, res, de, ate };
  _cqGrafDesenhar();
}

function _cqGrafDesenhar() {
  const area = document.getElementById('cq-graf-area');
  const t = cqState.config.testes[_cqGraf.testeId];
  if (!area || !t || !_cqGraf.dados) return;
  const an = _cqAnalito(t.analitoId);
  const dec = an?.decimais ?? 2;
  const res = _cqGraf.dados.res.filter(r => (_cqGraf.niveis || []).includes(Number(r.nivel)));
  if (!res.length) {
    area.innerHTML = `<div class="cq-vazio">Sem resultados de ${_cqFmtMes(_cqGraf.dados.de)} a ${_cqFmtMes(_cqGraf.dados.ate)}.</div>`;
    return;
  }
  if (_cqTesteQual(t)) { area.innerHTML = _cqGrafQualHTML(t, res); return; }
  let html = '';
  if (_cqGraf.modo === 'z') {
    html += `<div class="cq-card cq-graf-card"><div class="cq-card-tit">${_cqEsc(_cqNomeTeste(t))} · ${_cqEsc(_cqEquipTeste(t))} — escore z, todos os níveis</div>
      ${_cqLJSvg(res, { modo: 'z', dec })}
      <div class="cq-graf-leg">${(_cqGraf.niveis || []).map(n => `<span><i style="background:${CQ_COR_NIVEL[(n - 1) % 3]}"></i>Nível ${n}</span>`).join('')}</div></div>`;
  } else {
    (_cqGraf.niveis || []).forEach(n => {
      const rn = res.filter(r => Number(r.nivel) === n);
      if (!rn.length) return;
      html += `<div class="cq-card cq-graf-card"><div class="cq-card-tit">${_cqEsc(_cqNomeTeste(t))} · ${_cqEsc(_cqEquipTeste(t))} — nível ${n} (${_cqEsc(an?.unidadeMedida || '')})</div>
        ${_cqLJSvg(rn, { modo: 'valor', dec })}</div>`;
    });
  }
  html += `<div class="cq-graf-leg">
    <span><i style="background:${CQ_COR_ESTADO.A}"></i>Aceito</span><span><i style="background:${CQ_COR_ESTADO.W}"></i>Alerta</span>
    <span><i style="background:${CQ_COR_ESTADO.R}"></i>Rejeitado</span><span><i class="cq-leg-oco"></i>Invalidado</span>
    <span><i class="cq-leg-linha"></i>Troca de lote / alvo</span></div>`;
  html += _cqGrafEstatHTML(t, _cqGraf.dados.res);
  area.innerHTML = html;
}

// Histórico de controles qualitativos: conformidade por nível e registro corrida a corrida
function _cqGrafQualHTML(t, res) {
  const niveis = (_cqGraf.niveis || []).filter(n => _cqNiveisTeste(t).includes(n));
  const conf = CQEngine.conformidadeQualitativa(res);
  const corridas = {};
  res.forEach(r => { (corridas[r.corridaKey] = corridas[r.corridaKey] || {})[r.nivel] = r; });
  const chaves = Object.keys(corridas).sort().reverse();
  const cls = r => r.invalidado ? 'cq-q-inval' : r.decisao === 'R' || r.estado === 'R' ? 'cq-q-rej' : r.estado === 'W' ? 'cq-q-alerta' : r.estado === 'A' ? 'cq-q-ok' : '';
  const resumo = niveis.map(n => {
    const c = conf[n];
    const ctrl = _cqControleQual(t, n) || {};
    const mat = cqState.config.materiais[ctrl.materialId];
    return `<div class="cq-q-resumo">
      <div class="cq-q-resumo-tit">${_cqEsc(_cqRotuloNivel(t, n))}</div>
      <div class="cq-muted">${_cqEsc(mat ? `${mat.nome}${mat.codigoReferencia ? ' · ' + mat.codigoReferencia : ''}` : 'Sem material')} · esperado: ${_cqEsc(ctrl.esperado || '—')}</div>
      <div class="cq-q-pct ${c && c.pctConforme < 100 ? 'cq-txt-vermelho' : 'cq-txt-verde'}">${c ? Math.round(c.pctConforme) + '%' : '—'}</div>
      <div class="cq-muted">${c ? `${c.conformes} de ${c.n} conformes${c.alertas ? ` · ${c.alertas} alerta(s)` : ''}${c.discordantes ? ` · ${c.discordantes} discordante(s)` : ''}` : 'sem resultados'}</div>
    </div>`;
  }).join('');
  const faixa = niveis.map(n => `<div class="cq-q-faixa"><span class="cq-q-faixa-lbl">${_cqEsc(_cqRotuloNivel(t, n))}</span>
    ${[...chaves].reverse().map(k => { const r = corridas[k][n]; return r ? `<i class="${cls(r)}" title="${_cqEsc(`${_cqFmtDH(CQEngine.dataDeChave(k))} · ${r.obtido}${r.observacao ? ' · ' + r.observacao : ''}`)}" onclick="cqAbrirCorrida('${CQEngine.mesDe(k)}','${k}')"></i>` : '<i class="cq-q-vazio"></i>'; }).join('')}</div>`).join('');
  const linhas = chaves.map(k => {
    const rs = corridas[k];
    const algum = Object.values(rs)[0];
    const ins = algum?.loteReagenteId ? cqState.config.insumos[algum.loteReagenteId] : null;
    const dec = Object.values(rs).map(r => r.decisao).find(Boolean);
    return `<tr class="ot-list-row" onclick="cqAbrirCorrida('${CQEngine.mesDe(k)}','${k}')"><td style="white-space:nowrap;">${_cqFmtDH(CQEngine.dataDeChave(k))}</td>
      ${niveis.map(n => { const r = rs[n]; return `<td>${r ? `<span class="cq-q-res ${cls(r)}">${_cqEsc(r.obtido)}</span>${r.valorOriginal !== undefined ? ` <span class="cq-muted">(orig. ${_cqEsc(r.valorOriginal)})</span>` : ''}${r.observacao ? ` <span class="cq-badge cq-st-alerta" title="${_cqEsc(r.observacao)}">sem lote</span>` : ''}` : '—'}</td>`; }).join('')}
      <td style="font-size:12px;">${ins ? `${_cqEsc(ins.nome)} · ${_cqEsc(ins.lote)}` : '—'}</td>
      <td>${dec ? ({ L: 'Liberado', R: '<b class="cq-txt-vermelho">Rejeitado</b>', O: 'Liberado c/ justificativa' }[dec] || dec) : '<span class="cq-txt-amarelo">Aguardando</span>'}</td></tr>`;
  }).join('');
  return `<div class="cq-card"><div class="cq-card-tit">${_cqEsc(_cqNomeTeste(t))} · ${_cqEsc(_cqEquipTeste(t))} — conformidade de ${_cqFmtMes(_cqGraf.dados.de)} a ${_cqFmtMes(_cqGraf.dados.ate)}</div>
      <div class="cq-q-resumos">${resumo}</div>
      <div class="cq-q-faixas">${faixa}</div>
      <div class="cq-graf-leg"><span><i style="background:${CQ_COR_ESTADO.A}"></i>Conforme</span><span><i style="background:${CQ_COR_ESTADO.W}"></i>Alerta</span><span><i style="background:${CQ_COR_ESTADO.R}"></i>Discordante / rejeitado</span><span><i class="cq-leg-oco"></i>Invalidado</span></div></div>
    <div class="cq-card"><div class="cq-card-tit">Registros (${chaves.length})</div>
      <div class="oc-table-scroll"><table class="ot-list-table cq-table cq-table-sm"><thead><tr><th class="ot-list-th">Data/hora</th>
        ${niveis.map(n => `<th class="ot-list-th">${_cqEsc(_cqRotuloNivel(t, n))}<div class="cq-muted" style="font-weight:400;">esp.: ${_cqEsc(_cqControleQual(t, n)?.esperado || '—')}</div></th>`).join('')}
        <th class="ot-list-th">Lote do insumo</th><th class="ot-list-th">Decisão</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

// Desenha um gráfico de Levey-Jennings
function _cqLJSvg(res, { modo, dec }) {
  const W = 960, H = modo === 'z' ? 300 : 260, ml = 64, mr = 16, mt = 14, mb = 34;
  const pts = res.map(r => {
    const y = modo === 'z' ? r.z : r.valor;
    return { r, y: Number.isFinite(y) ? y : null };
  }).filter(p => p.y !== null);
  if (!pts.length) return '<div class="cq-vazio-p">Sem pontos com alvo para exibir.</div>';
  // Eixo x por corrida (ordem cronológica)
  const corridas = Array.from(new Set(pts.map(p => p.r.corridaKey))).sort();
  const xi = new Map(corridas.map((k, i) => [k, i]));
  const nx = Math.max(corridas.length - 1, 1);
  const X = i => ml + (W - ml - mr) * (corridas.length === 1 ? 0.5 : i / nx);
  // Domínio y
  let ymin, ymax;
  if (modo === 'z') { ymin = -4; ymax = 4; pts.forEach(p => { ymin = Math.min(ymin, p.y - 0.3); ymax = Math.max(ymax, p.y + 0.3); }); ymin = Math.max(ymin, -6); ymax = Math.min(ymax, 6); }
  else {
    ymin = Infinity; ymax = -Infinity;
    pts.forEach(p => {
      if (Number.isFinite(p.r.media) && Number.isFinite(p.r.dp)) { ymin = Math.min(ymin, p.r.media - 3.6 * p.r.dp); ymax = Math.max(ymax, p.r.media + 3.6 * p.r.dp); }
      ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
    });
    const pad = (ymax - ymin) * 0.04 || 1;
    ymin -= pad; ymax += pad;
  }
  const Y = v => mt + (H - mt - mb) * (1 - (Math.min(Math.max(v, ymin), ymax) - ymin) / (ymax - ymin));
  let svg = `<svg class="cq-lj" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de Levey-Jennings">`;
  // Faixas de DP
  if (modo === 'z') {
    const faixa = (a, b, cls) => `<rect x="${ml}" y="${Y(b)}" width="${W - ml - mr}" height="${Y(a) - Y(b)}" class="${cls}"/>`;
    svg += faixa(2, 3, 'cq-lj-f3') + faixa(-3, -2, 'cq-lj-f3') + faixa(1, 2, 'cq-lj-f2') + faixa(-2, -1, 'cq-lj-f2');
    [-3, -2, -1, 0, 1, 2, 3].forEach(k => {
      svg += `<line x1="${ml}" x2="${W - mr}" y1="${Y(k)}" y2="${Y(k)}" class="${k === 0 ? 'cq-lj-media' : Math.abs(k) === 3 ? 'cq-lj-l3' : Math.abs(k) === 2 ? 'cq-lj-l2' : 'cq-lj-l1'}"/>`;
      svg += `<text x="${ml - 6}" y="${Y(k) + 4}" class="cq-lj-ylbl" text-anchor="end">${k === 0 ? 'x̄' : (k > 0 ? '+' : '') + k + 'DP'}</text>`;
    });
  } else {
    // Segmentos de alvo constante (média e DP em degrau)
    const segs = [];
    pts.forEach(p => {
      const key = `${p.r.media}|${p.r.dp}`;
      const i = xi.get(p.r.corridaKey);
      const last = segs[segs.length - 1];
      if (last && last.key === key) last.i1 = i; else segs.push({ key, m: p.r.media, s: p.r.dp, i0: i, i1: i });
    });
    segs.forEach((sg, si) => {
      if (!Number.isFinite(sg.m) || !Number.isFinite(sg.s)) return;
      const x0 = si === 0 ? ml : (X(sg.i0) + X(segs[si - 1].i1)) / 2;
      const x1 = si === segs.length - 1 ? W - mr : (X(sg.i1) + X(segs[si + 1].i0)) / 2;
      const band = (a, b, cls) => `<rect x="${x0}" y="${Y(sg.m + b * sg.s)}" width="${Math.max(x1 - x0, 1)}" height="${Math.max(Y(sg.m + a * sg.s) - Y(sg.m + b * sg.s), 0)}" class="${cls}"/>`;
      svg += band(2, 3, 'cq-lj-f3') + band(-3, -2, 'cq-lj-f3') + band(1, 2, 'cq-lj-f2') + band(-2, -1, 'cq-lj-f2');
      [-3, -2, -1, 0, 1, 2, 3].forEach(k => {
        svg += `<line x1="${x0}" x2="${x1}" y1="${Y(sg.m + k * sg.s)}" y2="${Y(sg.m + k * sg.s)}" class="${k === 0 ? 'cq-lj-media' : Math.abs(k) === 3 ? 'cq-lj-l3' : Math.abs(k) === 2 ? 'cq-lj-l2' : 'cq-lj-l1'}"/>`;
      });
      if (si === segs.length - 1) {
        [-3, -2, -1, 0, 1, 2, 3].forEach(k => {
          svg += `<text x="${ml - 6}" y="${Y(sg.m + k * sg.s) + 4}" class="cq-lj-ylbl" text-anchor="end">${_cqNum(sg.m + k * sg.s, dec)}</text>`;
        });
      }
      if (si > 0) svg += `<line x1="${x0}" x2="${x0}" y1="${mt}" y2="${H - mb}" class="cq-lj-evento"><title>Alvo alterado</title></line>`;
    });
  }
  // Eventos: troca de lote de controle ou de reagente
  let antL = null, antLr = null;
  pts.forEach(p => {
    const i = xi.get(p.r.corridaKey);
    const evs = [];
    if (antL && p.r.loteControleId && p.r.loteControleId !== antL) evs.push('lote de controle');
    if (antLr && p.r.loteReagenteId && p.r.loteReagenteId !== antLr) evs.push('lote de reagente');
    if (evs.length && i > 0) {
      const x = (X(i) + X(i - 1)) / 2;
      svg += `<line x1="${x}" x2="${x}" y1="${mt}" y2="${H - mb}" class="cq-lj-evento"><title>Troca: ${evs.join(', ')}</title></line>`;
      svg += `<text x="${x + 3}" y="${mt + 10}" class="cq-lj-evlbl">${evs.map(e => e === 'lote de controle' ? 'lote' : 'reag.').join('/')}</text>`;
    }
    antL = p.r.loteControleId || antL;
    antLr = p.r.loteReagenteId || antLr;
  });
  // Linhas que unem os pontos (por nível)
  const porNivel = {};
  pts.filter(p => !p.r.invalidado).forEach(p => { (porNivel[p.r.nivel] = porNivel[p.r.nivel] || []).push(p); });
  Object.entries(porNivel).forEach(([n, ps]) => {
    const cor = modo === 'z' ? CQ_COR_NIVEL[(Number(n) - 1) % 3] : 'var(--text-muted)';
    svg += `<polyline fill="none" stroke="${cor}" stroke-width="1.2" stroke-opacity="0.55" points="${ps.map(p => `${X(xi.get(p.r.corridaKey))},${Y(p.y)}`).join(' ')}"/>`;
  });
  // Pontos
  pts.forEach(p => {
    const r = p.r;
    const x = X(xi.get(r.corridaKey)), y = Y(p.y);
    const est = r.estado || 'X';
    const cor = r.decisao === 'R' ? CQ_COR_ESTADO.R : (CQ_COR_ESTADO[est] || CQ_COR_ESTADO.X);
    const corNivel = modo === 'z' ? CQ_COR_NIVEL[(Number(r.nivel) - 1) % 3] : cor;
    const regras = _cqArr(r.regras).map(k => CQEngine.rotuloRegra(k));
    const dh = CQEngine.dataDeChave(r.corridaKey);
    const tip = `${_cqFmtDH(dh)} · N${r.nivel}\nValor ${_cqNum(r.valor, dec)}${r.valorOriginal !== undefined ? ` (orig. ${_cqNum(r.valorOriginal, dec)})` : ''}\nz ${Number.isFinite(r.z) ? _cqNum(r.z, 2) : '—'}${regras.length ? '\nRegras: ' + regras.join(', ') : ''}${r.decisao ? '\nDecisão: ' + ({ L: 'liberado', R: 'rejeitado', O: 'liberado c/ justificativa' }[r.decisao] || r.decisao) : '\nAguardando avaliação'}${r.invalidado ? '\nINVALIDADO: ' + (r.invalidacao?.motivo || '') : ''}${r.observacao ? '\nObs.: ' + r.observacao : ''}`;
    const fora = p.y > ymax || p.y < ymin;
    svg += `<g class="cq-lj-pt" onclick="cqAbrirCorrida('${CQEngine.mesDe(r.corridaKey)}','${r.corridaKey}')"><title>${_cqEsc(tip)}</title>`;
    if (r.invalidado) svg += `<circle cx="${x}" cy="${y}" r="4.5" fill="var(--bg-card)" stroke="${CQ_COR_ESTADO.X}" stroke-width="1.6"/>`;
    else {
      svg += `<circle cx="${x}" cy="${y}" r="${est === 'A' ? 4 : 5}" fill="${modo === 'z' && est === 'A' ? corNivel : cor}" stroke="${modo === 'z' ? corNivel : 'none'}" stroke-width="1.5"/>`;
      if (est === 'R' || r.decisao === 'R') svg += `<circle cx="${x}" cy="${y}" r="8.5" fill="none" stroke="${CQ_COR_ESTADO.R}" stroke-width="1.4"/>`;
      if (fora) svg += `<text x="${x}" y="${p.y > ymax ? mt + 8 : H - mb - 4}" class="cq-lj-evlbl" text-anchor="middle">${p.y > ymax ? '▲' : '▼'}</text>`;
    }
    if (regras.length && est !== 'A') svg += `<text x="${x + 7}" y="${y - 7}" class="cq-lj-regra" fill="${cor}">${_cqEsc(regras.join(' '))}</text>`;
    svg += `</g>`;
  });
  // Eixo x (datas)
  const passo = Math.max(1, Math.ceil(corridas.length / 12));
  corridas.forEach((k, i) => {
    if (i % passo !== 0 && i !== corridas.length - 1) return;
    const dh = CQEngine.dataDeChave(k);
    svg += `<text x="${X(i)}" y="${H - mb + 16}" class="cq-lj-xlbl" text-anchor="middle">${dh.slice(8, 10)}/${dh.slice(5, 7)}</text>`;
  });
  svg += `<line x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}" class="cq-lj-eixo"/></svg>`;
  return `<div class="cq-lj-wrap">${svg}</div>`;
}

// Estatística do período por nível e por lote
function _cqGrafEstatHTML(t, todos) {
  const an = _cqAnalito(t.analitoId);
  const dec = an?.decimais ?? 2;
  const eta = t.etaOverride?.valor || (an?.eta?.tipo === '%' ? Number(an.eta.valor) : null);
  const cvMeta = an?.cvMeta?.valor ? Number(an.cvMeta.valor) : null;
  const validos = todos.filter(r => !r.invalidado && !r.excluido && r.decisao !== 'R' && Number.isFinite(r.valor));
  const linhas = [];
  _cqNiveisTeste(t).forEach(n => {
    const porLote = {};
    validos.filter(r => Number(r.nivel) === n).forEach(r => { const k = r.loteControleId || '?' + (r.loteTexto || ''); (porLote[k] = porLote[k] || []).push(r); });
    Object.entries(porLote).forEach(([lid, rs]) => {
      const s = CQEngine.estatisticas(rs.map(r => r.valor));
      const ult = rs[rs.length - 1];
      const alvoM = ult?.media, alvoS = ult?.dp;
      const vies = Number.isFinite(alvoM) && alvoM ? (s.media - alvoM) / alvoM * 100 : null;
      const dentro2 = rs.filter(r => Number.isFinite(r.z) && Math.abs(r.z) <= 2).length;
      const sig = eta && s.cv ? CQEngine.sigma({ eta, vies: vies ?? 0, cv: s.cv }) : null;
      linhas.push(`<tr><td>N${n}</td><td>${lid.startsWith('?') ? `<span class="cq-txt-amarelo" title="Resultados sem lote do controle identificado">${_cqEsc(lid.slice(1) || 'sem lote')}${lid.length > 1 ? ' (não cadastrado)' : ''}</span>` : _cqEsc(cqState.config.lotesControle[lid]?.lote || '?')}</td><td>${s.n}</td>
        <td>${_cqNum(s.media, dec)}</td><td>${_cqNum(s.dp, dec + 1)}</td>
        <td class="${cvMeta && s.cv > cvMeta ? 'cq-txt-vermelho' : ''}">${_cqNum(s.cv, 2)}%</td>
        <td>${Number.isFinite(alvoM) ? `${_cqNum(alvoM, dec)} ± ${_cqNum(alvoS, dec + 1)}` : '—'}</td>
        <td>${vies === null ? '—' : _cqNum(vies, 2) + '%'}</td>
        <td>${s.n ? Math.round(dentro2 / s.n * 100) + '%' : '—'}</td>
        <td>${sig === null ? '—' : `<b class="${sig >= 6 ? 'cq-txt-verde' : sig < 3 ? 'cq-txt-vermelho' : sig < 4 ? 'cq-txt-amarelo' : ''}">${_cqNum(sig, 1)}</b>`}</td></tr>`);
    });
  });
  const rejeitadas = new Set(todos.filter(r => r.decisao === 'R').map(r => r.corridaKey)).size;
  const corridas = new Set(todos.map(r => r.corridaKey)).size;
  return `<div class="cq-card"><div class="cq-card-tit">Estatística do período (resultados válidos, sem corridas rejeitadas)</div>
    <div class="oc-table-scroll"><table class="ot-list-table cq-table cq-table-sm"><thead><tr><th class="ot-list-th">Nível</th><th class="ot-list-th">Lote</th><th class="ot-list-th">n</th><th class="ot-list-th">Média</th><th class="ot-list-th">DP</th><th class="ot-list-th">CV</th><th class="ot-list-th">Alvo atual</th><th class="ot-list-th">Desvio da média</th><th class="ot-list-th">Dentro de ±2 DP</th><th class="ot-list-th">Sigma*</th></tr></thead>
    <tbody>${linhas.join('') || '<tr><td colspan="10" class="cq-td-vazio">Sem dados válidos.</td></tr>'}</tbody></table></div>
    <div class="cq-nota">${corridas} corrida(s) no período · ${rejeitadas} rejeitada(s)${cvMeta ? ` · CV meta ${_cqNum(cvMeta, 2)}%` : ''}${eta ? ` · ETa ${_cqNum(eta, 1)}%` : ''}.
      *Sigma estimado com o desvio em relação ao alvo do CIQ; a estimativa de viés pelo CEQ (exatidão) será incorporada na fase 2.</div></div>`;
}

function cqImprimirGrafico() {
  const area = document.getElementById('cq-graf-area');
  const t = cqState.config.testes[_cqGraf.testeId];
  if (!area || !t) return;
  const un = _cqUnidade();
  const css = `@page{size:A4 landscape;margin:12mm}body{font:11px/1.4 system-ui,sans-serif;color:#111}h1{font-size:15px;margin:0}
    .cq-card{border:1px solid #ccc;border-radius:6px;padding:8px;margin:8px 0;page-break-inside:avoid}.cq-card-tit{font-weight:700;margin-bottom:4px}
    svg{width:100%;height:auto}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left}
    .cq-lj-f2{fill:rgba(233,162,59,.08)}.cq-lj-f3{fill:rgba(230,57,70,.08)}.cq-lj-media{stroke:#2a9d8f;stroke-width:1.4}.cq-lj-l1{stroke:#bbb;stroke-dasharray:2 3}
    .cq-lj-l2{stroke:#e9a23b;stroke-dasharray:5 3}.cq-lj-l3{stroke:#e63946;stroke-dasharray:5 3}.cq-lj-evento{stroke:#7b61ff;stroke-dasharray:3 3}
    .cq-lj-ylbl,.cq-lj-xlbl,.cq-lj-evlbl,.cq-lj-regra{font-size:10px;fill:#444}.cq-lj-eixo{stroke:#888}.cq-graf-leg span{margin-right:10px}
    .cq-graf-leg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px}.cq-nota{color:#555;margin-top:4px}`;
  const titulo = _cqTesteQual(t) ? 'Controle qualitativo' : 'Levey-Jennings';
  const cssQ = `.cq-q-resumos{display:flex;gap:8px;flex-wrap:wrap}.cq-q-resumo{border:1px solid #ccc;border-radius:6px;padding:6px;min-width:160px}.cq-q-pct{font-size:18px;font-weight:700}
    .cq-q-faixa i{display:inline-block;width:8px;height:12px;margin-right:2px;background:#ddd}.cq-q-ok{background:#2a9d8f!important}.cq-q-alerta{background:#e9a23b!important}.cq-q-rej{background:#e63946!important}
    .cq-q-res{padding:0 4px;border-radius:3px;color:#fff}.cq-q-faixa-lbl{display:inline-block;width:120px}`;
  imprimirEmSegundoPlano(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo} — ${_cqEsc(_cqNomeTeste(t))}</title><style>${css}${cssQ}</style></head><body>
    <h1>${titulo} — ${_cqEsc(_cqNomeTeste(t))} · ${_cqEsc(_cqEquipTeste(t))}</h1>
    <div>Área ${_cqEsc(un?.sigla)}${_cqSetorDoTeste(t) ? ' · setor ' + _cqEsc(_cqRotuloSetor(_cqSetorDoTeste(t))) : ''} · período ${_cqFmtMes(_cqGraf.dados?.de)} a ${_cqFmtMes(_cqGraf.dados?.ate)} · emitido em ${_cqFmtDH(_cqAgora())} por ${_cqEsc(_cqSess().nome)}</div>
    ${area.innerHTML}<script>window.onload=()=>window.print()<\/script></body></html>`);
}
