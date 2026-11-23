// ═══════════════════════════════════════════════════════════════
// firebase.js — Firebase Realtime Database — COMERCIAL LAMIC
// Usa Firebase Compat (script clássico, sem ES modules)
// ═══════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: 'AIzaSyD38STN_vG08tlYJBXFtRUWtlcyRexw7Mc',
  authDomain: 'applamic.firebaseapp.com',
  databaseURL: 'https://applamic-default-rtdb.firebaseio.com',
  projectId: 'applamic',
  storageBucket: 'applamic.firebasestorage.app',
};

firebase.initializeApp(firebaseConfig);
const _db = firebase.database();

// ── Ambiente de teste (Firebase Emulator) ─────────────────────
// http://localhost:PORTA/index.html?emu=1 conecta ao emulador local
// (firebase emulators:start --only database). Ignorado fora de localhost.
window.DB_TESTE = false;
(function () {
  const host = location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  if (local && new URLSearchParams(location.search).get('emu') === '1') {
    _db.useEmulator(host, 9000);
    window.DB_TESTE = true;
  }
})();

// Banco unificado: o Comercial vive no projeto do Dados LAMIC (applamic), no nó /comercial.
// Todo caminho do sistema é relativo a esse nó ('/' = o próprio nó); '.info/...' fica na raiz.
const RAIZ_COMERCIAL = 'comercial';
const _r = caminho => {
  const c = String(caminho ?? '').replace(/^\/+/, '');
  return _db.ref(c.startsWith('.info') ? c : c ? `${RAIZ_COMERCIAL}/${c}` : RAIZ_COMERCIAL);
};

// Leitura de nós do Dados LAMIC (raiz do applamic): uids, usuarios.
const lerDados = async caminho => (await _db.ref(caminho).get()).val();
// Acesso individual ao Comercial (fora do nó /comercial): comercial_acesso/{login} = true
// No treinamento (modo simulação) não grava nada de verdade.
const gravarAcessoDados = (login, valor) => window.SIM?.ativo || (typeof SIM !== 'undefined' && SIM.ativo) ? Promise.resolve() : _db.ref(`comercial_acesso/${login}`).set(valor ? true : null);

const DB = {
  ref:    caminho => _r(caminho),
  ler:    async caminho => (await _r(caminho).get()).val(),
  gravar: (caminho, valor) => _r(caminho).set(valor),
  mesclar:(caminho, valor) => _r(caminho).update(valor),
  remover: caminho => _r(caminho).remove(),
  novaChave: caminho => _r(caminho).push().key,
  // Escuta contínua; devolve função para cancelar
  ouvir(caminho, cb) {
    const r = _r(caminho);
    const fn = s => cb(s.val());
    // sem permissão de leitura: segue com vazio em vez de travar a carga
    r.on('value', fn, err => { console.warn(`Sem acesso a ${caminho}:`, err?.message); cb(null); });
    return () => r.off('value', fn);
  },
  // Estado da conexão com o servidor
  conexao(cb) {
    _db.ref('.info/connected').on('value', s => cb(!!s.val()));
  },
  agora: () => firebase.database.ServerValue.TIMESTAMP
};
