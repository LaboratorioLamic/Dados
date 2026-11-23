// ═══════════════════════════════════════════════════════════════
// nav.js — Navegação, menu lateral, permissões e modo noturno
// ═══════════════════════════════════════════════════════════════

// modulo: módulo de permissão exigido para ver a tela
const TELAS = {
  inicio:     { titulo: 'Início',              secao: 'Principal', modulo: null,         render: () => renderInicio() },
  exames:     { titulo: 'Exames',              secao: 'Principal', modulo: 'exames',     render: () => renderExames() },
  custos:     { titulo: 'Custos',              secao: 'Principal', modulo: 'custos',     render: () => renderCustos() },
  tabelas:    { titulo: 'Tabelas de Preço',    secao: 'Principal', modulo: 'tabelas',    render: () => renderTabelas() },
  simulador:  { titulo: 'Simulador',           secao: 'Principal', modulo: 'simulador',  render: () => renderSimulador() },
  pendencias: { titulo: 'Pendências',          secao: 'Principal', modulo: 'pendencias', render: () => renderPendencias() },
  instrucoes: { titulo: 'Instruções',          secao: 'Principal', modulo: 'instrucoes', render: () => renderInstrucoes() },
  importar:   { titulo: 'Importar / Exportar', secao: 'Sistema',   modulo: 'importar',   render: () => renderImportar() },
  config:     { titulo: 'Configurações',       secao: 'Sistema',   modulo: null,         render: () => renderConfig() }
};

const FASES = {
  2: 'Cadastro de exames, cálculo de custo e margem, ficha do exame, pendências e migração da planilha.',
  5: 'Importação/exportação no formato do sistema, simulador de reajuste e painel completo.'
};

let telaAtual = 'inicio';

const podeVerTela = t => {
  if (t === 'config') return pode('usuarios') || pode('params');
  const m = TELAS[t].modulo;
  return !m || pode(m);
};

function irPara(t) {
  if (!TELAS[t] || !podeVerTela(t)) t = 'inicio';
  telaAtual = t;
  fecharPop();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.s === t));
  document.querySelectorAll('.screen').forEach(x => x.classList.toggle('active', x.id === 's-' + t));
  document.getElementById('tb-title').textContent = TELAS[t].titulo;
  document.getElementById('tb-crumb').textContent = `${TELAS[t].secao} / ${TELAS[t].titulo}`;
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-fundo').classList.remove('open');
  try { sessionStorage.setItem('prec-tela', t); } catch (e) {}
  renderTela();
  window.scrollTo(0, 0);
}

function renderTela() {
  const tela = TELAS[telaAtual];
  if (tela.render) tela.render();
  else document.getElementById('s-' + telaAtual).innerHTML = telaEmConstrucao(telaAtual);
}

function telaEmConstrucao(t) {
  const tela = TELAS[t];
  return `<div class="h-row"><div><h2>${tela.titulo}</h2><p>Disponível na fase ${tela.fase} do desenvolvimento</p></div></div>
    <div class="card">${vazio('fa-person-digging', `<b>Em construção · Fase ${tela.fase}</b><br>${FASES[tela.fase]}`)}</div>`;
}

// Esconde itens do menu sem permissão e atualiza o rodapé do usuário
function aplicarPermissoes() {
  document.querySelectorAll('#nav a').forEach(a => { a.style.display = podeVerTela(a.dataset.s) ? '' : 'none'; });
  document.querySelectorAll('#nav .nav-sec').forEach(sec => {
    let el = sec.nextElementSibling, algum = false;
    while (el && !el.classList.contains('nav-sec')) { if (el.style.display !== 'none') algum = true; el = el.nextElementSibling; }
    sec.style.display = algum ? '' : 'none';
  });
  const u = usuarioAtual();
  if (!u) return;
  atualizarBadgePendencias();
  atualizarBadgePropostas();
  atualizarSino();
  atualizarTutorialBtn();
  const g = ESTADO.grupos[u.grupoId];
  document.getElementById('user-box').innerHTML = `<div class="avatar" style="background:${corAvatar(u.id)}">${esc(iniciais(u.nome))}</div>
    <div class="user-txt"><div class="user-n">${esc(u.nome)}</div><div class="user-g">${esc(u.cargo || (g ? g.nome : 'Sem grupo'))}</div></div>
    <i class="fa-solid fa-ellipsis-vertical user-more"></i>`;
}

function abrirMenu() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-fundo').classList.add('open');
}
function fecharMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-fundo').classList.remove('open');
}

// ── Modo noturno ──────────────────────────────────────────────
function aplicarTema(escuro) {
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
  document.getElementById('sw-dark')?.classList.toggle('on', escuro);
  try { localStorage.setItem('prec-tema', escuro ? 'dark' : 'light'); } catch (e) {}
}
function alternarTema() { aplicarTema(document.documentElement.dataset.theme !== 'dark'); }
function temaInicial() {
  let t = null;
  try { t = localStorage.getItem('prec-tema'); } catch (e) {}
  aplicarTema(t === 'dark');   // claro por padrão; lembra a escolha do usuário
}
