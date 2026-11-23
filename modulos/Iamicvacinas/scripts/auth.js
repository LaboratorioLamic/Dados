// ─── AUTHENTICATION & PERMISSIONS (from index.html lines ~5789-6134) ─────────

function hashPwd(pwd) {
    let h = 5381;
    for (let i = 0; i < pwd.length; i++) h = Math.imul(h, 33) ^ pwd.charCodeAt(i);
    return (h >>> 0).toString(36);
}

function hasPerm(perm) {
    if (!currentUser) return false;
    const u = appUsers.find(x => x.id == currentUser.id);
    if (!u) return false;
    if (u.isAdmin) return true;
    const g = appGroups.find(x => x.id == u.grupoId);
    return g ? (g.permissions || []).includes(perm) : false;
}

// Só quem pode aplicar vacina (marcar status "Aplicado") edita Lote/Aplicador.
// Para os demais os campos ficam bloqueados — a informação de estoque é suprida
// pela legenda de doses disponíveis abaixo do campo Vacina.
function canEditLoteAplicador() {
    return isCurrentUserAdmin() || hasPerm('aplicar');
}

function isCurrentUserAdmin() {
    if (!currentUser) return false;
    const u = appUsers.find(x => x.id == currentUser.id);
    return u ? !!u.isAdmin : false;
}

// Exibe notificação e retorna false se sem permissão; retorna true se ok
function checkPerm(perm) {
    if (isCurrentUserAdmin() || hasPerm(perm)) return true;
    showNotification('Acesso negado: você não tem permissão para esta ação.', 'error');
    return false;
}

// Retorna html se o usuário tem a permissão, senão string vazia
function permBtn(perm, html) {
    return (isCurrentUserAdmin() || hasPerm(perm)) ? html : '';
}

// ─── LOGIN PELO DADOS LAMIC ────────────────────────────────────────────────────
// Sem login próprio: entra quem está logado no Dados LAMIC, ativo, e é admin ou tem a permissão
// "Acessar o ImunoGest" (Dados › Grupos e permissões › Vacinas). As regras do banco exigem o mesmo.
// appUsers continua guardando grupo, funções (vendedor/aplicador) e admin do ImunoGest; o vínculo com a
// conta do Dados fica em appUsers[i].dadosLogin. O id numérico do usuário NUNCA muda (auditoria e contatos
// apontam para ele). Publicações guardam o NOME (aplicador, vendedor, pagoPor, usuario, autor): se o nome
// no Dados for diferente, todas as referências são renomeadas juntas (renomearReferencias).
const DADOS_URL = 'https://laboratoriolamic.github.io/Dados/';
// Link "LAMIC Vacinas" no Dados (módulo Agendas). Se o link for recriado, troque aqui e em firebase/database.rules.json (nó vacinas).
const MODULO_VACINAS = '-P6y5YhNCv--m3yiKH3J', LINK_VACINAS = '-P6y5YhNCv--m3yiKH3G';
let dadosSessao = null;   // { login, perfil, cpf }
const _nomeChave = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const _cpfDig = s => String(s || '').replace(/\D/g, '');
const _cpfMasc = d => d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d;

function _telaSemAcesso(msg) {
    if (window.LamicCarregando) window.LamicCarregando.fim(); 
    const tela = document.getElementById('login-screen');
    tela.innerHTML = `<div class="m-auto bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <i class="fas fa-lock text-3xl text-slate-400 mb-3 block"></i>
        <p class="font-black text-navy-900 uppercase tracking-widest text-sm mb-2">ImunoGest</p>
        <p class="text-sm text-slate-600 mb-5">${msg}</p>
        <a href="${DADOS_URL}" class="inline-block px-5 py-2.5 bg-navy-900 text-white rounded-xl text-xs font-black uppercase">Ir para o Dados LAMIC</a></div>`;
    tela.style.display = 'flex';
    const l = document.getElementById('loading-overlay'); if (l) l.style.display = 'none';
}

// Antes de ler /vacinas: sessão ativa no Dados e permissão de acesso.
async function sessaoDados() {
    const user = await new Promise(res => { const off = firebase.auth().onAuthStateChanged(u => { off(); res(u); }); });
    if (!user) { _telaSemAcesso('O ImunoGest usa o login do Dados LAMIC. Entre por lá e abra o módulo novamente.'); return false; }
    const login = (await rootDb.ref('uids/' + user.uid).once('value')).val();
    const perfil = login ? (await rootDb.ref('usuarios/' + login).once('value')).val() : null;
    if (!perfil || perfil.ativo !== true) { _telaSemAcesso('Sua conta está desativada no Dados LAMIC.'); return false; }
    // Acesso = mesmo critério do link "LAMIC Vacinas" no Dados: admin, quem edita módulos (vê todos os links)
    // ou grupo com o link liberado (grupos/{g}/links/{id}; grupo antigo sem a lista usa modulos/{m}/grupos/{g}).
    let ok = perfil.grupo === 'admin';
    if (!ok && perfil.grupo) {
        const g = (await rootDb.ref(`grupos/${perfil.grupo}`).once('value')).val() || {};
        ok = g.perms?.modulos_gerenciar === true || (g.links ? g.links[LINK_VACINAS] === true
            : (await rootDb.ref(`modulos/${MODULO_VACINAS}/grupos/${perfil.grupo}`).once('value')).val() === true);
    }
    if (!ok) { _telaSemAcesso('Seu grupo no Dados LAMIC não tem acesso ao ImunoGest. Peça a um administrador para liberar o link "LAMIC Vacinas" no seu grupo (Dados LAMIC › Grupos e permissões).'); return false; }
    let cpf = '';
    try { cpf = _cpfDig((await rootDb.ref(`privado/${login}/cpf`).once('value')).val()); } catch (e) {}
    dadosSessao = { login, perfil, cpf };
    return true;
}

// Troca o nome antigo pelo novo em tudo que guarda o nome do usuário. Devolve quantos registros mudaram.
function renomearReferencias(antigo, novo) {
    const k = _nomeChave(antigo);
    if (!k || antigo === novo) return 0;
    let n = 0;
    const troca = (obj, campo) => { if (obj && obj[campo] && _nomeChave(obj[campo]) === k) { obj[campo] = novo; n++; } };
    appointments.forEach(a => { troca(a, 'aplicador'); troca(a, 'vendedor'); troca(a, 'pagoPor'); });
    stockMovements.forEach(m => troca(m, 'usuario'));
    patientContacts.forEach(c => troca(c, 'autor'));
    return n;
}

// Depois de carregar /vacinas: acha (ou cria) o registro do usuário logado. Ordem: vínculo já feito → CPF → nome completo.
function vincularUsuarioAtual() {
    const { login, perfil, cpf } = dadosSessao;
    const admin = perfil.grupo === 'admin';
    let u = appUsers.find(x => x.dadosLogin === login);
    if (!u && cpf) u = appUsers.find(x => !x.dadosLogin && _cpfDig(x.cpf) === cpf);
    if (!u) { const m = appUsers.filter(x => !x.dadosLogin && _nomeChave(x.nome) === _nomeChave(perfil.nome)); if (m.length === 1) u = m[0]; }
    let mudouUsers = false, mudouDados = false;
    if (!u) {
        u = { id: Date.now(), nome: String(perfil.nome || login).toUpperCase().trim(), cpf: _cpfMasc(cpf), login, dadosLogin: login,
              grupoId: admin ? null : (appSettings.defaultGroupId || null), isAdmin: admin, isVendedor: false, isAplicador: false, ativo: true };
        appUsers.push(u); mudouUsers = true;
    }
    if (u.dadosLogin !== login) { u.dadosLogin = login; mudouUsers = true; }
    if (u.login !== login) { u.login = login; mudouUsers = true; }
    if (u.senhaHash) { delete u.senhaHash; mudouUsers = true; }
    if (cpf && _cpfDig(u.cpf) !== cpf) { u.cpf = _cpfMasc(cpf); mudouUsers = true; }
    const nomeDados = String(perfil.nome || '').toUpperCase().trim();
    if (nomeDados && u.nome !== nomeDados) {
        if (renomearReferencias(u.nome, nomeDados)) mudouDados = true;
        u.nome = nomeDados; mudouUsers = true;
    }
    if (admin && !u.isAdmin) { u.isAdmin = true; mudouUsers = true; }
    if (u.ativo === false && !admin) { _telaSemAcesso('Seu acesso ao ImunoGest está inativo. Fale com o administrador.'); return false; }
    if (mudouDados) _fbSaveNow();
    if (mudouUsers) saveUsersData();
    currentUser = { id: u.id, login: u.login, nome: u.nome };
    return true;
}

function initAuth() {
    // Sessão já validada em sessaoDados()/vincularUsuarioAtual() (init.js)
    document.getElementById('login-screen').style.display = 'none';
    updateUserUI();
}

function _initAuthAntigo() {
    const adminExists = appUsers.some(u => u.isAdmin);
    const screen = document.getElementById('login-screen');

    if (!adminExists) {
        document.getElementById('login-card').classList.add('hidden');
        document.getElementById('first-admin-card').classList.remove('hidden');
        screen.style.display = 'flex';
        return;
    }

    // Valida sessão existente
    if (currentUser) {
        const u = appUsers.find(x => x.id == currentUser.id && x.login === currentUser.login);
        if (u) { screen.style.display = 'none'; updateUserUI(); return; }
    }

    document.getElementById('login-card').classList.remove('hidden');
    document.getElementById('first-admin-card').classList.add('hidden');
    document.getElementById('register-card').classList.add('hidden');
    updateSelfRegisterUI();
    screen.style.display = 'flex';
}

function showRegisterCard() {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('register-card').classList.remove('hidden');
    document.getElementById('register-form').reset();
    document.getElementById('register-error').classList.add('hidden');
    document.getElementById('reg-pwd-match-msg').classList.add('hidden');
}

function hideRegisterCard() {
    document.getElementById('register-card').classList.add('hidden');
    document.getElementById('login-card').classList.remove('hidden');
}

function checkRegisterPwdMatch() {
    const senha  = document.getElementById('reg-user-senha').value;
    const senha2 = document.getElementById('reg-user-senha2').value;
    const msgEl  = document.getElementById('reg-pwd-match-msg');
    const btn    = document.getElementById('register-submit-btn');
    if (!senha2) { msgEl.classList.add('hidden'); btn.disabled = false; return; }
    msgEl.classList.remove('hidden');
    if (senha === senha2) {
        msgEl.className = 'text-[10px] font-black mt-1 text-emerald-600';
        msgEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i>As senhas conferem.';
        btn.disabled = false;
    } else {
        msgEl.className = 'text-[10px] font-black mt-1 text-red-600';
        msgEl.innerHTML = '<i class="fas fa-times-circle mr-1"></i>As senhas não conferem.';
        btn.disabled = true;
    }
}

function doRegister(e) {
    e.preventDefault();
    const errEl = document.getElementById('register-error');
    const msgEl = document.getElementById('register-error-msg');
    errEl.classList.add('hidden');

    if (!appSettings.allowSelfRegister) { msgEl.textContent = 'Autocadastro desativado. Contate um administrador.'; errEl.classList.remove('hidden'); return; }
    if (!appSettings.defaultGroupId || !appGroups.some(g => g.id == appSettings.defaultGroupId)) {
        msgEl.textContent = 'Nenhum grupo padrão configurado. Contate um administrador.'; errEl.classList.remove('hidden'); return;
    }

    const nome   = document.getElementById('reg-user-nome').value.trim().toUpperCase();
    const cpf    = document.getElementById('reg-user-cpf').value.trim();
    const login  = document.getElementById('reg-user-login').value.trim();
    const senha  = document.getElementById('reg-user-senha').value;
    const senha2 = document.getElementById('reg-user-senha2').value;

    if (!nome) { msgEl.textContent = 'Informe o nome completo.'; errEl.classList.remove('hidden'); return; }
    if (!/^[a-z0-9]+$/.test(login)) { msgEl.textContent = 'O login deve conter apenas letras minúsculas e números, sem espaços ou caracteres especiais.'; errEl.classList.remove('hidden'); return; }
    if (appUsers.some(u => u.login === login)) { msgEl.textContent = 'Este login já está em uso.'; errEl.classList.remove('hidden'); return; }
    if (appUsers.some(u => u.nome === nome)) { msgEl.textContent = 'Já existe um usuário cadastrado com este nome completo.'; errEl.classList.remove('hidden'); return; }
    const cpfDigits = cpf.replace(/\D/g, '');
    if (cpfDigits && appUsers.some(u => (u.cpf || '').replace(/\D/g, '') === cpfDigits)) { msgEl.textContent = 'Já existe um usuário cadastrado com este CPF.'; errEl.classList.remove('hidden'); return; }
    if (senha.length < 6) { msgEl.textContent = 'A senha deve ter ao menos 6 caracteres.'; errEl.classList.remove('hidden'); return; }
    if (senha !== senha2) { msgEl.textContent = 'As senhas não conferem.'; errEl.classList.remove('hidden'); return; }

    const newUser = { id: Date.now(), nome, cpf, login, senhaHash: hashPwd(senha), grupoId: appSettings.defaultGroupId, isAdmin: false, ativo: true, isVendedor: true };
    appUsers.push(newUser);
    saveUsersData();
    logAudit('Criado', 'usuario', newUser.id, nome, `Autocadastro · Login: ${login}`);

    currentUser = { id: newUser.id, login: newUser.login, nome: newUser.nome };
    localStorage.setItem('ig_session', JSON.stringify(currentUser));
    document.getElementById('login-screen').style.display = 'none';
    updateUserUI();
    if (typeof updateContactsBadge === 'function') updateContactsBadge();
    if (typeof updateSemLoteBadge === 'function') updateSemLoteBadge();
    const firstTab = getFirstAllowedTab();
    if (firstTab) switchTab(firstTab);
    showNotification(`Bem-vindo, ${newUser.nome.split(' ')[0]}!`, 'success');
}

function toggleLoginPwd() {
    const inp = document.getElementById('senha-input');
    const eye = document.getElementById('login-eye');
    if (inp.type === 'password') { inp.type = 'text'; eye.className = 'fas fa-eye-slash text-sm'; }
    else { inp.type = 'password'; eye.className = 'fas fa-eye text-sm'; }
}

function createFirstAdmin(e) {
    e.preventDefault();
    const nome   = document.getElementById('admin-nome').value.trim().toUpperCase();
    const cpf    = document.getElementById('admin-cpf').value.trim();
    const login  = document.getElementById('admin-login').value.trim();
    const senha  = document.getElementById('admin-senha').value;
    const senha2 = document.getElementById('admin-senha2').value;
    const errEl  = document.getElementById('admin-error');
    const msgEl  = document.getElementById('admin-error-msg');
    errEl.classList.add('hidden');

    if (!/^[a-z0-9]+$/.test(login)) { msgEl.textContent = 'O login deve conter apenas letras minúsculas e números, sem espaços ou caracteres especiais.'; errEl.classList.remove('hidden'); return; }
    if (appUsers.some(u => u.login === login)) { msgEl.textContent = 'Este login já está em uso.'; errEl.classList.remove('hidden'); return; }
    if (appUsers.some(u => u.nome === nome)) { msgEl.textContent = 'Já existe um usuário cadastrado com este nome completo.'; errEl.classList.remove('hidden'); return; }
    const cpfDigitsAdmin = cpf.replace(/\D/g, '');
    if (cpfDigitsAdmin && appUsers.some(u => (u.cpf || '').replace(/\D/g, '') === cpfDigitsAdmin)) { msgEl.textContent = 'Já existe um usuário cadastrado com este CPF.'; errEl.classList.remove('hidden'); return; }
    if (senha !== senha2) { msgEl.textContent = 'As senhas não conferem.'; errEl.classList.remove('hidden'); return; }
    if (senha.length < 6) { msgEl.textContent = 'A senha deve ter ao menos 6 caracteres.'; errEl.classList.remove('hidden'); return; }

    const admin = { id: Date.now(), nome, cpf, login, senhaHash: hashPwd(senha), grupoId: null, isAdmin: true };
    appUsers.push(admin);
    saveUsersData();
    currentUser = { id: admin.id, login: admin.login, nome: admin.nome };
    localStorage.setItem('ig_session', JSON.stringify(currentUser));
    logAudit('Criado', 'usuario', admin.id, admin.nome, `Administrador inicial · Login: ${admin.login}`);
    document.getElementById('login-screen').style.display = 'none';
    updateUserUI();
    if (typeof updateContactsBadge === 'function') updateContactsBadge();
    if (typeof updateSemLoteBadge === 'function') updateSemLoteBadge();
    showNotification(`Bem-vindo, ${admin.nome.split(' ')[0]}!`, 'success');
}

function doLogin(e) {
    e.preventDefault();
    const login  = document.getElementById('login-input').value.trim();
    const senha  = document.getElementById('senha-input').value;
    const errEl  = document.getElementById('login-error');
    const msgEl  = document.getElementById('login-error-msg');
    errEl.classList.add('hidden');

    if (!/^[a-z0-9]+$/.test(login)) { msgEl.textContent = 'Login inválido: use apenas letras minúsculas e números.'; errEl.classList.remove('hidden'); return; }
    const user = appUsers.find(u => u.login === login && u.senhaHash === hashPwd(senha));
    if (!user) { msgEl.textContent = 'Login ou senha incorretos.'; errEl.classList.remove('hidden'); return; }
    if (user.ativo === false) { msgEl.textContent = 'Usuário inativo. Contate o administrador.'; errEl.classList.remove('hidden'); return; }

    currentUser = { id: user.id, login: user.login, nome: user.nome };
    localStorage.setItem('ig_session', JSON.stringify(currentUser));
    document.getElementById('login-screen').style.display = 'none';
    updateUserUI();
    if (typeof updateContactsBadge === 'function') updateContactsBadge();
    if (typeof updateSemLoteBadge === 'function') updateSemLoteBadge();
    const firstTab = getFirstAllowedTab();
    if (firstTab) switchTab(firstTab);
    showNotification(`Bem-vindo, ${user.nome.split(' ')[0]}!`, 'success');
}

function doLogout() {
    // Sai do Dados LAMIC (vale para todos os módulos) e volta para a página do Dados
    currentUser = null;
    firebase.auth().signOut().catch(() => {}).then(() => { location.href = DADOS_URL; });
}

function getFirstAllowedTab() {
    const admin = isCurrentUserAdmin();
    const order = [
        { tab: 'dashboard', perm: 'ver_dashboard' },
        { tab: 'agenda',    perm: 'ver_agenda'    },
        { tab: 'dados',     perm: 'ver_tabela'    },
        { tab: 'pacientes', perm: 'ver_pacientes' },
        { tab: 'vacinas',   perm: 'ver_vacinas'   },
    ];
    for (const { tab, perm } of order) {
        if (admin || hasPerm(perm)) return tab;
    }
    return null;
}

function applyPermissions() {
    if (!currentUser) return;

    // Sempre oculta o aviso de acesso restrito ao re-aplicar permissões
    const avisoExistente = document.getElementById('aviso-sem-permissao');
    if (avisoExistente) avisoExistente.classList.add('hidden');

    const admin      = isCurrentUserAdmin();
    const canDash    = admin || hasPerm('ver_dashboard');
    const canFinanc  = admin || hasPerm('ver_dash_financeiro');
    const canAgenda  = admin || hasPerm('ver_agenda');
    const canTabela  = admin || hasPerm('ver_tabela');
    const canPacTab  = admin || hasPerm('ver_pacientes');
    const canVacTab  = admin || hasPerm('ver_vacinas');
    const canCfg     = admin || hasPerm('ver_configuracoes');
    const canAgendar = admin || hasPerm('criar_agendamento');
    const canPac     = admin || hasPerm('adicionar_paciente');
    const canVac     = admin || hasPerm('criar_produtos');
    const canPdf     = admin || hasPerm('baixar_pdf');

    // Sub-views de agenda — Planilha/Kanban requerem ver_tabela
    ['btn-agendaview-planilha', 'btn-agendaview-kanban'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = canTabela ? '' : 'none';
    });

    // Sub-aba Aprazamento (Oportunidades) — exclusiva de quem pode aplicar vacina
    const canAprazar = admin || hasPerm('aplicar');
    const btnAprazamento = document.getElementById('btn-opp-sub-aprazamento');
    if (btnAprazamento) btnAprazamento.style.display = canAprazar ? '' : 'none';
    // Sem permissão, cai para "Oferta" se o Aprazamento estiver aberto
    if (!canAprazar && typeof _oppSubTab !== 'undefined' && _oppSubTab === 'aprazamento'
        && typeof switchOppSubTab === 'function') {
        switchOppSubTab('oferta');
    }

    // Tabs — oculta botões sem permissão
    const tabVisibility = {
        'btn-dashboard': canDash,
        'btn-agenda':    canAgenda,
        'btn-pacientes': canPacTab,
        'btn-vacinas':   canVacTab,
    };
    for (const [id, can] of Object.entries(tabVisibility)) {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = can ? '' : 'none';
    }

    // Botão Financeiro no dashboard
    const btnFinanceiro = document.getElementById('dash-tab-btn-financeiro');
    if (btnFinanceiro) {
        btnFinanceiro.style.display = canFinanc ? '' : 'none';
        if (!canFinanc && dashView === 'financeiro') switchDashView('analitico');
    }

    // Redireciona se a aba atual não é permitida
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
        const activeId = activeTab.id.replace('tab-', '');
        const tabPerms = { dashboard: canDash, agenda: canAgenda, dados: canTabela, pacientes: canPacTab, vacinas: canVacTab };
        if (tabPerms[activeId] === false) {
            const next = getFirstAllowedTab();
            if (next) {
                switchTab(next);
            } else {
                // Nenhuma aba disponível — oculta conteúdo e mostra aviso
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                let aviso = document.getElementById('aviso-sem-permissao');
                if (!aviso) {
                    aviso = document.createElement('div');
                    aviso.id = 'aviso-sem-permissao';
                    aviso.className = 'flex flex-col items-center justify-center h-full py-32 gap-4 text-center';
                    aviso.innerHTML = `
                        <div class="bg-red-50 border border-red-200 rounded-2xl px-10 py-8 max-w-md">
                            <i class="fas fa-lock text-4xl text-red-400 mb-4"></i>
                            <p class="text-base font-black text-red-700 mb-1">Acesso restrito</p>
                            <p class="text-sm text-red-500">Você não tem permissão para acessar nenhuma aba. Entre em contato com um administrador.</p>
                        </div>`;
                    document.querySelector('main') && document.querySelector('main').appendChild(aviso);
                }
                aviso.classList.remove('hidden');
            }
        } else {
            const aviso = document.getElementById('aviso-sem-permissao');
            if (aviso) aviso.classList.add('hidden');
        }
    }

    // Engrenagem de configurações
    const gearBtn = document.getElementById('btn-settings');
    if (gearBtn) gearBtn.style.display = canCfg ? '' : 'none';

    // Botões de ação nos cabeçalhos de seção
    const el = (id) => document.getElementById(id);
    if (el('btn-agendar-agenda')) el('btn-agendar-agenda').style.display = canAgendar ? '' : 'none';
    if (el('btn-novo-tabela'))    el('btn-novo-tabela').style.display    = canAgendar ? '' : 'none';
    if (el('btn-view-kanban'))    el('btn-view-kanban').style.display    = canAgendar ? '' : 'none';
    if (el('btn-novo-paciente'))  el('btn-novo-paciente').style.display  = canPac     ? '' : 'none';
    if (el('fab-nova-vacina'))    el('fab-nova-vacina').style.display    = canVac     ? '' : 'none';
    if (el('btn-pdf-prontuario')) el('btn-pdf-prontuario').style.display = canPdf     ? '' : 'none';

    // Módulos do almoxarifado — oculta botões de nav sem permissão
    const canEstoque  = admin || hasPerm('leitura_estoque') || hasPerm('criar_produtos') || hasPerm('edicao_lotes') || hasPerm('edicao_movimentacao');
    const canProdutos = admin || hasPerm('criar_produtos');
    const canLotes    = admin || hasPerm('edicao_lotes');
    const canMov      = admin || hasPerm('edicao_movimentacao');
    if (el('alm-btn-estoque'))      el('alm-btn-estoque').style.display      = canEstoque  ? '' : 'none';
    if (el('alm-btn-produtos'))     el('alm-btn-produtos').style.display     = canProdutos ? '' : 'none';
    if (el('alm-btn-lotes'))        el('alm-btn-lotes').style.display        = canLotes    ? '' : 'none';
    if (el('alm-btn-movimentacao')) el('alm-btn-movimentacao').style.display = canMov      ? '' : 'none';
    // Redireciona para primeiro módulo permitido se o atual ficou oculto
    if (typeof almoxModulo !== 'undefined') {
        const moduloOk = { estoque: canEstoque, produtos: canProdutos, lotes: canLotes, movimentacao: canMov };
        if (!moduloOk[almoxModulo]) {
            const primeiro = ['estoque','produtos','lotes','movimentacao'].find(m => moduloOk[m]);
            if (primeiro) switchAlmoxModulo(primeiro);
        }
    }

    // Botão "Agendar neste dia" no modal do dia
    const btnDia = el('btn-agendar-dia');
    if (btnDia && !btnDia.dataset.holidayHidden) {
        btnDia.style.display = canAgendar ? '' : 'none';
    }

    // Aba de Unidades no modal de configurações — só quem pode gerenciá-las
    const tabUnidades = document.getElementById('settings-tab-unidades');
    if (tabUnidades) {
        const canUni = typeof canGerenciarUnidades === 'function' && canGerenciarUnidades();
        tabUnidades.style.display = canUni ? '' : 'none';
        if (!canUni && !document.getElementById('settings-content-unidades')?.classList.contains('hidden')) {
            switchSettingsTab('usuarios');
        }
    }

    // Re-renderiza listas para reflectir permissões nos botões dinâmicos
    renderVaccines();
    renderPatients();
    renderTable();
    if (typeof renderUnidadesList === 'function') renderUnidadesList();
}

function updateUserUI() {
    const el = document.getElementById('header-user-info');
    if (el && currentUser) el.textContent = currentUser.nome.split(' ')[0];
    applyPermissions();
}

// ─── MEU PERFIL ───────────────────────────────────────────────────────────────
function openMeuPerfil() {
    if (!currentUser) return;
    const u = appUsers.find(x => x.id == currentUser.id);
    if (!u) return;
    const canEdit = false;   // nome, CPF, login e senha são do Dados LAMIC
    const grupo = appGroups.find(g => g.id == u.grupoId);
    const { initials } = getDisplayName(u.nome);

    document.getElementById('perfil-avatar').textContent = initials;
    document.getElementById('perfil-role-badge').textContent = u.isAdmin ? 'Administrador Geral' : (grupo ? grupo.nome : 'Sem grupo');
    document.getElementById('perfil-grupo').value = u.isAdmin ? 'Administrador Geral' : (grupo ? grupo.nome : '—');

    const nomeEl  = document.getElementById('perfil-nome');
    const cpfEl   = document.getElementById('perfil-cpf');
    const loginEl = document.getElementById('perfil-login');
    nomeEl.value  = u.nome;
    cpfEl.value   = u.cpf || '';
    loginEl.value = u.login;

    [nomeEl, cpfEl, loginEl].forEach(el => {
        el.readOnly = !canEdit;
        el.classList.remove('bg-white','bg-slate-100','text-slate-700','text-slate-500','cursor-default');
        if (canEdit) { el.classList.add('bg-white','text-slate-700'); }
        else { el.classList.add('bg-slate-100','text-slate-500','cursor-default'); }
    });

    document.getElementById('perfil-senha-atual').value = '';
    document.getElementById('perfil-senha-nova').value = '';
    document.getElementById('perfil-senha-nova2').value = '';
    document.getElementById('perfil-aviso').classList.add('hidden');

    const podeTrocarSenha = false;   // senha é a do Dados LAMIC
    document.getElementById('perfil-secao-senha').classList.toggle('hidden', !podeTrocarSenha);

    const podeSalvar = false;
    document.getElementById('perfil-btn-salvar').classList.toggle('hidden', !podeSalvar);

    document.getElementById('modal-meu-perfil').classList.add('active');
}

function salvarMeuPerfil() {
    const u = appUsers.find(x => x.id == currentUser.id);
    if (!u) return;
    const canEdit = isCurrentUserAdmin() || hasPerm('criar_editar_usuarios');
    const avisoEl = document.getElementById('perfil-aviso');

    function showAviso(msg, tipo) {
        avisoEl.className = `flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] font-black ${tipo === 'erro' ? 'bg-red-50 border border-red-300 text-red-600' : 'bg-green-50 border border-green-300 text-green-700'}`;
        avisoEl.innerHTML = `<i class="fas ${tipo === 'erro' ? 'fa-exclamation-circle' : 'fa-check-circle'} mt-0.5 shrink-0"></i><span>${msg}</span>`;
        avisoEl.classList.remove('hidden');
        setTimeout(() => avisoEl.classList.add('hidden'), 4000);
    }

    const senhaAtual = document.getElementById('perfil-senha-atual').value;
    const senhaNova  = document.getElementById('perfil-senha-nova').value;
    const senhaNova2 = document.getElementById('perfil-senha-nova2').value;
    let alterou = false;

    if (canEdit) {
        const novoNome  = document.getElementById('perfil-nome').value.trim().toUpperCase();
        const novoCpf   = document.getElementById('perfil-cpf').value.trim();
        const novoLogin = document.getElementById('perfil-login').value.trim();
        if (!novoNome || !novoLogin) { showAviso('Nome e login são obrigatórios.', 'erro'); return; }
        if (!/^[a-z0-9]+$/.test(novoLogin)) { showAviso('Login inválido: use apenas letras minúsculas e números.', 'erro'); return; }
        const loginDup = appUsers.find(x => x.login === novoLogin && x.id != u.id);
        if (loginDup) { showAviso('Este login já está em uso por outro usuário.', 'erro'); return; }
        const oldFlat = {nome: u.nome, cpf: u.cpf || '', login: u.login};
        u.nome = novoNome; u.cpf = novoCpf; u.login = novoLogin;
        const changes = computeChanges(oldFlat, {nome: u.nome, cpf: u.cpf, login: u.login}, {nome:'Nome', cpf:'CPF', login:'Login'});
        if (changes.length) { logAudit('Editado', 'usuario', u.id, u.nome, null, changes); alterou = true; }
        if (currentUser.id == u.id) {
            currentUser.nome = u.nome; currentUser.login = u.login;
            localStorage.setItem('ig_session', JSON.stringify(currentUser));
            updateUserUI();
        }
    }

    if (senhaNova || senhaAtual) {
        if (!senhaAtual) { showAviso('Informe a senha atual para alterá-la.', 'erro'); return; }
        if (hashPwd(senhaAtual) !== u.senhaHash) { showAviso('Senha atual incorreta.', 'erro'); return; }
        if (!senhaNova || senhaNova.length < 6) { showAviso('A nova senha deve ter ao menos 6 caracteres.', 'erro'); return; }
        if (senhaNova !== senhaNova2) { showAviso('As novas senhas não conferem.', 'erro'); return; }
        u.senhaHash = hashPwd(senhaNova);
        logAudit('Editado', 'usuario', u.id, u.nome, 'Senha alterada pelo próprio usuário');
        alterou = true;
    }

    if (!alterou) { showAviso('Nenhuma alteração detectada.', 'erro'); return; }
    saveUsersData();
    showNotification('Perfil atualizado com sucesso!', 'success');
    document.getElementById('perfil-senha-atual').value = '';
    document.getElementById('perfil-senha-nova').value = '';
    document.getElementById('perfil-senha-nova2').value = '';
    document.getElementById('modal-meu-perfil').classList.remove('active');
}
