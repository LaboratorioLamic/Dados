// ═══════════════════════════════════════════════════════════════
// simulacao.js — Modo simulação (sandbox) dos tutoriais — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════
//
// Com a simulação ligada nenhuma gravação chega ao Firebase: DB.gravar,
// DB.mesclar e DB.remover só registram a operação num log em memória e a
// aplicam no ESTADO local (a tela reage como se tivesse gravado). Leituras
// e escutas recebem o valor real com o log reaplicado por cima.
// Ao encerrar, o localStorage volta ao que era antes e a página recarrega:
// nada do treinamento sobra em memória.

const SIM = { ativo: false, log: [] };
const SIM_FLAG = 'prec-sim', SIM_LS = 'prec-sim-ls', SIM_MSG = 'prec-sim-msg';
// Chaves do localStorage que a simulação não restaura (sessão, tema e tutoriais concluídos)
const simPreserva = k => k === 'prec-sessao-v1' || k === 'prec-tema' || k.startsWith('tutFeito:');

// ── Árvore: ler e trocar um subcaminho sem alterar o objeto original ──
const partesCaminho = c => String(c || '').split('/').filter(Boolean);
function simLerEm(raiz, partes) {
  let v = raiz;
  for (const p of partes) { if (v == null || typeof v !== 'object') return null; v = v[p]; }
  return v ?? null;
}
// Copia cada nível do caminho (cópia rasa): quem guardou o objeto antigo não vê a troca
function simTrocarEm(raiz, partes, valor) {
  if (!partes.length) return valor ?? null;
  const obj = raiz && typeof raiz === 'object' ? { ...raiz } : {};
  const [p, ...resto] = partes, v = simTrocarEm(obj[p], resto, valor);
  if (v == null) delete obj[p]; else obj[p] = v;
  return Object.keys(obj).length ? obj : null;      // nó vazio some, como no Firebase
}
// Cópia do valor gravado; DB.agora() (ServerValue.TIMESTAMP) vira a hora local
function simValor(v) {
  if (v == null || typeof v !== 'object') return v ?? null;
  if (v['.sv'] === 'timestamp') return Date.now();
  if (Array.isArray(v)) return v.map(simValor);
  const o = {};
  Object.entries(v).forEach(([k, x]) => { const y = simValor(x); if (y != null) o[k] = y; });
  return Object.keys(o).length ? o : null;
}

// Aplica uma operação { caminho, valor } sobre o valor que está em `base`
function simAplicar(base, valorBase, op) {
  const b = partesCaminho(base), o = partesCaminho(op.caminho);
  const prefixo = (a, c) => a.length <= c.length && a.every((p, i) => p === c[i]);
  if (prefixo(b, o)) return simTrocarEm(valorBase, o.slice(b.length), op.valor);   // gravou dentro (ou no próprio) caminho
  if (prefixo(o, b)) return simLerEm(op.valor, b.slice(o.length));                  // gravou num caminho acima
  return valorBase;
}
const simSobrepor = (caminho, valor) => SIM.log.reduce((v, op) => simAplicar(caminho, v, op), valor ?? null);

// Mesmo formato que sincronizarEstado guarda em ESTADO
const simNormalizar = (chave, v) => chave === 'permitirCadastro' ? v !== false : chave === 'parametros' ? v : v || {};
const simCaminhosEstado = () => ({ ...CAMINHOS, catalogo: 'catalogo' });

// Registra e aplica no ESTADO; avisa as telas como o listener do Firebase faria
function simRegistrar(ops) {
  ops.forEach(op => SIM.log.push(op));
  const mudou = new Set();
  Object.entries(simCaminhosEstado()).forEach(([chave, caminho]) => {
    if (chave === 'catalogo' && ESTADO.catalogo == null) return;   // ainda não carregado: a escuta já recebe o log
    let v = ESTADO[chave], tocou = false;
    ops.forEach(op => { const n = simAplicar(caminho, v, op); if (n !== v) { v = n; tocou = true; } });
    if (tocou) { ESTADO[chave] = simNormalizar(chave, v); mudou.add(chave); }
  });
  console.info('[SIM] gravação simulada (nada enviado ao banco):', ops.map(o => o.caminho).join(', '));
  if (mudou.size) setTimeout(() => mudou.forEach(ch => _ouvintes.forEach(fn => fn(ch))), 0);
  return Promise.resolve();
}

// ── Intercepta o acesso ao banco ──────────────────────────────
(function () {
  const real = { gravar: DB.gravar, mesclar: DB.mesclar, remover: DB.remover, ler: DB.ler, ouvir: DB.ouvir };
  DB.gravar = (caminho, valor) => SIM.ativo ? simRegistrar([{ caminho, valor: simValor(valor) }]) : real.gravar(caminho, valor);
  // update do Firebase: cada chave (pode ter "/") grava o seu próprio subcaminho
  DB.mesclar = (caminho, valor) => SIM.ativo
    ? simRegistrar(Object.entries(valor || {}).map(([k, v]) => ({ caminho: `${caminho}/${k}`, valor: simValor(v) })))
    : real.mesclar(caminho, valor);
  DB.remover = caminho => SIM.ativo ? simRegistrar([{ caminho, valor: null }]) : real.remover(caminho);
  DB.ler = async caminho => { const v = await real.ler(caminho); return SIM.ativo ? simSobrepor(caminho, v) : v; };
  DB.ouvir = (caminho, cb) => real.ouvir(caminho, v => cb(SIM.ativo ? simSobrepor(caminho, v) : v));
})();

// ── Ligar e desligar ──────────────────────────────────────────
function iniciarSimulacao() {
  if (SIM.ativo) return;
  const copia = {};
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!simPreserva(k)) copia[k] = localStorage.getItem(k); }
    sessionStorage.setItem(SIM_LS, JSON.stringify(copia));
    sessionStorage.setItem(SIM_FLAG, '1');
  } catch (e) {}
  SIM.ativo = true;
  SIM.log = [];
  document.documentElement.classList.add('sim-on');
  desenharFaixaSimulacao();
  console.info('[SIM] modo simulação ligado');
}

// Devolve o localStorage ao estado de antes da simulação
function restaurarLocalSimulacao() {
  try {
    const copia = JSON.parse(sessionStorage.getItem(SIM_LS) || 'null');
    if (copia) {
      const atuais = [];
      for (let i = 0; i < localStorage.length; i++) atuais.push(localStorage.key(i));
      atuais.filter(k => !simPreserva(k)).forEach(k => localStorage.removeItem(k));
      Object.entries(copia).forEach(([k, v]) => localStorage.setItem(k, v));
    }
    sessionStorage.removeItem(SIM_LS);
    sessionStorage.removeItem(SIM_FLAG);
  } catch (e) {}
}

// sair: também encerra a sessão do usuário
function encerrarSimulacao({ msg = 'Treinamento encerrado. Nenhum dado do sistema foi alterado.', sair = false } = {}) {
  restaurarLocalSimulacao();
  SIM.ativo = false;
  try { sessionStorage.setItem(SIM_MSG, msg); } catch (e) {}
  document.documentElement.classList.add('sim-saindo');
  // sair: a sessão é a do Dados LAMIC; sem signOut o reload entraria de novo
  if (sair) { encerrarSessao(); return firebase.auth().signOut().catch(() => {}).then(() => { location.href = 'https://laboratoriolamic.github.io/Dados/'; }); }
  location.reload();
}

async function confirmarFimSimulacao() {
  const ok = await confirmar({ titulo: 'Encerrar o treinamento?', icone: 'fa-flask', tom: 'pausa', botao: 'Encerrar',
    texto: 'Tudo o que foi feito na simulação será descartado. Os dados reais continuam como estavam.' });
  if (ok) encerrarSimulacao();
}

// Faixa fixa no topo enquanto a simulação está ligada
function desenharFaixaSimulacao() {
  let el = document.getElementById('sim-faixa');
  if (!SIM.ativo) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'sim-faixa'; el.className = 'sim-faixa'; document.body.appendChild(el); }
  el.innerHTML = `<span class="sim-faixa-ic"><i class="fa-solid fa-flask"></i></span>
    <span class="sim-faixa-t"><b>Modo simulação</b><span>Treinamento: nada do que você fizer é gravado no sistema</span></span>
    <button onclick="confirmarFimSimulacao()"><i class="fa-solid fa-power-off"></i><span>Encerrar treinamento</span></button>`;
}

// Segurança: na simulação nenhum arquivo (planilha, CSV…) entra no sistema.
// Bloqueia abrir o seletor de arquivo (input ou label dele), soltar arquivo e o change do input.
(function () {
  const ehArquivo = el => {
    if (!el?.closest) return false;
    const inp = el.closest('input[type=file]');
    if (inp) return true;
    const lb = el.closest('label');
    return !!lb && (!!lb.querySelector('input[type=file]') || document.getElementById(lb.htmlFor)?.type === 'file');
  };
  const bloquear = e => {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.target?.type === 'file') e.target.value = '';
    toast('Importação de arquivos bloqueada no modo simulação', 'aviso');
  };
  document.addEventListener('click', e => { if (SIM.ativo && ehArquivo(e.target)) bloquear(e); }, true);
  document.addEventListener('change', e => { if (SIM.ativo && e.target?.type === 'file') bloquear(e); }, true);
  ['dragover', 'drop'].forEach(ev => document.addEventListener(ev, e => {
    if (!SIM.ativo || ![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (ev === 'drop') toast('Importação de arquivos bloqueada no modo simulação', 'aviso');
  }, true));
})();

// Página recarregada no meio da simulação: devolve o localStorage e avisa
(function () {
  try {
    if (sessionStorage.getItem(SIM_FLAG)) {
      restaurarLocalSimulacao();
      sessionStorage.setItem(SIM_MSG, 'A simulação foi interrompida pela recarga da página. Nenhum dado do sistema foi alterado.');
    }
  } catch (e) {}
})();

// Mensagem de fim de simulação, mostrada depois do login automático
function avisoFimSimulacao() {
  let msg = null;
  try { msg = sessionStorage.getItem(SIM_MSG); sessionStorage.removeItem(SIM_MSG); } catch (e) {}
  if (msg) setTimeout(() => toast(msg), 300);
}
