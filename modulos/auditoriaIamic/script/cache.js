// === PREFERÊNCIAS DE USUÁRIO (Firebase Realtime Database) ===

    // Cache em memória das preferências do usuário atual
    var _userPrefsCache = {};
    var _filterSaveTimer = null;

    function _getUserPrefsPath() {
        const username = currentuser && (currentuser.user || currentuser.name);
        return username ? 'userPreferences/' + username : null;
    }

    async function loadUserPrefsFromFirebase() {
        const path = _getUserPrefsPath();
        if (!path) return;
        try {
            const database = getFirebaseDatabase();
            const dbRef = getFirebaseRef();
            const dbGet = getFirebaseGet();
            const snapshot = await dbGet(dbRef(database, path));
            _userPrefsCache = snapshot.exists() ? snapshot.val() : {};
        } catch (error) {
            console.error('Erro ao carregar preferências do usuário:', error);
            _userPrefsCache = {};
        }
    }

    async function _persistUserPrefs() {
        const path = _getUserPrefsPath();
        if (!path) return;
        try {
            const database = getFirebaseDatabase();
            const dbRef = getFirebaseRef();
            const { set } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
            await set(dbRef(database, path), _userPrefsCache);
        } catch (error) {
            console.error('Erro ao salvar preferências do usuário:', error);
        }
    }

    // ===== SISTEMA DE PERSISTÊNCIA DE FILTROS (Firebase) =====

    function saveFiltersToFirebase() {
        try {
            const filters = {
                // Dashboard
                fDashArea: document.getElementById('fDashArea')?.value || '',
                fDashSetor: document.getElementById('fDashSetor')?.value || '',
                fDashCat: document.getElementById('fDashCat')?.value || '',
                fDashSub: document.getElementById('fDashSub')?.value || '',
                fDashStatus: document.getElementById('fDashStatus')?.value || '',
                fDashResponsavel: document.getElementById('fDashResponsavel')?.value || '',
                fDashRevisor: document.getElementById('fDashRevisor')?.value || '',
                fDashDateType: document.getElementById('fDashDateType')?.value || 'all',
                fDashMonth: document.getElementById('fDashMonth')?.value || currentMonth,
                fDashYearForMonth: document.getElementById('fDashYearForMonth')?.value || currentYear,
                fDashYearOnly: document.getElementById('fDashYearOnly')?.value || currentYear,
                fDashDataIni: document.getElementById('fDashDataIni')?.value || '',
                fDashDataFim: document.getElementById('fDashDataFim')?.value || '',

                // Auditoria
                fAuditSetor: document.getElementById('fAuditSetor')?.value || '',
                fAuditCat: document.getElementById('fAuditCat')?.value || '',
                fAuditSub: document.getElementById('fAuditSub')?.value || '',
                fAuditStatus: document.getElementById('fAuditStatus')?.value || '',
                fAuditResponsavel: document.getElementById('fAuditResponsavel')?.value || '',
                fAuditRevisor: document.getElementById('fAuditRevisor')?.value || '',
                fAuditMarcador: document.getElementById('fAuditMarcador')?.value || '',
                fAuditDateType: document.getElementById('fAuditDateType')?.value || 'all',
                fAuditMonth: document.getElementById('fAuditMonth')?.value || currentMonth,
                fAuditYearForMonth: document.getElementById('fAuditYearForMonth')?.value || currentYear,
                fAuditYearOnly: document.getElementById('fAuditYearOnly')?.value || currentYear,
                fAuditDataIni: document.getElementById('fAuditDataIni')?.value || '',
                fAuditDataFim: document.getElementById('fAuditDataFim')?.value || '',

                // Atividades
                fAtivSetor: document.getElementById('fAtivSetor')?.value || '',
                fAtivCat: document.getElementById('fAtivCat')?.value || '',
                fAtivSub: document.getElementById('fAtivSub')?.value || '',
                fAtivStatus: document.getElementById('fAtivStatus')?.value || '',
                fAtivResponsavel: document.getElementById('fAtivResponsavel')?.value || '',
                fAtivRevisor: document.getElementById('fAtivRevisor')?.value || '',
                fAtivMarcador: document.getElementById('fAtivMarcador')?.value || '',
                fAtivDateType: document.getElementById('fAtivDateType')?.value || 'all',
                fAtivMonth: document.getElementById('fAtivMonth')?.value || currentMonth,
                fAtivYearForMonth: document.getElementById('fAtivYearForMonth')?.value || currentYear,
                fAtivYearOnly: document.getElementById('fAtivYearOnly')?.value || currentYear,
                fAtivDataIni: document.getElementById('fAtivDataIni')?.value || '',
                fAtivDataFim: document.getElementById('fAtivDataFim')?.value || '',

                // Manutenção
                fMantSetor: document.getElementById('fMantSetor')?.value || '',
                fMantCat: document.getElementById('fMantCat')?.value || '',
                fMantItem: document.getElementById('fMantItem')?.value || '',
                fMantTipo: document.getElementById('fMantTipo')?.value || '',
                fMantStatus: document.getElementById('fMantStatus')?.value || '',
                fMantResponsavel: document.getElementById('fMantResponsavel')?.value || '',
                fMantRevisor: document.getElementById('fMantRevisor')?.value || '',
                fMantMarcador: document.getElementById('fMantMarcador')?.value || '',
                fMantDateType: document.getElementById('fMantDateType')?.value || 'all',
                fMantMonth: document.getElementById('fMantMonth')?.value || currentMonth,
                fMantYearForMonth: document.getElementById('fMantYearForMonth')?.value || currentYear,
                fMantYearOnly: document.getElementById('fMantYearOnly')?.value || currentYear,
                fMantDataIni: document.getElementById('fMantDataIni')?.value || '',
                fMantDataFim: document.getElementById('fMantDataFim')?.value || '',

                // Documentos
                fDocSetor: document.getElementById('fDocSetor')?.value || '',
                fDocCat: document.getElementById('fDocCat')?.value || '',
                fDocSub: document.getElementById('fDocSub')?.value || '',
                fDocStatus: document.getElementById('fDocStatus')?.value || '',
                fDocResponsavel: document.getElementById('fDocResponsavel')?.value || '',
                fDocRevisor: document.getElementById('fDocRevisor')?.value || '',
                fDocMarcador: document.getElementById('fDocMarcador')?.value || '',
                fDocDateType: document.getElementById('fDocDateType')?.value || 'all',
                fDocMonth: document.getElementById('fDocMonth')?.value || currentMonth,
                fDocYearForMonth: document.getElementById('fDocYearForMonth')?.value || currentYear,
                fDocYearOnly: document.getElementById('fDocYearOnly')?.value || currentYear,
                fDocDataIni: document.getElementById('fDocDataIni')?.value || '',
                fDocDataFim: document.getElementById('fDocDataFim')?.value || ''
            };

            _userPrefsCache.filters = filters;

            // Debounce: salva no Firebase após 1s de inatividade
            clearTimeout(_filterSaveTimer);
            _filterSaveTimer = setTimeout(_persistUserPrefs, 1000);
        } catch (error) {
            console.error('Erro ao salvar filtros:', error);
        }
    }

    function restoreFiltersFromFirebase() {
        try {
            const filters = _userPrefsCache && _userPrefsCache.filters;
            if (!filters) return;

            Object.keys(filters).forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    try { el.value = filters[id]; } catch (_) {}
                }
            });
        } catch (error) {
            console.error('Erro ao restaurar filtros:', error);
        }
    }

    // ===== FIM SISTEMA DE PERSISTÊNCIA DE FILTROS =====
