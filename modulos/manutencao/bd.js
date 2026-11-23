// ═══════════════════════════════════════════════════════════════
// bd.js — Firebase Realtime Database — Manutenção LAMIC
// Usa Firebase Compat (script clássico, sem ES modules)
// ═══════════════════════════════════════════════════════════════

// Banco único do Dados LAMIC (applamic). Mesma origem do portal → mesma sessão do Firebase Auth.
const firebaseConfig = {
  apiKey: "AIzaSyD38STN_vG08tlYJBXFtRUWtlcyRexw7Mc",
  authDomain: "applamic.firebaseapp.com",
  databaseURL: "https://applamic-default-rtdb.firebaseio.com",
  projectId: "applamic",
  storageBucket: "applamic.firebasestorage.app",
};

firebase.initializeApp(firebaseConfig);
// rootDb: raiz do Dados LAMIC (uids, usuarios, grupos, modulos) — só leitura do perfil.
// _db: tudo da Manutenção fica dentro de "manutencao/". ".info/..." continua na raiz.
const MANUT_RAIZ = 'manutencao';
const rootDb = firebase.database();
const _db = {
  ref(path) {
    const p = String(path || '').replace(/^\/+/, '');
    if (p.startsWith('.info')) return rootDb.ref(p);
    return rootDb.ref(p ? `${MANUT_RAIZ}/${p}` : MANUT_RAIZ);
  },
  useEmulator: (h, porta) => rootDb.useEmulator(h, porta),
};
window.rootDb = rootDb;

// ── Ambiente de teste (Firebase Emulator) ─────────────────────
// Abrir http://localhost:PORTA/index.html?emu=1 conecta ao emulador local
// (firebase emulators:start --only database) em vez do banco de produção.
// Só funciona em localhost; em qualquer outro endereço o parâmetro é ignorado.
window._dbAmbienteTeste = false;
(function _dbConfigurarAmbiente() {
  try {
    const host = location.hostname;
    const local = host === 'localhost' || host === '127.0.0.1';
    if (!local || new URLSearchParams(location.search).get('emu') !== '1') return;
    _db.useEmulator(host, 9000);
    window._dbAmbienteTeste = true;
    const mostrarFaixa = () => {
      if (document.getElementById('db-faixa-teste')) return;
      const faixa = document.createElement('div');
      faixa.id = 'db-faixa-teste';
      faixa.textContent = 'AMBIENTE DE TESTE — Firebase Emulator (dados não são de produção)';
      faixa.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#e63946;color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center;letter-spacing:.04em;pointer-events:none;';
      document.body.appendChild(faixa);
    };
    if (document.body) mostrarFaixa(); else document.addEventListener('DOMContentLoaded', mostrarFaixa);
  } catch (err) {
    console.error('[bd.js] Falha ao configurar o ambiente de teste:', err);
  }
})();

// Diferença (ms) entre o relógio do servidor e o do computador.
// Usada para recusar lançamentos quando o relógio local está muito desajustado.
window._dbClockSkewMs = 0;
_db.ref('.info/serverTimeOffset').on('value', snap => { window._dbClockSkewMs = Number(snap.val()) || 0; });

// ── Detecção de conectividade ─────────────────────────────────

// Monitora o estado de conexão com o Firebase em tempo real.
// window._dbConnected: true = online, false = offline
window._dbConnected = false;
_db.ref('.info/connected').on('value', snap => {
  window._dbConnected = !!snap.val();
  if (typeof window._onDbConnectionChange === 'function') {
    window._onDbConnectionChange(window._dbConnected);
  }
});

// ── Helpers internos ──────────────────────────────────────────

function _hasContent(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    return Object.values(value).some(v =>
      Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined
    );
  }
  return true;
}

// ── API pública ───────────────────────────────────────────────

function _stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(_stripUndefined);
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = _stripUndefined(v);
    }
    return out;
  }
  return obj;
}

async function dbSave(path, data, guardEmpty = true) {
  if (guardEmpty && !_hasContent(data)) {
    console.warn(`[bd.js] dbSave("${path}"): dado vazio ignorado — banco protegido.`);
    return;
  }
  try {
    await _db.ref(path).set(_stripUndefined(data));
  } catch (err) {
    console.error(`[bd.js] dbSave("${path}") falhou:`, err);
  }
}

async function dbLoad(path) {
  try {
    const snap = await _db.ref(path).once('value');
    return snap.exists() ? snap.val() : null;
  } catch (err) {
    console.error(`[bd.js] dbLoad("${path}") falhou:`, err);
    return null;
  }
}

// Como dbLoad, mas lança exceção em caso de falha (distingue "vazio" de "erro").
async function dbGet(path) {
  const snap = await _db.ref(path).once('value');
  return snap.exists() ? snap.val() : null;
}

function dbListen(path, callback) {
  const r = _db.ref(path);
  r.on('value',
    snap => callback(snap.exists() ? snap.val() : null),
    err  => console.error(`[bd.js] dbListen("${path}") erro:`, err)
  );
  return () => r.off('value');
}

async function dbRemove(path) {
  try {
    await _db.ref(path).remove();
    return true;
  } catch (err) {
    console.error(`[bd.js] dbRemove("${path}") falhou:`, err);
    return false;
  }
}

// Atualização atômica (ex.: contadores sequenciais compartilhados entre usuários).
// Retorna o valor final gravado, ou null em caso de falha.
async function dbTransaction(path, updateFn) {
  try {
    const res = await _db.ref(path).transaction(updateFn);
    return res.committed ? res.snapshot.val() : null;
  } catch (err) {
    console.error(`[bd.js] dbTransaction("${path}") falhou:`, err);
    return null;
  }
}

// Escrita multi-caminho atômica: { 'a/b': valor, 'c/d': null, ... } grava tudo ou nada.
// Retorna true em caso de sucesso, false em caso de falha.
async function dbUpdate(updates) {
  try {
    await _db.ref().update(_stripUndefined(updates));
    return true;
  } catch (err) {
    console.error('[bd.js] dbUpdate falhou:', err);
    return false;
  }
}

// Leitura de um intervalo de filhos ordenados pela chave (sem índice no servidor).
// opts: { startAt, endAt, limitToLast, limitToFirst }. Retorna objeto (ou null).
async function dbQuery(path, opts = {}) {
  try {
    let q = _db.ref(path).orderByKey();
    if (opts.startAt !== undefined)     q = q.startAt(String(opts.startAt));
    if (opts.endAt !== undefined)       q = q.endAt(String(opts.endAt));
    if (opts.limitToFirst !== undefined) q = q.limitToFirst(opts.limitToFirst);
    if (opts.limitToLast !== undefined)  q = q.limitToLast(opts.limitToLast);
    const snap = await q.once('value');
    return snap.exists() ? snap.val() : null;
  } catch (err) {
    console.error(`[bd.js] dbQuery("${path}") falhou:`, err);
    return null;
  }
}

// Marcador de data/hora do servidor (preenchido pelo Firebase ao gravar).
function dbServerTs() { return firebase.database.ServerValue.TIMESTAMP; }

window.dbSave        = dbSave;
window.dbLoad        = dbLoad;
window.dbGet         = dbGet;
window.dbListen      = dbListen;
window.dbRemove      = dbRemove;
window.dbTransaction = dbTransaction;
window.dbUpdate      = dbUpdate;
window.dbQuery       = dbQuery;
window.dbServerTs    = dbServerTs;

// Sinaliza que o banco pode ser usado. Espera a sessão do Firebase Auth (Dados LAMIC) responder:
// as regras exigem login, e um listener aberto antes disso é negado e cancelado pelo Firebase
// para sempre (os dados não chegavam e nada era gravado).
firebase.auth().onAuthStateChanged(function _primeiraSessao() {
  if (window._dbReadyResolvido) return;
  window._dbReadyResolvido = true;
  if (typeof window._dbReadyResolve === 'function') window._dbReadyResolve();
});
