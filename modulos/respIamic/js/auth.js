// Autenticação, cadastro e gestão de usuários

// ============================================================
// AUTENTICAÇÃO — LOGIN / USUÁRIOS
// ============================================================
async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function togglePwdVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function formatCpfInput(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/^(\d{3})(\d{0,3})/, '$1.$2');
    input.value = v;
}

function maskCpf(cpf) {
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length !== 11) return cpf || '—';
    return `${d.slice(0,3)}.***.***-${d.slice(9)}`;
}

function getInitials(fullName) {
    if (!fullName) return '?';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---- Sessão vinda do Dados LAMIC ----
// Não há mais login, senha nem cadastro próprios da Agenda. Quem entrou no Dados LAMIC chega logado.
// A lista de usuários é a do Dados LAMIC (/usuarios): todo colaborador ativo de lá entra. Aqui fica só
// o que é da Agenda, em agenda/users/{loginDados}: fullName (nome de atendente gravado nos agendamentos,
// mantido do cadastro antigo para não quebrar o vínculo), role e active (false = bloqueado na Agenda).
// Administrador do Dados é sempre administrador da Agenda.
function _mostrarAvisoLogin(msg) {
    if (window.LamicCarregando) window.LamicCarregando.fim(); 
    document.getElementById('login-overlay').style.display = 'flex';
    const el = document.getElementById('login-error');
    el.innerText = msg || 'A Agenda usa o mesmo login e senha do Dados LAMIC. Entre por lá e abra a Agenda novamente.';
    const btn = document.getElementById('btn-ir-dados');
    btn.classList.remove('hidden'); btn.classList.add('flex');
}

async function _sessaoDados(user) {
    const login = (await rootDatabase.ref(`uids/${user.uid}`).once('value')).val();
    if (!login) throw new Error('Conta sem cadastro no Dados LAMIC.');
    const perfil = (await rootDatabase.ref(`usuarios/${login}`).once('value')).val();
    if (!perfil || perfil.ativo !== true) throw new Error('Sua conta está desativada no Dados LAMIC.');
    const adminDados = perfil.grupo === 'admin';
    let u = null;
    try { u = (await database.ref(`users/${login}`).once('value')).val(); }
    catch (e) { if (!adminDados) throw new Error('Você não tem acesso à Agenda. Peça a um administrador da Agenda.'); }
    if (!adminDados && u?.active === false) throw new Error('Seu acesso à Agenda está bloqueado. Peça a um administrador da Agenda.');
    return {
        username: login,
        fullName: u?.fullName || perfil.nome || login,
        role: adminDados ? 'admin' : (u?.role || 'user'),
        active: true
    };
}

// Chamado no carregamento: resolve a sessão e só então inicia a aplicação (as regras do banco
// exigem login, então nenhum listener pode ser ligado antes).
function iniciarComDados(iniciarApp) {
    let iniciado = false;
    fbAuth.onAuthStateChanged(async (user) => {
        if (!user) {
            if (iniciado) return location.reload();
            return _mostrarAvisoLogin();
        }
        if (iniciado) return;
        try {
            currentUser = await _sessaoDados(user);
        } catch (err) {
            currentUser = null;
            return _mostrarAvisoLogin(err.message);
        }
        iniciado = true;
        document.getElementById('login-overlay').style.display = 'none';
        if (window.LamicCarregando) window.LamicCarregando.fim(); 
        _ocultarCamposDeSenha();
        iniciarApp();
        updateUserBadge();
        updateConfigSectionVisibility();
        showNotification(`Bem-vindo, ${currentUser.fullName.split(' ')[0]}!`, 'success');
    });
}

// Senha e CPF agora são do Dados LAMIC: some com esses campos dos modais.
function _ocultarCamposDeSenha() {
    ['modal-reg-pwd', 'modal-reg-pwd-confirm', 'edit-user-pwd', 'edit-user-pwd-confirm', 'edit-user-cpf'].forEach(id => {
        const el = document.getElementById(id);
        const box = el?.closest('.relative')?.parentElement || el?.parentElement;
        if (box) box.style.display = 'none';
    });
    const senhaBox = document.getElementById('myaccount-old-pwd')?.closest('.border-t');
    if (senhaBox) senhaBox.innerHTML = '<p class="text-[11px] text-slate-500 font-bold">A senha é a do Dados LAMIC. Para trocar, use o ícone de chave no Dados.</p>';
    const btnSenha = document.querySelector('[onclick="saveMyAccountPassword()"]');
    if (btnSenha) btnSenha.style.display = 'none';
}

function showLoginForm() {}
function showRegisterForm() {}

function populateRegAttendentesList() {
    const dl1 = document.getElementById('reg-atendentes-list');
    const dl2 = document.getElementById('modal-reg-atendentes-list');
    const opts = atendentesList.map(n => `<option value="${n}">`).join('');
    if (dl1) dl1.innerHTML = opts;
    if (dl2) dl2.innerHTML = opts;
}

// Dá acesso à Agenda a uma conta do Dados LAMIC (admin).
async function submitRegister() {
    const fullName = document.getElementById('modal-reg-fullname').value.trim();
    const username = document.getElementById('modal-reg-username').value.trim().toLowerCase();
    const errorEl = document.getElementById('modal-register-error');
    const erro = (m) => { errorEl.innerText = m; errorEl.classList.remove('hidden'); };
    errorEl.classList.add('hidden');

    if (!fullName || !username) return erro('Preencha nome e login.');
    if (atendentesList.length > 0 && !atendentesList.includes(fullName)) return erro('O nome deve corresponder a um atendente da lista.');
    if (!/^[a-z0-9]{1,14}$/.test(username)) return erro('Login inválido.');
    const perfil = (await rootDatabase.ref(`usuarios/${username}`).once('value')).val();
    if (!perfil) return erro('Login não encontrado no Dados LAMIC. Crie a conta lá primeiro.');
    if ((await database.ref(`users/${username}`).once('value')).val()) return erro('Este login já tem acesso à Agenda.');

    const newUser = { username, fullName, role: 'user', active: true, createdAt: new Date().toISOString() };
    await database.ref(`users/${username}`).set(newUser);
    document.getElementById('modal-create-user').classList.remove('active');
    clearCreateUserForm();
    showNotification('Acesso liberado!', 'success');
    addUserAuditLog('user_create', newUser);
    renderUsersTable();
}

function clearCreateUserForm() {
    ['modal-reg-fullname','modal-reg-username'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('modal-register-error').classList.add('hidden');
}

async function logoutUser() {
    currentUser = null;
    try { await fbAuth.signOut(); } catch (e) { /* já saiu */ }
    location.reload();
}

// O badge do cabeçalho foi removido; a identidade do usuário aparece só no drawer
function updateUserBadge() {
    if (!currentUser) return;
    syncDrawerUser();
}

function updateConfigSectionVisibility() {
    if (isAdmin()) {
        renderUsersTable();
        loadAllowRegistrationToggle();
    }
    switchConfigTab('usuarios');
}

async function loadAllowRegistrationToggle() {
    const snap = await database.ref('config/allowRegistration').once('value');
    const val = !!snap.val();
    const checkbox = document.getElementById('toggle-allow-registration');
    const track = document.getElementById('toggle-allow-reg-track');
    const thumb = document.getElementById('toggle-allow-reg-thumb');
    checkbox.checked = val;
    if (val) {
        track.classList.replace('bg-slate-600', 'bg-blue-500');
        thumb.style.transform = 'translateX(20px)';
    } else {
        track.classList.replace('bg-blue-500', 'bg-slate-600');
        thumb.style.transform = 'translateX(0)';
    }
}

async function saveAllowRegistration(val) {
    await database.ref('config/allowRegistration').set(val);
    const track = document.getElementById('toggle-allow-reg-track');
    const thumb = document.getElementById('toggle-allow-reg-thumb');
    if (val) {
        track.classList.replace('bg-slate-600', 'bg-blue-500');
        thumb.style.transform = 'translateX(20px)';
    } else {
        track.classList.replace('bg-blue-500', 'bg-slate-600');
        thumb.style.transform = 'translateX(0)';
    }
}

// Usuários vêm do Dados LAMIC: não há criação nem exclusão aqui.
function openCreateUserModal() {
    showNotification('Usuários são criados no Dados LAMIC (Administração › Usuários).', 'info');
}

// Junta /usuarios do Dados (fonte da lista) com as configurações da Agenda (agenda/users).
async function _usuariosDaAgenda() {
    const [dados, agenda] = await Promise.all([
        rootDatabase.ref('usuarios').once('value').then(s => s.val() || {}),
        database.ref('users').once('value').then(s => s.val() || {})
    ]);
    return Object.entries(dados)
        .filter(([, p]) => p && p.ativo === true)
        .map(([login, p]) => {
            const a = agenda[login] || {};
            const adminDados = p.grupo === 'admin';
            return {
                username: login,
                fullName: a.fullName || p.nome || login,
                nomeDados: p.nome || '',
                role: adminDados ? 'admin' : (a.role || 'user'),
                adminDados,
                active: a.active !== false
            };
        })
        .sort((x, y) => x.fullName.localeCompare(y.fullName, 'pt-BR'));
}

async function renderUsersTable() {
    let users = await _usuariosDaAgenda();
    if (_usersFilter === 'active')   users = users.filter(u => u.active !== false);
    if (_usersFilter === 'inactive') users = users.filter(u => u.active === false);
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => `
        <tr class="hover:bg-slate-50">
            <td class="px-4 py-3 font-bold text-slate-700">${u.fullName}${u.nomeDados && u.nomeDados.toUpperCase() !== u.fullName.toUpperCase() ? `<br><span class="text-[10px] font-normal text-slate-400">Dados: ${u.nomeDados}</span>` : ''}</td>
            <td class="px-4 py-3 text-slate-500 font-mono">${u.username}</td>
            <td class="px-4 py-3 text-slate-400">—</td>
            <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${u.role === 'admin' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}">${u.role === 'admin' ? 'Admin' : 'Usuário'}</span>
            </td>
            <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${u.active ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-600 border border-red-200'}">${u.active ? 'Ativo' : 'Bloqueado'}</span>
            </td>
            <td class="px-4 py-3">
                <div class="flex justify-center gap-1">
                    <button onclick="openEditUserModal('${u.username}')" title="Editar" class="h-7 w-7 rounded-lg flex items-center justify-center text-xs bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white transition-all">
                        <i class="fas fa-pen"></i>
                    </button>
                    ${u.adminDados ? '' : `<button onclick="toggleUserActive('${u.username}', ${!u.active})" title="${u.active ? 'Bloquear na Agenda' : 'Liberar na Agenda'}" class="h-7 w-7 rounded-lg flex items-center justify-center text-xs ${u.active ? 'bg-yellow-50 text-yellow-600 border border-yellow-200 hover:bg-yellow-500 hover:text-white' : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-500 hover:text-white'} transition-all">
                        <i class="fas ${u.active ? 'fa-user-slash' : 'fa-user-check'}"></i>
                    </button>
                    <button onclick="toggleUserRole('${u.username}', '${u.role}')" title="${u.role === 'admin' ? 'Rebaixar para Usuário' : 'Promover para Admin'}" class="h-7 w-7 rounded-lg flex items-center justify-center text-xs ${u.role === 'admin' ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-500 hover:text-white' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-blue-500 hover:text-white'} transition-all">
                        <i class="fas ${u.role === 'admin' ? 'fa-user-minus' : 'fa-user-shield'}"></i>
                    </button>`}
                </div>
            </td>
        </tr>
    `).join('');
}

async function toggleUserActive(username, newActive) {
    await database.ref(`users/${username}/active`).set(newActive);
    renderUsersTable();
}

async function toggleUserRole(username, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await database.ref(`users/${username}/role`).set(newRole);
    renderUsersTable();
}

// Filtro de status na tabela de usuários
let _usersFilter = 'all';
function setUsersFilter(filter) {
    _usersFilter = filter;
    ['all','active','inactive'].forEach(f => {
        const btn = document.getElementById(`filter-users-${f}`);
        const isActive = f === filter;
        btn.classList.toggle('bg-navy-900',    isActive);
        btn.classList.toggle('text-white',     isActive);
        btn.classList.toggle('shadow',         isActive);
        btn.classList.toggle('border-2',       !isActive);
        if (!isActive) {
            if (f === 'active')   { btn.classList.add('border-green-500','text-green-700'); btn.classList.remove('border-red-400','text-red-600'); }
            if (f === 'inactive') { btn.classList.add('border-red-400','text-red-600');     btn.classList.remove('border-green-500','text-green-700'); }
        }
    });
    renderUsersTable();
}

// Exclusão com modal de confirmação
let _pendingDeleteUsername = null;
function deleteUser() {
    showNotification('Para remover um colaborador, desative-o no Dados LAMIC.', 'info');
}
async function confirmDeleteUser() {
    document.getElementById('modal-delete-user-confirm').classList.remove('active');
}

// Modal Minha Conta
function openMyAccountModal() {
    if (!currentUser) return;
    document.getElementById('myaccount-fullname').innerText = currentUser.fullName || '—';
    document.getElementById('myaccount-username').innerText = '@' + currentUser.username;
    document.getElementById('myaccount-cpf').innerText     = '—';
    document.getElementById('myaccount-role').innerText    = currentUser.role === 'admin' ? 'Administrador' : 'Usuário';
    { const e = document.getElementById('myaccount-old-pwd'); if (e) e.value = ''; }
    { const e = document.getElementById('myaccount-new-pwd'); if (e) e.value = ''; }
    { const e = document.getElementById('myaccount-confirm-pwd'); if (e) e.value = ''; }
    document.getElementById('myaccount-error').classList.add('hidden');
    document.getElementById('modal-my-account').classList.add('active');
}
async function saveMyAccountPassword() {}

async function openEditUserModal(username) {
    const u = (await _usuariosDaAgenda()).find(x => x.username === username);
    if (!u) return;
    document.getElementById('edit-user-username').value = u.username;
    document.getElementById('edit-user-subtitle').innerText = '@' + u.username;
    document.getElementById('edit-user-fullname').value = u.fullName || '';
    // Nome vem do Dados LAMIC (ou do nome de atendente já gravado nos agendamentos): não se edita aqui.
    { const nm = document.getElementById('edit-user-fullname'); nm.readOnly = true; nm.style.opacity = '.7'; nm.title = 'Nome importado do Dados LAMIC'; }
    document.getElementById('edit-user-role').value = u.role || 'user';
    document.getElementById('edit-user-active').value = String(u.active !== false);
    document.getElementById('edit-user-error').classList.add('hidden');
    // populate datalist
    const dl = document.getElementById('edit-user-atendentes-list');
    dl.innerHTML = atendentesList.map(a => `<option value="${a}">`).join('');
    document.getElementById('modal-edit-user').classList.add('active');
}

async function saveEditUser() {
    const username = document.getElementById('edit-user-username').value;
    const fullName = document.getElementById('edit-user-fullname').value.trim();
    const role = document.getElementById('edit-user-role').value;
    const active = document.getElementById('edit-user-active').value === 'true';
    const errorEl = document.getElementById('edit-user-error');
    errorEl.classList.add('hidden');

    if (!fullName) { errorEl.innerText = 'Nome completo é obrigatório.'; errorEl.classList.remove('hidden'); return; }

    // Buscar nome atual antes de atualizar para propagar mudança nos agendamentos
    const oldData = (await _usuariosDaAgenda()).find(x => x.username === username) || {};
    const oldFullName = oldData.fullName || '';

    const updates = { fullName, role, active };

    await database.ref(`users/${username}`).update(updates);

    // Propagar mudança de nome em todos os agendamentos onde era atendente
    if (oldFullName && fullName && oldFullName.toUpperCase() !== fullName.toUpperCase()) {
        // Propaga em todas as agendas
        AGENDA_IDS.forEach(agendaId => {
            const atualizada = appointmentsDe(agendaId).map(a =>
                a.atendente && a.atendente.toUpperCase() === oldFullName.toUpperCase()
                    ? { ...a, atendente: fullName.toUpperCase() }
                    : a
            );
            setAppointments(atualizada, agendaId);
            saveAppointmentsToFirebase(agendaId);
        });
        // Atualizar badge se for o próprio usuário logado
        if (currentUser && currentUser.username === username) {
            currentUser.fullName = fullName;
            updateUserBadge();
        }
    }

    // Calcular campos alterados para o diff
    const userChanges = [];
    if (oldData.fullName !== fullName) userChanges.push({ label: 'Nome', oldVal: oldData.fullName || '—', newVal: fullName });
    if (oldData.role !== role) userChanges.push({ label: 'Papel', oldVal: oldData.role === 'admin' ? 'Admin' : 'Usuário', newVal: role === 'admin' ? 'Admin' : 'Usuário' });
    if (String(oldData.active) !== String(active)) userChanges.push({ label: 'Status', oldVal: oldData.active !== false ? 'Ativo' : 'Inativo', newVal: active ? 'Ativo' : 'Inativo' });
    if (userChanges.length > 0) addUserAuditLog('user_edit', { username, fullName }, userChanges);

    document.getElementById('modal-edit-user').classList.remove('active');
    renderUsersTable();
    showNotification('Usuário atualizado com sucesso.', 'success');
}

let _pendingAuditDeleteId = null;

function deleteAuditLogEntry(id) {
    if (!isAdmin()) return;
    _pendingAuditDeleteId = id;
    document.getElementById('modal-audit-delete-confirm').classList.add('active');
}

function confirmAuditDeleteEntry() {
    const id = _pendingAuditDeleteId;
    _pendingAuditDeleteId = null;
    document.getElementById('modal-audit-delete-confirm').classList.remove('active');
    if (!id) return;
    auditLog = auditLog.filter(e => e.id !== id);
    database.ref(`auditLog/${id}`).remove().catch(console.error);
    renderHistoryList();
    renderTraceability();
}
// ============================================================
