// Configuração e inicialização do Firebase
// Banco unificado: a Agenda vive no projeto do Dados LAMIC (applamic), dentro do nó /agenda.
// O login é o do Dados LAMIC (mesma origem laboratoriolamic.github.io): o Firebase Auth guarda a
// sessão no IndexedDB do domínio, então quem entrou no Dados já chega logado aqui.
const firebaseConfig = {
    apiKey: "AIzaSyD38STN_vG08tlYJBXFtRUWtlcyRexw7Mc",
    authDomain: "applamic.firebaseapp.com",
    databaseURL: "https://applamic-default-rtdb.firebaseio.com",
    projectId: "applamic",
    storageBucket: "applamic.firebasestorage.app",
    messagingSenderId: "1038898074287",
    appId: "1:1038898074287:web:ec9fa6ce997d415e48fa5a"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const rootDatabase = firebase.database();
const AGENDA_ROOT = 'agenda';
const DADOS_URL = 'https://laboratoriolamic.github.io/Dados/';

// O restante do código continua chamando database.ref('agendas/...'), 'users/...' etc.:
// todo caminho é resolvido dentro de /agenda. Dados do Dados LAMIC (uids, usuarios) usam rootDatabase.
const database = {
    ref(path) {
        const p = String(path || '').replace(/^\/+/, '');
        return rootDatabase.ref(p ? `${AGENDA_ROOT}/${p}` : AGENDA_ROOT);
    }
};
