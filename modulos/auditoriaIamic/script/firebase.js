// === FIREBASE HELPERS ===
    // --- CONFIGURAÇÃO FIREBASE ---
    // Firebase já inicializado no módulo acima
    // Função auxiliar para garantir que Firebase está carregado
    function getFirebaseDatabase() {
        if (!window.firebaseDatabase) {
            throw new Error('Firebase ainda não foi carregado. Aguarde alguns instantes e tente novamente.');
        }
        return window.firebaseDatabase;
    }

    function getFirebaseRef() {
        if (!window.firebaseRef) {
            throw new Error('Firebase ainda não foi carregado. Aguarde alguns instantes e tente novamente.');
        }
        return window.firebaseRef;
    }

    function getFirebaseGet() {
        if (!window.firebaseGet) {
            throw new Error('Firebase ainda não foi carregado. Aguarde alguns instantes e tente novamente.');
        }
        return window.firebaseGet;
    }

    function getFirebaseSet() {
        if (!window.firebaseSet) {
            throw new Error('Firebase ainda não foi carregado. Aguarde alguns instantes e tente novamente.');
        }
        return window.firebaseSet;
    }

    function getFirebaseUpdate() {
        if (!window.firebaseUpdate) {
            throw new Error('Firebase ainda não foi carregado. Aguarde alguns instantes e tente novamente.');
        }
        return window.firebaseUpdate;
    }

    function getFirebaseRunTransaction() {
        if (!window.firebaseRunTransaction) {
            throw new Error('Firebase ainda não foi carregado. Aguarde alguns instantes e tente novamente.');
        }
        return window.firebaseRunTransaction;
    }

    function getFirebaseOnValue() {
        if (!window.firebaseOnValue) {
            throw new Error('Firebase ainda não foi carregado. Aguarde alguns instantes e tente novamente.');
        }
        return window.firebaseOnValue;
    }

    function getFirebaseOff() {
        if (!window.firebaseOff) {
            throw new Error('Firebase ainda não foi carregado. Aguarde alguns instantes e tente novamente.');
        }
        return window.firebaseOff;
    }
