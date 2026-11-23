// ═══════════════════════════════════════════════════════════════
// pendencias.js — Itens que impedem um preço confiável
// ═══════════════════════════════════════════════════════════════

const PEND_POR_PAG = 50;
let pendAba = 'custo', pendPag = 1;

function mapaPendencias() {
  const m = {};
  Object.keys(PENDENCIAS).forEach(k => { m[k] = []; });
  examesVisiveis().forEach(e => {
    const c = calcular(e);
    pendenciasExame(e, c).forEach(k => m[k].push({ e, c }));
  });
  return m;
}

function renderPendencias() {
  const m = mapaPendencias();
  if (!m[pendAba]?.length) pendAba = Object.keys(PENDENCIAS).find(k => m[k].length) || pendAba;
  const itens = m[pendAba] || [];
  const n = Math.max(1, Math.ceil(itens.length / PEND_POR_PAG));
  if (pendPag > n) pendPag = n;
  const pag = itens.slice((pendPag - 1) * PEND_POR_PAG, pendPag * PEND_POR_PAG);
  const col = {
    custo: ['Setor', x => tagSetor(x.e.setorId)],
    setor: ['Origem', x => x.e.origem === 'apoio' ? 'Apoio' : 'Interno'],
    preco: ['Setor', x => tagSetor(x.e.setorId)],
    sist:  ['Praticado', x => fmt(x.e.precoPraticado)],
    div:   ['Sistema → Praticado', x => `${fmt(x.e.precoSistema)} → <b>${fmt(x.e.precoPraticado)}</b>`],
    hier:  ['Quebra', x => quebrasHierarquia(x.e.id).map(q => esc(textoQuebra(q))).join('<br>')],
    min:   ['Margem · mínimo viável', x => `<span style="color:var(--red)">${pct(x.c.margem)}</span> · ${fmt(x.c.minimo)}`]
  }[pendAba];
  const total = new Set(Object.values(m).flat().map(x => x.e.id)).size;

  document.getElementById('s-pendencias').innerHTML = `
    <div class="h-row"><div><h2>Pendências</h2><p>${total} exame(s) com algo que impede um preço confiável</p></div></div>
    <div class="card">
      <div class="tabs">${Object.entries(PENDENCIAS).map(([k, p]) => `<button class="tab ${k === pendAba ? 'on' : ''}" onclick="pendAba='${k}';pendPag=1;renderPendencias()"><i class="fa-solid ${p.icone}"></i>${p.nome}<span class="n ${m[k].length ? '' : 'zero'}">${m[k].length}</span></button>`).join('')}</div>
      <div class="pend-desc"><i class="fa-solid fa-circle-info"></i>${PENDENCIAS[pendAba].desc}</div>
      <div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>MN</th><th>Descrição</th><th class="${pendAba === 'min' || pendAba === 'div' ? 'num' : ''}">${col[0]}</th><th></th></tr></thead>
      <tbody>${pag.map(x => `<tr class="row" onclick="abrirFicha('${x.e.id}')"><td class="mn">${esc(x.e.mn)}${iconesExame(x.e)}</td><td class="desc" title="${esc(x.e.descricao)}">${esc(x.e.descricao)}</td>
        <td class="${pendAba === 'min' || pendAba === 'div' ? 'num' : ''}">${col[1](x)}</td><td class="acts"><button title="Abrir ficha"><i class="fa-solid fa-chevron-right"></i></button></td></tr>`).join('')
        || `<tr><td colspan="4">${vazio('fa-circle-check', 'Nenhuma pendência nesta categoria')}</td></tr>`}</tbody></table></div>
      <div class="foot">${paginacao(itens.length, pendPag, PEND_POR_PAG, 'paginaPendencias')}</div>
    </div>`;
}
function paginaPendencias(p) { pendPag = p; renderPendencias(); }

// Contador no menu: exames abaixo do mínimo
function atualizarBadgePendencias() {
  const a = document.querySelector('#nav a[data-s="pendencias"]');
  if (!a) return;
  const n = examesVisiveis().filter(e => e.ativo !== false && calcular(e).status === 'r').length;
  a.querySelector('.badge')?.remove();
  if (n) a.insertAdjacentHTML('beforeend', `<span class="badge" title="Exames abaixo da margem mínima">${n}</span>`);
}
