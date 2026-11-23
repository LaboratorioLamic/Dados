// Inicialização única do Firebase, compartilhada entre o portal e o painel admin.
// Usa o SDK "compat" (script clássico) para que a página funcione tambem
// aberta direto do disco (file://), sem exigir um servidor local.
var UniAdmin = window.UniAdmin || {};

(function () {
    // Banco unificado: o UniLAMIC vive no projeto do Dados LAMIC (applamic), no nó /uniadmin.
    // A sessão é a do próprio Dados LAMIC (mesma origem laboratoriolamic.github.io): o Firebase Auth
    // guarda o login no IndexedDB do domínio, então quem entrou no Dados já chega logado aqui.
    var firebaseConfig = {
        apiKey: 'AIzaSyD38STN_vG08tlYJBXFtRUWtlcyRexw7Mc',
        authDomain: 'applamic.firebaseapp.com',
        databaseURL: 'https://applamic-default-rtdb.firebaseio.com',
        projectId: 'applamic',
        storageBucket: 'applamic.firebasestorage.app',
        messagingSenderId: '1038898074287',
        appId: '1:1038898074287:web:ec9fa6ce997d415e48fa5a'
    };

    firebase.initializeApp(firebaseConfig);

    UniAdmin.db = firebase.database();
    UniAdmin.auth = firebase.auth();
    UniAdmin.REST_BASE = firebaseConfig.databaseURL;
    UniAdmin.DADOS_URL = 'https://laboratoriolamic.github.io/Dados/';

    // Token atual para chamadas REST (sendBeacon, fetch de conteúdo): as regras exigem auth.
    UniAdmin.authToken = null;
    UniAdmin.auth.onIdTokenChanged(function (user) {
        if (!user) { UniAdmin.authToken = null; return; }
        user.getIdToken().then(function (t) { UniAdmin.authToken = t; }).catch(function () {});
    });
    // Sufixo de query para URLs REST: '' sem sessão, senão 'auth=<token>'.
    UniAdmin.restAuth = function () {
        return UniAdmin.authToken ? 'auth=' + encodeURIComponent(UniAdmin.authToken) : '';
    };

    UniAdmin.dbRoot = 'uniadmin';

    UniAdmin.categoryPaths = {
        'Treinamentos': 'treinamentos',
        'Educação Continuada': 'educacao_continuada',
        'Estágios': 'estagios'
    };

    // Nota mínima de aprovação. Estágios tem corte próprio (7); as demais
    // categorias usam 8. Aceita nome da categoria ou slug do banco, porque o
    // portal trabalha com o nome e os relatórios do admin, com o slug.
    UniAdmin.DEFAULT_PASSING_SCORE = 8;
    UniAdmin.PASSING_SCORE_BY_SLUG = { estagios: 7 };

    UniAdmin.getPassingScore = function (categoryOrSlug) {
        var slug = UniAdmin.categoryPaths[categoryOrSlug] || categoryOrSlug;
        var score = UniAdmin.PASSING_SCORE_BY_SLUG[slug];
        return typeof score === 'number' ? score : UniAdmin.DEFAULT_PASSING_SCORE;
    };

    UniAdmin.isApproved = function (score, categoryOrSlug) {
        return Number(score) >= UniAdmin.getPassingScore(categoryOrSlug);
    };

    // Categorias sem conta logada não têm cargo de sessão, então a restrição
    // de visibilidade por função (`roles` do assunto) não se aplica a elas: se
    // um assunto com `roles` acabar ali (por duplicação vinda de outra
    // categoria, por exemplo), ninguém consegue vê-lo no portal. O painel não
    // grava `roles` nessas categorias e o portal ignora o campo.
    UniAdmin.ROLE_FREE_SLUGS = ['estagios'];

    UniAdmin.categoryUsesRoles = function (categoryOrSlug) {
        var slug = UniAdmin.categoryPaths[categoryOrSlug] || categoryOrSlug;
        return UniAdmin.ROLE_FREE_SLUGS.indexOf(slug) === -1;
    };

    UniAdmin.getCategoryDbPath = function (category) {
        var slug = UniAdmin.categoryPaths[category] || category.toLowerCase().replace(/[^a-z0-9]+/gi, '_');
        return '/' + UniAdmin.dbRoot + '/' + slug;
    };

    // Helpers no formato do SDK modular, para o restante do codigo nao mudar.
    // Aceita ref(path) e tambem ref(db, path), a forma do SDK modular.
    UniAdmin.ref = function (a, b) {
        var path = (typeof a === 'string') ? a : b;
        return UniAdmin.db.ref(path);
    };
    UniAdmin.get = function (reference) { return reference.once('value'); };
    UniAdmin.set = function (reference, value) { return reference.set(value); };
    UniAdmin.remove = function (reference) { return reference.remove(); };
})();

window.UniAdmin = UniAdmin;
