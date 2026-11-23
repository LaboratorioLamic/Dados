// ═══════════════════════════════════════════════════════════════
// rascexames.js — Rascunho de exames: preços alterados nas fichas dos
// exames (Particular e tabelas), revisados e enviados como proposta
// ═══════════════════════════════════════════════════════════════
//
// Junta, por exame, o que está no rascunho do usuário em cada tabela (rascunhos/{alvo}/{usuario}).
// Abre pelo botão "Rascunho" da tela de exames ou pelo "Enviar proposta" da ficha, já no exame,
// para confirmar o envio. Envio: uma proposta por tabela, todas no mesmo lote (como na ficha).

let _rx = null, _rxVolta = null;   // _rxVolta: estado guardado ao abrir a ficha de um exame (a janela volta igual)   // { foco: chave do exame vindo da ficha, soFoco, sel: Set de chaves marcadas, q }

const alvosRascExames = () => ['particular', ...(pode('tabelas') ? tabelasLista(false).map(t => t.id) : [])];
const emRascExame = k => Object.values(RASC).some(r => r && k in r);

async function carregarRascExames() {
  const alvos = alvosRascExames();
  await Promise.all(alvos.map(a => carregarRascunho(a)));
  await Promise.all(alvos.map(a => gravarRasc(a)));   // grava o que ainda estava para gravar
}

// Exames com valor no rascunho: [{ k, e, itens: [linha da proposta + alvo e cx] }]
function examesNoRascunho() {
  const por = {};
  alvosRascExames().forEach(a => {
    const cx = ctxAlvo(a);
    if (!cx) return;
    Object.entries(rasc(a)).forEach(([k, v]) => {
      if (!ESTADO.exames[k] || propPendente(a, k)) return;
      (por[k] ??= []).push({ ...linhaProposta(cx, k, cx.salvo(k) ?? null, arredPP(v ?? null)), alvo: a, cx });
    });
  });
  return Object.entries(por).map(([k, itens]) => ({ k, e: ESTADO.exames[k], itens })).sort((a, b) => a.e.mn.localeCompare(b.e.mn));
}

// Botão "Rascunho" da tela de exames: quantos exames têm preço no rascunho
async function atualizarBotaoRascExames() {
  if (!usuarioAtual() || !document.getElementById('ex-rasc')) return;
  await carregarRascExames();
  const el = document.getElementById('ex-rasc-n');
  if (!el) return;
  const n = examesNoRascunho().length;
  el.textContent = n > 99 ? '99+' : n;
  el.hidden = !n;
  document.getElementById('ex-rasc').classList.toggle('rx-tem', n > 0);
  document.getElementById('ex-rasc').title = n ? `${n} exame(s) com preço no seu rascunho: revisar e enviar` : 'Rascunho de exames (vazio)';
  desenharExames();
}

// ── Janela ────────────────────────────────────────────────────
// foco: exame vindo da ficha (abre só com ele marcado) · just: justificativa digitada na ficha
async function abrirRascunhoExames(foco = null, just = '') {
  if (!usuarioAtual()) return;
  await carregarRascExames();
  if (!_rxVolta) _ppArred = '0';
  _ppRascPart = true;
  const ls = examesNoRascunho(), aprova = pode('tabelas', 'aprovar');
  const temFoco = foco && ls.some(x => x.k === foco);
  _rx = _rxVolta || { foco: temFoco ? foco : null, soFoco: !!temFoco, q: '', sel: new Set(temFoco ? [foco] : ls.map(x => x.k)) };
  if (!_rxVolta) _envVs = {};
  _rxVolta = null;
  abrirGaveta({
    larga: true, centro: true, sobre: 'Rascunho de exames', titulo: temFoco ? `Confirmar envio · ${ESTADO.exames[foco].mn}` : 'Preços alterados nas fichas',
    meta: '<span id="rx-meta" style="display:contents"></span>',
    corpo: `
      <div class="alert x"><i class="fa-solid fa-pen-to-square"></i><div>Preços alterados na ficha dos exames ficam aqui até serem enviados. Marque os exames, confira os valores e envie: <b>uma proposta por tabela</b>, todas no mesmo lote.</div></div>
      <div class="toolbar rx-bar">
        <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="rx-q" placeholder="Filtrar mnemônico ou nome…" autocomplete="off" oninput="_rx.q=this.value;desenharRascExames()"></div>
        <span id="rx-foco"></span>
        <button class="btn sm" id="rx-todos" onclick="marcarTodosRx()"></button>
      </div>
      <div class="pp-barra" id="rx-arred">${barraRx()}</div>
      <div id="rx-lista"></div>
      <div class="just"><label for="rx-just">Justificativa <span class="muted">(opcional)</span></label>
        <textarea id="rx-just" placeholder="Motivo do reajuste, negociação, concorrência…">${esc(just)}</textarea></div>
      ${aprova ? '' : '<div class="hint" style="margin-top:8px"><i class="fa-solid fa-circle-info"></i> Os preços passam a valer quando alguém com permissão de aprovação aprovar a proposta.</div>'}`,
    rodape: `<button class="btn" style="margin-right:auto" onclick="fecharGaveta()">Voltar</button>
      <button class="btn perigo-txt" id="rx-descartar" onclick="descartarRascExames()" title="Tira do rascunho os exames marcados"><i class="fa-solid fa-trash"></i></button>
      <button class="btn ${aprova ? '' : 'pri'}" id="rx-enviar" onclick="enviarRascExames(false)"><i class="fa-solid fa-paper-plane"></i>Enviar para aprovação</button>
      ${aprova ? '<button class="btn pri" id="rx-publicar" onclick="enviarRascExames(true)"><i class="fa-solid fa-stamp"></i>Aprovar e publicar</button>' : ''}`
  });
  desenharRascExames();
}

// Exames à vista: só o da ficha (soFoco) ou todos, com o filtro de texto
const visiveisRx = ls => ls.filter(x => (!_rx.soFoco || x.k === _rx.foco) && contem(x.e.mn + ' ' + (x.e.descricao || ''), _rx.q));

// Um quadro por tabela, igual ao envio da proposta: Particular, custo, atual, proposto, desconto, margem,
// indicadores (com a tabela toda) e a chave UniLab; a caixa ao lado do mnemônico marca o exame para enviar
function desenharRascExames() {
  const el = document.getElementById('rx-lista');
  if (!el || !_rx) return;
  const ls = examesNoRascunho(), vis = visiveisRx(ls);
  [..._rx.sel].forEach(k => { if (!ls.some(x => x.k === k)) _rx.sel.delete(k); });
  const por = {};
  vis.forEach(x => x.itens.forEach(i => { (por[i.alvo] ??= { cx: i.cx, itens: [] }).itens.push(i); }));
  const marca = x => { const on = _rx.sel.has(x.k);
    return `<button type="button" class="rx-ck ${on ? 'on' : ''}" title="${on ? 'Desmarcar' : 'Marcar para enviar'}" onclick="event.stopPropagation();alternarRx('${esc(x.k)}')"><i class="fa-solid ${on ? 'fa-square-check' : 'fa-square'}"></i></button>`; };
  // sintético: uma linha por exame e uma coluna por tabela (a chave UniLab fica na vista analítica)
  el.innerHTML = ppSint() ? (vis.length ? (Object.keys(_envVs).length ? '<div class="hint" style="margin:12px 0 0"><i class="fa-solid fa-clock-rotate-left" style="color:var(--red)"></i> Para marcar os valores já lançados no UniLab, use a vista <b>Analítico</b>.</div>' : '')
      + htmlSintetico(alvosRascExames().filter(a => por[a]).map(a => ({ cx: por[a].cx, nome: por[a].cx.nome, itens: por[a].itens, alvo: a })), { marcaEsq: marca, cel: (x, g) => `<td class="num">${campoRx(g.alvo, x)}${sintInfo(x) ? `<small class="pp-sinf">${sintInfo(x)}</small>` : ''}</td>` }) : '')
    : alvosRascExames().filter(a => por[a]).map(a => {
    // chave UniLab só nos exames cujo valor proposto difere do que está hoje no sistema
    const { cx, itens } = por[a], vs = pode('exames', 'editar') ? itens.filter(x => precisaVs(cx, x.k, x.para)) : [], podeVs = vs.length > 0;
    itens.forEach(x => { const kv = `${a}|${x.k}`; if (!vs.includes(x)) delete _envVs[kv]; else if (!(kv in _envVs)) _envVs[kv] = false; });
    const ab = itens.filter(x => _rx.sel.has(x.k) && x.c?.status === 'r').length, dm = itens.filter(x => _rx.sel.has(x.k) && acimaDescMax(x.desc, x.descMax, x.descTol)).length;
    return `<div class="rx-q">
      ${ab ? `<div class="alert r"><i class="fa-solid fa-circle-xmark"></i><div>${esc(cx.nome)}: ${ab} preço(s) abaixo do ${cx.pisoNome} de ${cx.pisoTxt}.</div></div>` : ''}
      ${dm ? `<div class="alert r"><i class="fa-solid fa-ban"></i><div>${esc(cx.nome)}: ${dm} preço(s) passam do desconto máximo de ${cx.dmaxTxt}.</div></div>` : ''}
      ${podeVs ? `<div class="hint" style="display:flex;align-items:center;gap:8px;margin:12px 0 6px"><i class="fa-solid fa-clock-rotate-left" style="color:var(--red)"></i><span style="flex:1">UniLab (${esc(cx.nome)}): marque os exames cujo novo valor <b>já foi lançado</b> no sistema do laboratório. Ao publicar, a tabela do sistema no banco recebe esse valor.</span>
        <button class="btn sm" onclick="envVsRx('${esc(a)}',true)"><i class="fa-solid fa-check-double"></i>Marcar todos</button><button class="btn sm" onclick="envVsRx('${esc(a)}',null)"><i class="fa-solid fa-right-left"></i>Inverter</button></div>` : ''}
      ${htmlQuadroProposta(cx, itens, { colDe: 'Atual', colPara: 'Proposto', marcaEsq: marca, celPara: x => campoRx(a, x),
        colExtra: { th: podeVs ? 'UniLab' : '', td: x => `<span class="rx-acts"><button type="button" class="icon-btn" title="Tirar do rascunho (volta ao valor publicado)" onclick="tirarItemRx('${esc(x.k)}','${esc(a)}')"><i class="fa-solid fa-rotate-left"></i></button>${podeVs && `${a}|${x.k}` in _envVs ? `<span data-vs="${esc(a)}|${esc(x.k)}" title="Valor já lançado no UniLab">${chave(_envVs[`${a}|${x.k}`], `envVs('${esc(a)}|${esc(x.k)}')`)}</span>` : ''}</span>` } })}</div>`;
  }).join('');
  el.innerHTML ||= vazio('fa-pen-to-square', ls.length ? 'Nenhum exame com esse filtro' : 'Rascunho vazio<br><span class="muted">Altere o preço na ficha de um exame e escolha <b>Rascunho</b> ou <b>Enviar proposta</b>.</span>');
  el.querySelectorAll('tr[data-k]').forEach(tr => tr.classList.toggle('rx-off', !_rx.sel.has(tr.dataset.k)));

  const sel = ls.filter(x => _rx.sel.has(x.k)), n = sel.reduce((s, x) => s + x.itens.length, 0);
  const ab = sel.reduce((s, x) => s + x.itens.filter(i => i.c?.status === 'r').length, 0);
  document.getElementById('rx-meta').innerHTML = `<span class="tag"><i class="fa-solid fa-flask-vial"></i>${ls.length} exame(s) no rascunho</span>`
    + `<span class="tag"><i class="fa-solid fa-square-check"></i>${sel.length} marcado(s) · ${n} preço(s)</span>`
    + (ab ? `<span class="tag" style="color:var(--red)"><i class="fa-solid fa-circle-xmark"></i>${ab} abaixo do piso</span>` : '');
  document.getElementById('rx-foco').innerHTML = _rx.foco && ls.length > 1
    ? `<button class="chip ${_rx.soFoco ? 'on' : ''}" onclick="_rx.soFoco=!_rx.soFoco;desenharRascExames()"><i class="fa-solid fa-filter"></i>Só ${esc(ESTADO.exames[_rx.foco]?.mn || '')}</button>` : '';
  const todos = vis.length && vis.every(x => _rx.sel.has(x.k));
  const bt = document.getElementById('rx-todos');
  bt.innerHTML = `<i class="fa-solid ${todos ? 'fa-square' : 'fa-check-double'}"></i>${todos ? 'Desmarcar' : 'Marcar'} todos`;
  bt.disabled = !vis.length;
  ['rx-enviar', 'rx-publicar', 'rx-descartar'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !sel.length; });
}
// Chave UniLab de todos os exames de uma tabela (true = marcar; null = inverter)
const envVsRx = (a, v) => Object.keys(_envVs).filter(kv => kv.startsWith(a + '|')).forEach(kv => envVs(kv, v ?? !_envVs[kv]));

// Valor proposto editável: muda o rascunho na hora (vale para o envio mesmo sem sair do campo);
// ao sair do campo, a janela recalcula. Vazio = retirar da tabela (na Particular, volta ao publicado)
const campoRx = (a, x) => `<div class="price-in on"><span>R$</span><input type="text" inputmode="numeric" autocomplete="off" data-a="${esc(a)}" value="${moedaCampo(x.para)}"
  placeholder="${x.cx.base ? '' : x.cx.lab ? 'remover' : 'retirar'}" oninput="editarRx(this)" onchange="desenharRascExames()" onfocus="this.select()"></div><div class="pp-var">${ppVar(x)}</div>`;
function editarRx(inp) {
  mascaraMoeda(inp);
  const cx = ctxAlvo(inp.dataset.a), k = inp.closest('tr').dataset.k, v = lerMoeda(inp.value);
  if (!cx || (v != null && !(v > 0))) return;
  definirRasc(cx, k, v == null && cx.base ? undefined : v);
}
const barraRx = () => htmlVistaPP('desenharVistaRx') + htmlArredPP('arredRx');
function desenharVistaRx() {
  document.getElementById('rx-arred').innerHTML = barraRx();
  desenharRascExames();
}
function arredRx(v) {
  _ppArred = _ppArred === v ? '0' : v;
  document.getElementById('rx-arred').innerHTML = barraRx();
  desenharRascExames();
}
function alternarRx(k) {
  if (_rx.sel.has(k)) _rx.sel.delete(k); else _rx.sel.add(k);
  desenharRascExames();
}
function marcarTodosRx() {
  const vis = visiveisRx(examesNoRascunho()), todos = vis.every(x => _rx.sel.has(x.k));
  vis.forEach(x => { if (todos) _rx.sel.delete(x.k); else _rx.sel.add(x.k); });
  desenharRascExames();
}
function fichaRx(k) {
  fecharGaveta();
  abrirFicha(k);
}
async function tirarItemRx(k, alvo) {
  definirRasc(ctxAlvo(alvo), k, undefined);
  await gravarRasc(alvo);
  desenharRascExames();
  atualizarBotaoRascExames();
}
async function descartarRascExames() {
  const sel = examesNoRascunho().filter(x => _rx.sel.has(x.k));
  if (!sel.length) return;
  const ok = await confirmar({ titulo: 'Descartar do rascunho?', perigo: true, botao: 'Descartar',
    texto: `${sel.length} exame(s) marcados voltam ao valor publicado: ${sel.slice(0, 8).map(x => `<b>${esc(x.e.mn)}</b>`).join(', ')}${sel.length > 8 ? '…' : ''}` });
  if (ok !== true) return;
  const alvos = new Set();
  sel.forEach(x => x.itens.forEach(i => { definirRasc(i.cx, x.k, undefined); alvos.add(i.alvo); }));
  await Promise.all([...alvos].map(a => gravarRasc(a)));
  toast(`${sel.length} exame(s) tirados do rascunho`);
  desenharRascExames();
  atualizarBotaoRascExames();
}

// Envia os exames marcados: uma proposta por tabela; publicar = aprova e publica na hora, sem outra confirmação
async function enviarRascExames(publicar) {
  const sel = examesNoRascunho().filter(x => _rx.sel.has(x.k));
  if (!sel.length) return toast('Marque ao menos um exame', 'erro');
  const por = {};
  sel.forEach(x => x.itens.forEach(i => { (por[i.alvo] ??= { cx: i.cx, itens: {}, ab: 0, dm: 0 }).itens[x.k] = { mn: x.e.mn, de: i.de ?? null, para: i.para ?? null };
    if (i.c?.status === 'r') por[i.alvo].ab++;
    if (acimaDescMax(i.desc, i.descMax, i.descTol)) por[i.alvo].dm++; }));
  const alvos = Object.keys(por), n = sel.reduce((s, x) => s + x.itens.length, 0);
  if (por.particular && !pode('exames', 'editar')) return toast('Seu grupo não pode alterar o preço praticado', 'erro');
  if (alvos.some(a => a !== 'particular') && !pode('tabelas', 'editar')) return toast('Seu grupo não pode alterar tabelas de preço', 'erro');
  if (publicar && !pode('tabelas', 'aprovar')) return toast('Seu grupo não pode publicar preços', 'erro');
  // publicar: UniLab dos divergentes ainda não marcados na janela
  const marc = publicar ? await perguntarUnilab(alvos.flatMap(a => Object.entries(por[a].itens).filter(([k]) => _envVs[`${a}|${k}`] !== true)
    .map(([k, it]) => ({ alvo: a, k, mn: it.mn, para: it.para })))) : new Set();
  if (!marc) return;
  const u = usuarioAtual(), just = valorCampo('rx-just').trim() || null, lote = DB.novaChave('propostas');   // um lote só por envio
  for (const a of alvos) {
    const { cx, itens } = por[a], id = DB.novaChave('propostas'), q = Object.keys(itens).length;
    Object.keys(itens).forEach(k => { itens[k].sistemaOk = sistemaSuportado(cx) && (_envVs[`${a}|${k}`] === true || marc.has(`${a}|${k}`)) || null; });
    const p = { alvo: a, alvoNome: cx.nome, itens, n: q, justificativa: just, autor: u.nome, autorId: u.id, em: Date.now(), status: 'pendente', origem: 'ficha', lote };
    await DB.gravar(`propostas/${id}`, { ...p, em: DB.agora() });
    if (publicar) await aplicarProposta(id, p);
    else registrar('tabelas', `${cx.nome}: proposta com ${q} preço(s) enviada (rascunho de exames)`, { proposta: id });
    // enviado: sai do rascunho
    Object.keys(itens).forEach(k => definirRasc(cx, k, undefined));
    await gravarRasc(a);
  }
  _rx = null; _envVs = {}; _ppArred = '0';
  fecharGaveta();
  toast(publicar ? `${n} preço(s) publicados` : `${alvos.length} proposta(s) enviadas: ${n} preço(s) aguardando aprovação`);
  if (document.getElementById('ex-rasc')) atualizarBotaoRascExames();
}
