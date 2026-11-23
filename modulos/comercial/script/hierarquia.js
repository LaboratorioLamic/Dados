// ═══════════════════════════════════════════════════════════════
// hierarquia.js — Hierarquia de valor entre tabelas de preço
// ═══════════════════════════════════════════════════════════════
//
// Particular ≥ 1ª tabela ≥ 2ª ≥ … (ordem em config/hierarquia/ordem).
// Cada tabela da hierarquia não pode passar do menor preço das que estão
// acima dela (exames sem preço numa tabela são pulados). Tabelas ativas fora
// da hierarquia só precisam ficar ≤ Particular.

const TOL_HIER = 0.004;

// Ids das tabelas na hierarquia (ativas = só as que entram na verificação)
function ordemHierarquia(soAtivas = true) {
  const h = ESTADO.hierarquia;
  const ids = h?.definida ? (Array.isArray(h.ordem) ? h.ordem : Object.values(h.ordem || {}))
    : PADRAO_HIERARQUIA.map(n => tabelasLista().find(t => normalizar(t.nome) === normalizar(n))?.id);
  return [...new Set(ids)].filter(id => id && ESTADO.tabelas[id] && (!soAtivas || ESTADO.tabelas[id].ativa !== false));
}
const foraHierarquia = (soAtivas = true) => tabelasLista(!soAtivas).filter(t => !ordemHierarquia(false).includes(t.id)).map(t => t.id);
const nomeAlvoHier = a => a === 'particular' ? 'Particular' : ESTADO.tabelas[a]?.nome || '?';

// Preço salvo de um exame numa tabela da hierarquia
const precoSalvoHier = (a, k) => a === 'particular' ? ESTADO.exames[k]?.precoPraticado || null : ESTADO.tabelas[a]?.precos?.[k] ?? null;

// Quebras de um exame. preco(alvo, chave) permite simular (ex.: rascunho da grade).
// → [{ tipo: 'ordem' | 'fora', alvo, nome, p, teto: { alvo, nome, p } }]
function quebrasHierarquia(k, preco = precoSalvoHier) {
  const q = [];
  let teto = null;
  ['particular', ...ordemHierarquia()].forEach(a => {
    const p = preco(a, k);
    if (p == null) return;
    if (teto && p > teto.p + TOL_HIER) q.push({ tipo: 'ordem', alvo: a, nome: nomeAlvoHier(a), p, teto });
    if (!teto || p < teto.p) teto = { alvo: a, nome: nomeAlvoHier(a), p };
  });
  const part = preco('particular', k);
  if (part != null) foraHierarquia().forEach(a => {
    const p = preco(a, k);
    if (p != null && p > part + TOL_HIER) q.push({ tipo: 'fora', alvo: a, nome: nomeAlvoHier(a), p, teto: { alvo: 'particular', nome: 'Particular', p: part } });
  });
  return q;
}
const textoQuebra = x => `${x.nome} ${fmt(x.p)} > ${x.teto.nome} ${fmt(x.teto.p)}`;

// Todos os exames visíveis com quebra
function mapaQuebras() {
  return examesVisiveis().filter(e => e.ativo !== false)
    .map(e => ({ e, k: e.id, q: quebrasHierarquia(e.id) }))
    .filter(x => x.q.length);
}

// ── Aba Hierarquia (tela Tabelas) ─────────────────────────────
const hier = { q: '', tab: '', pag: 1, ed: {} };          // ed: alvo → { chave: novo valor } (edição direta na lista de quebras)
const precoHier = (a, k) => hier.ed[a]?.[k] ?? precoSalvoHier(a, k);

function desenharPaneHierarquia() {
  const el = document.getElementById('tabelas-hierarquia');
  const edit = pode('tabelas', 'editar') || pode('tabelas', 'criar');
  const ordem = ordemHierarquia(false), fora = foraHierarquia(false);
  const item = (id, i) => {
    const t = ESTADO.tabelas[id], inat = t.ativa === false;
    return `<div class="hier-i ${inat ? 'off' : ''}"><span class="hier-n">${i + 1}</span><span class="po-ic" style="--c:${t.cor}"><i class="fa-solid ${t.icone}"></i></span>
      <div class="hier-t"><b>${esc(t.nome)}</b><small>${inat ? 'inativa: fora da verificação' : `≤ ${i ? esc(ESTADO.tabelas[ordem[i - 1]].nome) : 'Particular'}`}</small></div>
      ${edit ? `<div class="acts"><button title="Subir" ${i ? '' : 'disabled'} onclick="moverHierarquia('${id}',-1)"><i class="fa-solid fa-arrow-up"></i></button><button title="Descer" ${i < ordem.length - 1 ? '' : 'disabled'} onclick="moverHierarquia('${id}',1)"><i class="fa-solid fa-arrow-down"></i></button><button title="Tirar da hierarquia" onclick="tirarHierarquia('${id}')"><i class="fa-solid fa-xmark"></i></button></div>` : ''}</div>`;
  };
  el.innerHTML = `<div class="hier-grid">
    <div class="card">
      <div class="card-h"><h3><i class="fa-solid fa-stairs"></i>Hierarquia de valor</h3></div>
      <div class="hier-lista">
        <div class="hier-i topo"><span class="hier-n"><i class="fa-solid fa-star"></i></span><span class="po-ic" style="--c:#00a8cc"><i class="fa-solid fa-user"></i></span><div class="hier-t"><b>Particular</b><small>tabela base: maior valor</small></div><i class="fa-solid fa-lock muted"></i></div>
        ${ordem.map(item).join('') || '<div class="hint" style="padding:8px 4px">Nenhuma tabela na hierarquia.</div>'}
      </div>
      <div class="sec-t" style="margin:14px 18px 8px"><i class="fa-solid fa-arrow-down-short-wide"></i>Fora da hierarquia · só ≤ Particular</div>
      <div class="hier-lista">${fora.map(id => { const t = ESTADO.tabelas[id]; return `<div class="hier-i ${t.ativa === false ? 'off' : ''}"><span class="po-ic" style="--c:${t.cor}"><i class="fa-solid ${t.icone}"></i></span>
          <div class="hier-t"><b>${esc(t.nome)}</b><small>${t.ativa === false ? 'inativa' : '≤ Particular'}</small></div>
          ${edit ? `<div class="acts"><button title="Incluir no fim da hierarquia" onclick="incluirHierarquia('${id}')"><i class="fa-solid fa-plus"></i></button></div>` : ''}</div>`; }).join('') || '<div class="hint" style="padding:8px 4px">Todas as tabelas estão na hierarquia.</div>'}</div>
      <div class="foot"><span><i class="fa-solid fa-circle-info"></i> Cada tabela não pode passar do menor preço das que estão acima. Exame sem preço numa tabela é pulado.</span></div>
    </div>
    <div class="card" id="hier-res"></div></div>`;
  desenharQuebras();
}

function desenharQuebras() {
  const el = document.getElementById('hier-res');
  if (!el) return;
  const todas = mapaQuebras(), ordem = ordemHierarquia();
  const porTab = {};
  todas.forEach(x => x.q.forEach(q => { porTab[q.alvo] = (porTab[q.alvo] || 0) + 1; }));
  const ls = todas.filter(x => (!hier.tab || x.q.some(q => q.alvo === hier.tab)) && contem(x.e.mn + ' ' + x.e.descricao, hier.q))
    .sort((a, b) => a.e.mn.localeCompare(b.e.mn, 'pt-BR', { sensitivity: 'base' }));
  const n = Math.max(1, Math.ceil(ls.length / 50));
  if (hier.pag > n) hier.pag = n;
  const fora = foraHierarquia().filter(a => porTab[a]);
  const edit = pode('tabelas', 'editar');
  const cel = (x, a) => {
    const p = precoHier(a, x.k), qb = x.qs.find(q => q.alvo === a), ed = hier.ed[a]?.[x.k] != null;
    // exame sem preço na tabela: com permissão, o campo vem vazio para incluir o valor
    return `<td class="num ${qb ? 'hier-bad' : p == null && !edit ? 'muted' : ''}" data-a="${a}" title="${qb ? esc(textoQuebra(qb)) : ''}">${!edit ? (p == null ? '—' : fmt(p))
      : `<input class="hier-in ${ed ? 'on' : ''}" type="number" step="0.01" min="0" value="${p == null ? '' : p.toFixed(2)}" placeholder="—" oninput="editarHier(this)" onkeydown="teclaHier(event)" onfocus="this.select()">`}</td>`;
  };
  el.innerHTML = `<div class="card-h"><h3><i class="fa-solid fa-triangle-exclamation" style="color:var(--amber)"></i>Exames que quebram a hierarquia</h3>
      <span>${todas.length ? `${num(todas.length, 0)} exame(s)` : 'nenhuma quebra'}</span></div>
    <div class="toolbar">
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input value="${esc(hier.q)}" placeholder="Buscar exame…" oninput="hier.q=this.value;hier.pag=1;desenharQuebras()"></div>
      ${todas.length && pode('tabelas', 'exportar') ? `<button class="btn sm" onclick="exportarQuebras()"><i class="fa-solid fa-file-csv"></i>Exportar</button>` : ''}
    </div>
    <div class="chips">
      <button class="chip ${!hier.tab ? 'on' : ''}" onclick="hier.tab='';hier.pag=1;desenharQuebras()"><i class="fa-solid fa-list"></i>Todas <b>${todas.length}</b></button>
      ${[...ordem, ...foraHierarquia()].filter(a => porTab[a] || hier.tab === a).map(a => `<button class="chip ${hier.tab === a ? 'on' : ''}" onclick="hier.tab='${a}';hier.pag=1;desenharQuebras()"><span class="d" style="background:${ESTADO.tabelas[a].cor}"></span>${esc(ESTADO.tabelas[a].nome)} <b>${porTab[a] || 0}</b></button>`).join('')}
    </div>
    <div class="alert x" id="hier-bar" style="display:none;margin:10px 18px 0;align-items:center"></div>
    <div class="tbl-wrap" style="margin-top:10px"><table class="tab-hier"><thead><tr><th>MN</th><th class="desc">Exame</th><th class="num">Particular</th>
      ${ordem.map(a => `<th class="num" title="${esc(ESTADO.tabelas[a].nome)}">${esc(ESTADO.tabelas[a].nome)}</th>`).join('')}
      ${fora.length ? '<th>Fora da hierarquia</th>' : ''}<th></th></tr></thead>
      <tbody>${ls.slice((hier.pag - 1) * 50, hier.pag * 50).map(x => {
        x.qs = quebrasHierarquia(x.k, precoHier);          // com os valores em edição
        const qf = x.q.filter(q => q.tipo === 'fora'), alvo = (x.q.find(q => q.alvo === hier.tab) || x.q[0]).alvo;
        return `<tr data-k="${esc(x.k)}"><td class="mn"><a href="#" class="lk-mn" onclick="abrirFicha('${esc(x.k)}');return false">${esc(x.e.mn)}</a></td>
          <td class="desc" title="${esc(x.e.descricao)}">${esc(x.e.descricao)}</td>
          ${cel(x, 'particular')}${ordem.map(a => cel(x, a)).join('')}
          ${fora.length ? `<td>${qf.map(q => `<span class="tag hier-tag" title="${esc(textoQuebra(q))}">${esc(q.nome)}<b>${fmt(q.p)}</b></span>`).join('') || '<span class="muted">—</span>'}</td>` : ''}
          <td class="acts">${pode('tabelas', 'editar') ? `<button title="Corrigir na grade de ${esc(nomeAlvoHier(alvo))}" onclick="corrigirQuebra('${alvo}','${esc(x.e.mn)}')"><i class="fa-solid fa-pen-to-square"></i></button>` : ''}</td></tr>`;
      }).join('') || `<tr><td colspan="${ordem.length + 5}">${vazio('fa-circle-check', todas.length ? 'Nenhum exame com esses filtros' : '<b>Hierarquia respeitada</b><br>Nenhum exame quebra a ordem de valor entre as tabelas.')}</td></tr>`}</tbody></table></div>
    <div class="foot">${paginacao(ls.length, hier.pag, 50, 'paginaQuebras')}</div>`;
  desenharBarraHier();
}
function paginaQuebras(p) { hier.pag = p; desenharQuebras(); }

// ── Edição direta do valor na lista de quebras ────────────────
function editarHier(inp) {
  const td = inp.closest('td'), tr = inp.closest('tr'), a = td.dataset.a, k = tr.dataset.k, s = precoSalvoHier(a, k);
  const v = inp.value.trim() === '' ? NaN : Math.round(parseFloat(inp.value) * 100) / 100;
  if (isNaN(v) || v < 0 || Math.abs(v - s) < 0.005) { if (hier.ed[a]) delete hier.ed[a][k]; }
  else (hier.ed[a] ??= {})[k] = v;
  // realça de novo a linha sem recriar os campos (mantém o foco)
  const qs = quebrasHierarquia(k, precoHier);
  tr.querySelectorAll('td[data-a]').forEach(c => {
    const qb = qs.find(q => q.alvo === c.dataset.a);
    c.classList.toggle('hier-bad', !!qb); c.title = qb ? textoQuebra(qb) : '';
    c.querySelector('input')?.classList.toggle('on', hier.ed[c.dataset.a]?.[k] != null);
  });
  desenharBarraHier();
}
function teclaHier(ev) {
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  ev.preventDefault();
  const a = ev.target.closest('td').dataset.a, ins = [...document.querySelectorAll('#hier-res td[data-a] input')].filter(i => i.closest('td').dataset.a === a);
  ins[ins.indexOf(ev.target) + (ev.key === 'ArrowUp' ? -1 : 1)]?.focus();
}
const edicoesHier = () => Object.entries(hier.ed).map(([a, o]) => [a, Object.entries(o).filter(([k]) => ESTADO.exames[k])]).filter(([a, l]) => l.length && ctxAlvo(a));

function desenharBarraHier() {
  const bar = document.getElementById('hier-bar');
  if (!bar) return;
  const eds = edicoesHier(), n = eds.reduce((s, [, l]) => s + l.length, 0);
  bar.style.display = n ? 'flex' : 'none';
  if (!n) { bar.innerHTML = ''; return; }
  const ks = new Set(eds.flatMap(([, l]) => l.map(([k]) => k)));
  const ainda = [...ks].filter(k => quebrasHierarquia(k, precoHier).length).length;
  bar.innerHTML = `<i class="fa-solid fa-pen-to-square"></i><div style="flex:1"><b>${n} valor(es) alterado(s)</b> em ${eds.map(([a]) => esc(nomeAlvoHier(a))).join(', ')}
      <div class="s">${ainda ? `<span style="color:var(--red)">${ainda} exame(s) alterado(s) ainda quebram a hierarquia</span>` : 'exames alterados passam a respeitar a hierarquia'}</div></div>
    <button class="btn sm" onclick="hier.ed={};desenharQuebras()"><i class="fa-solid fa-trash-can"></i>Descartar</button>
    <button class="btn sm ${pode('tabelas', 'aprovar') ? '' : 'pri'}" onclick="enviarHier(false)"><i class="fa-solid fa-paper-plane"></i>Enviar para aprovação</button>
    ${pode('tabelas', 'aprovar') ? `<button class="btn sm pri" onclick="enviarHier(true)"><i class="fa-solid fa-stamp"></i>Publicar direto</button>` : ''}`;
}

// Uma proposta por tabela alterada (mesmo fluxo da grade): pendente ou já publicada
async function enviarHier(publicar) {
  const eds = edicoesHier(), n = eds.reduce((s, [, l]) => s + l.length, 0), u = usuarioAtual();
  if (!n) return;
  if (publicar && !pode('tabelas', 'aprovar')) return toast('Sem permissão para publicar', 'erro');
  const ok = await confirmar({ titulo: publicar ? 'Publicar os valores?' : 'Enviar para aprovação?',
    texto: `${n} valor(es) em ${eds.map(([a]) => esc(nomeAlvoHier(a))).join(', ')}. ${publicar ? 'Os preços passam a valer agora.' : 'Os preços só valem depois de aprovados.'}`, botao: publicar ? 'Publicar' : 'Enviar' });
  if (!ok) return;
  const lote = eds.length > 1 ? DB.novaChave('propostas') : null;
  for (const [a, l] of eds) {
    const cx = ctxAlvo(a), itens = Object.fromEntries(l.map(([k, v]) => [k, { mn: ESTADO.exames[k].mn, de: cx.salvo(k) ?? null, para: v }]));
    const id = DB.novaChave('propostas');
    const p = { alvo: a, alvoNome: cx.nome, itens, n: l.length, justificativa: 'Correção de hierarquia', autor: u.nome, autorId: u.id, em: Date.now(), status: 'pendente', lote };
    await DB.gravar(`propostas/${id}`, { ...p, em: DB.agora() });
    if (publicar) await aplicarProposta(id, p);
    else registrar('tabelas', `${cx.nome}: proposta com ${l.length} preço(s) enviada (hierarquia)`, { proposta: id });
  }
  hier.ed = {};
  toast(publicar ? `${n} preço(s) publicados` : `${eds.length} proposta(s) enviada(s): ${n} preço(s) aguardando aprovação`);
  desenharQuebras();
}

// Abre a grade da tabela já filtrada nas quebras e buscando o exame
function corrigirQuebra(alvo, mn) {
  tabAba = 'tabelas'; tabSel = alvo;
  grade.alvo = null; grade.proxFiltro = 'hier'; grade.proxQ = mn;
  renderTabelas();
}

async function gravarOrdemHierarquia(ids) {
  ESTADO.hierarquia = { definida: true, ordem: ids };
  await DB.gravar(CAMINHOS.hierarquia, { definida: true, ordem: ids.length ? ids : null });
  registrar('tabelas', `Hierarquia de valor: Particular ≥ ${ids.map(nomeAlvoHier).join(' ≥ ') || '(nenhuma)'}`);
  desenharPaneHierarquia();
}
function moverHierarquia(id, d) {
  const o = ordemHierarquia(false), i = o.indexOf(id), j = i + d;
  if (i < 0 || j < 0 || j >= o.length) return;
  [o[i], o[j]] = [o[j], o[i]];
  gravarOrdemHierarquia(o);
}
function tirarHierarquia(id) { gravarOrdemHierarquia(ordemHierarquia(false).filter(x => x !== id)); }
function incluirHierarquia(id) { gravarOrdemHierarquia([...ordemHierarquia(false), id]); }

function exportarQuebras() {
  const ls = mapaQuebras().sort((a, b) => a.e.mn.localeCompare(b.e.mn, 'pt-BR', { sensitivity: 'base' }));
  const dec = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  const alvos = ['particular', ...ordemHierarquia(), ...foraHierarquia()];
  const csv = [['Mnemônico', 'Exame', ...alvos.map(nomeAlvoHier), 'Quebras'].join(';'),
    ...ls.map(x => [x.e.mn, `"${String(x.e.descricao || '').replace(/"/g, '""')}"`, ...alvos.map(a => dec(precoSalvoHier(a, x.k))), `"${x.q.map(textoQuebra).join(' | ')}"`].join(';'))].join('\r\n') + '\r\n';
  baixarArquivo('Quebras de hierarquia.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}
