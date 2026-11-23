// ─── TAILWIND CONFIG (from index.html lines 14-18) ─────────────────────────
tailwind.config = {
    theme: { extend: { colors: { navy: { 700: '#1e3a8a', 800: '#172554', 900: '#0f172a' }, clinic: { 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' } } } }
}

// ─── FIREBASE CONFIG & INIT ─────────────────────────────────────────────────
// Banco unificado: o ImunoGest vive no projeto do Dados LAMIC (applamic), no nó /vacinas.
// Login: sessão do Dados LAMIC (mesma origem → mesma sessão do Firebase Auth).
// `db.ref(caminho)` é relativo a /vacinas (db.ref() = o próprio nó); `rootDb` lê o Dados (uids, usuarios, privado, grupos).
const _fbConfig = {
    apiKey: "AIzaSyD38STN_vG08tlYJBXFtRUWtlcyRexw7Mc",
    authDomain: "applamic.firebaseapp.com",
    projectId: "applamic",
    storageBucket: "applamic.firebasestorage.app",
    databaseURL: "https://applamic-default-rtdb.firebaseio.com"
};
firebase.initializeApp(_fbConfig);
const rootDb = firebase.database();
const RAIZ_VACINAS = 'vacinas';
const db = {
    ref: (caminho) => {
        const c = String(caminho ?? '').replace(/^\/+/, '');
        return rootDb.ref(c ? `${RAIZ_VACINAS}/${c}` : RAIZ_VACINAS);
    }
};

// ─── FIREBASE HELPERS (from index.html lines 2037-2052) ─────────────────────
function _fbToArr(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj.filter(x => x != null);
    return Object.values(obj).filter(x => x != null);
}
function _arrToFbObj(arr) {
    if (!arr || !arr.length) return {};
    const o = {};
    arr.forEach(item => { if (item != null && item.id != null) o[String(item.id)] = item; });
    return o;
}
function _normalizeSimpleArr(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val);
}
