// ═══════════════════════════════════════════════════════════════
// config.js — Tela Configurações (abas) — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

const ABAS_CONFIG = [
  { id: 'usuarios', nome: 'Usuários',            icone: 'fa-users',       modulo: 'usuarios', render: () => renderUsuarios() },
  { id: 'grupos',   nome: 'Grupos e permissões', icone: 'fa-user-shield', modulo: 'usuarios', render: () => renderGrupos() },
  { id: 'apoiados', nome: 'Apoiados (L2L)',      icone: 'fa-building-user', modulo: 'usuarios', render: () => renderApoiados() },
  { id: 'params',   nome: 'Parâmetros',          icone: 'fa-sliders',     modulo: 'params',   render: () => renderParametros() },
  { id: 'setores',  nome: 'Setores',             icone: 'fa-sitemap',     modulo: 'params',   render: () => renderSetores() }
];
let configAba = null;
SUBNAV_GANCHO.cfg = p => { configAba = p; renderConfig(); };

function renderConfig() {
  const abas = ABAS_CONFIG.filter(a => pode(a.modulo));
  if (!abas.find(a => a.id === configAba)) configAba = abas[0]?.id;
  document.getElementById('s-config').innerHTML = `
    <div class="h-row"><div><h2>Configurações</h2><p>Usuários, grupos, acessos dos laboratórios apoiados, parâmetros de cálculo e setores.</p></div></div>
    <div class="subnav" data-grupo="cfg">${abas.map(a => `<button data-p="${a.id}" class="${a.id === configAba ? 'on' : ''}"><i class="fa-solid ${a.icone}"></i>${a.nome}</button>`).join('')}</div>
    <div class="pane on" id="cfg-${configAba}"></div>`;
  iniciarSubnav();
  abas.find(a => a.id === configAba)?.render();
}
const painelConfig = () => document.getElementById(`cfg-${configAba}`);
