// === GRUPOS DE USUÁRIOS + AUTO-CADASTRO ===
// /userGroups   → [{ id, name, perms:{ ...mesmas permissões do usuário } }]
// /authSettings → { allowSignup, defaultGroupId }
// Usuário com grupoId herda dinamicamente as permissões do grupo (aplicadas em
// _normalizeUser no load/listener). Sem grupo = "Personalizado" (permissões próprias).
// isAdmin nunca vem do grupo: continua sendo decisão individual.

    var userGroups = [];
    var authSettings = { allowSignup: false, defaultGroupId: null };
    let _userGroupsListener = null;
    let editingGroupIndex = null;
    let _userModalMode = 'usuario';

    function getUserGroup(id) {
        if (!id) return null;
        return userGroups.find(g => g.id === id) || null;
    }

    // Cópia normalizada das permissões de um grupo, no mesmo formato dos campos do usuário
    function _groupPermsCopy(group) {
        const p = (group && group.perms) || {};
        return {
            canEditCards:   _normTriPerm(p.canEditCards,   'total'),
            canDeleteCards: _normTriPerm(p.canDeleteCards, 'nao'),
            canManageLists: !!p.canManageLists,
            canManagePubs:  _normTriPerm(p.canManagePubs,  'total'),
            canPublish: p.canPublish || 'total',
            canChecklist: p.canChecklist || 'total',
            taskView: p.taskView || 'todos',
            rncCanEdit: _normTriPerm(p.rncCanEdit, 'total'),
            rncTaskView: p.rncTaskView || 'todos',
            canManageOc: p.canManageOc || 'total',
            canManageMotivos: p.canManageMotivos || 'total',
            canViewOc: p.canViewOc || 'total',
            canManageReu: _normTriPerm(p.canManageReu, 'parcial'),
            listasPermitidas: typeof window._listasDe === 'function' ? window._listasDe(p) : (p.canManageLists ? 'todas' : []),
            tabs: Array.isArray(p.tabs) && p.tabs.length ? p.tabs.slice() : ['dashboard', 'auditoria'],
            allowedSetores: Array.isArray(p.allowedSetores) ? p.allowedSetores.slice() : [],
            allowedTiposOc: Array.isArray(p.allowedTiposOc) ? p.allowedTiposOc.slice() : null
        };
    }

    // Campos de "Abas e Restrições" — podem ser personalizados por usuário mesmo com grupo
    const RESTR_KEYS = ['tabs', 'allowedSetores', 'allowedTiposOc'];

    // Aplica (no lugar) as permissões do grupo ao usuário. Grupo inexistente: mantém a
    // última cópia gravada no próprio usuário. Com customRestr, abas/setores/tipos
    // continuam sendo os do próprio usuário.
    function _applyGroupPerms(u) {
        if (!u || !u.grupoId) return u;
        const g = getUserGroup(u.grupoId);
        if (!g) return u;
        const perms = _groupPermsCopy(g);
        if (u.customRestr === true) RESTR_KEYS.forEach(k => delete perms[k]);
        Object.assign(u, perms);
        u.grupo = g.name;
        if (typeof window._regraSetores === 'function') window._regraSetores(u);
        return u;
    }

    function _reapplyGroupsToUsers() {
        if (typeof users === 'undefined' || !Array.isArray(users)) return;
        users.forEach(_applyGroupPerms);
    }

    function _normalizeGroups(raw) {
        const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
        return arr.filter(g => g && g.id && g.name).map(g => ({ id: g.id, name: String(g.name), perms: g.perms || {} }));
    }

    async function loadUserGroups() {
        const snap = await getFirebaseGet()(getFirebaseRef()(getFirebaseDatabase(), 'userGroups'));
        userGroups = _normalizeGroups(snap.exists() ? snap.val() : []);
        return userGroups;
    }

    async function saveUserGroups() {
        await getFirebaseSet()(getFirebaseRef()(getFirebaseDatabase(), 'userGroups'), userGroups);
    }

    async function loadAuthSettings() {
        const snap = await getFirebaseGet()(getFirebaseRef()(getFirebaseDatabase(), 'authSettings'));
        const v = snap.exists() ? snap.val() : {};
        authSettings = { allowSignup: v.allowSignup === true, defaultGroupId: v.defaultGroupId || null };
        return authSettings;
    }

    async function _saveAuthSettings(patch) {
        Object.assign(authSettings, patch);
        await getFirebaseUpdate()(getFirebaseRef()(getFirebaseDatabase(), 'authSettings'), patch);
    }

    function _signupEnabled() {
        return authSettings.allowSignup === true && !!getUserGroup(authSettings.defaultGroupId);
    }

    // Listener: alteração de grupo feita por outro admin propaga para esta sessão
    function startUserGroupsListener() {
        if (_userGroupsListener) return;
        const ref = getFirebaseRef()(getFirebaseDatabase(), 'userGroups');
        _userGroupsListener = getFirebaseOnValue()(ref, (snapshot) => {
            const fresh = _normalizeGroups(snapshot.exists() ? snapshot.val() : []);
            if (JSON.stringify(fresh) === JSON.stringify(userGroups)) return;
            userGroups = fresh;
            _reapplyGroupsToUsers();
            if (typeof _refreshCurrentUserPerms === 'function') _refreshCurrentUserPerms(true);
            if (typeof currentTab !== 'undefined' && currentTab === 'configuracoes') {
                renderUserGroupsTable();
                renderSignupSettings();
                if (typeof renderusersConfigTable === 'function') renderusersConfigTable();
            }
        });
    }

    function stopUserGroupsListener() {
        if (!_userGroupsListener) return;
        try { getFirebaseOff()(getFirebaseRef()(getFirebaseDatabase(), 'userGroups'), _userGroupsListener); } catch (_) {}
        _userGroupsListener = null;
    }

    const _ugToast = (msg, type) => (typeof showToast === 'function' ? showToast(msg, type) : alert(msg));
    const _ugEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ── Aba Configurações: seção Usuários | Grupos ───────────────
    window.setConfigSection = function(section) {
        const isGroups = section === 'grupos';
        document.querySelectorAll('.cfg-section-tab').forEach(b => b.classList.toggle('active', b.dataset.section === section));
        const up = document.getElementById('cfgUsersPanel');
        const gp = document.getElementById('cfgGroupsPanel');
        if (up) up.style.display = isGroups ? 'none' : '';
        if (gp) gp.style.display = isGroups ? '' : 'none';
        const title = document.getElementById('cfgPageTitle');
        const sub = document.getElementById('cfgPageSub');
        const btn = document.getElementById('cfgNewBtn');
        if (title) title.textContent = isGroups ? 'Grupos' : 'Usuários';
        if (sub) sub.textContent = isGroups ? 'Perfis de permissão herdados pelos usuários vinculados' : 'Gerencie os membros com acesso ao sistema';
        if (btn) {
            btn.innerHTML = isGroups ? '<i class="fas fa-plus"></i> Novo Grupo' : '<i class="fas fa-plus"></i> Novo Usuário';
            btn.onclick = isGroups ? () => openGroupModal(null) : () => openUserModal(null);
        }
    };

    // Chamado ao abrir a aba Configurações: recarrega grupos e configuração de cadastro
    window.renderConfigGroupsUI = async function() {
        try {
            await Promise.all([loadUserGroups(), loadAuthSettings()]);
            _reapplyGroupsToUsers();
        } catch (e) {
            console.warn('Falha ao carregar grupos/configurações de cadastro:', e);
        }
        renderUserGroupsTable();
        renderSignupSettings();
        if (typeof renderusersConfigTable === 'function') renderusersConfigTable();
    };

    function renderUserGroupsTable() {
        const tbody = document.getElementById('cfgGroupsTable');
        if (!tbody) return;
        if (userGroups.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:36px;color:#94a3b8;font-size:13px;"><i class="fas fa-users-gear" style="font-size:22px;display:block;margin-bottom:8px;opacity:.4"></i>Nenhum grupo cadastrado.</td></tr>`;
            return;
        }
        const tabLabels = { dashboard: 'Dashboard', auditoria: 'Rotinas', documentos: 'Documentos', atividades: 'Atividades', ocorrencias: 'Ocorrências', rnc: 'RNC', backup: 'Backup' };
        tbody.innerHTML = userGroups
            .map((g, idx) => ({ g, idx }))
            .sort((a, b) => a.g.name.localeCompare(b.g.name, 'pt'))
            .map(({ g, idx }) => {
                const gc = _grupoColor(g.name);
                const count = (users || []).filter(u => u.grupoId === g.id).length;
                const tabs = _groupPermsCopy(g).tabs.map(t => tabLabels[t] || t).join(', ');
                const isDefault = authSettings.defaultGroupId === g.id;
                return `
            <tr>
                <td>
                    <span class="usr-grupo-badge" style="background:${gc.bg};color:${gc.text}">${_ugEsc(g.name)}</span>
                    ${isDefault ? '<span class="grp-default-badge" title="Grupo atribuído às contas criadas pela tela de login"><i class="fas fa-user-plus"></i> Padrão do cadastro</span>' : ''}
                </td>
                <td style="color:#374151;font-size:13px">${count} usuário${count !== 1 ? 's' : ''}</td>
                <td style="color:#64748b;font-size:12.5px">${_ugEsc(tabs)}</td>
                <td>
                    <div class="usr-actions">
                        <button class="usr-action-btn edit" onclick="openGroupModal(${idx})" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="usr-action-btn del" onclick="deleteUserGroup(${idx})" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
            }).join('');
    }
    window.renderUserGroupsTable = renderUserGroupsTable;

    // ── Card "Permitir criação de contas" ────────────────────────
    function renderSignupSettings() {
        const toggle = document.getElementById('cfgAllowSignup');
        const sel = document.getElementById('cfgDefaultGroup');
        const hint = document.getElementById('cfgSignupHint');
        if (sel) {
            sel.innerHTML = '<option value="">Selecione o grupo padrão…</option>' +
                userGroups.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt'))
                    .map(g => `<option value="${_ugEsc(g.id)}">${_ugEsc(g.name)}</option>`).join('');
            sel.value = getUserGroup(authSettings.defaultGroupId) ? authSettings.defaultGroupId : '';
            sel.disabled = userGroups.length === 0;
        }
        if (toggle) toggle.checked = _signupEnabled();
        if (hint) {
            hint.textContent = userGroups.length === 0
                ? 'Crie um grupo para poder ativar o auto-cadastro.'
                : 'Usuários novos vindos do Dados LAMIC entram ativos neste grupo.';
        }
    }

    window.saveAllowSignupSetting = async function(val) {
        const toggle = document.getElementById('cfgAllowSignup');
        if (val && !getUserGroup(authSettings.defaultGroupId)) {
            if (toggle) toggle.checked = false;
            _ugToast('Selecione o grupo padrão antes de ativar o auto-cadastro.', 'warning');
            return;
        }
        try {
            await _saveAuthSettings({ allowSignup: !!val });
            _ugToast(val ? 'Auto-cadastro ativado.' : 'Auto-cadastro desativado.', 'success');
        } catch (e) {
            if (toggle) toggle.checked = !val;
            _ugToast('Erro ao salvar configuração: ' + e.message, 'error');
        }
    };

    window.saveDefaultGroupSetting = async function(groupId) {
        const patch = { defaultGroupId: groupId || null };
        // Sem grupo padrão não há como cadastrar: desliga junto
        if (!groupId && authSettings.allowSignup) patch.allowSignup = false;
        try {
            await _saveAuthSettings(patch);
            renderSignupSettings();
            renderUserGroupsTable();
            _ugToast('Grupo padrão do cadastro atualizado.', 'success');
        } catch (e) {
            _ugToast('Erro ao salvar configuração: ' + e.message, 'error');
        }
    };

    // ── Modal compartilhado (modalUsuario) em modo usuário ou grupo ──
    function setUserModalMode(mode) {
        _userModalMode = mode;
        document.querySelectorAll('#modalUsuario [data-um-mode]').forEach(el => {
            el.style.display = el.dataset.umMode === mode ? '' : 'none';
        });
        const sub = document.querySelector('#modalUsuario .um-subtitle');
        if (sub) sub.textContent = mode === 'grupo' ? 'Defina as permissões herdadas pelos membros' : 'Defina os dados e acessos';
        if (mode === 'grupo') _setPermFormLocked(false);
    }
    window.setUserModalMode = setUserModalMode;

    // locked: permissões vêm do grupo. customRestr: abas/setores/tipos liberados mesmo assim.
    function _setPermFormLocked(locked, groupName, customRestr) {
        document.querySelectorAll('#modalUsuario .um-perm-card-sel').forEach(el => { el.disabled = !!locked; });
        document.querySelectorAll('#modalUsuario .um-setores-btn').forEach(el => { el.disabled = !!locked && !customRestr; });
        document.querySelectorAll('#modalUsuario .um-perm-grid').forEach(el => el.classList.toggle('um-perm-locked', !!locked));
        // O liga/desliga só faz sentido para usuário vinculado a grupo
        const row = document.getElementById('umCustomRestrRow');
        if (row) row.style.display = locked ? 'flex' : 'none';
        const notice = document.getElementById('umGroupLockNotice');
        if (notice) {
            notice.style.display = locked ? 'flex' : 'none';
            const nm = document.getElementById('umGroupLockName');
            if (nm) nm.textContent = groupName || '';
            const extra = document.getElementById('umGroupLockExtra');
            if (extra) extra.textContent = customRestr
                ? ' Abas e restrições estão personalizadas para este usuário.'
                : ' Para alterá-las, edite o grupo ou escolha "Personalizado".';
        }
    }

    function _readRestrForm() {
        return {
            tabs: tempSelectedTabs.slice(),
            allowedSetores: tempSelectedSetores.slice(),
            allowedTiposOc: tempSelectedTiposOc ? tempSelectedTiposOc.slice() : null
        };
    }

    function _writeRestrForm(r) {
        tempSelectedTabs = r.tabs.slice();
        tempSelectedSetores = r.allowedSetores.slice();
        tempSelectedTiposOc = r.allowedTiposOc ? r.allowedTiposOc.slice() : null;
        updateAbasButtonText();
        updateSetoresButtonText();
        updateTiposOcButtonText();
    }

    function populateUserGroupSelect() {
        const sel = document.getElementById('cfgGrupoId');
        if (!sel) return;
        sel.innerHTML = '<option value="">Personalizado (sem grupo)</option>' +
            userGroups.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt'))
                .map(g => `<option value="${_ugEsc(g.id)}">${_ugEsc(g.name)}</option>`).join('');
    }
    window.populateUserGroupSelect = populateUserGroupSelect;

    // Troca de grupo no modal de usuário: grupo → carrega e trava; Personalizado → libera.
    // Com "Abas e Restrições personalizadas" ligado, preserva o que está no formulário
    // (do usuário) e só puxa do grupo as demais permissões. Desligar volta ao grupo.
    function _onUserGroupChange() {
        const sel = document.getElementById('cfgGrupoId');
        const g = getUserGroup(sel ? sel.value : null);
        if (g) {
            const custom = !!document.getElementById('cfgCustomRestr')?.checked;
            const keep = custom ? _readRestrForm() : null;
            _fillPermForm(g.perms);
            if (keep) _writeRestrForm(keep);
            _setPermFormLocked(true, g.name, custom);
        } else {
            _setPermFormLocked(false);
        }
    }
    window._onUserGroupChange = _onUserGroupChange;

    function _isCustomRestrOn() {
        return !!document.getElementById('cfgCustomRestr')?.checked;
    }
    window._isCustomRestrOn = _isCustomRestrOn;
    window._readRestrForm = _readRestrForm;

    window.openGroupModal = function(idx) {
        setUserModalMode('grupo');
        editingGroupIndex = idx;
        editinguserIndex = null; // openSetoresModal usa o usuário em edição como fallback
        const g = idx === null ? null : userGroups[idx];
        const nameEl = document.getElementById('cfgGroupName');
        if (nameEl) nameEl.value = g ? g.name : '';
        _fillPermForm(g ? g.perms : {});
        document.getElementById('usrModalTitle').textContent = g ? 'Editar Grupo' : 'Novo Grupo';
        const av = document.getElementById('usrModalAvatarLg');
        if (av) { av.innerHTML = '<i class="fas fa-users-gear"></i>'; av.style.background = g ? _grupoColor(g.name).text : ''; }
        document.querySelectorAll('.um-perm-desc').forEach(d => d.remove());
        document.querySelectorAll('.um-perm-info.active').forEach(b => b.classList.remove('active'));
        document.getElementById('modalUsuario').style.display = 'flex';
        if (nameEl) setTimeout(() => nameEl.focus(), 50);
    };

    window.saveUserModal = function() {
        return _userModalMode === 'grupo' ? saveGroupConfig() : saveuserConfig();
    };

    async function saveGroupConfig() {
        const name = (document.getElementById('cfgGroupName')?.value || '').trim();
        if (!name) { _ugToast('Informe o nome do grupo.', 'error'); return; }
        const dup = userGroups.some((g, i) => i !== editingGroupIndex && g.name.trim().toLowerCase() === name.toLowerCase());
        if (dup) { _ugToast('Já existe um grupo com esse nome.', 'error'); return; }

        const perms = _readPermForm();
        let group;
        if (editingGroupIndex === null) {
            group = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, perms };
            userGroups.push(group);
        } else {
            group = userGroups[editingGroupIndex];
            group.name = name;
            group.perms = perms;
        }

        // Propaga para os membros (herança dinâmica)
        const members = (users || []).filter(u => u.grupoId === group.id);
        members.forEach(_applyGroupPerms);

        closeModal('modalUsuario');
        editingGroupIndex = null;
        try {
            await saveUserGroups();
            if (members.length && typeof saveusers === 'function') await saveusers();
            if (members.some(u => currentuser && u.user === currentuser.user)) _refreshCurrentUserPerms(true);
            _ugToast(`Grupo salvo${members.length ? ` — ${members.length} usuário${members.length !== 1 ? 's' : ''} atualizado${members.length !== 1 ? 's' : ''}` : ''}.`, 'success');
        } catch (e) {
            _ugToast('Erro ao salvar grupo: ' + e.message, 'error');
        }
        renderUserGroupsTable();
        renderSignupSettings();
        if (typeof renderusersConfigTable === 'function') renderusersConfigTable();
    }

    window.deleteUserGroup = function(idx) {
        const g = userGroups[idx];
        if (!g) return;
        if (authSettings.defaultGroupId === g.id) {
            _ugToast('Este é o grupo padrão do auto-cadastro. Escolha outro grupo padrão antes de excluí-lo.', 'warning');
            return;
        }
        const members = (users || []).filter(u => u.grupoId === g.id);
        const extra = members.length
            ? `<br><span style="font-size:12px;color:#94a3b8;">${members.length} usuário${members.length !== 1 ? 's' : ''} vinculado${members.length !== 1 ? 's' : ''} passará${members.length !== 1 ? 'ão' : ''} a Personalizado, mantendo as permissões atuais.</span>`
            : '<br><span style="font-size:12px;color:#94a3b8;">Esta ação não pode ser desfeita.</span>';
        _showConfirmDialog({
            title: 'Excluir Grupo',
            message: `Deseja realmente excluir o grupo <strong>${_ugEsc(g.name)}</strong>?${extra}`,
            confirmLabel: 'Excluir',
            confirmClass: 'confirm-dlg-btn--danger',
            onConfirm: async () => {
                members.forEach(u => { u.grupoId = null; u.grupo = ''; });
                userGroups = userGroups.filter(x => x.id !== g.id);
                try {
                    await saveUserGroups();
                    if (members.length) await saveusers();
                    _ugToast('Grupo excluído.', 'success');
                } catch (e) {
                    _ugToast('Erro ao excluir grupo: ' + e.message, 'error');
                }
                renderUserGroupsTable();
                renderSignupSettings();
                if (typeof renderusersConfigTable === 'function') renderusersConfigTable();
            }
        });
    };

    // ── Tela de login: auto-cadastro ─────────────────────────────
    function _withTimeout(promise, ms) {
        return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo de conexão esgotado.')), ms))]);
    }

    // Mostra/oculta o link "Criar conta". Fora de sessão, a conexão é fechada logo
    // após a leitura (mesma economia de conexões simultâneas do logout).
    async function refreshSignupAvailability() {
        const link = document.getElementById('btnShowSignup');
        if (link) link.style.display = 'none';
        return; // contas nascem no Dados LAMIC
        if (!window.firebaseDatabase) { setTimeout(refreshSignupAvailability, 1000); return; }
        try {
            try { if (typeof window.firebaseGoOnline === 'function') window.firebaseGoOnline(); } catch (_) {}
            await _withTimeout(Promise.all([loadAuthSettings(), loadUserGroups()]), 10000);
            link.style.display = _signupEnabled() ? '' : 'none';
        } catch (e) {
            link.style.display = 'none';
        } finally {
            if (!currentuser && !window._authBusy) {
                window._intentionalOffline = true;
                try { if (typeof window.firebaseGoOffline === 'function') window.firebaseGoOffline(); } catch (_) {}
            }
        }
    }
    window.refreshSignupAvailability = refreshSignupAvailability;

    function _signupError(msg) {
        const el = document.getElementById('signupError');
        if (el) el.textContent = msg || '';
    }

    // Login do cadastro: minúsculas, sem acento, sem espaço; só letras, números e ponto
    // (sem ponto no início nem repetido). Mantém o cursor no lugar ao filtrar.
    window.maskLoginInput = function(el) {
        const raw = el.value;
        const clean = v => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            .replace(/[^a-z0-9.]/g, '').replace(/\.{2,}/g, '.').replace(/^\./, '');
        const next = clean(raw);
        if (next === raw) return;
        const caret = clean(raw.slice(0, el.selectionStart || 0)).length;
        el.value = next;
        try { el.setSelectionRange(caret, caret); } catch (_) {}
    };

    window.showSignupForm = function() {
        ['signupName', 'signupUser', 'signupCpf', 'signupCargo', 'signupPassword', 'signupPasswordConfirm'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        _signupError('');
        document.getElementById('loginBox').style.display = 'none';
        document.getElementById('signupBox').style.display = '';
        setTimeout(() => document.getElementById('signupName')?.focus(), 50);
    };

    window.showLoginForm = function() {
        const sb = document.getElementById('signupBox');
        if (sb) sb.style.display = 'none';
        const lb = document.getElementById('loginBox');
        if (lb) lb.style.display = '';
    };

    window.submitSignup = async function() {
        return _signupError('Contas são criadas no Dados LAMIC.');
        const btn = document.getElementById('btnSignup');
        if (!btn || btn.disabled) return;
        const v = id => (document.getElementById(id)?.value || '');
        const name = v('signupName').trim();
        const login = v('signupUser').trim();
        const cpf = v('signupCpf').trim();
        const cargo = v('signupCargo').trim();
        const senha = v('signupPassword');
        const confirma = v('signupPasswordConfirm');

        if (!name || !login || !senha) return _signupError('Preencha Nome, Login e Senha.');
        if (!/^[a-z0-9]+(\.[a-z0-9]+)*$/.test(login) || login.length < 3) return _signupError('Login deve ter ao menos 3 caracteres: letras minúsculas, números e ponto (ex: joao.silva).');
        if (login.toLowerCase() === 'admin') return _signupError('Este login é reservado.');
        if (senha.length < 6) return _signupError('A senha deve ter pelo menos 6 caracteres.');
        if (senha !== confirma) return _signupError('A confirmação de senha não confere.');
        if (cpf && cpf.replace(/\D/g, '').length !== 11) return _signupError('CPF incompleto.');
        _signupError('');

        btn.disabled = true;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando conta...';
        window._authBusy = true;
        let created = false;
        try {
            try { if (typeof window.firebaseGoOnline === 'function') window.firebaseGoOnline(); } catch (_) {}
            window._intentionalOffline = false;
            // Re-lê a configuração: o admin pode ter desligado o cadastro depois que a tela abriu
            await _withTimeout(Promise.all([loadAuthSettings(), loadUserGroups()]), 15000);
            if (!_signupEnabled()) throw new Error('O cadastro de novas contas está desativado.');
            const group = getUserGroup(authSettings.defaultGroupId);

            const newUser = {
                id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                name, user: login, password: await hashPassword(senha), cpf, cargo,
                ..._groupPermsCopy(group),
                grupoId: group.id, grupo: group.name,
                active: true, isAdmin: false,
                createdVia: 'autocadastro', createdAt: Date.now()
            };

            // Append atômico: não sobrescreve edições concorrentes e recusa login duplicado
            let duplicate = false;
            const res = await getFirebaseRunTransaction()(getFirebaseRef()(getFirebaseDatabase(), 'passwords'), (cur) => {
                if (cur !== null && !Array.isArray(cur)) return; // formato inesperado: aborta sem tocar
                const arr = cur || [];
                duplicate = arr.some(u => String((u && (u.user || u.User)) || '').trim().toLowerCase() === login.toLowerCase());
                if (duplicate) return;
                arr.push(newUser);
                return arr;
            });
            if (!res.committed) throw new Error(duplicate ? 'Já existe um usuário com esse login.' : 'Não foi possível criar a conta. Tente novamente.');
            created = true;
        } catch (e) {
            _signupError(e.message || String(e));
        } finally {
            btn.disabled = false;
            btn.innerHTML = oldHtml;
            window._authBusy = false;
        }

        if (created) {
            // Login automático com a conta recém-criada
            showLoginForm();
            document.getElementById('userInput').value = login;
            document.getElementById('passwordInput').value = senha;
            if (typeof checkLogin === 'function') checkLogin();
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        ['signupName', 'signupUser', 'signupCpf', 'signupCargo', 'signupPassword', 'signupPasswordConfirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitSignup(); });
        });
        refreshSignupAvailability();
    });
