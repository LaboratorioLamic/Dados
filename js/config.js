// Configuração do Firebase (projeto "applamic").
// Estes valores são públicos por natureza: a proteção dos dados está nas regras
// do Realtime Database (firebase/database.rules.json), não no apiKey.
window.LAMIC_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyD38STN_vG08tlYJBXFtRUWtlcyRexw7Mc',
    authDomain: 'applamic.firebaseapp.com',
    databaseURL: 'https://applamic-default-rtdb.firebaseio.com',
    projectId: 'applamic',
    storageBucket: 'applamic.firebasestorage.app',
    messagingSenderId: '1038898074287',
    appId: '1:1038898074287:web:ec9fa6ce997d415e48fa5a',
  },
  // Domínio interno usado só para montar a conta no Firebase Auth (login → login.N@dominio).
  // Não é um e-mail real e nenhum e-mail é enviado.
  dominioInterno: 'dados-lamic.app',
  // Apps Script que grava anexos dos avisos no Google Drive (mesmo modelo de modulos/respIamic).
  driveEndpoint: 'https://script.google.com/macros/s/AKfycbxXwMuVBeWw_sByJjjHvzkc_OyEPSO7gxXYYDJYqDi5YPo9MXks1dXsQkXBPzxSQ1c/exec',
};
