// --- LÓGICA DE LOGIN (USUÁRIO + SENHA VIA BIN DE USUÁRIOS) ---

// Normaliza permissão tripla: aceita bool legado ou string 'total'|'parcial'|'nao'
function _normTriPerm(val, defaultVal) {
    if (val === 'total' || val === 'parcial' || val === 'nao') return val;
    // Compatibilidade com bool legado
    if (val === true)  return 'total';
    if (val === false) return 'nao';
    return defaultVal || 'nao';
}

// Verifica permissão tripla para item específico
// Resolve user ID → name. Returns null if not found.
window.resolveUserId = function(id) {
    if (!id) return null;
    const u = (typeof users !== 'undefined' ? users : []).find(u => u.id === String(id));
    return u ? (u.name || u.user || '') : null;
};

// Valida permissão parcial/nao ao salvar: usuário deve estar em resp ou revisor.
// respArr e revArr são arrays já resolvidos (antes de JSON.stringify).
// Retorna true se pode salvar, false se deve bloquear (e já exibe toast).
function _checkPartialPermOnSave(isNew, respArr, revArr) {
    if (!currentuser || userIsAdmin()) return true;
    const perm = _normTriPerm(currentuser.canEditCards, 'total');
    if (perm === 'total') return true;
    if (perm === 'nao') {
        if (typeof showToast === 'function') showToast('Você não tem permissão para criar ou editar registros.', 'error');
        return false;
    }
    // parcial: deve estar como responsável ou revisor
    const meId   = String(currentuser.id || '').trim();
    const meName = String(currentuser.name || currentuser.user || '').trim().toLowerCase();
    const _hasMe = (arr) => (arr || []).some(v => {
        const vs = String(v).trim();
        return (meId && vs === meId) || vs.toLowerCase() === meName;
    });
    if (_hasMe(respArr) || _hasMe(revArr)) return true;
    if (typeof showToast === 'function') {
        showToast('Permissão insuficiente: você deve estar como Responsável ou Revisor para salvar este registro.', 'error');
    }
    return false;
}
window._checkPartialPermOnSave = _checkPartialPermOnSave;

// item=undefined → contexto sem card (ex: criar novo) → parcial libera
function _checkTriPerm(permVal, item) {
    if (permVal === 'total') return true;
    if (permVal === 'nao')   return false;
    if (!item) return true;
    const meId   = (currentuser && currentuser.id) || '';
    const meName = ((currentuser && (currentuser.name || currentuser.user)) || '').trim().toLowerCase();
    const _hasMe = (raw) => {
        if (!raw) return false;
        try {
            const arr = JSON.parse(String(raw));
            const vals = Array.isArray(arr) ? arr : [String(arr)];
            return vals.some(v => { const vs = String(v).trim(); return (meId && vs === meId) || vs.toLowerCase() === meName; });
        } catch { const vs = String(raw).trim(); return (meId && vs === meId) || vs.toLowerCase() === meName; }
    };
    return _hasMe(item?.responsavelTecnico || item?.responsavel) || _hasMe(item?.revisor);
}

// Normaliza um registro cru de /passwords (usado no load e no listener de usuários)
// e aplica as permissões herdadas do grupo, se o usuário estiver vinculado a um.
// Setores de quem não é admin. Setores (do RH): setor do RH + marcados à mão (setoresManuais,
// só se confirmados: setoresManuaisEm). Áreas: as do grupo (ou do cadastro, se sem grupo).
function _regraSetores(out) {
    if (!out || out.isAdmin) return out;
    const rh = typeof window._setorRhDe === 'function' ? window._setorRhDe(out) : '';
    out.setorRh = rh || '';
    const ehSetor = s => typeof window.setorEhRH === 'function' ? window.setorEhRH(s) : /^\s*\d{1,2}\s*[-–]/.test(s);
    const manuais = out.setoresManuaisEm && Array.isArray(out.setoresManuais) ? out.setoresManuais : [];
    const base = Array.isArray(out.allowedSetores) ? out.allowedSetores : [];
    out.allowedSetores = [...new Set([...manuais.filter(ehSetor), ...(rh ? [rh] : []), ...base.filter(s => !ehSetor(s))])];
    return out;
}
window._regraSetores = _regraSetores;

function _normalizeUser(u) {
    const normalizedUser = String(u.user || u.User || '').trim().toLowerCase();
    const out = {
        ...u,
        name: u.name || u.Name || u.user || '',
        user: u.user || u.User || '',
        password: String(u.password || ''),
        cpf: u.cpf || '',
        cargo: u.cargo || '',
        grupo: u.grupo || '',
        grupoId: u.grupoId || null,
        active: u.active !== false,
        canDeleteCards: _normTriPerm(u.canDeleteCards, 'nao'),
        canEditCards:   _normTriPerm(u.canEditCards,   'total'),
        canManageLists: !!u.canManageLists,
        canManagePubs:  _normTriPerm(u.canManagePubs,  'total'),
        canPublish: u.canPublish || 'total',
        canChecklist: u.canChecklist || 'total',
        rncCanEdit: _normTriPerm(u.rncCanEdit, 'total'),
        rncTaskView: u.rncTaskView || 'todos',
        canManageOc: u.canManageOc || 'total',
        canManageMotivos: u.canManageMotivos || 'total',
        canViewOc: u.canViewOc || 'total',
        canManageReu: _normTriPerm(u.canManageReu, 'parcial'),
        isAdmin: !!u.isAdmin || normalizedUser === 'admin'
    };
    if (typeof _applyGroupPerms === 'function') _applyGroupPerms(out);
    // Todos os setores só com "Todas as listas" (cadastro sem listasPermitidas segue o antigo)
    if (out.listasPermitidas !== undefined) out.canManageLists = typeof _listasDe === 'function' && _listasDe(out) === 'todas';
    _regraSetores(out);
    return out;
}

    document.getElementById('passwordInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkLogin();
    });
    document.getElementById('userInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkLogin();
    });

    async function loadusers() {
        try {
            const database = getFirebaseDatabase();
            const dbRef = getFirebaseRef();
            const dbGet = getFirebaseGet();
            
            // O seu JSON indica que tudo está no nó 'passwords' como uma lista.
            // Os grupos vêm junto: as permissões herdadas são aplicadas no mapeamento.
            const usersRef = dbRef(database, 'passwords');
            const [snapshot] = await Promise.all([dbGet(usersRef), loadUserGroups()]);

            let rawUsers = [];
            if (snapshot.exists()) {
                rawUsers = snapshot.val();
                if (!Array.isArray(rawUsers)) rawUsers = [];
            }

            // Mapeia os dados garantindo a consistência das flags
            users = rawUsers.map(_normalizeUser);
            
            // Garante que cada usuário tem um ID único persistente
            let _usersNeedSave = false;
            users.forEach(u => {
                if (!u.id) {
                    u.id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
                    _usersNeedSave = true;
                }
            });
            if (_usersNeedSave) await saveusers();

            // Inicializa os usuários no multi-select após carregar
            msRefreshUsers();
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            throw new Error('Erro ao carregar usuários: ' + error.message);
        }
    }

    async function saveusers() {
        try {
            const database = getFirebaseDatabase();
            const dbRef = getFirebaseRef();
            const dbSet = getFirebaseSet();
            
            // Salva a lista completa de volta no nó 'passwords'
            const usersRef = dbRef(database, 'passwords');
            await dbSet(usersRef, users);
        } catch (error) {
            console.error('Erro ao salvar usuários:', error);
            throw new Error('Erro ao salvar usuários: ' + error.message);
        }
    }
    function updateCurrentuserUI() {
        const box = document.getElementById('currentuserBox');
        const label = document.getElementById('currentuserLabel');
        if (currentuser) {
            label.textContent = currentuser.name || currentuser.user || '-';
            box.style.display = 'flex';
            // Se o filtro "Minhas Tarefas" estiver ativo, aplica filtro por responsável automaticamente
            if (typeof fbarMyTasksActive !== 'undefined' && fbarMyTasksActive && currentuser && currentuser.name) {
                try {
                    if (typeof setMyTasksMode === 'function') setMyTasksMode('responsavel');
                    else {
                        fbarRespFilter = currentuser.name;
                        if (typeof _updatePeopleBtnUI === 'function') _updatePeopleBtnUI('responsavel');
                        if (typeof _syncHiddenSelects === 'function') _syncHiddenSelects();
                        if (typeof renderCards === 'function') renderCards();
                    }
                } catch (e) {
                    console.warn('fbar: não foi possível aplicar filtro automático de Minhas Tarefas', e);
                }
            }
        } else {
            box.style.display = 'none';
        }
        applyListManagerPermissions();
        applyTaskViewPermission();
    }

    function applyListManagerPermissions() {
        document.querySelectorAll('button[onclick*="openListManager"]').forEach(btn => {
            const k = ((btn.getAttribute('onclick') || '').match(/openListManager\(\?'(\w+)/) || [])[1];
            btn.style.display = userCanManageLists(k) ? 'block' : 'none';
        });
        if (typeof applyRncManagePermission === 'function') applyRncManagePermission();
    }

    function applyOcorrenciasPermissions() {
        if (!currentuser) return;
        const isAdmin = userIsAdmin();
        const canTipos = isAdmin || userCanManageLists('tipos');
        const canAreas = isAdmin || userCanManageLists('areas');
        const canManageOc = isAdmin ? 'total' : (currentuser.canManageOc || 'total');
        const canManageMotivos = isAdmin ? 'total' : (currentuser.canManageMotivos || 'total');

        // Gate tipo manage button (ocTypeManageBtn) by canManageLists
        const tipoBtn = document.getElementById('ocTypeManageBtn');
        if (tipoBtn) tipoBtn.style.display = canTipos ? '' : 'none';

        // Gate setor + button in edit form by canManageLists
        // The setor field-plus button: onclick="ocOpenManager('setores')"
        document.querySelectorAll('.oc-field-plus[onclick*="setores"]').forEach(b => {
            b.style.display = canAreas ? '' : 'none';
        });

        // Gate category + and motivo + buttons by canManageMotivos
        document.querySelectorAll('.oc-field-plus[onclick*="categorias"]').forEach(b => {
            b.style.display = (canManageMotivos === 'total') ? '' : 'none';
        });
        document.querySelectorAll('.oc-field-plus[onclick*="motivos"]').forEach(b => {
            b.style.display = (canManageMotivos === 'nao') ? 'none' : '';
        });

        // Gate XLSX button by canManageOc === 'total'
        const xlsxBtn = document.getElementById('ocXlsxBtn');
        if (xlsxBtn) xlsxBtn.style.display = (canManageOc === 'total') ? '' : 'none';

        // Gate "apagar todos" button — visível apenas para administradores
        const deleteAllBtn = document.getElementById('ocDeleteAllBtn');
        if (deleteAllBtn) deleteAllBtn.style.display = isAdmin ? '' : 'none';

        // Expose to ocorrencias.js for row-level restrictions
        window._ocUserPerm = canManageOc;
    }
    window.applyOcorrenciasPermissions = applyOcorrenciasPermissions;

    function applyTaskViewPermission() {
        const restrictToSelf = currentuser && !userIsAdmin() && currentuser.taskView === 'usuario';
        const display = restrictToSelf ? 'none' : '';
        const b1 = document.getElementById('btnViewAllTabs');
        const b2 = document.getElementById('btnViewAllDash');
        if (b1) b1.style.display = display;
        if (b2) b2.style.display = display;
        // Se o usuário estava em modo 'all' mas agora é restrito, forçar para responsável
        if (restrictToSelf && typeof fbarMyTasksMode !== 'undefined' && fbarMyTasksMode === 'all') {
            if (typeof setMyTasksMode === 'function') setMyTasksMode('responsavel');
            if (typeof setMyTasksModeDash === 'function') setMyTasksModeDash('responsavel');
        }
    }
    window.applyTaskViewPermission = applyTaskViewPermission;

    function userIsAdmin() {
        if (!currentuser) return false;
        const normalizedUser = String(currentuser.user || '').trim().toLowerCase();
        return normalizedUser === 'admin' || currentuser.isAdmin === true;
    }

    function userCanDeleteCards(item) {
        if (!currentuser) return false;
        if (userIsAdmin()) return true;
        const perm = _normTriPerm(currentuser.canDeleteCards, 'nao');
        if (perm === 'total') return true;
        if (perm === 'nao')   return false;
        // parcial: só responsável técnico, não revisor
        if (!item) return false;
        const meId   = (currentuser.id || '');
        const meName = ((currentuser.name || currentuser.user) || '').trim().toLowerCase();
        const _hasMe = (raw) => {
            if (!raw) return false;
            try {
                const arr = JSON.parse(String(raw));
                const vals = Array.isArray(arr) ? arr : [String(arr)];
                return vals.some(v => { const vs = String(v).trim(); return (meId && vs === meId) || vs.toLowerCase() === meName; });
            } catch { const vs = String(raw).trim(); return (meId && vs === meId) || vs.toLowerCase() === meName; }
        };
        return _hasMe(item?.responsavelTecnico || item?.responsavel);
    }

    function userCanEditCards(item) {
        if (!currentuser) return false;
        if (userIsAdmin()) return true;
        return _checkTriPerm(_normTriPerm(currentuser.canEditCards, 'total'), item);
    }

    // Listas que o usuário pode gerenciar: 'todas' ou array de chaves (areas, status, categorias,
    // tipos, marcadores, rnc). Cadastro antigo sem listasPermitidas: canManageLists = todas.
    function _listasDe(u) {
        if (!u) return [];
        if (u.listasPermitidas === 'todas') return 'todas';
        if (Array.isArray(u.listasPermitidas)) return u.listasPermitidas;
        if (u.listasPermitidas && typeof u.listasPermitidas === 'object') return Object.keys(u.listasPermitidas).filter(k => u.listasPermitidas[k]);
        return u.canManageLists ? 'todas' : [];
    }
    window._listasDe = _listasDe;
    const _LISTA_ALIAS = { setores: 'areas', subcategorias: 'categorias' };
    function userCanManageLists(key) {
        if (!currentuser) return false;
        if (userIsAdmin()) return true;
        const lp = _listasDe(currentuser);
        if (lp === 'todas') return true;
        if (!key) return lp.length > 0;
        return lp.includes(_LISTA_ALIAS[key] || key);
    }

    // ── Permissões específicas de RNC ──
    function userCanEditRnc(item) {
        if (!currentuser) return false;
        if (userIsAdmin()) return true;
        return _checkTriPerm(_normTriPerm(currentuser.rncCanEdit, 'total'), item);
    }
    window.userCanEditRnc = userCanEditRnc;

    // true se o usuário só pode editar como Revisor (não é Responsável) — bloqueia campo Responsável
    function userRncResponsavelLocked(item) {
        if (!currentuser || userIsAdmin()) return false;
        const perm = _normTriPerm(currentuser.rncCanEdit, 'total');
        if (perm !== 'parcial' || !item) return false;
        const meId   = (currentuser.id || '');
        const meName = ((currentuser.name || currentuser.user) || '').trim().toLowerCase();
        const isResp = [item.responsavel].some(v => {
            const vs = String(v || '').trim();
            return (meId && vs === meId) || vs.toLowerCase() === meName;
        });
        return !isResp;
    }
    window.userRncResponsavelLocked = userRncResponsavelLocked;

    function userRncTaskView() {
        if (!currentuser || userIsAdmin()) return 'todos';
        return currentuser.rncTaskView || 'todos';
    }
    window.userRncTaskView = userRncTaskView;

    // ── Novas permissões ─────────────────────────────────────────

    // Retorna o nível de permissão de ocorrências do usuário atual
    window.userOcPerm = function() {
        if (!currentuser) return 'visualizar';
        if (userIsAdmin()) return 'total';
        return currentuser.canManageOc || 'total';
    };

    // Retorna true se o usuário pode criar/editar a ocorrência (item pode ser null para "novo")
    window.userCanEditOc = function(item) {
        const perm = window.userOcPerm();
        if (perm === 'total') return true;
        if (perm === 'visualizar') return false;
        // parcial: só se for o responsável
        if (!item) return true; // criar novo é sempre permitido em parcial
        if (!currentuser) return false;
        const meId = currentuser.id || '';
        const meName = ((currentuser.name || currentuser.user) || '').trim().toLowerCase();
        const resp = String(item.responsavel || '').trim();
        return (meId && resp === meId) || resp.toLowerCase() === meName;
    };

    // Retorna true se o usuário pode excluir a ocorrência
    window.userCanDeleteOc = function(item) {
        return window.userCanEditOc(item) && window.userOcPerm() !== 'visualizar';
    };

    // Tipos de ocorrência permitidos para o usuário (null = todos)
    window.userAllowedTiposOc = function() {
        if (!currentuser) return null;
        if (userIsAdmin()) return null;
        return Array.isArray(currentuser.allowedTiposOc) ? currentuser.allowedTiposOc : null;
    };

    // Gerenciar reuniões — Total/Parcial/Não (padrão parcial)
    window.userCanManageReu = function() {
        if (!currentuser) return 'nao';
        if (userIsAdmin()) return 'total';
        return _normTriPerm(currentuser.canManageReu, 'parcial');
    };

    // Pode editar/excluir publicações — Total/Parcial/Não
    window.userCanManagePubs = function(item) {
        if (!currentuser) return false;
        if (userIsAdmin()) return true;
        return _checkTriPerm(_normTriPerm(currentuser.canManagePubs, 'total'), item);
    };

    // Pode publicar no card informado:
    //   'total'   → qualquer card
    //   'parcial' → apenas se for responsável ou revisor do card
    //   'nao'     → nunca
    window.userCanPublish = function(item) {
        if (!currentuser) return false;
        if (userIsAdmin()) return true;
        return _checkTriPerm(currentuser.canPublish || 'total', item);
    };

    window.userCanChecklist = function(item) {
        if (!currentuser) return false;
        if (userIsAdmin()) return true;
        return _checkTriPerm(currentuser.canChecklist || 'total', item);
    };

    function userAllowedTabs() {
        if (!currentuser) return null;
        // Admin tem acesso a todas as abas
        if (userIsAdmin()) {
            return ['dashboard', 'auditoria', 'documentos', 'atividades', 'manutencao', 'ocorrencias', 'rnc', 'reunioes', 'backup', 'configuracoes'];
        }
        // Se não houver configuração de abas, por segurança libera apenas Dashboard e Auditoria
        if (!Array.isArray(currentuser.tabs) || currentuser.tabs.length === 0) {
            return ['dashboard', 'auditoria', 'reunioes'];
        }
        // Reuniões: liberada por padrão; some só se desmarcada em Abas Permitidas ("!reunioes")
        if (currentuser.tabs.includes('!reunioes')) return currentuser.tabs.filter(t => t !== 'reunioes' && t !== '!reunioes');
        return currentuser.tabs.includes('reunioes') ? currentuser.tabs : currentuser.tabs.concat('reunioes');
    }

    // Abas que devem ser ocultadas (não apenas desabilitadas) quando não permitidas
    const TABS_HIDE_WHEN_DENIED = new Set(['configuracoes', 'ocorrencias', 'rnc']);

    function applyuserPermissionsToTabs() {
        const allowed = userAllowedTabs();
        const tabMap = {
            dashboard: 'tabDashboard',
            auditoria: 'tabAuditoria',
            documentos: 'tabDocumentos',
            atividades: 'tabAtividades',
            manutencao: 'tabManutencao',
            ocorrencias: 'tabOcorrencias',
            rnc: 'tabRnc',
            reunioes: 'tabReunioes',
            backup: 'tabBackup',
            configuracoes: 'tabConfiguracoes'
        };
        Object.entries(tabMap).forEach(([key, btnId]) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const permitted = !allowed || allowed.includes(key);
            if (TABS_HIDE_WHEN_DENIED.has(key)) {
                btn.style.display = permitted ? '' : 'none';
            } else if (permitted) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.display = '';
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.4';
            }
        });
        if (typeof window.applyDashAreaPermissions === 'function') window.applyDashAreaPermissions();
    }

    function logout() {
        // Para o listener do Firebase
        stopFirebaseListener();
        // Para o listener de mensagens e fecha o drawer
        try { if (typeof stopMessagesListener === 'function') stopMessagesListener(); } catch (_) {}
        try { if (typeof stopReunioesListener === 'function') stopReunioesListener(); } catch (_) {}
        try { if (typeof reuCloseDetail === 'function') reuCloseDetail(true); } catch (_) {}
        try { if (typeof msgCloseDrawer === 'function') msgCloseDrawer(); } catch (_) {}
        // Para o gerenciador de conexão e fecha o socket RTDB: sessão deslogada
        // não deve segurar uma conexão simultânea. Marca a desconexão como
        // INTENCIONAL para o offline.js NÃO exibir o overlay vermelho de "Sem
        // conexão" (que é reservado a quedas reais de energia/internet/servidor).
        // stopConnectionManager zera o flag, então marcamos DEPOIS dele.
        try { if (typeof window.stopConnectionManager === 'function') window.stopConnectionManager(); } catch (_) {}
        window._intentionalOffline = true;
        try { if (typeof window.firebaseGoOffline === 'function') window.firebaseGoOffline(); } catch (_) {}
        // Aviso calmo (azul) distinto do overlay vermelho de queda real: comunica que
        // a desconexão foi proposital e que a sessão fica offline até um novo login.
        try { if (typeof showToast === 'function') showToast('Sessão encerrada. Você ficará desconectado até fazer login novamente.', 'info'); } catch (_) {}

        // Limpa usuário atual e volta para tela de login
        currentuser = null;
        updateCurrentuserUI();
        // Reseta aba para dashboard padrão sem dados sensíveis
        currentTab = 'dashboard';
        switchTab('dashboard');
        // Limpa campos de login
        const userInput = document.getElementById('userInput');
        const passInput = document.getElementById('passwordInput');
        const loginBtn = document.getElementById('btnLogin');
        const loading = document.getElementById('loadingText');
        const timerDisplay = document.getElementById('timerDisplay');
        if (userInput) userInput.value = '';
        if (passInput) passInput.value = '';
        if (userInput) {
            userInput.disabled = false;
            userInput.focus();
        }
        if (passInput) passInput.disabled = false;
        if (loginBtn) loginBtn.disabled = false;
        if (loading) loading.style.display = 'none';
        if (timerDisplay) timerDisplay.textContent = '';
        failedAttempts = 0;
        // Mostra novamente o overlay de login
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'flex';
        if (typeof showLoginForm === 'function') showLoginForm();
        if (typeof refreshSignupAvailability === 'function') refreshSignupAvailability();
    }

    async function checkLogin() {
        const userInput = document.getElementById('userInput');
        const passInput = document.getElementById('passwordInput');
        const btn = document.getElementById('btnLogin');
        const loading = document.getElementById('loadingText');
        const loginBox = document.getElementById('loginBox');

        if (btn.disabled) return;

        const login = (userInput.value || '').trim();
        const senha = passInput.value;
        if (!login || !senha) return;

        btn.disabled = true;
        userInput.disabled = true;
        passInput.disabled = true;
        loading.style.display = 'block';
        window._authBusy = true;

        // Garante socket ativo antes de ler usuários: um logout anterior pode ter
        // deixado o RTDB em goOffline, o que faria loadusers() (get) travar.
        try { if (typeof window.firebaseGoOnline === 'function') window.firebaseGoOnline(); } catch (_) {}
        window._intentionalOffline = false;

        try {
            await loadusers();
            const candidate = users.find(u => String(u.user).trim().toLowerCase() === login.toLowerCase());
            const found = candidate && await verifyPassword(senha, candidate.password) ? candidate : null;
            if (found) {
                if (found.active === false) {
                    alert('Usuário inativo. Entre em contato com o administrador para reativar o acesso.');
                    handleLoginError(passInput, btn, loginBox);
                    userInput.disabled = false;
                    passInput.disabled = false;
                    userInput.focus();
                } else {
                    window._entrarComo(found);
                }
            } else {
                handleLoginError(passInput, btn, loginBox);
                userInput.disabled = false;
                userInput.focus();
            }
        } catch (err) {
            alert("Erro de conexão: " + err.message);
            btn.disabled = false;
            userInput.disabled = false;
            passInput.disabled = false;
            userInput.focus();
        } finally {
            loading.style.display = 'none';
            window._authBusy = false;
        }
    }

    // Entra no sistema como "found" (login antigo ou sessão do Dados LAMIC).
    window._entrarComo = function(found) {
        const loading = document.getElementById('loadingText');
        {
                {
                    currentuser = found;
                    // Só agora (logado) abrimos o listener .info/connected e ligamos o
                    // gerenciador de conexão (desconecta em background/inatividade) —
                    // economiza conexões simultâneas do RTDB.
                    if (typeof window.setupOfflineDetection === 'function') window.setupOfflineDetection();
                    if (typeof window.startConnectionManager === 'function') window.startConnectionManager();
                    updateCurrentuserUI();
                    applyuserPermissionsToTabs();
                    applyListManagerPermissions();
                    applyTaskViewPermission();
                    applyOcorrenciasPermissions();
                    loading.innerHTML = '<i class="fas fa-check"></i> Login realizado. Sincronizando dados...';
                    // A tela de carregamento sobe ANTES de esconder o login: sem ela,
                    // o usuário veria o dashboard zerado enquanto loadCloudData (que
                    // não é aguardado aqui, de propósito) ainda baixa as coleções.
                    if (typeof window.showBootLoader === 'function') window.showBootLoader('connect');
                    // PROTEÇÃO: Força sincronização completa com Firebase após login
                    forceFirebaseSync();
                    document.getElementById('loginOverlay').style.display = 'none';
                    // Atualiza tabela de usuários para garantir que todos pré-cadastrados apareçam na aba Configurações
                    renderusersConfigTable();
                }
        }
    };
    
    function handleLoginError(input, btn, box) {
        failedAttempts++;
        input.classList.add('error');
        box.classList.add('shake');
        
        setTimeout(() => {
            box.classList.remove('shake');
            input.classList.remove('error');
        }, 500);
    
        if (failedAttempts >= 5) {
            let seconds = 10;
            const timerDisplay = document.getElementById('timerDisplay');
            timerDisplay.textContent = `Muitas tentativas. Aguarde ${seconds}s`;
            
            const interval = setInterval(() => {
                seconds--;
                timerDisplay.textContent = `Muitas tentativas. Aguarde ${seconds}s`;
                if (seconds <= 0) {
                    clearInterval(interval);
                    timerDisplay.textContent = "";
                    failedAttempts = 0;
                    input.disabled = false;
                    btn.disabled = false;
                    input.value = "";
                    input.focus();
                }
            }, 1000);
        } else {
            input.disabled = false;
            btn.disabled = false;
            input.value = "";
            input.focus();
        }
    }

    // --- FUNÇÕES DE BACKUP LOCAL (ARQUIVO) ---
    
    // O backup precisa ser AUTO-CONTIDO: desde que os snapshots do histórico passaram
    // a viver em /cardSnapshots, os cards carregam só `snapId`. Exportar assim geraria
    // um arquivo com referências penduradas, inúteis ao restaurar em outro banco. Aqui
    // os snapshots são re-embutidos, deixando o arquivo idêntico ao formato antigo — o
    // importLocalData continua funcionando sem mudança, e o saveAll externaliza de novo
    // na volta.
    async function exportLocalData() {
        const cols = { audits, activities, maintenances, documents };
        const copia = JSON.parse(JSON.stringify(cols));

        try {
            const refs = [];
            Object.values(copia).forEach(arr => (arr || []).forEach(item => {
                (item && Array.isArray(item.historico) ? item.historico : []).forEach(e => {
                    if (e && e.snapId) refs.push(e);
                });
            }));
            if (refs.length) {
                const database = getFirebaseDatabase();
                const dbRef = getFirebaseRef();
                const dbGet = getFirebaseGet();
                const path = window._cardSnapshotsPath || 'cardSnapshots';
                const snap = await dbGet(dbRef(database, path));
                const store = snap.exists() ? (snap.val() || {}) : {};
                let ausentes = 0;
                refs.forEach(e => {
                    if (store[e.snapId]) { e.snapshot = store[e.snapId]; delete e.snapId; }
                    else { ausentes++; }
                });
                if (ausentes) {
                    console.warn('Backup: ' + ausentes + ' snapshots não encontrados em /' + path);
                }
            }
        } catch (err) {
            console.error('Erro ao embutir snapshots no backup:', err);
            if (!confirm('Não foi possível carregar os snapshots do histórico. ' +
                         'O backup será gerado sem eles. Continuar mesmo assim?')) return;
        }

        const data = {
            audits: copia.audits,
            activities: copia.activities,
            maintenances: copia.maintenances,
            documents: copia.documents,
            masterLists,
            exportDate: new Date().toISOString(),
            source: "local_export"
        };
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "Auditoria_Lamic_" + today() + ".json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
    
    function importLocalData(input) {
        const file = input.files[0];
        if (!file) return;
    
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                // Validação básica
                if (data.audits && data.masterLists) {
                    if(confirm("ATENÇÃO: Isso substituirá os dados atuais e atualizará a nuvem. Deseja continuar?")) {
                        
                        audits = data.audits || [];
                        activities = data.activities || [];
                        maintenances = data.maintenances || [];
                        documents = data.documents || []; 
                        
                        masterLists = { ...defaultMasterLists, ...data.masterLists };
                        if (Array.isArray(masterLists.mantItens)) {
                            masterLists.mantItens = defaultMasterLists.mantItens; 
                        }
                        
                        // Garante que os itens importados tenham o campo historico (vazio se não vier)
                        audits.forEach(a => a.historico = a.historico || []);
                        activities.forEach(a => a.historico = a.historico || []);
                        maintenances.forEach(m => m.historico = m.historico || []);
                        documents.forEach(d => d.historico = d.historico || []);
    
                        await saveAll(false); 
                        
                        alert("Backup local restaurado e sincronizado com a nuvem com sucesso!");
                        
                        populateSelects();
                        switchTab(currentTab); 
                        input.value = ''; 
                    }
                } else {
                    alert("O arquivo selecionado não é um backup válido deste sistema.");
                }
            } catch (err) {
                alert("Erro ao ler o arquivo: " + err.message);
            }
        };
        reader.readAsText(file);
    }
    

    // --- LIMPEZA DE LOGS ÓRFÃOS (historico de itens deletados) ---
    window.runOrphanLogsPurge = async function() {
        const btn    = document.getElementById('btnPurgeOrphanLogs');
        const report = document.getElementById('orphanLogsReport');
        if (!btn || !report) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
        report.style.display = 'none';

        try {
            const collections = [audits, activities, maintenances, documents, ocorrencias, rncItems];
            let totalLogs = 0;
            let removedLogs = 0;
            let affectedItems = 0;

            collections.forEach(col => {
                (col || []).forEach(item => {
                    if (!item || !item.deleted) return;
                    const logCount = Array.isArray(item.historico) ? item.historico.length : 0;
                    if (logCount > 0) {
                        totalLogs += logCount;
                        removedLogs += logCount;
                        affectedItems++;
                        item.historico = [];
                    }
                });
            });

            if (removedLogs === 0) {
                report.innerHTML = `<i class="fas fa-check-circle" style="color:#16a34a"></i> Nenhum log órfão encontrado. Todos os logs pertencem a itens ativos.`;
            } else {
                await saveAll(false);
                report.innerHTML = `
                    <i class="fas fa-trash-alt" style="color:#dc2626"></i>
                    <strong>${removedLogs}</strong> log(s) de rastreabilidade removido(s) de <strong>${affectedItems}</strong> item(ns) excluído(s).<br>
                    <span style="color:#9ca3af; font-size:12px;">Logs de itens ativos não foram afetados.</span>`;
            }
            report.style.display = '';
            if (typeof showToast === 'function') {
                showToast(removedLogs > 0 ? `${removedLogs} log(s) órfão(s) removido(s).` : 'Nenhum log órfão encontrado.', 'success');
            }
        } catch (err) {
            report.innerHTML = `<i class="fas fa-exclamation-triangle" style="color:#ef4444"></i> Erro: ${err.message}`;
            report.style.display = '';
            if (typeof showToast === 'function') showToast('Erro ao limpar logs: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-eraser"></i> Limpar Logs Órfãos';
        }
    };

    // --- LIMPEZA DE IMGBLOBS ÓRFÃOS ---
    window.runImgBlobsPurge = async function() {
        const btn    = document.getElementById('btnPurgeImgBlobs');
        const report = document.getElementById('imgBlobsReport');
        if (!btn || !report) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
        report.style.display = 'none';

        try {
            const result = await window.purgeOrphanImgBlobs([
                audits, activities, maintenances, documents, rncItems
            ]);

            const { total, orphans } = result;
            const kept = total - orphans;

            if (total === 0) {
                report.innerHTML = `<i class="fas fa-check-circle" style="color:#16a34a"></i> Nenhuma imagem encontrada no banco.`;
            } else if (orphans === 0) {
                report.innerHTML = `<i class="fas fa-check-circle" style="color:#16a34a"></i> <strong>${total}</strong> imagem(ns) encontrada(s) — todas associadas a publicações. Nada removido.`;
            } else {
                report.innerHTML = `
                    <i class="fas fa-trash-alt" style="color:#7c3aed"></i>
                    <strong>${orphans}</strong> imagem(ns) órfã(s) removida(s).<br>
                    <span style="color:#9ca3af; font-size:12px;">${kept} imagem(ns) mantida(s) por estarem associadas a publicações.</span>`;
            }
            report.style.display = '';
            if (typeof showToast === 'function') {
                showToast(orphans > 0 ? `${orphans} imagem(ns) órfã(s) removida(s).` : 'Nenhuma imagem órfã encontrada.', 'success');
            }
        } catch (err) {
            report.innerHTML = `<i class="fas fa-exclamation-triangle" style="color:#ef4444"></i> Erro: ${err.message}`;
            report.style.display = '';
            if (typeof showToast === 'function') showToast('Erro ao limpar imagens: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-broom"></i> Analisar e Limpar Imagens Órfãs';
        }
    };

    // --- CONFIGURAÇÕES: GESTÃO DE USUÁRIOS ---
    let editinguserIndex = null;
    let tempSelectedSetores = [];
    let tempSelectedTiposOc = null; // null = todos permitidos
    let tempSelectedTabs = ['dashboard', 'auditoria'];
    let currentUserFilter = 'ativos';

    // ── Cores para avatar (determinístico por nome) ──────────────
    function _usrAvatarColor(name) {
        const palette = ['#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#10b981','#ef4444','#6366f1','#06b6d4','#f97316'];
        let h = 0;
        for (let i = 0; i < (name||'').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
        return palette[Math.abs(h) % palette.length];
    }

    // ── Cores para badge de grupo ────────────────────────────────
    function _grupoColor(grupo) {
        if (!grupo) return { bg: '#f1f5f9', text: '#64748b' };
        if (grupo.toLowerCase() === 'admin') return { bg: '#ccfbf1', text: '#0f766e' };
        const opts = [
            { bg: '#ede9fe', text: '#7c3aed' },
            { bg: '#dbeafe', text: '#1d4ed8' },
            { bg: '#fce7f3', text: '#be185d' },
            { bg: '#fef3c7', text: '#b45309' },
            { bg: '#dcfce7', text: '#166534' },
            { bg: '#fee2e2', text: '#b91c1c' },
            { bg: '#e0f2fe', text: '#0369a1' },
        ];
        let h = 0;
        for (let i = 0; i < grupo.length; i++) h = (h * 31 + grupo.charCodeAt(i)) & 0xffffffff;
        return opts[Math.abs(h) % opts.length];
    }

    // ── Máscara de CPF ───────────────────────────────────────────
    window.maskCpfInput = function(el) {
        let v = el.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d+)/, '$1.$2');
        el.value = v;
    };

    // ── Atualiza avatar no sidebar do modal ──────────────────────
    window.updateUsrModalAvatar = function() {
        const name = (document.getElementById('cfgname')?.value || '').trim();
        const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
        const el = document.getElementById('usrModalAvatarLg');
        if (el) {
            el.textContent = initials;
            el.style.background = name ? _usrAvatarColor(name) : '';
        }
    };

    // ── Mostrar/ocultar senha ────────────────────────────────────
    window.toggleUsrPwVis = function() {
        const inp = document.getElementById('cfgPassword');
        const ico = document.getElementById('umPwEyeIcon');
        if (!inp) return;
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        if (ico) { ico.className = show ? 'fas fa-eye-slash' : 'fas fa-eye'; }
    };

    window.toggleUsrPwConfirmVis = function() {
        const inp = document.getElementById('cfgPasswordConfirm');
        const ico = document.getElementById('umPwConfirmEyeIcon');
        if (!inp) return;
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        if (ico) { ico.className = show ? 'fas fa-eye-slash' : 'fas fa-eye'; }
    };

    window.checkPwMatch = function() {
        const pw  = document.getElementById('cfgPassword')?.value || '';
        const pw2 = document.getElementById('cfgPasswordConfirm')?.value || '';
        const msg = document.getElementById('cfgPwMatchMsg');
        if (!msg) return;
        if (!pw && !pw2) { msg.textContent = ''; msg.className = 'um-pw-match-msg'; return; }
        if (pw2.length === 0) { msg.textContent = ''; msg.className = 'um-pw-match-msg'; return; }
        if (pw === pw2) { msg.textContent = '✓ Senhas coincidem'; msg.className = 'um-pw-match-msg um-pw-ok'; }
        else            { msg.textContent = '✗ Senhas não coincidem'; msg.className = 'um-pw-match-msg um-pw-err'; }
    };

    // ── Filtro de status ─────────────────────────────────────────
    window.setUserFilter = function(filter, btn) {
        currentUserFilter = filter;
        document.querySelectorAll('.usr-ftab').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderusersConfigTable();
    };

    // ── Formulário de permissões (compartilhado entre usuário e grupo) ──
    // Lê os selects de permissão + abas/setores/tipos selecionados.
    function _readPermForm() {
        const g = id => document.getElementById(id);
        const canManageLists = g('cfgCanManageLists').value === 'true';
        return {
            canEditCards: g('cfgCanEdit').value || 'total',
            canDeleteCards: g('cfgCanDelete').value || 'nao',
            canManageLists,
            canManagePubs: g('cfgCanManagePubs').value || 'total',
            canPublish: g('cfgCanPublish').value || 'total',
            canChecklist: g('cfgCanChecklist').value || 'total',
            taskView: g('cfgTaskView').value || 'todos',
            rncCanEdit: g('cfgRncCanEdit')?.value || 'total',
            rncTaskView: g('cfgRncTaskView')?.value || 'todos',
            canManageOc: g('cfgCanManageOc')?.value || 'total',
            canManageMotivos: g('cfgCanManageMotivos')?.value || 'total',
            canViewOc: g('cfgCanViewOc')?.value || 'total',
            canManageReu: g('cfgCanManageReu')?.value || 'parcial',
            listasPermitidas: window._permListas === 'todas' ? 'todas' : (Array.isArray(window._permListas) ? window._permListas.slice() : []),
            tabs: tempSelectedTabs.slice(),
            allowedSetores: canManageLists ? (masterLists.setores || []).slice() : tempSelectedSetores.slice(),
            allowedTiposOc: tempSelectedTiposOc // null = todos
        };
    }

    // Preenche os selects de permissão a partir de um objeto (usuário ou perms de grupo).
    function _fillPermForm(p) {
        p = p || {};
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        set('cfgCanEdit',   _normTriPerm(p.canEditCards,  'total'));
        set('cfgCanDelete', _normTriPerm(p.canDeleteCards, 'nao'));
        set('cfgCanManageLists', p.canManageLists ? 'true' : 'false');
        set('cfgCanManagePubs', _normTriPerm(p.canManagePubs, 'total'));
        set('cfgCanPublish', p.canPublish || 'total');
        set('cfgCanChecklist', p.canChecklist || 'total');
        set('cfgTaskView', p.taskView || 'todos');
        set('cfgRncCanEdit', _normTriPerm(p.rncCanEdit, 'total'));
        set('cfgRncTaskView', p.rncTaskView || 'todos');
        set('cfgCanManageOc', p.canManageOc || 'total');
        set('cfgCanManageMotivos', p.canManageMotivos || 'total');
        set('cfgCanViewOc', p.canViewOc || 'total');
        set('cfgCanManageReu', _normTriPerm(p.canManageReu, 'parcial'));
        const lp = _listasDe(p);
        window._permListas = lp === 'todas' ? 'todas' : lp.slice();
        set('cfgCanManageLists', lp === 'todas' ? 'true' : 'false');
        if (typeof window._permUiRender === 'function') setTimeout(window._permUiRender, 0);
        tempSelectedTabs = Array.isArray(p.tabs) && p.tabs.length > 0 ? p.tabs.slice() : ['dashboard', 'auditoria'];
        updateAbasButtonText();
        tempSelectedSetores = Array.isArray(p.allowedSetores) ? p.allowedSetores.slice() : [];
        updateSetoresButtonText();
        tempSelectedTiposOc = Array.isArray(p.allowedTiposOc) ? p.allowedTiposOc.slice() : null;
        updateTiposOcButtonText();
    }
    window._readPermForm = _readPermForm;
    window._fillPermForm = _fillPermForm;

    // Reaplica permissões ao usuário logado após mudanças em usuários ou grupos
    // force=true quando o objeto foi alterado no lugar (mesma referência de currentuser).
    function _refreshCurrentUserPerms(force) {
        if (!currentuser) return;
        const fresh = users.find(u => String(u.user).toLowerCase() === String(currentuser.user).toLowerCase());
        if (!fresh) return;
        // Sem mudança efetiva: evita re-render (updateCurrentuserUI reaplica "Minhas Tarefas")
        if (!force && JSON.stringify(fresh) === JSON.stringify(currentuser)) { currentuser = fresh; return; }
        currentuser = fresh;
        updateCurrentuserUI();
        applyuserPermissionsToTabs();
        applyListManagerPermissions();
        applyOcorrenciasPermissions();
        if (typeof applyRncTaskViewPermission === 'function') applyRncTaskViewPermission();
        if (typeof updateRncNotificationBell === 'function') updateRncNotificationBell();
    }
    window._refreshCurrentUserPerms = _refreshCurrentUserPerms;

    // ── Abre modal de criação ou edição ─────────────────────────
    window.openUserModal = function(idx) {
        if (typeof setUserModalMode === 'function') setUserModalMode('usuario');
        if (typeof populateUserGroupSelect === 'function') populateUserGroupSelect();
        if (idx === null) {
            editinguserIndex = null;
            resetConfigForm();
            document.getElementById('usrModalTitle').textContent = 'Novo Usuário';
            const hint = document.getElementById('cfgPasswordHint');
            if (hint) hint.style.display = 'none';
        } else {
            edituserConfig(idx);
            document.getElementById('usrModalTitle').textContent = 'Editar Usuário';
            const hint = document.getElementById('cfgPasswordHint');
            if (hint) hint.style.display = 'inline';
        }
        updateUsrModalAvatar();
        // Limpa qualquer descrição de permissão aberta
        document.querySelectorAll('.um-perm-desc').forEach(d => d.remove());
        document.querySelectorAll('.um-perm-info.active').forEach(b => b.classList.remove('active'));
        document.getElementById('modalUsuario').style.display = 'flex';
    };

    function resetConfigForm() {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        set('cfgname', '');
        set('cfguser', '');
        set('cfgPassword', '');
        set('cfgPasswordConfirm', '');
        const pwMsg = document.getElementById('cfgPwMatchMsg'); if (pwMsg) { pwMsg.textContent = ''; pwMsg.className = 'um-pw-match-msg'; }
        set('cfgCpf', '');
        set('cfgCargo', '');
        set('cfgGrupoId', '');
        set('cfgStatus', 'true');
        set('cfgIsAdmin', 'false');
        const _cr = document.getElementById('cfgCustomRestr'); if (_cr) _cr.checked = false;
        _fillPermForm({});
        if (typeof _onUserGroupChange === 'function') _onUserGroupChange();
        editinguserIndex = null;
    }

    function openSetoresModal() {
        const canManageLists = document.getElementById('cfgCanManageLists')?.value === 'true';
        const setores = masterLists.setores || [];
        
        // Se canManageLists está marcado, todos os setores são permitidos
        if (canManageLists) {
            tempSelectedSetores = setores.slice();
        } else if (tempSelectedSetores.length === 0) {
            // Se não há setores temporários, tenta carregar do usuário sendo editado
            if (editinguserIndex !== null && users[editinguserIndex] && Array.isArray(users[editinguserIndex].allowedSetores)) {
                tempSelectedSetores = users[editinguserIndex].allowedSetores.slice();
            }
        }
        
        const notice = document.getElementById('modalSetoresLockNotice');
        if (notice) notice.style.display = canManageLists ? 'flex' : 'none';
        renderModalSetores();
        document.getElementById('modalSetoresPermissoes').style.display = 'flex';
    }

    function renderModalSetores() {
        const container = document.getElementById('modalSetoresList');
        if (!container) return;

        const setores = (masterLists.setores || []).slice().sort((a, b) => String(a).localeCompare(String(b), 'pt'));
        const canManageLists = document.getElementById('cfgCanManageLists')?.value === 'true';

        const subtitle = document.getElementById('modalSetoresSubtitle');
        if (subtitle) subtitle.textContent = `${setores.length} SETOR${setores.length !== 1 ? 'ES' : ''} DISPONÍVE${setores.length !== 1 ? 'IS' : 'L'}`;

        container.innerHTML = '';

        if (setores.length === 0) {
            container.innerHTML = '<p style="color:#9ca3af; font-size:13px; text-align:center; padding:20px;">Nenhum setor cadastrado. Adicione setores primeiro.</p>';
            updateModalSetoresCount();
            return;
        }

        setores.forEach(setor => {
            const isChecked = tempSelectedSetores.includes(setor);
            const chip = document.createElement('div');
            chip.className = 'setor-chip' + (isChecked ? ' selected' : '') + (canManageLists ? ' disabled' : '');
            chip.dataset.setor = setor;
            chip.innerHTML = `
                <div class="setor-chip-check"><i class="fas fa-check"></i></div>
                <span class="setor-chip-label" title="${setor}">${setor}</span>
            `;
            if (!canManageLists) {
                chip.onclick = function () { toggleSetorChipModal(setor); };
            } else {
                chip.style.cursor = 'default';
                chip.style.opacity = '0.7';
            }
            container.appendChild(chip);
        });

        updateModalSetoresCount();
    }

    function toggleSetorChipModal(setor) {
        const canManageLists = document.getElementById('cfgCanManageLists')?.value === 'true';
        if (canManageLists) return;
        const idx = tempSelectedSetores.indexOf(setor);
        if (idx === -1) tempSelectedSetores.push(setor);
        else tempSelectedSetores.splice(idx, 1);
        renderModalSetores();
    }

    function updateModalSetoresCount() {
        const setores = masterLists.setores || [];
        const countEl = document.getElementById('modalSetoresCount');
        const btn = document.getElementById('modalSetoresToggleAllBtn');
        if (countEl) countEl.textContent = `${tempSelectedSetores.length} de ${setores.length} selecionados`;
        if (btn) {
            const allSelected = setores.length > 0 && tempSelectedSetores.length === setores.length;
            btn.innerHTML = allSelected
                ? '<i class="fas fa-times"></i> Desmarcar todos'
                : '<i class="fas fa-check"></i> Marcar todos';
        }
    }

    function toggleAllSetoresModal() {
        const canManageLists = document.getElementById('cfgCanManageLists')?.value === 'true';
        if (canManageLists) return;
        const setores = masterLists.setores || [];
        if (tempSelectedSetores.length === setores.length) {
            deselectAllSetores();
        } else {
            selectAllSetores();
        }
    }

    function selectAllSetores() {
        const canManageLists = document.getElementById('cfgCanManageLists')?.value === 'true';
        if (canManageLists) return; // Não faz nada se canManageLists está marcado
        tempSelectedSetores = (masterLists.setores || []).slice();
        renderModalSetores();
    }

    function deselectAllSetores() {
        const canManageLists = document.getElementById('cfgCanManageLists')?.value === 'true';
        if (canManageLists) return; // Não faz nada se canManageLists está marcado
        tempSelectedSetores = [];
        renderModalSetores();
    }

    function saveSetoresPermissoes() {
        const canManageLists = document.getElementById('cfgCanManageLists')?.value === 'true';
        if (canManageLists) {
            // Se canManageLists está marcado, todos os setores são permitidos
            tempSelectedSetores = (masterLists.setores || []).slice();
        }
        updateSetoresButtonText();
        closeModal('modalSetoresPermissoes');
    }

    function openTiposOcorrenciasModal() {
        const tipos = (typeof masterLists !== 'undefined' && masterLists.ncTipos) ? masterLists.ncTipos : [];
        const container = document.getElementById('modalTiposOcList');
        if (!container) return;
        container.innerHTML = '';
        if (tipos.length === 0) {
            container.innerHTML = '<p style="color:#9ca3af; font-size:13px; text-align:center; padding:20px;">Nenhum tipo de ocorrência cadastrado.</p>';
        } else {
            const allowed = tempSelectedTiposOc; // null = todos
            tipos.forEach(t => {
                const id = t.id || t;
                const name = t.name || t;
                const isChecked = allowed === null || allowed.includes(id);
                const label = document.createElement('label');
                label.style.cssText = 'display:flex; align-items:center; padding:10px 12px; margin-bottom:6px; background:white; border:1px solid #e5e7eb; border-radius:6px; cursor:pointer; transition:all 0.2s ease;';
                label.innerHTML = `<input type="checkbox" class="modal-tipo-oc-checkbox" value="${id}" ${isChecked ? 'checked' : ''} style="margin-right:10px; width:18px; height:18px; cursor:pointer;"><span style="flex:1; font-size:14px; color:#1f2937;">${name}</span>`;
                container.appendChild(label);
            });
        }
        document.getElementById('modalTiposOcorrencias').style.display = 'flex';
    }
    window.openTiposOcorrenciasModal = openTiposOcorrenciasModal;

    window.selectAllTiposOc = function() {
        document.querySelectorAll('.modal-tipo-oc-checkbox').forEach(c => c.checked = true);
    };
    window.deselectAllTiposOc = function() {
        document.querySelectorAll('.modal-tipo-oc-checkbox').forEach(c => c.checked = false);
    };

    window.saveTiposOcPermissoes = function() {
        const tipos = (typeof masterLists !== 'undefined' && masterLists.ncTipos) ? masterLists.ncTipos : [];
        const checked = Array.from(document.querySelectorAll('.modal-tipo-oc-checkbox')).filter(c => c.checked).map(c => c.value);
        // null = todos permitidos (if all selected)
        tempSelectedTiposOc = (checked.length === tipos.length) ? null : checked;
        updateTiposOcButtonText();
        closeModal('modalTiposOcorrencias');
    };

    function updateTiposOcButtonText() {
        const btn = document.getElementById('tiposOcButtonText');
        if (!btn) return;
        const tipos = (typeof masterLists !== 'undefined' && masterLists.ncTipos) ? masterLists.ncTipos : [];
        if (tempSelectedTiposOc === null || tempSelectedTiposOc.length === tipos.length) {
            btn.textContent = `Todos os Tipos de Ocorrências (${tipos.length})`;
        } else if (tempSelectedTiposOc.length === 0) {
            btn.textContent = 'Nenhum Tipo Selecionado';
        } else {
            btn.textContent = `${tempSelectedTiposOc.length} de ${tipos.length} Tipos Selecionados`;
        }
    }

    const ALL_TABS = [
        { value: 'dashboard',    label: 'Dashboard',    icon: 'fa-chart-pie' },
        { value: 'auditoria',    label: 'Rotinas',      icon: 'fa-clipboard-list' },
        { value: 'documentos',   label: 'Documentos',   icon: 'fa-file-lines' },
        { value: 'atividades',   label: 'Atividades',   icon: 'fa-list-check' },
        { value: 'ocorrencias',  label: 'Ocorrências',  icon: 'fa-triangle-exclamation' },
        { value: 'rnc',          label: 'RNC',           icon: 'fa-file-circle-exclamation' },
        { value: 'reunioes',     label: 'Reuniões',     icon: 'fa-people-group' },
        { value: 'backup',       label: 'Backup',       icon: 'fa-database' },
    ];

    function openAbasModal() {
        const container = document.getElementById('modalAbasList');
        if (!container) return;
        container.innerHTML = '';
        ALL_TABS.forEach(t => {
            // Reuniões: liberada por padrão; só sai quando desmarcada ("!reunioes")
            const isChecked = t.value === 'reunioes' ? !tempSelectedTabs.includes('!reunioes') : tempSelectedTabs.includes(t.value);
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; padding:10px 12px; margin-bottom:6px; background:white; border:1px solid #e5e7eb; border-radius:6px; cursor:pointer; transition:all 0.2s ease;';
            label.onmouseover = function() { this.style.background = '#f9fafb'; };
            label.onmouseout  = function() { this.style.background = 'white'; };
            label.innerHTML = `<input type="checkbox" class="modal-aba-checkbox" value="${t.value}" ${isChecked ? 'checked' : ''} style="margin-right:10px; width:18px; height:18px; cursor:pointer;"><i class="fas ${t.icon}" style="margin-right:10px; color:#6366f1; width:16px; text-align:center;"></i><span style="flex:1; font-size:14px; color:#1f2937;">${t.label}</span>`;
            container.appendChild(label);
        });
        document.getElementById('modalAbasPermissoes').style.display = 'flex';
    }
    window.openAbasModal = openAbasModal;

    window.selectAllAbas = function() {
        document.querySelectorAll('.modal-aba-checkbox').forEach(c => c.checked = true);
    };
    window.deselectAllAbas = function() {
        document.querySelectorAll('.modal-aba-checkbox').forEach(c => c.checked = false);
    };

    window.saveAbasPermissoes = function() {
        tempSelectedTabs = Array.from(document.querySelectorAll('.modal-aba-checkbox')).filter(c => c.checked).map(c => c.value);
        if (!tempSelectedTabs.includes('reunioes')) tempSelectedTabs.push('!reunioes');
        updateAbasButtonText();
        closeModal('modalAbasPermissoes');
    };

    function updateAbasButtonText() {
        const btn = document.getElementById('abasButtonText');
        if (!btn) return;
        const total = ALL_TABS.length;
        const count = ALL_TABS.filter(t => t.value === 'reunioes' ? !tempSelectedTabs.includes('!reunioes') : tempSelectedTabs.includes(t.value)).length;
        if (count === 0) {
            btn.textContent = 'Nenhuma aba selecionada';
        } else if (count === total) {
            btn.textContent = `Todas as abas (${total})`;
        } else {
            const names = ALL_TABS.filter(t => t.value === 'reunioes' ? !tempSelectedTabs.includes('!reunioes') : tempSelectedTabs.includes(t.value)).map(t => t.label);
            btn.textContent = names.join(', ');
        }
    }

    function updateSetoresButtonText() {
        const buttonText = document.getElementById('setoresButtonText');
        if (!buttonText) return;
        
        const canManageLists = document.getElementById('cfgCanManageLists')?.value === 'true';
        const count = tempSelectedSetores.length;
        const total = (masterLists.setores || []).length;
        
        if (canManageLists) {
            buttonText.textContent = `Todos os Setores (${total})`;
        } else if (count === 0) {
            buttonText.textContent = 'Selecionar Setores';
        } else if (count === total) {
            buttonText.textContent = `Todos os Setores (${total})`;
        } else {
            buttonText.textContent = `${count} de ${total} Setores Selecionados`;
        }
    }

    // Descrições das opções de cada permissão (exibidas ao clicar no ícone de info)
    const PERM_INFO = {
        edit: {
            title: 'Editar registros',
            items: [
                ['Total', 'Pode editar qualquer registro do sistema.'],
                ['Parcial', 'Só pode criar ou editar registros em que estiver como Responsável ou Revisor.'],
                ['Não', 'Somente leitura: não pode criar nem editar nenhum registro.']
            ]
        },
        delete: {
            title: 'Excluir registros',
            items: [
                ['Não', 'Não pode excluir nenhum registro.'],
                ['Parcial', 'Só pode excluir registros em que é Responsável. Não se aplica se for apenas Revisor.'],
                ['Total', 'Pode excluir qualquer registro do sistema.']
            ]
        },
        lists: {
            title: 'Gerenciar listas',
            items: [
                ['Sim', 'Pode criar, editar e excluir itens das listas (setores, responsáveis, etc.) e acessa todos os setores.'],
                ['Não', 'Não pode alterar as listas; o acesso fica restrito aos setores selecionados.']
            ]
        },
        rncEdit: {
            title: 'Gerenciar RNC',
            items: [
                ['Total', 'Pode criar e editar qualquer RNC.'],
                ['Parcial', 'Só pode criar ou editar RNC em que estiver como Responsável ou Revisor. Se for apenas Revisor, o campo Responsável fica bloqueado.'],
                ['Não', 'Somente leitura: não pode criar nem editar nenhuma RNC.']
            ]
        },
        rncView: {
            title: 'Visualizar RNC',
            items: [
                ['Todos', 'Visualiza todas as RNCs cadastradas.'],
                ['Usuário', 'Visualiza apenas as RNCs como Responsável ou como Revisor (sem opção "Todas RNC\'s"). Não pode excluir cards.']
            ]
        },
        manageReu: {
            title: 'Gerenciar reuniões',
            items: [
                ['Total', 'Pode criar e editar qualquer reunião.'],
                ['Parcial', 'Pode criar reuniões e editar apenas as próprias (criador ou participante).'],
                ['Não', 'Não pode criar nem editar reuniões (somente visualizar).']
            ]
        },
        managePubs: {
            title: 'Gerenciar publicações',
            items: [
                ['Total', 'Pode criar e gerenciar qualquer publicação.'],
                ['Parcial', 'Só pode gerenciar publicações em que é responsável técnico ou revisor.'],
                ['Não', 'Não pode gerenciar publicações.']
            ]
        },
        publish: {
            title: 'Realizar publicações',
            items: [
                ['Total', 'Pode efetivar a publicação de qualquer registro.'],
                ['Parcial', 'Só pode publicar registros em que é responsável técnico ou revisor.'],
                ['Não', 'Não pode realizar publicações.']
            ]
        },
        checklist: {
            title: 'Preencher checklist',
            items: [
                ['Total', 'Pode preencher o checklist de qualquer tarefa.'],
                ['Parcial', 'Só pode preencher o checklist de tarefas em que é responsável técnico ou revisor.'],
                ['Não', 'Não pode preencher checklists.']
            ]
        },
        taskView: {
            title: 'Visualização de tarefas',
            items: [
                ['Todos', 'Visualiza as tarefas de todos os usuários.'],
                ['Usuário', 'Visualiza apenas as tarefas em que é responsável técnico ou revisor.']
            ]
        },
        manageOc: {
            title: 'Gerenciar ocorrências',
            items: [
                ['Total', 'Pode adicionar, editar e excluir qualquer ocorrência.'],
                ['Parcial', 'Pode adicionar, editar e excluir apenas ocorrências em que é responsável.'],
                ['Visualizar', 'Apenas visualiza as ocorrências, sem poder criar ou alterar.']
            ]
        },
        manageMotivos: {
            title: 'Gerenciar motivos',
            items: [
                ['Total', 'Acessa e gerencia os botões "+" de categoria e motivo.'],
                ['Apenas Motivo', 'Acessa e gerencia apenas o botão "+" de motivo.'],
                ['Não', 'Não gerencia nenhum campo de "+", ocultando ambos.']
            ]
        },
        viewOc: {
            title: 'Visualizar ocorrências',
            items: [
                ['Total', 'Visualiza todas as ocorrências.'],
                ['Parcial', 'Visualiza apenas as ocorrências em que é responsável (Minhas ocorrências).']
            ]
        }
    };

    function togglePermInfo(btn, key) {
        const wasActive = btn.classList.contains('active');
        // Fecha qualquer dropdown aberto
        document.querySelectorAll('.um-perm-info.active').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.um-perm-desc').forEach(d => d.remove());
        if (wasActive) return;

        const info = PERM_INFO[key];
        if (!info) return;
        btn.classList.add('active');

        const box = document.createElement('div');
        box.className = 'um-perm-desc';
        const lis = info.items.map(([opt, desc]) => `<li><b>${opt}:</b> ${desc}</li>`).join('');
        box.innerHTML = `<div class="um-perm-desc-title"><i class="fas fa-circle-info"></i>${info.title}</div><ul>${lis}</ul>`;

        const card = btn.closest('.um-perm-card');
        const section = btn.closest('.um-section');
        const wrap = document.querySelector('.um-wrap');

        section.style.position = 'relative';
        section.appendChild(box);

        // Posiciona abaixo do card, com largura igual ao modal
        const cardRect = card.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        const wrapWidth = wrap ? wrap.getBoundingClientRect().width : sectionRect.width;
        const offsetLeft = sectionRect.left - (wrap ? wrap.getBoundingClientRect().left : sectionRect.left);

        box.style.width = wrapWidth + 'px';
        box.style.left = -offsetLeft + 'px';
        box.style.top = (cardRect.bottom - sectionRect.top + 8) + 'px';
        box.style.transform = 'none';

        // Fecha ao clicar fora
        const outsideClick = (e) => {
            if (!section.contains(e.target) || (!card.contains(e.target) && !box.contains(e.target))) {
                box.remove();
                btn.classList.remove('active');
                document.removeEventListener('click', outsideClick, true);
            }
        };
        setTimeout(() => document.addEventListener('click', outsideClick, true), 0);
    }
    window.togglePermInfo = togglePermInfo;

    function renderusersConfigTable() {
        const tbody = document.getElementById('cfgusersTable');
        if (!tbody) return;
        tbody.innerHTML = '';

        const visible = users
            .map((u, idx) => ({ u, idx }))
            .filter(({ u }) => String(u.user).trim().toLowerCase() !== 'admin')
            .filter(({ u }) => {
                if (currentUserFilter === 'ativos') return u.active !== false;
                if (currentUserFilter === 'inativos') return u.active === false;
                return true;
            });

        if (visible.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:36px;color:#94a3b8;font-size:13px;"><i class="fas fa-users" style="font-size:22px;display:block;margin-bottom:8px;opacity:.4"></i>Nenhum usuário encontrado.</td></tr>`;
            return;
        }

        visible.forEach(({ u, idx }) => {
            const name = u.name || u.user || '';
            const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
            const color = _usrAvatarColor(name);
            const isYou = currentuser && String(currentuser.user).toLowerCase() === String(u.user).toLowerCase();
            const _grp = typeof getUserGroup === 'function' ? getUserGroup(u.grupoId) : null;
            const grupo = (_grp && _grp.name) || u.grupo || (u.isAdmin ? 'Admin' : '');
            const gc = _grupoColor(grupo);
            const statusCls = u.active === false ? 'inativo' : 'ativo';
            const statusLbl = u.active === false ? 'Inativo' : 'Ativo';
            const cpf = u.cpf || '—';
            const cargo = u.cargo || '—';

            tbody.innerHTML += `
            <tr>
                <td>
                    <div class="usr-cell">
                        <div class="usr-avatar" style="background:${color}">${initials}</div>
                        <div class="usr-cell-info">
                            <div class="usr-cell-name">${name || '-'}${isYou ? '<span class="usr-you-badge">Você</span>' : ''}</div>
                            <div class="usr-cell-login">${u.user || '-'}</div>
                        </div>
                    </div>
                </td>
                <td style="color:#64748b;font-size:13px">${cpf}</td>
                <td style="color:#374151;font-size:13px">${cargo}</td>
                <td>${grupo ? `<span class="usr-grupo-badge" style="background:${gc.bg};color:${gc.text}">${grupo}</span>` : '<span style="color:#94a3b8">—</span>'}</td>
                <td><span class="usr-status-badge ${statusCls}">${statusLbl}</span></td>
                <td>
                    <div class="usr-actions">
                        <button class="usr-action-btn edit" onclick="openUserModal(${idx})" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="usr-action-btn del" onclick="deleteuserConfig(${idx})" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });
    }

    async function saveuserConfig() {
        const g = id => document.getElementById(id);
        const name = g('cfgname').value.trim();
        const user = g('cfguser').value.trim();
        const password = g('cfgPassword').value;
        const cpf = (g('cfgCpf')?.value || '').trim();
        const cargo = (g('cfgCargo')?.value || '').trim();
        const isActive = g('cfgStatus').value !== 'false';
        const isAdmin = g('cfgIsAdmin').value === 'true';
        // Vinculado a grupo: permissões vêm do grupo (herança). Sem grupo: do formulário.
        const group = getUserGroup(g('cfgGrupoId')?.value || null);
        const perms = group ? _groupPermsCopy(group) : _readPermForm();
        // Grupo + "Abas e Restrições personalizadas": abas/setores/tipos vêm do formulário
        const customRestr = !!group && _isCustomRestrOn();
        if (customRestr) Object.assign(perms, _readRestrForm());

        const passwordConfirm = g('cfgPasswordConfirm')?.value || '';

        const _toast = (msg, type) => typeof showToast === 'function' ? showToast(msg, type) : alert(msg);
        if (!name || !user || (!password && editinguserIndex === null)) {
            _toast('Preencha ao menos Nome, Login e Senha (para novos usuários).', 'error'); return;
        }
        if (password && password !== passwordConfirm) {
            _toast('A confirmação de senha não confere. Verifique os campos de senha.', 'error'); return;
        }
        if (user.toLowerCase() === 'admin') {
            _toast('O usuário "admin" é reservado e não pode ser criado/alterado por aqui.', 'warning'); return;
        }
        if (editinguserIndex === null && users.some(u => String(u.user).trim().toLowerCase() === user.toLowerCase())) {
            _toast('Já existe um usuário com esse login.', 'error'); return;
        }

        const userData = { name, user, cpf, cargo, ...perms, grupoId: group ? group.id : null, customRestr, active: isActive, isAdmin };
        if (group) userData.grupo = group.name;
        const passwordHash = password ? await hashPassword(password) : null;

        if (editinguserIndex === null) {
            users.push({ id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ...userData, password: passwordHash });
        } else {
            const u = users[editinguserIndex];
            // Saiu de um grupo: o nome dele deixa de valer como rótulo (vira Personalizado)
            if (!group && u.grupoId) userData.grupo = '';
            Object.assign(u, userData);
            if (passwordHash) u.password = passwordHash;
        }

        // Com sistema de IDs, registros referenciam o ID do usuário — mudança de nome não requer propagação
        closeModal('modalUsuario');
        resetConfigForm();
        if (typeof msRefreshUsers === 'function') msRefreshUsers();
        renderusersConfigTable();
        if (typeof renderUserGroupsTable === 'function') renderUserGroupsTable();
        if (typeof renderCards === 'function') renderCards();
        if (currentuser && currentuser.user && currentuser.user.toLowerCase() === user.toLowerCase()) {
            _refreshCurrentUserPerms(true);
        }
        try {
            await saveusers();
            if (typeof showToast === 'function') showToast('Usuário salvo com sucesso.', 'success');
        } catch (e) {
            if (typeof showToast === 'function') showToast('Erro ao salvar usuário: ' + e.message, 'error');
            else alert('Erro ao salvar usuários: ' + e.message);
        }
    }

    // Migra campos responsavel/revisor de nomes para IDs de usuário.
    // Nomes sem correspondência a usuário cadastrado são removidos.
    window.migrateResponsaveisToIds = async function() {
        if (typeof users === 'undefined' || !users.length) return;
        const nameToId = new Map();
        users.forEach(u => { if (u.id && u.name) nameToId.set(u.name.trim().toLowerCase(), u.id); });
        const validIds = new Set(users.map(u => u.id).filter(Boolean));
        let anyChanged = false;

        const migrateField = (val) => {
            if (!val) return { val: '', changed: false };
            let arr;
            try {
                const p = JSON.parse(val);
                arr = Array.isArray(p) ? p.map(String).filter(Boolean) : (p ? [String(p).trim()] : []);
            } catch { arr = [String(val).trim()].filter(Boolean); }
            const newArr = [];
            let changed = false;
            for (const v of arr) {
                if (!v.trim()) continue;
                if (validIds.has(v)) { newArr.push(v); }
                else {
                    const id = nameToId.get(v.toLowerCase());
                    if (id) { newArr.push(id); changed = true; }
                    else { changed = true; } // inválido: remove
                }
            }
            const newVal = newArr.length ? JSON.stringify(newArr) : '';
            return { val: newVal, changed: changed || newVal !== val };
        };

        const patchArr = (arr, fields) => arr.forEach(item => {
            fields.forEach(f => {
                const r = migrateField(item[f]);
                if (r.changed) { item[f] = r.val; anyChanged = true; }
            });
        });

        patchArr(audits      || [], ['responsavel', 'revisor']);
        patchArr(activities  || [], ['responsavel', 'revisor']);
        patchArr(documents   || [], ['responsavel', 'revisor']);
        patchArr(maintenances || [], ['responsavelTecnico', 'responsavelManutencao']);

        if (anyChanged) {
            if (typeof saveAll === 'function') await saveAll();
            if (typeof msRefreshUsers === 'function') msRefreshUsers();
        }
    };

    function edituserConfig(idx) {
        const u = users[idx];
        editinguserIndex = idx;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        set('cfgname', u.name || '');
        set('cfguser', u.user || '');
        set('cfgPassword', '');
        set('cfgPasswordConfirm', '');
        const _pwMsg = document.getElementById('cfgPwMatchMsg'); if (_pwMsg) { _pwMsg.textContent = ''; _pwMsg.className = 'um-pw-match-msg'; }
        set('cfgCpf', u.cpf || '');
        set('cfgCargo', u.cargo || '');
        set('cfgGrupoId', getUserGroup(u.grupoId) ? u.grupoId : '');
        set('cfgStatus', u.active === false ? 'false' : 'true');
        set('cfgIsAdmin', u.isAdmin === true ? 'true' : 'false');
        const _cr = document.getElementById('cfgCustomRestr'); if (_cr) _cr.checked = u.customRestr === true;
        _fillPermForm(u);
        _onUserGroupChange();
    }

    async function deleteuserConfig(idx) {
        const u = users[idx];
        const _doDelete = async () => {
            users.splice(idx, 1);
            try {
                await saveusers();
                renderusersConfigTable();
                if (typeof showToast === 'function') showToast('Usuário excluído com sucesso.', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast('Erro ao excluir usuário: ' + e.message, 'error');
            }
        };
        _showConfirmDialog({
            title: 'Excluir Usuário',
            message: `Deseja realmente excluir o usuário <strong>${u.name || u.user}</strong>?<br><span style="font-size:12px;color:#94a3b8;">Esta ação não pode ser desfeita.</span>`,
            confirmLabel: 'Excluir',
            confirmClass: 'confirm-dlg-btn--danger',
            onConfirm: _doDelete
        });
    }

    // Botão de logout ao lado do nome do usuário
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _showConfirmDialog({
                title: 'Sair do sistema',
                message: 'Deseja realmente sair do sistema?',
                confirmLabel: 'Sair',
                confirmClass: 'confirm-dlg-btn--primary',
                iconClass: 'confirm-dlg-icon--info',
                icon: 'fa-right-from-bracket',
                onConfirm: logout
            });
        });
    }

    // FUNÇÕES PARA AUTOCOMPLETE DE RESPONSÁVEIS
    function updateResponsavelList(tab) {
        const inputId = tab === 'audit' ? 'auditResponsavel' : tab === 'ativ' ? 'ativResponsavel' : tab === 'mant' ? 'mantResponsavelTecnico' : 'docResponsavel';
        const listId = tab === 'audit' ? 'auditResponsavelList' : tab === 'ativ' ? 'ativResponsavelList' : tab === 'mant' ? 'mantResponsavelTecnicoList' : 'docResponsavelList';
        
        const input = document.getElementById(inputId);
        const list = document.getElementById(listId);
        
        if (!input || !list) return;
        
        const query = input.value.toLowerCase().trim();
        
        // Obtém lista de usuários cadastrados
        const userNames = users.map(u => u.name).filter(Boolean);
        
        // Filtra usuários que correspondem ao texto digitado
        const filtered = userNames.filter(name => 
            name.toLowerCase().includes(query)
        );
        
        // Mostra a lista apenas se há texto e há resultados
        if (query.length > 0 && filtered.length > 0) {
            list.style.display = 'block';
            list.innerHTML = filtered.map(name => `
                <div class="autocomplete-item" onclick="selectResponsavel('${inputId}', '${name.replace(/'/g, "\\'")}')">${name}</div>
            `).join('');
        } else {
            list.style.display = 'none';
        }
    }
    
    function selectResponsavel(inputId, name) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = name;
        }
        // Esconde a lista
        const listId = inputId.replace('Responsavel', 'ResponsavelList');
        const list = document.getElementById(listId);
        if (list) {
            list.style.display = 'none';
        }
    }
    
    // Esconde a lista ao clicar fora
    document.addEventListener('click', function(e) {
        document.querySelectorAll('.autocomplete-list').forEach(list => {
            if (!list.contains(e.target) && !list.previousElementSibling.contains(e.target)) {
                list.style.display = 'none';
            }
        });
    });
    
    // FUNÇÕES PARA MOSTRAR/ESCONDER SUBCATEGORIA E RESPONSÁVEL COM BASE NA CATEGORIA
    function onFilterCategoryChange(prefix) {
        // Mostra/esconde subcategoria
        const subId = prefix === 'Mant' ? 'fMantItem' : `f${prefix}Sub`;
        const subEl = document.getElementById(subId);
        const responsavelId = `f${prefix}Responsavel`;
        const responsavelEl = document.getElementById(responsavelId);
        const catEl = document.getElementById(`f${prefix}Cat`);
        
        if (catEl && catEl.value === '') {
            // Categoria vazia ("todas") - esconde apenas subcategoria, responsável sempre visível
            if (subEl) subEl.style.display = 'none';
            // Responsável sempre visível
            if (responsavelEl) responsavelEl.style.display = 'block';
        } else {
            // Categoria selecionada - mostra subcategoria e responsável
            if (subEl) subEl.style.display = 'block';
            if (responsavelEl) responsavelEl.style.display = 'block';
            updateFilterFacetOptions(prefix);
        }
        renderCards();
    }

    document.onkeydown = function(event) {
        if (
            event.keyCode === 123 ||  // F12
            (event.ctrlKey && event.shiftKey && event.keyCode === 'I'.charCodeAt(0)) ||  // Ctrl + Shift + I
            (event.ctrlKey && event.shiftKey && event.keyCode === 'J'.charCodeAt(0)) ||  // Ctrl + Shift + J
            (event.ctrlKey && event.shiftKey && event.keyCode === 'C'.charCodeAt(0)) ||  // Ctrl + Shift + C
            (event.ctrlKey && event.keyCode === 'U'.charCodeAt(0)) ||  // Ctrl + U
            (event.ctrlKey && event.keyCode === 'S'.charCodeAt(0))  // Ctrl + S
        ) {
            event.preventDefault();
            return false;
        }

        // ESC: fecha qualquer aba/janela aberta
        if (event.key === 'Escape') {
            // Diálogo de confirmação em cima de tudo: ESC = cancelar (volta a editar)
            const _confirmDlg = document.getElementById('_confirmDlgOverlay');
            if (_confirmDlg) {
                const _cancelBtn = _confirmDlg.querySelector('#_confirmDlgCancel');
                if (_cancelBtn) _cancelBtn.click(); else _confirmDlg.remove();
                return;
            }
            // Modais com display flex/block (IDs conhecidos)
            const modalIds = [
                'viewModal', 'historyViewModal', 'modalTrashBin',
                'modalListManager', 'modalUsuario', 'modalSetoresPermissoes',
                'modalPublicacao', 'modalVerPublicacao'
            ];
            let closed = false;
            for (const id of modalIds) {
                const el = document.getElementById(id);
                if (el && el.style.display && el.style.display !== 'none') {
                    // viewModal passa pelo closeModal() para respeitar o aviso de
                    // checklist com marcações pendentes (não aplicadas)
                    if (id === 'viewModal' && typeof closeModal === 'function') {
                        closeModal('viewModal');
                        closed = true;
                        break;
                    }
                    el.style.display = 'none';
                    // Fechar a publicação por ESC descarta imagens enviadas mas não publicadas
                    if (id === 'modalPublicacao' && typeof window._discardSessionImgBlobs === 'function') {
                        window._discardSessionImgBlobs('pub');
                    }
                    closed = true;
                    break;
                }
            }
            if (!closed) {
                // Modais dinâmicos com classe genérica (fbar, setor, calendar)
                const flexModal = document.querySelector('.modal-overlay[style*="flex"], .modal-backdrop[style*="flex"]');
                if (flexModal) { flexModal.style.display = 'none'; closed = true; }
            }
            if (!closed) {
                // History drawer
                const hd = document.getElementById('historyDrawer');
                if (hd && hd.classList.contains('open')) {
                    if (typeof closeHistoryDrawer === 'function') closeHistoryDrawer();
                    closed = true;
                }
            }
            if (!closed) {
                // Form drawers (novo/editar card)
                const formDrawerIds = ['modalAuditoria', 'modalAtividades', 'modalDocumentos', 'modalManutencao', 'modalRnc'];
                for (const id of formDrawerIds) {
                    const el = document.getElementById(id);
                    if (el && el.classList.contains('open')) {
                        // Guarded: pede confirmação se houver preenchimento não salvo
                        if (typeof window.closeFormDrawerGuarded === 'function') window.closeFormDrawerGuarded();
                        else if (typeof closeFormDrawer === 'function') closeFormDrawer();
                        else el.classList.remove('open');
                        closed = true;
                        break;
                    }
                }
            }
        }
    };
            document.addEventListener('contextmenu', function(evento) {
                    evento.preventDefault();
                });

