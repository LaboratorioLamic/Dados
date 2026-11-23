// ===== Configurações (somente admin): Usuários, Cargos, Unidades, Benefícios, Parâmetros =====

const TIPOS_CARGO = ['Operacional', 'Administrativo', 'Gestão', 'Estágio', 'Aprendizagem', 'Diretoria'];
const TIPOS_BENEFICIO = ['Plano de saúde', 'Plano odontológico', 'Vale alimentação', 'Vale refeição', 'Vale transporte', 'Seguro de vida', 'Educação', 'Outro'];

const CFG_TABS = [
    { id: 'usuarios', label: 'Usuários' },
    { id: 'grupos', label: 'Grupos e permissões' },
    { id: 'cargos', label: 'Cargos' },
    { id: 'unidades', label: 'Unidades' },
    { id: 'beneficios', label: 'Benefícios' },
    { id: 'parametros', label: 'Parâmetros' },
    // Sem gate extra aqui: a página Configurações inteira já é adminOnly (ver registerPage
    // abaixo) — todo mundo que chega nesta aba já é administrador.
    { id: 'backup', label: 'Backup' }
];
let cfgTab = 'usuarios';

registerPage({
    id: 'config',
    title: 'Configurações',
    icon: 'settings',
    order: 6,
    adminOnly: true,
    render(el) {
        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Configurações</h2>
                    <div class="page-sub">Dados mestres do sistema — alimentam todos os módulos e KPIs.</div>
                </div>
            </div>
            <div class="tabs" id="cfgTabs">
                ${CFG_TABS.map(t => `<div class="tab${t.id === cfgTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
            </div>
            <div class="mt-16" id="cfgContent"></div>`;

        el.querySelectorAll('#cfgTabs .tab').forEach(tab => {
            tab.onclick = () => {
                cfgTab = tab.dataset.tab;
                el.querySelectorAll('#cfgTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
                renderCfgTab();
            };
        });
        renderCfgTab();
    }
});

function cfgLoading() {
    document.getElementById('cfgContent').innerHTML =
        '<div class="loading-center"><div class="spinner-dark"></div></div>';
}

function renderCfgTab() {
    cfgLoading();
    ({
        usuarios: renderCfgUsuarios,
        grupos: renderCfgGrupos,
        cargos: renderCfgCargos,
        unidades: renderCfgUnidades,
        beneficios: renderCfgBeneficios,
        parametros: renderCfgParametros,
        backup: renderCfgBackup
    })[cfgTab]().catch(e => {
        console.error(e);
        document.getElementById('cfgContent').innerHTML =
            emptyState({ icon: 'alert', title: 'Erro ao carregar', text: e.message || 'Tente novamente.' });
    });
}

// Toolbar + tabela genérica com busca
function cfgList({ searchPh, btnLabel, thead, rowsHtml, onNew, emptyText }) {
    const cont = document.getElementById('cfgContent');
    cont.innerHTML = `
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="cfgSearch" placeholder="${searchPh}"></div>
                <div class="grow"></div>
                <button class="btn btn-primary" id="cfgNew">${icon('plus')} ${btnLabel}</button>
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>${thead}</tr></thead>
                    <tbody id="cfgTbody">${rowsHtml || ''}</tbody>
                </table>
            </div>
        </div>`;
    if (!rowsHtml) {
        document.getElementById('cfgTbody').innerHTML =
            `<tr><td colspan="10"><div class="table-empty">${icon('search')}<span>${emptyText}</span></div></td></tr>`;
    }
    document.getElementById('cfgNew').onclick = onNew;
    document.getElementById('cfgSearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#cfgTbody tr[data-search]').forEach(tr =>
            tr.style.display = tr.dataset.search.includes(q) ? '' : 'none');
    });
}

function cfgRowActions(tr, items) {
    const btn = tr.querySelector('.btn-icon[data-menu]');
    if (btn) btn.onclick = e => { e.stopPropagation(); openPopover(btn, items); };
}

// ============ USUÁRIOS ============
// A lista é a do Dados LAMIC (/usuarios): não se cria nem exclui usuário aqui. Cada colaborador ativo
// de lá aparece; o RH só guarda o acesso dele (rh_usuarios, ligado pelo campo login): administrador,
// grupo de permissões e ativo. Quem não tem registro aparece como "Sem acesso".
async function usuariosDoDados() {
    const [dados, rh] = await Promise.all([DB.getObj('usuarios'), DB.getAll(PATHS.usuarios)]);
    const porLogin = new Map(rh.filter(u => u.login).map(u => [String(u.login).toLowerCase(), u]));
    return Object.entries(dados || {})
        .filter(([, p]) => p && p.ativo === true)
        .map(([login, p]) => {
            const r = porLogin.get(login);
            return r
                ? { ...r, login, nome: p.nome || r.nome, cpf: null, adminDados: p.grupo === 'admin' }
                : { id: null, login, nome: p.nome || login, admin: false, ativo: false, grupoId: null, semAcesso: true, adminDados: p.grupo === 'admin' };
        })
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}

async function renderCfgUsuarios() {
    const [usuarios, grupos] = await Promise.all([usuariosDoDados(), carregarGrupos(true)]);
    const grupoNome = id => grupos.find(g => g.id === id)?.nome;

    cfgList({
        searchPh: 'Buscar usuário...',
        btnLabel: 'Criar no Dados LAMIC',
        emptyText: 'Nenhum usuário cadastrado.',
        thead: '<th>Usuário</th><th>Login</th><th>Perfil</th><th>Grupo de acesso</th><th>Status</th><th style="width:48px"></th>',
        rowsHtml: usuarios.map(u => {
            const gNome = grupoNome(u.grupoId);
            const grupoCell = (u.admin || u.adminDados)
                ? '<span class="text-2">Acesso total</span>'
                : gNome
                    ? `<span class="badge badge-info">${escapeHtml(gNome)}</span>`
                    : u.grupoId
                        ? '<span class="badge badge-warning">Grupo removido</span>'
                        : '<span class="badge badge-neutral">Sem grupo</span>';
            return `
            <tr data-id="${u.login}" data-search="${escapeHtml((u.nome + ' ' + u.login).toLowerCase())}">
                <td><div class="flex"><div class="avatar">${iniciais(u.nome)}</div><strong>${escapeHtml(u.nome)}</strong></div></td>
                <td class="text-2">${escapeHtml(u.login)}</td>
                <td>${(u.admin || u.adminDados) ? '<span class="badge badge-accent">Administrador</span>' : '<span class="badge badge-neutral">Usuário</span>'}</td>
                <td>${grupoCell}</td>
                <td>${u.adminDados ? '<span class="badge badge-success">Admin do Dados</span>' : u.semAcesso ? '<span class="badge badge-neutral">Sem acesso</span>' : u.ativo !== false ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-danger">Inativo</span>'}</td>
                <td><button class="btn-icon" data-menu>${icon('dots')}</button></td>
            </tr>`; }).join(''),
        onNew: () => window.open(DADOS_URL, '_blank')
    });

    document.querySelectorAll('#cfgTbody tr[data-id]').forEach(tr => {
        const u = usuarios.find(x => x.login === tr.dataset.id);
        cfgRowActions(tr, [
            { label: u.semAcesso ? 'Dar acesso ao RH' : 'Editar acesso', icon: 'edit', onClick: () => formUsuario(u, usuarios, grupos) }
        ]);
    });
}

function formUsuario(u, usuarios, grupos = gruposCache || []) {
    const isEdit = !!u?.id;
    const m = openModal({
        title: 'Acesso ao RH',
        size: 'modal-lg',
        body: `
            <div class="form-section">
                <div class="form-section-title">Identificação</div>
                <div class="field"><label>Nome completo <span class="req">*</span></label><input class="input" id="fuNome" readonly value="${escapeHtml(u?.nome || '')}"></div>
                <div class="form-row" style="margin-bottom:0">
                    <div class="field" style="margin-bottom:0"><label>Login <span class="req">*</span></label><input class="input" id="fuLogin" readonly value="${escapeHtml(u?.login || '')}"><div class="field-hint">Nome, login, senha e CPF são do Dados LAMIC.</div></div>
                    <div class="field" style="display:none"><label>CPF</label><input class="input" id="fuCpf" inputmode="numeric" placeholder="000.000.000-00" value="${escapeHtml(u?.cpf || '')}"></div>
                </div>
            </div>

            <div class="form-section">
                <div class="form-section-title">Acesso</div>
                <div class="toggle-cards">
                    <label class="toggle-card">
                        <div class="grow"><strong>Ativo</strong><span>Pode entrar no RH</span></div>
                        <span class="switch"><input type="checkbox" id="fuAtivo" ${u && !u.semAcesso && u.ativo !== false ? 'checked' : (u?.semAcesso ? 'checked' : '')}><span class="track"></span></span>
                    </label>
                    <label class="toggle-card">
                        <div class="grow"><strong>Administrador</strong><span>Acesso total ao sistema</span></div>
                        <span class="switch"><input type="checkbox" id="fuAdmin" ${u?.admin ? 'checked' : ''}><span class="track"></span></span>
                    </label>
                </div>
            </div>

            <div class="form-section" id="fuGrupoWrap" style="margin-bottom:0">
                <div class="form-section-title">Grupo de acesso <span class="req">*</span></div>
                <div class="field-hint" style="margin:-4px 0 12px">As permissões vêm do grupo. Para ajustar o que este usuário pode fazer, edite o grupo na aba <strong>Grupos e permissões</strong>.</div>
                ${grupos.length ? `
                <div class="grupo-picker" id="fuGrupos">
                    ${grupos.map(g => {
                        const n = permKeysAtivas(g.perms).length;
                        return `
                        <label class="grupo-opt">
                            <input type="radio" name="fuGrupo" value="${g.id}" ${u?.grupoId === g.id ? 'checked' : ''}>
                            <span class="grupo-opt-body">
                                <span class="grupo-opt-ico">${icon('lock')}</span>
                                <span class="grupo-opt-txt">
                                    <strong>${escapeHtml(g.nome)}</strong>
                                    <small>${g.descricao ? escapeHtml(g.descricao) : `${n} permiss${n === 1 ? 'ão' : 'ões'}`}</small>
                                </span>
                                <span class="grupo-opt-check">${icon('check')}</span>
                            </span>
                        </label>`; }).join('')}
                </div>`
                : `<div class="rec-empty">Nenhum grupo criado ainda. Crie um grupo na aba <strong>Grupos e permissões</strong> antes de atribuir acesso — ou marque este usuário como Administrador.</div>`}
            </div>`,
        footer: ''
    });

    const cpfInput = m.body.querySelector('#fuCpf');
    cpfInput.addEventListener('input', () => cpfInput.value = maskCPF(cpfInput.value));

    const adminChk = m.body.querySelector('#fuAdmin');
    const grupoWrap = m.body.querySelector('#fuGrupoWrap');
    // Admin ignora o grupo (acesso total): esmaece e destrava a exigência de escolher um grupo.
    const syncPerms = () => {
        grupoWrap.style.opacity = adminChk.checked ? '.45' : '1';
        grupoWrap.style.pointerEvents = adminChk.checked ? 'none' : '';
    };
    adminChk.onchange = syncPerms;
    syncPerms();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>Salvar</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        const nome = m.body.querySelector('#fuNome').value.trim();
        const login = m.body.querySelector('#fuLogin').value.trim().toLowerCase().replace(/^@/, '');
        const cpf = cpfInput.value.trim();
        const admin = adminChk.checked;
        const ativo = m.body.querySelector('#fuAtivo').checked;

        const grupoId = admin ? null : (m.body.querySelector('input[name="fuGrupo"]:checked')?.value || null);

        if (!nome || !login) return toast('Preencha nome e login.', 'error');
        if (cpf && !validaCPF(cpf)) return toast('CPF inválido.', 'error');
        const perfilDados = await DB.getObj(`usuarios/${login}`).catch(() => null);
        if (!/^[a-z0-9]{1,14}$/.test(login) || !perfilDados) return toast('Login não encontrado no Dados LAMIC. Crie a conta lá primeiro.', 'error');
        if (!admin && !grupoId) return toast('Selecione um grupo de acesso ou marque o usuário como Administrador.', 'error');

        // Proteção: não deixar o sistema sem administrador ativo
        if (isEdit && u.admin && (!admin || !ativo)) {
            const admins = usuarios.filter(x => (x.admin || x.adminDados) && x.ativo !== false && x.login !== u.login);
            if (admins.length === 0) return toast('O sistema precisa de ao menos um administrador ativo.', 'error');
        }

        // As permissões vivem no grupo — o usuário guarda só o vínculo (grupoId). Zera o `perms`
        // legado para não conflitar com o grupo na hora de resolver o acesso.
        const data = { nome, login, admin, ativo, grupoId, perms: null, senhaHash: null, cpf: null };
        if (!isEdit) data.criadoEm = hoje();

        await DB.save(PATHS.usuarios, u?.id || null, data);
        // Libera (ou bloqueia) os nós rh_* nas regras do banco para este login.
        const antigo = (u?.login || '').toLowerCase();
        const acesso = { [`${PATHS.acesso}/${login}`]: ativo ? true : null };
        if (antigo && antigo !== login) acesso[`${PATHS.acesso}/${antigo}`] = null;
        await db.ref().update(acesso);

        // Editou a si mesmo → re-resolve as permissões (podem ter mudado de grupo) e atualiza UI
        if (login === currentUser.login) {
            await carregarGrupos(true);
            const perms = await resolverPerms({ admin, grupoId, perms: null });
            setSession({ ...currentUser, nome, login, admin, grupoId, grupoNome: grupoId ? (grupoPorId(grupoId)?.nome || null) : null, perms });
            renderSidebar();
        }
        toast('Acesso salvo.');
        m.close();
        renderCfgTab();
    };
}

// ============ GRUPOS E PERMISSÕES ============
// As permissões vivem aqui, no grupo. O usuário só aponta para um grupo (ver formUsuario).

// Chaves de permissão marcadas como true num objeto de perms.
function permKeysAtivas(perms) {
    return PERM_KEYS.filter(k => perms && perms[k]);
}

// Todas as chaves de permissão que um módulo (e seus sub-itens) controla.
function chavesDoModulo(m) {
    return [
        ...(m.acoes || []).map(a => a.key),
        ...(m.viewCoarse ? [m.viewCoarse] : []),
        ...(m.subs || []).map(s => s.ver)
    ];
}

// Resumo textual do que um grupo libera (para o card da lista).
function resumoGrupo(perms) {
    const mods = PERM_MODULOS.filter(m => chavesDoModulo(m).some(k => perms?.[k])).map(m => m.label);
    const sens = PERM_SENSIVEIS.filter(s => perms?.[s.key]).map(s => s.label);
    return [...mods, ...sens];
}

// Grupos padrão sugeridos — criados sob demanda no estado vazio.
function gruposPadrao() {
    const on = (...keys) => { const p = {}; keys.forEach(k => p[k] = true); return p; };
    const todos = on(...PERM_KEYS);
    // Abas de Lançamentos não-financeiras (as operacionais).
    const abasOperacionais = PERM_LANC_SUBS.filter(s => !s.fin).map(s => s.ver);
    return [
        { nome: 'Administração RH', descricao: 'Acesso completo a todos os módulos, incluindo valores financeiros e dados médicos.', perms: todos },
        {
            nome: 'Operação RH', descricao: 'Cadastra e gerencia funcionários e lançamentos do dia a dia. Sem folha nem valores financeiros.',
            perms: on('ver_dashboard', 'ver_funcionarios', 'editar_funcionarios', 'editar_lancamentos', 'ver_resultados', 'ver_medico', 'ver_disciplinar', ...abasOperacionais)
        },
        {
            nome: 'Consulta', descricao: 'Somente leitura dos módulos operacionais. Não altera nada e não vê valores nem dados médicos.',
            perms: on('ver_dashboard', 'ver_funcionarios', 'ver_resultados', ...abasOperacionais)
        }
    ];
}

async function renderCfgGrupos() {
    const [grupos, usuarios] = await Promise.all([
        carregarGrupos(true).then(gs => [...gs].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))),
        DB.getAll(PATHS.usuarios)
    ]);
    const membrosDe = id => usuarios.filter(u => !u.admin && u.grupoId === id).length;
    const cont = document.getElementById('cfgContent');

    if (!grupos.length) {
        cont.innerHTML = `
            <div class="grupos-empty">
                <div class="grupos-empty-ico">${icon('lock')}</div>
                <h3>Organize o acesso por grupos</h3>
                <p>Em vez de marcar permissões usuário por usuário, crie <strong>grupos de acesso</strong> — cada usuário herda as permissões do seu grupo. Mudou a regra do grupo, mudou para todo mundo nele.</p>
                <div class="flex" style="justify-content:center;gap:10px;flex-wrap:wrap;margin-top:4px">
                    <button class="btn btn-primary" id="grpNew">${icon('plus')} Criar grupo</button>
                    <button class="btn btn-secondary" id="grpSeed">${icon('check')} Criar grupos padrão</button>
                </div>
            </div>`;
        document.getElementById('grpNew').onclick = () => formGrupo(null, grupos);
        document.getElementById('grpSeed').onclick = async () => {
            if (!await confirmDialog({ title: 'Criar grupos padrão', message: 'Serão criados 3 grupos sugeridos: <strong>Administração RH</strong>, <strong>Operação RH</strong> e <strong>Consulta</strong>. Você pode editá-los depois. Continuar?', confirmText: 'Criar' })) return;
            for (const g of gruposPadrao()) await DB.save(PATHS.grupos, null, { ...g, criadoEm: hoje() });
            toast('Grupos padrão criados.');
            renderCfgTab();
        };
        return;
    }

    cont.innerHTML = `
        <div class="table-toolbar" style="margin-bottom:16px">
            <div class="cfg-tab-intro">As permissões do sistema vivem no grupo. Atribua um grupo a cada usuário na aba <strong>Usuários</strong>.</div>
            <div class="grow"></div>
            <button class="btn btn-primary" id="grpNew">${icon('plus')} Novo grupo</button>
        </div>
        <div class="grupos-grid">
            ${grupos.map(g => {
                const resumo = resumoGrupo(g.perms);
                const nMembros = membrosDe(g.id);
                const nPerms = permKeysAtivas(g.perms).length;
                return `
                <div class="grupo-card" data-id="${g.id}">
                    <div class="grupo-card-head">
                        <div class="grupo-card-ico">${icon('lock')}</div>
                        <div class="grow">
                            <div class="grupo-card-nome">${escapeHtml(g.nome)}</div>
                            <div class="grupo-card-membros">${icon('users')} ${nMembros} usuário${nMembros === 1 ? '' : 's'}</div>
                        </div>
                        <button class="btn-icon" data-menu>${icon('dots')}</button>
                    </div>
                    ${g.descricao ? `<div class="grupo-card-desc">${escapeHtml(g.descricao)}</div>` : ''}
                    <div class="grupo-card-perms">
                        ${nPerms ? resumo.map(r => `<span class="perm-tag">${escapeHtml(r)}</span>`).join('')
                            : '<span class="perm-tag perm-tag-none">Sem permissões</span>'}
                    </div>
                    <div class="grupo-card-foot">
                        <button class="btn btn-secondary btn-sm" data-edit>${icon('edit')} Editar permissões</button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;

    document.getElementById('grpNew').onclick = () => formGrupo(null, grupos);
    cont.querySelectorAll('.grupo-card').forEach(card => {
        const g = grupos.find(x => x.id === card.dataset.id);
        const abrir = () => formGrupo(g, grupos);
        card.querySelector('[data-edit]').onclick = abrir;
        card.querySelector('[data-menu]').onclick = e => {
            e.stopPropagation();
            openPopover(e.currentTarget, [
                { label: 'Editar', icon: 'edit', onClick: abrir },
                { label: 'Duplicar', icon: 'plus', onClick: () => formGrupo({ nome: `${g.nome} (cópia)`, descricao: g.descricao, perms: { ...g.perms } }, grupos, true) },
                'sep',
                {
                    label: 'Excluir', icon: 'trash', danger: true, onClick: async () => {
                        const n = membrosDe(g.id);
                        if (n) return toast(`Não é possível excluir: ${n} usuário(s) neste grupo. Mova-os para outro grupo antes.`, 'error');
                        if (await confirmDialog({ title: 'Excluir grupo', message: `Excluir o grupo <strong>${escapeHtml(g.nome)}</strong>?`, confirmText: 'Excluir', danger: true })) {
                            await DB.remove(PATHS.grupos, g.id);
                            toast('Grupo excluído.');
                            renderCfgTab();
                        }
                    }
                }
            ]);
        };
    });
}

// Matriz de permissões em ÁRVORE: cada módulo é uma linha; módulos com sub-itens (Lançamentos)
// expandem para mostrar as abas de dentro, cada uma com seu toggle de Visualizar. Tudo
// liga/desliga com switch.
function permMatrixHtml(perms) {
    const sw = key => `<span class="switch"><input type="checkbox" data-perm="${key}" ${perms?.[key] ? 'checked' : ''}><span class="track"></span></span>`;
    const acaoLabel = a => `
        <label class="perm-act" title="${PERM_ACOES[a.tipo].desc}">
            <span class="perm-act-txt"><strong>${PERM_ACOES[a.tipo].label}</strong><small>${PERM_ACOES[a.tipo].desc}</small></span>
            ${sw(a.key)}
        </label>`;

    const modHtml = mod => {
        // Módulo com sub-itens (árvore expansível)
        if (mod.subs) {
            const g = mod.acoes.find(a => a.tipo === 'gerenciar');
            return `
            <div class="perm-mod perm-mod-tree" data-mod="${mod.id}">
                <div class="perm-mod-row">
                    <button type="button" class="perm-expand" data-expand aria-expanded="true" title="Expandir/recolher">${icon('chevronDown')}</button>
                    <span class="perm-mod-ico">${icon(mod.icon)}</span>
                    <div class="perm-mod-txt grow"><strong>${mod.label}</strong><small>${mod.desc}</small></div>
                    ${g ? acaoLabel(g) : ''}
                </div>
                <div class="perm-subs" data-subs>
                    <div class="perm-sub-head">
                        <span>${icon('eye')} Abas visíveis</span>
                        <button type="button" class="perm-subs-all" data-subs-all>Marcar todas</button>
                    </div>
                    ${mod.subs.map(s => `
                        <label class="perm-sub" title="Ver a aba ${s.label}">
                            <span class="perm-sub-line"></span>
                            <span class="grow">${s.label}${s.fin ? ' <span class="perm-sub-fin" title="Também exige Valores financeiros">requer financeiro</span>' : ''}</span>
                            ${sw(s.ver)}
                        </label>`).join('')}
                </div>
            </div>`;
        }
        // Módulo simples (ações lado a lado)
        return `
            <div class="perm-mod" data-mod="${mod.id}">
                <div class="perm-mod-info">
                    <span class="perm-mod-ico">${icon(mod.icon)}</span>
                    <div class="perm-mod-txt"><strong>${mod.label}</strong><small>${mod.desc}</small></div>
                </div>
                <div class="perm-mod-acts">${mod.acoes.map(acaoLabel).join('')}</div>
            </div>`;
    };

    return `
        <div class="perm-matrix">
            <div class="perm-matrix-head">
                <div class="perm-matrix-title">Módulos do sistema</div>
                <button type="button" class="btn btn-ghost btn-sm" data-toggle-all>${icon('check')} Atribuir todos</button>
            </div>
            ${PERM_MODULOS.map(modHtml).join('')}

            <div class="perm-matrix-title" style="margin-top:18px">Dados sensíveis</div>
            <div class="perm-sens">
                ${PERM_SENSIVEIS.map(s => `
                    <label class="perm-sens-card">
                        <span class="perm-mod-ico">${icon(s.icon)}</span>
                        <span class="grow perm-mod-txt"><strong>${s.label}</strong><small>${s.desc}</small></span>
                        ${sw(s.key)}
                    </label>`).join('')}
            </div>
        </div>`;
}

function formGrupo(g, grupos = [], isDuplicate = false) {
    const isEdit = !!g?.id;
    const m = openModal({
        title: isEdit ? 'Editar grupo' : 'Novo grupo de acesso',
        size: 'modal-lg',
        body: `
            <div class="form-section">
                <div class="form-section-title">Identificação</div>
                <div class="field"><label>Nome do grupo <span class="req">*</span></label>
                    <input class="input" id="fgNome" placeholder="Ex: Operação RH" value="${escapeHtml(g?.nome || '')}"></div>
                <div class="field" style="margin-bottom:0"><label>Descrição</label>
                    <input class="input" id="fgDesc" placeholder="O que este grupo pode fazer (opcional)" value="${escapeHtml(g?.descricao || '')}"></div>
            </div>
            <div class="form-section" style="margin-bottom:0">
                <div class="form-section-title">Permissões</div>
                <div class="field-hint" style="margin:-4px 0 12px">Abra <strong>Lançamentos</strong> para liberar aba por aba (Férias, ASO, Faltas...). <strong>Gerenciar</strong> = incluir, alterar e excluir.</div>
                ${permMatrixHtml(expandirPerms(g?.perms || {}))}
            </div>`,
        footer: ''
    });

    const checks = () => [...m.body.querySelectorAll('[data-perm]')];
    // "Atribuir todos" vira "Limpar todos" quando tudo já está ligado.
    const btnAll = m.body.querySelector('[data-toggle-all]');
    const syncAllBtn = () => {
        const all = checks().every(c => c.checked);
        btnAll.innerHTML = `${icon(all ? 'x' : 'check')} ${all ? 'Limpar todos' : 'Atribuir todos'}`;
    };
    btnAll.onclick = () => {
        const all = checks().every(c => c.checked);
        checks().forEach(c => c.checked = !all);
        syncAllBtn();
    };
    checks().forEach(c => c.addEventListener('change', syncAllBtn));
    syncAllBtn();

    // Expandir/recolher os módulos com sub-itens
    m.body.querySelectorAll('[data-expand]').forEach(btn => {
        btn.onclick = () => {
            const tree = btn.closest('.perm-mod-tree');
            const aberto = tree.classList.toggle('collapsed');
            btn.setAttribute('aria-expanded', String(!aberto));
        };
    });
    // "Marcar todas" / "Limpar todas" as abas de um módulo
    m.body.querySelectorAll('[data-subs-all]').forEach(btn => {
        const subChecks = () => [...btn.closest('.perm-mod-tree').querySelectorAll('.perm-sub [data-perm]')];
        const sync = () => btn.textContent = subChecks().every(c => c.checked) ? 'Limpar todas' : 'Marcar todas';
        btn.onclick = () => {
            const all = subChecks().every(c => c.checked);
            subChecks().forEach(c => c.checked = !all);
            sync(); syncAllBtn();
        };
        subChecks().forEach(c => c.addEventListener('change', sync));
        sync();
    });

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Criar grupo'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        const nome = m.body.querySelector('#fgNome').value.trim();
        if (!nome) return toast('Informe o nome do grupo.', 'error');
        if (grupos.some(x => x.id !== g?.id && (x.nome || '').toLowerCase() === nome.toLowerCase()))
            return toast('Já existe um grupo com este nome.', 'error');

        const perms = {};
        checks().forEach(c => { if (c.checked) perms[c.dataset.perm] = true; });

        const data = { nome, descricao: m.body.querySelector('#fgDesc').value.trim(), perms };
        if (!isEdit) data.criadoEm = hoje();
        await DB.save(PATHS.grupos, g?.id || null, data);
        await carregarGrupos(true);

        // Editou um grupo que inclui o próprio usuário logado → re-resolve o acesso na hora.
        if (isEdit && currentUser && !currentUser.admin && currentUser.grupoId === g.id) {
            const novas = await resolverPerms(currentUser);
            setSession({ ...currentUser, perms: novas, grupoNome: nome });
            renderSidebar();
        }
        toast(isEdit ? 'Grupo atualizado.' : 'Grupo criado.');
        m.close();
        renderCfgTab();
    };
}

// ============ CARGOS ============
async function renderCfgCargos() {
    // Params junto: cargos marcados como "usa salário mínimo" não gravam o valor — a listagem
    // resolve o número na hora de exibir (ver salarioBaseCargo).
    const [cargos, cfgParams] = await Promise.all([
        DB.getAll(PATHS.cargos).then(cs => cs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))),
        DB.getObj(PATHS.parametros).then(p => p || {})
    ]);

    cfgList({
        searchPh: 'Buscar cargo...',
        btnLabel: 'Novo cargo',
        emptyText: 'Nenhum cargo cadastrado.',
        thead: '<th>Cargo</th><th title="Classificação Brasileira de Ocupações">CBO</th><th>Tipo</th><th>Perfil</th><th class="num">Remuneração</th><th class="num">Insalubridade</th><th class="num">Periculosidade</th><th class="num" title="Periodicidade do exame periódico (NR-7)">ASO</th><th style="width:48px"></th>',
        rowsHtml: cargos.map(c => {
            const r = remuneracaoCargo(c, cfgParams);
            const def = CARGO_PERFIS.find(p => p.id === r.perfil);
            // Mostra as verbas que o perfil tem — a coluna antiga dizia "salário base" mesmo
            // quando o valor era bolsa de estágio.
            // Aprendiz não tem valor mensal no cargo: o salário depende da jornada de CADA
            // funcionário (art. 428 §2º — mínimo-hora). Mostrar um mensal aqui seria inventar
            // uma jornada que o cargo não conhece, então a listagem exibe o valor-HORA.
            const aprendizHora = ehAprendiz(c) && c.usaSalarioMinimo
                ? `${fmtBRL(salarioHoraMinimo(cfgParams))} <span class="text-2">/hora</span> <span class="fc-min-tag" title="Salário mínimo-hora dos Parâmetros × jornada da ficha de cada aprendiz">mín./h</span>`
                : '';
            const verbas = [
                aprendizHora,
                aprendizHora ? '' : r.salarioBase ? `${fmtBRL(r.salarioBase)}${r.usaSalarioMinimo ? ' <span class="fc-min-tag" title="Acompanha o salário mínimo dos Parâmetros">mín.</span>' : ''}` : '',
                r.bolsa ? `${fmtBRL(r.bolsa)} <span class="text-2">bolsa</span>` : '',
                r.prolabore ? `${fmtBRL(r.prolabore)} <span class="text-2">pró-labore</span>` : ''
            ].filter(Boolean);
            return `
            <tr data-id="${c.id}" data-search="${escapeHtml((c.nome + ' ' + c.tipo + ' ' + def.label + ' ' + (c.cbo || '') + ' ' + (c.cboCodigo || '')).toLowerCase())}">
                <td><strong>${escapeHtml(c.nome)}</strong></td>
                <td class="cbo-cell">${ehAprendiz(c) ? `<div class="cbo-cell-tit">Jovem Aprendiz</div>`
                    : c.cbo || c.cboCodigo ? `
                    ${c.cbo ? `<div class="cbo-cell-tit" title="${escapeHtml(c.cbo)}">${escapeHtml(c.cbo)}</div>` : ''}
                    ${c.cboCodigo ? `<div class="cbo-cell-cod">${cboFmtCodigo(c.cboCodigo)}</div>` : ''}`
                    : '<span class="text-2">—</span>'}</td>
                <td><span class="badge badge-accent">${escapeHtml(c.tipo || '—')}</span></td>
                <td><span class="badge badge-neutral">${escapeHtml(def.label)}</span></td>
                <td class="num">${verbas.length ? verbas.join('<br>') : '—'}</td>
                <td class="num">${c.insalubridade ? `<span class="badge badge-warning">${c.insalubridade}%</span>` : '—'}</td>
                <td class="num">${c.periculosidade ? `<span class="badge badge-danger">${PERICULOSIDADE_PCT}%</span>` : '—'}</td>
                <td class="num text-2">${asoIsento(c)
                    ? '<span class="badge badge-neutral" title="Cargo fora do controle de ASO: não entra na programação nem nos alertas">Não se aplica</span>'
                    : `${asoPeriodicidadeDe(c)} meses`}</td>
                <td><button class="btn-icon" data-menu>${icon('dots')}</button></td>
            </tr>`; }).join(''),
        onNew: () => formCargo(null)
    });

    document.querySelectorAll('#cfgTbody tr[data-id]').forEach(tr => {
        const c = cargos.find(x => x.id === tr.dataset.id);
        cfgRowActions(tr, [
            { label: 'Editar', icon: 'edit', onClick: () => formCargo(c) },
            'sep',
            {
                label: 'Excluir', icon: 'trash', danger: true, onClick: async () => {
                    const funcs = await DB.getAll(PATHS.funcionarios);
                    const emUso = funcs.filter(f => f.cargoId === c.id).length;
                    if (emUso) return toast(`Não é possível excluir: ${emUso} funcionário(s) neste cargo.`, 'error');
                    if (await confirmDialog({ title: 'Excluir cargo', message: `Excluir o cargo <strong>${escapeHtml(c.nome)}</strong>?`, confirmText: 'Excluir', danger: true })) {
                        await DB.remove(PATHS.cargos, c.id);
                        toast('Cargo excluído.');
                        renderCfgTab();
                    }
                }
            }
        ]);
    });
}

function formCargo(c) {
    const isEdit = !!c;
    const m = openModal({
        title: isEdit ? 'Editar cargo' : 'Novo cargo',
        body: `
            <div class="field"><label>Nome do cargo <span class="req">*</span></label><input class="input" id="fcNome" placeholder="Ex: Analista de Sistemas" value="${escapeHtml(c?.nome || '')}"></div>
            <div class="form-row" id="fcCboRow">
                <div class="field"><label>CBO (Classificação Brasileira de Ocupações)</label>
                    <input class="input" id="fcCbo" placeholder="Digite para buscar. Ex: analista de sistemas" value="${escapeHtml(c?.cbo || '')}">
                    <div class="field-hint">Ocupação oficial (CBO 2002). Não achou? Digite o texto livremente.</div>
                </div>
                <div class="field"><label>Código CBO</label>
                    <input class="input" id="fcCboCodigo" placeholder="0000-00" value="${escapeHtml(cboFmtCodigo(c?.cboCodigo || ''))}">
                    <div class="field-hint">Preenchido ao escolher a ocupação — ou digite o código para achá-la.</div>
                </div>
            </div>
            <div class="fc-info-balao" id="fcCboAprendizHint" hidden>
                ${icon('info')} <span>Aprendiz não tem CBO próprio: o vínculo é de aprendizagem (art. 428 CLT), não uma ocupação da Classificação Brasileira de Ocupações.</span>
            </div>
            <div class="form-row">
                <div class="field"><label>Tipo de cargo <span class="req">*</span></label>
                    <select class="select" id="fcTipo">${TIPOS_CARGO.map(t => `<option ${c?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
                    <div class="field-hint">Classificação organizacional — usada nos gráficos do Dashboard.</div>
                </div>
                <div class="field"><label>Perfil de remuneração <span class="req">*</span></label>
                    <button class="btn btn-secondary btn-filter fc-perfil-btn" id="fcPerfil" type="button" data-perfil="${perfilCargo(c)}">
                        ${icon('briefcase')} <span id="fcPerfilLbl"></span> ${icon('chevronDown')}
                    </button>
                    <div class="field-hint">Define quais verbas o cargo tem.</div>
                </div>
            </div>
            <div class="cargo-verbas" id="fcVerbas">
                <div class="field" data-verba="salarioBase">
                    <label id="fcSalarioLbl">Salário base (R$) <span class="req">*</span></label>
                    <input class="input" id="fcSalario" type="number" min="0" step="0.01" value="${c?.salarioBase ?? c?.salario ?? ''}">
                    <label class="fc-min">
                        <span class="switch"><input type="checkbox" id="fcUsaMin" ${c?.usaSalarioMinimo ? 'checked' : ''}><span class="track"></span></span>
                        <span>Usar salário mínimo dos Parâmetros</span>
                    </label>
                    <div class="field-hint" id="fcSalHint">Sugestão na folha de pagamento.</div>
                </div>
                <div class="field" data-verba="bolsa">
                    <label>Bolsa estágio (R$) <span class="req">*</span></label>
                    <input class="input" id="fcBolsa" type="number" min="0" step="0.01" value="${c?.bolsa ?? (perfilCargo(c) === 'estagiario' ? c?.salario : '') ?? ''}">
                    <div class="field-hint">Lei 11.788: bolsa não é salário e não gera encargos.</div>
                </div>
                <div class="field" data-verba="prolabore">
                    <label>Pró-labore (R$)</label>
                    <input class="input" id="fcProlabore" type="number" min="0" step="0.01" value="${c?.prolabore ?? (perfilCargo(c) === 'diretor' ? c?.salario : '') ?? ''}">
                    <div class="field-hint">Remuneração de sócio/administrador, paga além do salário.</div>
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>Grau de insalubridade</label>
                    <select class="select" id="fcInsal">
                        ${[[0, 'Nenhum'], [10, 'Mínimo — 10%'], [20, 'Médio — 20%'], [40, 'Máximo — 40%']].map(([v, l]) =>
                            `<option value="${v}" ${(c?.insalubridade || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                    <div class="field-hint">% sobre a base de Parâmetros (salário do funcionário ou salário mínimo). Adicional sugerido automaticamente na folha.</div>
                </div>
                <div class="field"><label>Periculosidade</label>
                    <label class="fc-min">
                        <span class="switch"><input type="checkbox" id="fcPericul" ${c?.periculosidade ? 'checked' : ''}><span class="track"></span></span>
                        <span>Cargo perigoso (${PERICULOSIDADE_PCT}%)</span>
                    </label>
                    <div class="field-hint">Adicional fixo de ${PERICULOSIDADE_PCT}% sobre o salário total do funcionário (art. 193 CLT). Não cumulativo com insalubridade na prática — cabe ao RH escolher qual marcar.</div>
                </div>
            </div>
            <div class="field-hint txt-danger" id="fcRiscoAprendiz" hidden style="margin-top:-8px">
                Cargo de aprendizagem com risco: <strong>menores de 18 anos não podem ser alocados</strong> (CF art. 7º XXXIII e art. 405 da CLT). A ficha vai recusar aprendizes menores neste cargo.
            </div>
            <div class="form-row">
                <div class="field"><label>Periodicidade do ASO</label>
                    <select class="select" id="fcAsoPer">
                        ${ASO_PERIODICIDADES.map(v =>
                            `<option value="${v}" ${asoPeriodicidadeDe(c) === v ? 'selected' : ''}>${asoPeriodicidadeLabel(v)}</option>`).join('')}
                    </select>
                    <div class="field-hint" id="fcAsoPerHint"></div>
                </div>
            </div>`,
        footer: ''
    });
    // O salário mínimo vem dos Parâmetros e é lido a cada render — o cargo grava a intenção,
    // não o número (ver salarioBaseCargo). O form é síncrono: busca uma vez ao abrir.
    let minimo = 0;
    (async () => {
        minimo = Number((await DB.getObj(PATHS.parametros))?.salarioMinimo) || 0;
        syncMinimo();
    })();

    const cboEl = m.body.querySelector('#fcCbo');
    const cboCodEl = m.body.querySelector('#fcCboCodigo');
    initCboAutocomplete(cboEl, cboCodEl);

    // "Não se aplica" tira o cargo do controle de ASO por inteiro — o hint diz a consequência
    // antes de salvar, porque de fora a diferença aparece como "sumiu da fila".
    const asoPerEl = m.body.querySelector('#fcAsoPer');
    const asoPerHint = m.body.querySelector('#fcAsoPerHint');
    const syncAsoPer = () => {
        asoPerHint.innerHTML = asoPerEl.value === String(ASO_NAO_SE_APLICA)
            ? 'Cargo <strong>fora do controle de ASO</strong>: não entra na programação, na agenda nem nos alertas do sino. Use quando não há exigência de exame ocupacional (ex.: vínculo sem CLT). Exames lançados manualmente continuam guardados no histórico.'
            : 'Exame periódico (NR-7/PCMSO). Definida pelo médico do trabalho — independe do grau de insalubridade.';
    };
    asoPerEl.onchange = syncAsoPer;
    syncAsoPer();

    const btnPerfil = m.body.querySelector('#fcPerfil');
    const lblPerfil = m.body.querySelector('#fcPerfilLbl');
    const salEl = m.body.querySelector('#fcSalario');
    const minEl = m.body.querySelector('#fcUsaMin');
    const salHint = m.body.querySelector('#fcSalHint');
    const salLbl = m.body.querySelector('#fcSalarioLbl');

    const syncMinimo = () => {
        const on = minEl.checked;
        const aprendiz = btnPerfil.dataset.perfil === 'aprendiz';
        // Campo travado, não escondido: o RH tem que VER quanto o cargo vai pagar. Um input
        // vazio e desabilitado não diria nada.
        salEl.disabled = on;
        salEl.classList.toggle('cell-auto', on);
        // O rótulo acompanha a unidade do número mostrado: no aprendiz com mínimo o campo
        // exibe R$/hora, e chamá-lo de "salário base" faria o RH ler R$ 6,90 como mensal.
        salLbl.innerHTML = (on && aprendiz ? 'Salário-hora (R$/h)' : 'Salário base (R$)') + ' <span class="req">*</span>';
        // No aprendiz o campo mostra o valor-HORA, não o mensal: o mensal só existe quando a
        // jornada de um funcionário concreto entra na conta (ver salarioBaseCargo).
        if (on) salEl.value = minimo ? (aprendiz ? (minimo / JORNADA_MENSAL_PADRAO) : minimo).toFixed(2) : '';
        if (on && aprendiz && minimo) {
            const hora = minimo / JORNADA_MENSAL_PADRAO;
            salHint.innerHTML = `Salário mínimo-<strong>hora</strong> (art. 428 §2º CLT): ${fmtBRL(minimo)} ÷ ${JORNADA_MENSAL_PADRAO}h = <strong>${fmtBRL(hora)}/h</strong>. O valor mensal sai da jornada de cada aprendiz — ${APRENDIZ_JORNADA_MES_MAX}h/mês dá ${fmtBRL(hora * APRENDIZ_JORNADA_MES_MAX)}.`;
            return;
        }
        salHint.innerHTML = on
            ? minimo
                ? `Acompanha o salário mínimo dos Parâmetros (<strong>${fmtBRL(minimo)}</strong>). Muda lá, muda aqui — sem reeditar o cargo.`
                : `<span class="txt-danger">Salário mínimo não configurado em Parâmetros.</span> Defina-o antes de usar esta opção.`
            : aprendiz
                ? `Valor mensal fixo. O piso legal é o mínimo-hora × jornada (art. 428 §2º) — marque a opção acima para acompanhá-lo sozinho.`
                : 'Sugestão na folha de pagamento.';
    };
    minEl.onchange = syncMinimo;

    // Aviso (não bloqueio): um cargo de aprendizagem PODE ser insalubre/perigoso — só não pode
    // receber menor de 18. Quem barra é a ficha, que é onde a idade existe; aqui só se antecipa
    // a consequência, para o RH não descobrir na hora de alocar.
    const riscoEl = m.body.querySelector('#fcRiscoAprendiz');
    const insalEl = m.body.querySelector('#fcInsal');
    const periculEl = m.body.querySelector('#fcPericul');
    const syncRisco = () => {
        riscoEl.hidden = !(btnPerfil.dataset.perfil === 'aprendiz'
            && ((Number(insalEl.value) || 0) > 0 || periculEl.checked));
    };
    insalEl.onchange = syncRisco;
    periculEl.onchange = syncRisco;

    const cboRow = m.body.querySelector('#fcCboRow');
    const cboAprendizHint = m.body.querySelector('#fcCboAprendizHint');
    const syncPerfil = () => {
        const p = btnPerfil.dataset.perfil;
        const def = CARGO_PERFIS.find(x => x.id === p);
        lblPerfil.textContent = def.label;
        m.body.querySelectorAll('[data-verba]').forEach(el => {
            el.hidden = !def.campos.includes(el.dataset.verba);
        });
        // Aprendiz não tem CBO próprio: o vínculo em si já é a classificação (art. 428 CLT).
        // Esconde os campos em vez de só desabilitar — evitar que o RH busque um CBO à toa.
        const aprendiz = p === 'aprendiz';
        cboRow.hidden = aprendiz;
        cboAprendizHint.hidden = !aprendiz;
        syncMinimo();
        syncRisco();
    };
    btnPerfil.onclick = () => openPopover(btnPerfil, CARGO_PERFIS.map(p => ({
        label: `${p.label} — ${p.desc}`,
        icon: p.id === btnPerfil.dataset.perfil ? 'check' : null,
        onClick: () => { btnPerfil.dataset.perfil = p.id; syncPerfil(); }
    })));
    syncPerfil();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Criar cargo'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        const nome = m.body.querySelector('#fcNome').value.trim();
        const tipo = m.body.querySelector('#fcTipo').value;
        const perfil = btnPerfil.dataset.perfil;
        const usaMin = minEl.checked;
        if (!nome) return toast('Informe o nome do cargo.', 'error');

        const num = el => Number(m.body.querySelector(el).value) || 0;
        const salarioBase = usaMin ? 0 : num('#fcSalario');
        const bolsa = num('#fcBolsa');
        const prolabore = num('#fcProlabore');

        // Valida só a verba que o perfil realmente usa: exigir salário base de um estagiário
        // barraria um cadastro correto.
        if (perfil === 'estagiario' && !(bolsa > 0))
            return toast('Informe o valor da bolsa estágio.', 'error');
        if (perfil !== 'estagiario' && !usaMin && !(salarioBase > 0))
            return toast('Informe o salário base ou marque "usar salário mínimo".', 'error');
        if (usaMin && !minimo)
            return toast('Configure o salário mínimo em Parâmetros antes de usar essa opção.', 'error');

        await DB.save(PATHS.cargos, c?.id || null, {
            nome, tipo, perfil,
            // CBO é informativo (eSocial/RAIS): guarda o título como foi escrito e o
            // código só quando são 6 dígitos reais — texto solto não vira código.
            // Aprendiz não usa CBO (campo escondido) — não grava resíduo de um perfil anterior.
            cbo: perfil === 'aprendiz' ? '' : cboEl.value.trim(),
            cboCodigo: perfil === 'aprendiz' ? '' : cboCodigoValor(cboCodEl),
            // `salarioBase` substitui `salario`, que mudava de significado conforme o tipo.
            // O legado continua gravado para não quebrar folhas já lançadas que o leem.
            salarioBase, bolsa, prolabore,
            usaSalarioMinimo: usaMin,
            // Espelho do legado: valor "principal" do perfil, como o campo antigo esperava.
            salario: perfil === 'estagiario' ? bolsa : salarioBase,
            insalubridade: Number(m.body.querySelector('#fcInsal').value) || 0,
            periculosidade: m.body.querySelector('#fcPericul').checked,
            // 0 ("Não se aplica") é escolha válida, não valor vazio — por isso não cai no
            // `|| PADRÃO`, que o transformaria de volta em 12 meses.
            asoPeriodicidadeMeses: asoPerEl.value === String(ASO_NAO_SE_APLICA)
                ? ASO_NAO_SE_APLICA
                : Number(asoPerEl.value) || ASO_PERIODICIDADE_PADRAO
        });
        toast(isEdit ? 'Cargo atualizado.' : 'Cargo criado.');
        m.close();
        renderCfgTab();
    };
}

// ============ UNIDADES ============

// Diagnóstico de equipe incompleta por unidade.
// Nova regra: compara ativos POR CARGO vs. quantidade recomendada (só cargos adicionados).
// Fallback legado: se não há recomendação por cargo mas existe headcount antigo, compara o total.
// Retorna null quando a unidade está completa (ou sem meta).
function diagnosticoUnidade(un, funcionarios) {
    const ativos = funcionarios.filter(f => f.unidadeId === un.id && !f.demissao);
    const recs = un.recomendados || [];
    if (recs.length) {
        const faltasPorCargo = recs.map(r => {
            const noCargo = ativos.filter(f => f.cargoId === r.cargoId).length;
            const faltam = Math.max(0, (Number(r.qtd) || 0) - noCargo);
            return { cargoId: r.cargoId, meta: Number(r.qtd) || 0, ativos: noCargo, faltam };
        });
        const faltamTotal = faltasPorCargo.reduce((s, c) => s + c.faltam, 0);
        const metaTotal = recs.reduce((s, r) => s + (Number(r.qtd) || 0), 0);
        if (faltamTotal === 0) return null;
        return { unidadeId: un.id, nome: un.nome, modo: 'cargo', faltam: faltamTotal, meta: metaTotal, ativos: ativos.length, cargos: faltasPorCargo.filter(c => c.faltam > 0) };
    }
    // Fallback legado (headcount único por unidade)
    if (un.headcount && ativos.length < un.headcount) {
        return { unidadeId: un.id, nome: un.nome, modo: 'total', faltam: un.headcount - ativos.length, meta: un.headcount, ativos: ativos.length, cargos: [] };
    }
    return null;
}

// Diagnóstico de COBERTURA: quem está de férias continua ativo (contrato vigente, salário,
// encargos) e por isso NÃO entra em diagnosticoUnidade() — abrir vaga porque alguém saiu
// de férias seria erro. Mas operacionalmente a pessoa não está lá. Este cálculo é separado:
// gera alerta de escala/cobertura, não de contratação, e some sozinho quando a pessoa volta.
// Retorna null quando a presença cobre a meta de todos os cargos.
function diagnosticoCobertura(un, funcionarios, ausencias, ref) {
    const recs = un.recomendados || [];
    if (!recs.length) return null;                       // sem meta por cargo, sem cobertura a medir
    const ativos = funcionarios.filter(f => f.unidadeId === un.id && !f.demissao);
    const deFerias = ativos.filter(f => feriasVigente(f.id, ausencias, ref));
    if (!deFerias.length) return null;

    const idsFerias = new Set(deFerias.map(f => f.id));
    const cargos = recs.map(r => {
        const noCargo = ativos.filter(f => f.cargoId === r.cargoId);
        const fora = noCargo.filter(f => idsFerias.has(f.id)).length;
        const presentes = noCargo.length - fora;
        const meta = Number(r.qtd) || 0;
        return { cargoId: r.cargoId, meta, presentes, fora, gap: Math.max(0, meta - presentes) };
    }).filter(c => c.fora > 0 && c.gap > 0);             // só cargo cuja ausência abre buraco real

    if (!cargos.length) return null;
    const retornos = deFerias
        .map(f => ({ nome: f.nome, a: feriasVigente(f.id, ausencias, ref) }))
        .filter(x => x.a)
        .sort((x, y) => x.a.retorno.localeCompare(y.a.retorno));
    return { unidadeId: un.id, nome: un.nome, cargos, foraTotal: deFerias.length, retornos };
}

async function renderCfgUnidades() {
    const unidades = (await DB.getAll(PATHS.unidades)).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const funcs = await DB.getAll(PATHS.funcionarios);
    const ativosPorUnidade = id => funcs.filter(f => f.unidadeId === id && !f.demissao).length;
    const metaDe = un => (un.recomendados || []).reduce((s, r) => s + (Number(r.qtd) || 0), 0) || un.headcount || 0;

    cfgList({
        searchPh: 'Buscar unidade...',
        btnLabel: 'Nova unidade',
        emptyText: 'Nenhuma unidade cadastrada.',
        thead: '<th>Unidade</th><th>CNPJ</th><th>Endereço</th><th class="num">Funcionários</th><th class="num">Quadro recomendado</th><th style="width:48px"></th>',
        rowsHtml: unidades.map(un => {
            const ativos = ativosPorUnidade(un.id);
            const diag = diagnosticoUnidade(un, funcs);
            const meta = metaDe(un);
            const nCargos = (un.recomendados || []).length;
            return `
            <tr data-id="${un.id}" data-search="${escapeHtml((un.nome + ' ' + (un.cnpj || '')).toLowerCase())}">
                <td><div class="flex"><span style="color:var(--accent)">${icon('building')}</span><strong>${escapeHtml(un.nome)}</strong></div></td>
                <td class="text-2">${escapeHtml(un.cnpj || '—')}</td>
                <td class="text-2">${escapeHtml(un.endereco || '—')}</td>
                <td class="num">${diag ? `<span class="badge badge-warning" title="Equipe incompleta: faltam ${diag.faltam}">${fmtNum(ativos)} ⚠</span>` : fmtNum(ativos)}</td>
                <td class="num text-2">${meta ? `${fmtNum(meta)}${nCargos ? ` <span class="muted">· ${nCargos} cargo${nCargos > 1 ? 's' : ''}</span>` : ''}` : '—'}</td>
                <td><button class="btn-icon" data-menu>${icon('dots')}</button></td>
            </tr>`;
        }).join(''),
        onNew: () => formUnidade(null)
    });

    document.querySelectorAll('#cfgTbody tr[data-id]').forEach(tr => {
        const un = unidades.find(x => x.id === tr.dataset.id);
        cfgRowActions(tr, [
            { label: 'Editar', icon: 'edit', onClick: () => formUnidade(un) },
            'sep',
            {
                label: 'Excluir', icon: 'trash', danger: true, onClick: async () => {
                    const emUso = funcs.filter(f => f.unidadeId === un.id).length;
                    if (emUso) return toast(`Não é possível excluir: ${emUso} funcionário(s) nesta unidade.`, 'error');
                    if (await confirmDialog({ title: 'Excluir unidade', message: `Excluir a unidade <strong>${escapeHtml(un.nome)}</strong>?`, confirmText: 'Excluir', danger: true })) {
                        await DB.remove(PATHS.unidades, un.id);
                        toast('Unidade excluída.');
                        renderCfgTab();
                    }
                }
            }
        ]);
    });
}

async function formUnidade(un) {
    const isEdit = !!un;
    const cargos = (await DB.getAll(PATHS.cargos)).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    // Estado do editor de recomendação por cargo
    const recs = (un?.recomendados || []).map(r => ({ cargoId: r.cargoId, qtd: Number(r.qtd) || 0 }));

    const m = openModal({
        title: isEdit ? 'Editar unidade' : 'Nova unidade',
        size: 'modal-lg',
        body: `
            <div class="form-section">
                <div class="form-section-title">Identificação</div>
                <div class="field"><label>Nome da unidade <span class="req">*</span></label><input class="input" id="fnNome" placeholder="Ex: Matriz — São Paulo" value="${escapeHtml(un?.nome || '')}"></div>
                <div class="field" style="margin-bottom:0"><label>Endereço</label><input class="input" id="fnEnd" placeholder="Rua, número, bairro, cidade" value="${escapeHtml(un?.endereco || '')}"></div>
            </div>
            <div class="form-section">
                <div class="form-section-title">Dados fiscais</div>
                <div class="field" style="margin-bottom:0;max-width:280px"><label>CNPJ</label><input class="input" id="fnCnpj" inputmode="numeric" placeholder="00.000.000/0000-00" value="${escapeHtml(un?.cnpj || '')}"></div>
            </div>
            <div class="form-section" style="margin-bottom:0">
                <div class="form-section-title">Quadro recomendado por cargo</div>
                <div class="field-hint" style="margin:-4px 0 12px">Defina quantos funcionários cada cargo deve ter nesta unidade. Só os cargos adicionados geram alerta de equipe incompleta no Dashboard.</div>
                <div id="fnRecList"></div>
                <div class="rec-add">
                    <button type="button" class="picker-btn" id="fnRecCargo"></button>
                    <input class="input" id="fnRecQtd" type="number" min="1" step="1" placeholder="Qtd" style="width:90px">
                    <button type="button" class="btn btn-secondary btn-sm" id="fnRecAdd">${icon('plus')} Adicionar</button>
                </div>
                ${!cargos.length ? '<div class="field-hint" style="margin-top:8px;color:var(--warning)">Cadastre cargos primeiro para definir o quadro recomendado.</div>' : ''}
            </div>`,
        footer: ''
    });
    const cnpjInput = m.body.querySelector('#fnCnpj');
    cnpjInput.addEventListener('input', () => cnpjInput.value = maskCNPJ(cnpjInput.value));

    const cargoObj = id => cargos.find(c => c.id === id);
    const cargoNome = id => cargoObj(id)?.nome || '(cargo removido)';
    const recList = m.body.querySelector('#fnRecList');
    const recCargoSel = m.body.querySelector('#fnRecCargo');
    const recQtd = m.body.querySelector('#fnRecQtd');
    // Cargo em popover (nome + CBO): a meta é por cargo, e homônimos de CBO diferente são
    // linhas distintas do quadro — sem o CBO na lista não dá para saber qual foi adicionado.
    const recPicker = initPickerField(recCargoSel, { options: [], placeholder: 'Selecione o cargo', icon: 'briefcase' });

    const renderRecs = () => {
        recList.innerHTML = recs.length ? recs.map((r, i) => {
            const cbo = cargoCboTexto(cargoObj(r.cargoId));
            return `
            <div class="rec-item">
                <span class="rec-nome">${icon('briefcase')} ${escapeHtml(cargoNome(r.cargoId))}${cbo ? `<span class="rec-cbo">${escapeHtml(cbo)}</span>` : ''}</span>
                <span class="rec-qtd">${fmtNum(r.qtd)} recomendado${r.qtd > 1 ? 's' : ''}</span>
                <button type="button" class="btn-icon danger" data-rec-del="${i}" title="Remover">${icon('trash')}</button>
            </div>`;
        }).join('')
            : '<div class="rec-empty">Nenhum cargo definido. A unidade não gera alerta de equipe incompleta.</div>';
        // Opções de cargo ainda não adicionados
        const usados = new Set(recs.map(r => r.cargoId));
        const disp = cargos.filter(c => !usados.has(c.id));
        recPicker.setOptions(cargoOpcoes(disp), '');
        recCargoSel.disabled = !disp.length;
        if (!disp.length) recCargoSel.querySelector('.picker-lbl').textContent = 'Todos os cargos já adicionados';
        recList.querySelectorAll('[data-rec-del]').forEach(b =>
            b.onclick = () => { recs.splice(Number(b.dataset.recDel), 1); renderRecs(); });
    };
    m.body.querySelector('#fnRecAdd').onclick = () => {
        const cargoId = recCargoSel.value;
        const qtd = Number(recQtd.value);
        if (!cargoId) return toast('Selecione um cargo.', 'error');
        if (!(qtd > 0)) return toast('Informe uma quantidade maior que zero.', 'error');
        recs.push({ cargoId, qtd });
        recQtd.value = '';
        renderRecs();
    };
    renderRecs();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Criar unidade'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        const nome = m.body.querySelector('#fnNome').value.trim();
        const cnpj = cnpjInput.value.trim();
        if (!nome) return toast('Informe o nome da unidade.', 'error');
        if (cnpj && cnpj.replace(/\D/g, '').length !== 14) return toast('CNPJ incompleto.', 'error');
        await DB.save(PATHS.unidades, un?.id || null, {
            nome,
            endereco: m.body.querySelector('#fnEnd').value.trim(),
            cnpj,
            recomendados: recs,
            // Zera o headcount legado quando há recomendação por cargo (evita alerta duplicado)
            headcount: recs.length ? null : (un?.headcount ?? null)
        });
        toast(isEdit ? 'Unidade atualizada.' : 'Unidade criada.');
        m.close();
        renderCfgTab();
    };
}

// ============ BENEFÍCIOS ============
async function renderCfgBeneficios() {
    const beneficios = (await DB.getAll(PATHS.beneficios)).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    cfgList({
        searchPh: 'Buscar benefício...',
        btnLabel: 'Novo benefício',
        emptyText: 'Nenhum benefício cadastrado.',
        thead: '<th>Benefício</th><th>Tipo</th><th class="num">Custo titular</th><th class="num">Custo por dependente</th><th class="num">% funcionário</th><th style="width:48px"></th>',
        rowsHtml: beneficios.map(b => `
            <tr data-id="${b.id}" data-search="${escapeHtml((b.nome + ' ' + (b.tipo || '')).toLowerCase())}">
                <td><div class="flex"><span style="color:var(--accent)">${icon('gift')}</span><strong>${escapeHtml(b.nome)}</strong></div></td>
                <td><span class="badge badge-info">${escapeHtml(b.tipo || '—')}</span></td>
                <td class="num">${fmtBRL(b.custoTitular)}</td>
                <td class="num">${b.custoDependente ? fmtBRL(b.custoDependente) : '—'}</td>
                <td class="num">${b.descontoPct ? `<span class="badge badge-warning">${b.descontoPct}%</span>` : '<span class="badge badge-success">Empresa 100%</span>'}</td>
                <td><button class="btn-icon" data-menu>${icon('dots')}</button></td>
            </tr>`).join(''),
        onNew: () => formBeneficio(null)
    });

    document.querySelectorAll('#cfgTbody tr[data-id]').forEach(tr => {
        const b = beneficios.find(x => x.id === tr.dataset.id);
        cfgRowActions(tr, [
            { label: 'Editar', icon: 'edit', onClick: () => formBeneficio(b) },
            'sep',
            {
                label: 'Excluir', icon: 'trash', danger: true, onClick: async () => {
                    const funcs = await DB.getAll(PATHS.funcionarios);
                    const emUso = funcs.filter(f => (f.beneficios || []).some(fb => fb.beneficioId === b.id)).length;
                    if (emUso) return toast(`Não é possível excluir: ${emUso} funcionário(s) com este benefício.`, 'error');
                    if (await confirmDialog({ title: 'Excluir benefício', message: `Excluir <strong>${escapeHtml(b.nome)}</strong>?`, confirmText: 'Excluir', danger: true })) {
                        await DB.remove(PATHS.beneficios, b.id);
                        toast('Benefício excluído.');
                        renderCfgTab();
                    }
                }
            }
        ]);
    });
}

function formBeneficio(b) {
    const isEdit = !!b;
    const m = openModal({
        title: isEdit ? 'Editar benefício' : 'Novo benefício',
        body: `
            <div class="form-row">
                <div class="field"><label>Nome do benefício <span class="req">*</span></label><input class="input" id="fbNome" placeholder="Ex: Unimed Nacional" value="${escapeHtml(b?.nome || '')}"></div>
                <div class="field"><label>Tipo <span class="req">*</span></label>
                    <select class="select" id="fbTipo">${TIPOS_BENEFICIO.map(t => `<option ${b?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>Custo mensal do titular (R$) <span class="req">*</span></label><input class="input" id="fbCT" type="number" min="0" step="0.01" value="${b?.custoTitular ?? ''}"></div>
                <div class="field"><label>Custo mensal por dependente (R$)</label><input class="input" id="fbCD" type="number" min="0" step="0.01" value="${b?.custoDependente ?? ''}">
                    <div class="field-hint">Deixe vazio se não permite dependentes</div>
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>Coparticipação do funcionário (%)</label>
                    <input class="input" id="fbDesc" type="number" min="0" max="100" step="1" value="${b?.descontoPct ?? 0}">
                    <div class="field-hint">% do custo descontado do funcionário em folha. 0 = empresa paga tudo; 100 = funcionário paga tudo.</div>
                </div>
                <div></div>
            </div>`,
        footer: ''
    });
    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Criar benefício'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        const nome = m.body.querySelector('#fbNome').value.trim();
        const custoTitular = Number(m.body.querySelector('#fbCT').value);
        if (!nome) return toast('Informe o nome do benefício.', 'error');
        if (!(custoTitular >= 0)) return toast('Informe o custo do titular.', 'error');
        const descontoPct = Math.min(100, Math.max(0, Number(m.body.querySelector('#fbDesc').value) || 0));
        await DB.save(PATHS.beneficios, b?.id || null, {
            nome,
            tipo: m.body.querySelector('#fbTipo').value,
            custoTitular,
            custoDependente: Number(m.body.querySelector('#fbCD').value) || 0,
            descontoPct
        });
        toast(isEdit ? 'Benefício atualizado.' : 'Benefício criado.');
        m.close();
        renderCfgTab();
    };
}

// ============ PARÂMETROS ============
// Conteúdo do botão "i" de cada campo: o que é, onde no sistema ele é usado e como o valor afeta o cálculo.
const PARAM_INFO = {
    fgtsPct: {
        title: 'FGTS (%)',
        html: `<p><strong>O que é:</strong> a alíquota do FGTS (Lei 8.036, art. 15 — padrão legal 8%).</p>
               <p><strong>Onde afeta:</strong> Folha de pagamento e 13º salário (inclusive a 1ª parcela).</p>
               <p><strong>Como afeta:</strong> é aplicada sobre a base de cálculo de cada lançamento para estimar o depósito de FGTS devido, custo da empresa. É calculada separada do INSS porque incide em toda parcela do 13º, inclusive na 1ª, o que o INSS não faz.</p>
               <p><strong>Exceção:</strong> cargos com perfil <em>Jovem Aprendiz</em> recolhem ${FGTS_PCT_APRENDIZ}% fixos (art. 15 §7º da Lei 8.036/90) e ignoram este parâmetro — é alíquota de lei, não escolha.</p>`
    },
    inssFaixas: {
        title: 'INSS (%) — tabela progressiva',
        html: `<p><strong>O que é:</strong> tabela de faixas salariais com alíquota progressiva de INSS, <strong>descontado do empregado</strong> (não é custo da empresa).</p>
               <p><strong>Onde afeta:</strong> Folha de pagamento e 13º salário (exceto a 1ª parcela, que é adiantamento e não tem incidência de INSS).</p>
               <p><strong>Como afeta:</strong> a base de cálculo é dividida em fatias pelos limites de cada faixa; cada fatia paga a alíquota da sua própria faixa, e os valores se somam (não é uma alíquota única aplicada ao total). Base acima do limite da última faixa não gera INSS adicional — é o teto da tabela. O resultado reduz o valor líquido do funcionário, nunca o custo da empresa.</p>`
    },
    diasExperiencia: {
        title: 'Dias do período de experiência',
        html: `<p><strong>O que é:</strong> duração padrão do contrato de experiência (padrão CLT: 90 dias).</p>
               <p><strong>Onde afeta:</strong> Cadastro de funcionários e Dashboard (índice de aprovação após experiência).</p>
               <p><strong>Como afeta:</strong> conta a partir da admissão para determinar quando o período de experiência termina e o funcionário deve ser avaliado/efetivado.</p>`
    },
    insalubridadeBase: {
        title: 'Base de cálculo da insalubridade',
        html: `<p><strong>O que é:</strong> a base monetária sobre a qual o grau de insalubridade (10/20/40%) é calculado.</p>
               <p><strong>Onde afeta:</strong> Folha de pagamento, para funcionários com cargo insalubre.</p>
               <p><strong>Como afeta:</strong> "Salário do funcionário" usa o salário individual; "Salário mínimo" usa o valor vigente (padrão legal), o que costuma resultar em um adicional menor. O grau (10/20/40%) continua vindo do cadastro de Cargos.</p>
               <p><strong>Periculosidade não usa este parâmetro:</strong> é sempre ${PERICULOSIDADE_PCT}% sobre o salário total do funcionário, configurada por cargo em Configurações → Cargos.</p>`
    },
    salarioMinimo: {
        title: 'Salário mínimo vigente (R$)',
        html: `<p><strong>O que é:</strong> o valor do salário mínimo nacional em vigor.</p>
               <p><strong>Onde afeta:</strong> Cálculo de insalubridade (quando a base escolhida for "Salário mínimo").</p>
               <p><strong>Como afeta:</strong> é multiplicado pelo grau de insalubridade do cargo. Atualize sempre que o governo reajustar o mínimo, senão o adicional calculado ficará desatualizado. Não afeta a periculosidade, que sempre usa o salário total do funcionário.</p>`
    },
    feriasAlertaLegalDias: {
        title: 'Alerta de prazo legal de férias (dias)',
        html: `<p><strong>O que é:</strong> antecedência do alerta crítico antes do fim do período concessivo de férias.</p>
               <p><strong>Onde afeta:</strong> Sino de notificações e aba de Férias.</p>
               <p><strong>Como afeta:</strong> se o período concessivo vencer sem que as férias sejam gozadas, a empresa deve pagá-las em dobro (art. 137 CLT). O aviso da <strong>data prevista</strong> (não crítico) usa metade deste valor de dias.</p>`
    },
    feriasMesesVencimento: {
        title: 'Prazo para vencer as férias (meses)',
        html: `<p><strong>O que é:</strong> tempo total, contado do início do período aquisitivo, até as férias vencerem. Padrão 24 meses (12 do aquisitivo + 12 do concessivo, art. 134/137 CLT).</p>
               <p><strong>Onde afeta:</strong> cálculo de situação de férias em todas as telas (aba de Férias, cartões, programação, sino).</p>
               <p><strong>Como afeta:</strong> o direito continua nascendo em 12 meses; este parâmetro move só a data de vencimento (a dobra). Não pode ser menor que 12. O cálculo é feito pelo dia e mês da admissão — ou pela base de controle de férias, quando o funcionário foi cadastrado como antigo.</p>`
    },
    asoAlertaDias: {
        title: 'Alerta de vencimento do ASO (dias)',
        html: `<p><strong>O que é:</strong> antecedência do alerta antes do vencimento do exame periódico (ASO).</p>
               <p><strong>Onde afeta:</strong> Sino de notificações e aba de ASO.</p>
               <p><strong>Como afeta:</strong> conta regressivamente a partir da data de vencimento calculada com a periodicidade (6/12/24 meses) definida por cargo, no cadastro de Cargos. Cargos marcados como <strong>"Não se aplica"</strong> ficam fora do controle e não geram alerta.</p>`
    },
    bhCicloMeses: {
        title: 'Duração do ciclo do banco de horas (meses)',
        html: `<p><strong>O que é:</strong> o prazo máximo para compensar o saldo de horas (CLT art. 59, §2º).</p>
               <p><strong>Onde afeta:</strong> Aba de Banco de horas, para todos os funcionários.</p>
               <p><strong>Como afeta:</strong> o ciclo de cada funcionário começa no primeiro mês de saldo publicado para ele. Se o ciclo se esgotar sem compensação, o saldo positivo passa a ser devido como hora extra.</p>`
    },
    bhAlertaDias: {
        title: 'Alerta de fechamento do ciclo (dias)',
        html: `<p><strong>O que é:</strong> antecedência do alerta crítico antes do fim do ciclo do banco de horas.</p>
               <p><strong>Onde afeta:</strong> Sino de notificações e aba de Banco de horas.</p>
               <p><strong>Como afeta:</strong> marca a última janela de tempo em que ainda é possível compensar o saldo em vez de ter que pagá-lo como hora extra.</p>`
    },
    bhTetoMensalMin: {
        title: 'Teto mensal de compensação (HH:MM)',
        html: `<p><strong>O que é:</strong> quanto do saldo de horas dá para compensar em um único mês.</p>
               <p><strong>Onde afeta:</strong> Aba de Banco de horas, no cálculo de quanto do saldo ainda cabe no prazo restante do ciclo.</p>
               <p><strong>Como afeta:</strong> usado apenas para avisar quando o saldo não compensado excede o que pode ser absorvido nos meses restantes do ciclo. <strong>00:00</strong> significa sem teto (nenhum aviso desse tipo).</p>`
    },
    bhAdicionalPct: {
        title: 'Adicional de hora extra (%)',
        html: `<p><strong>O que é:</strong> percentual adicional sobre a hora normal usado só para estimativa (mínimo legal: 50%).</p>
               <p><strong>Onde afeta:</strong> Aba de Banco de horas, na estimativa em R$ do custo do saldo não compensado.</p>
               <p><strong>Como afeta:</strong> é multiplicativo apenas para fins de estimativa visual — <strong>não gera lançamento na folha</strong>.</p>`
    },
    feriasDiasPorCiclo: {
        title: 'Dias por período de férias',
        html: `<p><strong>O que é:</strong> o total de dias de uma competência de férias (CLT art. 130: 30 dias).</p>
               <p><strong>Onde afeta:</strong> Aba de Férias, no fechamento da competência de cada funcionário.</p>
               <p><strong>Como afeta:</strong> a competência só se encerra quando a soma dos dias lançados atinge este total — fracionar em vários lançamentos divide o direito, não o multiplica.</p>`
    },
    feriasTercoPct: {
        title: 'Terço constitucional (%)',
        html: `<p><strong>O que é:</strong> o adicional sobre a remuneração de férias (CF art. 7º XVII: mínimo 1/3 = 33,33%).</p>
               <p><strong>Onde afeta:</strong> Cálculo da remuneração de férias de todos os funcionários.</p>
               <p><strong>Como afeta:</strong> é somado ao valor das férias. Convenção coletiva pode aumentar este percentual, nunca reduzi-lo abaixo do mínimo constitucional.</p>`
    },
    feriasAbonoMaxDias: {
        title: 'Abono pecuniário — máximo (dias)',
        html: `<p><strong>O que é:</strong> o limite de dias de férias que o funcionário pode vender (CLT art. 143: até 1/3 do período).</p>
               <p><strong>Onde afeta:</strong> Aba de Férias, na venda de dias (abono).</p>
               <p><strong>Como afeta:</strong> dias vendidos como abono contam para fechar a competência, mesmo sem serem gozados como descanso.</p>`
    },
    feriasMediaHe: {
        title: 'Média de horas extras na base de férias',
        html: `<p><strong>O que é:</strong> se a média de horas extras habituais integra a remuneração de férias (Súmula 45 TST).</p>
               <p><strong>Onde afeta:</strong> Cálculo da remuneração de férias.</p>
               <p><strong>Como afeta:</strong> quando ativado, soma à base de férias a média das horas extras dos meses configurados ao lado. <strong>Confirme a regra da sua convenção coletiva</strong>, pois ela varia.</p>`
    },
    feriasMediaHeMeses: {
        title: 'Meses da média de horas extras',
        html: `<p><strong>O que é:</strong> quantos meses do período aquisitivo entram no cálculo da média de horas extras.</p>
               <p><strong>Onde afeta:</strong> Cálculo da remuneração de férias, quando a média de HE está ativada.</p>
               <p><strong>Como afeta:</strong> a média divide a soma das horas extras pelo total de meses configurado aqui, não apenas pelos meses em que houve hora extra.</p>`
    },
    decimoPrazo1: {
        title: 'Prazo da 1ª parcela do 13º',
        html: `<p><strong>O que é:</strong> a data-limite para pagar o adiantamento do 13º salário (Lei 4.749, art. 2º: até 30/11).</p>
               <p><strong>Onde afeta:</strong> Aba de 13º Salário, no cronograma de parcelas, e no sino de notificações.</p>
               <p><strong>Como afeta:</strong> nesta parcela incide apenas o FGTS — os demais encargos ficam concentrados na 2ª parcela.</p>`
    },
    decimoPrazo2: {
        title: 'Prazo da 2ª parcela do 13º',
        html: `<p><strong>O que é:</strong> a data-limite para pagar o saldo do 13º salário integral (Lei 4.749, art. 2º: até 20/12).</p>
               <p><strong>Onde afeta:</strong> Aba de 13º Salário, no cronograma de parcelas, e no sino de notificações.</p>
               <p><strong>Como afeta:</strong> nesta parcela incidem todos os encargos (FGTS e outros) sobre o valor integral do 13º, descontado o que já foi pago na 1ª parcela.</p>`
    },
    decimoDiasParaAvo: {
        title: 'Dias para gerar o avo',
        html: `<p><strong>O que é:</strong> o mínimo de dias trabalhados no mês para que ele conte como 1/12 (avo) do 13º (Lei 4.090, art. 1º §2º: 15 dias).</p>
               <p><strong>Onde afeta:</strong> Cálculo dos avos de 13º de todos os funcionários.</p>
               <p><strong>Como afeta:</strong> meses que atingem este mínimo contam um avo integral; meses abaixo dele não contam nenhum avo. Exigir mais que 15 dias reduz o direito do funcionário abaixo do mínimo legal.</p>`
    },
    decimoDescontarFaltas: {
        title: 'Faltas injustificadas descontam o avo',
        html: `<p><strong>O que é:</strong> se faltas injustificadas no mês reduzem o avo de 13º daquele mês.</p>
               <p><strong>Onde afeta:</strong> Cálculo dos avos de 13º.</p>
               <p><strong>Como afeta:</strong> só faltas <strong>injustificadas</strong> entram nessa conta — licença médica, férias e falta justificada são tempo de serviço e nunca descontam o avo.</p>`
    },
    decimoAlertaDias: {
        title: 'Alerta de prazo do 13º (dias)',
        html: `<p><strong>O que é:</strong> antecedência do aviso de parcela do 13º a vencer.</p>
               <p><strong>Onde afeta:</strong> Sino de notificações e aba de 13º Salário.</p>
               <p><strong>Como afeta:</strong> conta regressivamente a partir da data de cada parcela (1ª e 2ª) configurada acima.</p>`
    }
};

function openParamInfo(key) {
    const info = PARAM_INFO[key];
    if (!info) return;
    openModal({ title: info.title, size: 'modal-sm', body: `<div class="text-2">${info.html}</div>`, footer: '' });
}

// Rótulo de campo com botão "i" ao lado, que abre a explicação do parâmetro (PARAM_INFO[key]).
function pLabel(text, key) {
    return `<div class="field-label-row"><label>${text}</label>
        <button type="button" class="param-info-btn" data-param-info="${key}" title="O que é este parâmetro?">${icon('info')}</button></div>`;
}

// ---- Modal: editar a tabela de faixas de INSS ----
// Mesmo padrão de formBeneficio: modal próprio, com salvamento independente do card de
// Parâmetros — editar as faixas não exige revisar/reenviar os outros campos do card.
function formInssFaixas(params, onSaved) {
    let faixas = (params.inssFaixas && params.inssFaixas.length ? params.inssFaixas : INSS_FAIXAS_PADRAO)
        .map(f => ({ ate: Number(f.ate) || 0, aliquota: Number(f.aliquota) || 0 }))
        .sort((a, b) => a.ate - b.ate);

    const m = openModal({
        title: 'Faixas de INSS',
        body: `
            <p class="muted" style="font-size:12px;margin-bottom:14px">
                Desconto do empregado, por faixa progressiva de salário. Cada fatia da base paga a
                alíquota da sua própria faixa — base acima do limite da última faixa não gera INSS
                adicional (teto). Afeta a folha mensal e o 13º (exceto a 1ª parcela).
            </p>
            <div id="ifLista" class="inss-faixa-lista"></div>
            <button type="button" class="btn btn-secondary btn-sm mt-8" id="ifAdd">${icon('plus')} Adicionar faixa</button>`,
        footer: `
            <button class="btn btn-secondary" data-cancel>Cancelar</button>
            <button class="btn btn-primary" data-save>${icon('check')} Salvar faixas</button>`
    });

    const renderLista = () => {
        const box = m.body.querySelector('#ifLista');
        faixas.sort((a, b) => a.ate - b.ate);
        box.innerHTML = faixas.map((f, i) => `
            <div class="inss-faixa-row" data-i="${i}">
                <span class="inss-faixa-num">${i + 1}ª</span>
                <div class="field" style="margin-bottom:0">
                    <label>Até (R$)</label>
                    <input class="input inss-ate" type="number" min="0.01" step="0.01" value="${f.ate}">
                </div>
                <div class="field" style="margin-bottom:0">
                    <label>Alíquota (%)</label>
                    <input class="input inss-aliquota" type="number" min="0" max="100" step="0.01" value="${f.aliquota}">
                </div>
                <button type="button" class="btn-icon inss-faixa-del" title="Remover faixa">${icon('trash')}</button>
            </div>`).join('');
        box.querySelectorAll('.inss-faixa-row').forEach(row => {
            const i = Number(row.dataset.i);
            row.querySelector('.inss-ate').onchange = e => { faixas[i].ate = Number(e.target.value) || 0; };
            row.querySelector('.inss-aliquota').onchange = e => { faixas[i].aliquota = Number(e.target.value) || 0; };
            row.querySelector('.inss-faixa-del').onclick = () => {
                if (faixas.length <= 1) return toast('Mantenha ao menos uma faixa.', 'error');
                faixas.splice(i, 1);
                renderLista();
            };
        });
    };
    renderLista();

    m.body.querySelector('#ifAdd').onclick = () => {
        const ultimo = faixas[faixas.length - 1];
        faixas.push({ ate: (ultimo?.ate || 0) + 1000, aliquota: ultimo?.aliquota || 0 });
        renderLista();
    };

    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        if (!faixas.length || faixas.some(f => !(f.ate > 0) || !(f.aliquota >= 0 && f.aliquota <= 100)))
            return toast('Cada faixa precisa de um limite maior que zero e uma alíquota entre 0 e 100%.', 'error');
        const ordenadas = faixas.slice().sort((a, b) => a.ate - b.ate);
        await DB.set(PATHS.parametros, { ...params, inssFaixas: ordenadas });
        params.inssFaixas = ordenadas;
        toast('Faixas de INSS salvas.');
        m.close();
        onSaved && onSaved();
    };
}

async function renderCfgParametros() {
    const params = (await DB.getObj(PATHS.parametros)) || {};
    const cont = document.getElementById('cfgContent');
    cont.innerHTML = `
        <div class="grid grid-2">
        <div class="card">
            <div class="card-title">Parâmetros do sistema</div>
            <div class="card-sub" style="margin-bottom:18px">Valores padrão usados nos cálculos automáticos.</div>
            <div class="form-row form-row-inss">
                <div class="inss-col-esq">
                    <div class="field">
                        ${pLabel('FGTS (%)', 'fgtsPct')}
                        <input class="input" id="fpFgts" type="number" min="0" max="100" step="0.1" value="${params.fgtsPct ?? 8}">
                        <div class="field-hint">Alíquota do FGTS (Lei 8.036 art. 15: 8%), custo da empresa. Separado do INSS porque incide em toda parcela do 13º, inclusive na 1ª. Cargos de Jovem Aprendiz usam ${FGTS_PCT_APRENDIZ}% fixos por lei e não seguem este campo.</div>
                    </div>
                    <div class="field" style="margin-bottom:0">
                        ${pLabel('Dias do período de experiência', 'diasExperiencia')}
                        <input class="input" id="fpExp" type="number" min="1" step="1" value="${params.diasExperiencia ?? 90}">
                        <div class="field-hint">Usado no índice de aprovação após experiência (padrão CLT: 90)</div>
                    </div>
                </div>
                <div class="field" style="margin-bottom:0">
                    ${pLabel('INSS (%) — tabela progressiva', 'inssFaixas')}
                    <div class="field-hint" style="margin-bottom:10px">Desconto do empregado, por faixa salarial. Sugerido automaticamente na folha e no 13º (exceto 1ª parcela).</div>
                    <div class="inss-resumo-card">
                        <div class="inss-chips" id="fpInssChips"></div>
                        <button type="button" class="btn btn-secondary btn-sm" id="fpInssEditar">${icon('edit')} Editar faixas</button>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="field">
                    ${pLabel('Base de cálculo da insalubridade', 'insalubridadeBase')}
                    <select class="select" id="fpInsalBase">
                        <option value="salario" ${(params.insalubridadeBase || 'salario') === 'salario' ? 'selected' : ''}>Salário do funcionário</option>
                        <option value="minimo" ${params.insalubridadeBase === 'minimo' ? 'selected' : ''}>Salário mínimo (padrão legal)</option>
                    </select>
                    <div class="field-hint">Grau (10/20/40%) definido no cargo × esta base</div>
                </div>
                <div class="field">
                    ${pLabel('Salário mínimo vigente (R$)', 'salarioMinimo')}
                    <input class="input" id="fpSalMin" type="number" min="0" step="0.01" value="${params.salarioMinimo ?? ''}">
                    <div class="field-hint">Usado quando a base for "Salário mínimo". Atualize quando o mínimo mudar.</div>
                </div>
                <div class="field" style="margin-bottom:0">
                    ${pLabel('Alerta de prazo legal de férias (dias)', 'feriasAlertaLegalDias')}
                    <input class="input" id="fpFeriasAlerta" type="number" min="1" max="365" step="1" value="${params.feriasAlertaLegalDias ?? 60}">
                    <div class="field-hint">
                        Antecedência do alerta <strong>crítico</strong> antes do fim do período concessivo — o prazo que gera
                        pagamento em dobro (art. 137 CLT). O aviso da <strong>data prevista</strong> usa metade deste valor.
                    </div>
                </div>
                <div class="field" style="margin-bottom:0">
                    ${pLabel('Alerta de vencimento do ASO (dias)', 'asoAlertaDias')}
                    <input class="input" id="fpAsoAlerta" type="number" min="1" max="365" step="1" value="${params.asoAlertaDias ?? ASO_PARAMS_PADRAO.alertaDias}">
                    <div class="field-hint">
                        Antecedência do alerta antes do vencimento do exame periódico. A <strong>periodicidade</strong>
                        (6/12/24 meses, ou "Não se aplica") é definida por cargo, no cadastro de Cargos.
                    </div>
                </div>
            </div>
            <button class="btn btn-primary" id="fpSave">${icon('check')} Salvar parâmetros</button>
        </div>

        <div class="card">
            <div class="card-title">Banco de horas</div>
            <div class="card-sub" style="margin-bottom:18px">Regras do acordo de compensação (CLT art. 59, §2º). O ciclo de cada funcionário começa no primeiro mês de saldo publicado para ele.</div>
            <div class="form-row">
                <div class="field">
                    ${pLabel('Duração do ciclo (meses)', 'bhCicloMeses')}
                    <select class="select" id="fpBhCiclo">
                        <option value="6" ${(params.bhCicloMeses ?? 6) == 6 ? 'selected' : ''}>6 meses — acordo individual</option>
                        <option value="12" ${params.bhCicloMeses == 12 ? 'selected' : ''}>12 meses — acordo coletivo</option>
                    </select>
                    <div class="field-hint">Prazo máximo para compensar o saldo. Estourou, o saldo positivo é devido como hora extra.</div>
                </div>
                <div class="field">
                    ${pLabel('Alerta de fechamento do ciclo (dias)', 'bhAlertaDias')}
                    <input class="input" id="fpBhAlerta" type="number" min="1" max="365" step="1" value="${params.bhAlertaDias ?? BH_PARAMS_PADRAO.alertaDias}">
                    <div class="field-hint">Antecedência do alerta <strong>crítico</strong> antes do fim do ciclo — a última janela para compensar em vez de pagar.</div>
                </div>
            </div>
            <div class="form-row">
                <div class="field" style="margin-bottom:0">
                    ${pLabel('Teto mensal de compensação (HH:MM)', 'bhTetoMensalMin')}
                    <input class="input" id="fpBhTeto" placeholder="10:00" value="${fmtHHMM(params.bhTetoMensalMin ?? BH_PARAMS_PADRAO.tetoMensalMin)}">
                    <div class="field-hint">Quanto dá para compensar em um mês. Usado para avisar quando o saldo já não cabe no prazo restante. <strong>00:00</strong> = sem teto.</div>
                </div>
                <div class="field" style="margin-bottom:0">
                    ${pLabel('Adicional de hora extra (%)', 'bhAdicionalPct')}
                    <input class="input" id="fpBhAdicional" type="number" min="0" max="200" step="1" value="${params.bhAdicionalPct ?? BH_PARAMS_PADRAO.adicionalPct}">
                    <div class="field-hint">Só para <strong>estimar</strong> em R$ o custo do saldo não compensado (mínimo legal: 50%). Não lança na folha.</div>
                </div>
            </div>
            <button class="btn btn-primary mt-16" id="fpBhSave">${icon('check')} Salvar banco de horas</button>
        </div>

        <div class="card">
            <div class="card-title">Férias</div>
            <div class="card-sub" style="margin-bottom:18px">Regras de cálculo da remuneração (CF art. 7º XVII, CLT arts. 129-145). A competência de cada funcionário só se encerra quando os lançamentos somam os dias do período — fracionar divide o direito, não o multiplica.</div>
            <div class="form-row">
                <div class="field">
                    ${pLabel('Dias por período', 'feriasDiasPorCiclo')}
                    <input class="input" id="fpFerDias" type="number" min="1" max="60" step="1" value="${params.feriasDiasPorCiclo ?? FERIAS_PARAMS_PADRAO.diasPorCiclo}">
                    <div class="field-hint">Total de uma competência (art. 130: 30 dias). Só fecha quando os lançamentos somam este total.</div>
                </div>
                <div class="field">
                    ${pLabel('Prazo para vencer (meses)', 'feriasMesesVencimento')}
                    <input class="input" id="fpFerVenc" type="number" min="12" max="60" step="1" value="${params.feriasMesesVencimento ?? FERIAS_PARAMS_PADRAO.mesesVencimento}">
                    <div class="field-hint">Do início do aquisitivo até vencer (dobra, art. 137). Padrão 24 (12 aquisitivo + 12 concessivo). Mínimo 12.</div>
                </div>
            </div>
            <div class="form-row">
                <div class="field">
                    ${pLabel('Terço constitucional (%)', 'feriasTercoPct')}
                    <input class="input" id="fpFerTerco" type="number" min="0" max="100" step="0.01" value="${Number(params.feriasTercoPct ?? FERIAS_PARAMS_PADRAO.tercoPct).toFixed(2)}">
                    <div class="field-hint">Adicional sobre a remuneração (art. 7º XVII CF: 1/3 = 33,33%). Convenção pode ser mais generosa, nunca menos.</div>
                </div>
            </div>
            <div class="form-row">
                <div class="field">
                    ${pLabel('Abono pecuniário — máximo (dias)', 'feriasAbonoMaxDias')}
                    <input class="input" id="fpFerAbono" type="number" min="0" max="30" step="1" value="${params.feriasAbonoMaxDias ?? FERIAS_PARAMS_PADRAO.abonoMaxDias}">
                    <div class="field-hint">Dias que o funcionário pode vender (art. 143: até 1/3 do período). Contam para fechar a competência.</div>
                </div>
                <div class="field">
                    ${pLabel('Média de horas extras na base', 'feriasMediaHe')}
                    <label class="flex" style="gap:8px;align-items:center;margin-top:6px;cursor:pointer">
                        <span class="switch"><input type="checkbox" id="fpFerMediaHe" ${(params.feriasMediaHe ?? FERIAS_PARAMS_PADRAO.mediaHe) ? 'checked' : ''}><span class="track"></span></span>
                        <span>Incluir (Súmula 45 TST)</span>
                    </label>
                    <div class="field-hint">HE habitual integra a remuneração de férias. <strong>Confirme a regra da sua convenção coletiva</strong> — ela varia.</div>
                </div>
            </div>
            <div class="field" style="margin-bottom:0">
                ${pLabel('Meses da média de HE', 'feriasMediaHeMeses')}
                <input class="input" id="fpFerMediaMeses" type="number" min="1" max="12" step="1" value="${params.feriasMediaHeMeses ?? FERIAS_PARAMS_PADRAO.mediaHeMeses}">
                <div class="field-hint">Quantos meses do período aquisitivo entram na média. A média divide pelo total de meses, não só pelos que tiveram extra.</div>
            </div>
            <button class="btn btn-primary mt-16" id="fpFerSave">${icon('check')} Salvar férias</button>
        </div>

        <div class="card">
            <div class="card-title">13º Salário</div>
            <div class="card-sub" style="margin-bottom:18px">Regras da gratificação natalina (Lei 4.090/62, Lei 4.749/65). A competência é o <strong>ano civil</strong>, não o aniversário de admissão: os avos são recalculados a cada abertura da tela e se autocorrigem quando uma licença, promoção ou demissão muda o direito.</div>
            <div class="form-row">
                <div class="field">
                    ${pLabel('Prazo da 1ª parcela', 'decimoPrazo1')}
                    <div class="form-row" style="gap:8px">
                        <input class="input" id="fpDecP1Dia" type="number" min="1" max="31" step="1" value="${params.decimoPrazo1Dia ?? DECIMO_PARAMS_PADRAO.prazo1Dia}">
                        <select class="select" id="fpDecP1Mes">
                            ${MESES_FULL.map((n, i) => `<option value="${i + 1}"${(params.decimoPrazo1Mes ?? DECIMO_PARAMS_PADRAO.prazo1Mes) === i + 1 ? ' selected' : ''}>${n}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-hint">Adiantamento — só FGTS incide (Lei 4.749 art. 2º: até 30/11). O INSS fica para a 2ª parcela.</div>
                </div>
                <div class="field">
                    ${pLabel('Prazo da 2ª parcela', 'decimoPrazo2')}
                    <div class="form-row" style="gap:8px">
                        <input class="input" id="fpDecP2Dia" type="number" min="1" max="31" step="1" value="${params.decimoPrazo2Dia ?? DECIMO_PARAMS_PADRAO.prazo2Dia}">
                        <select class="select" id="fpDecP2Mes">
                            ${MESES_FULL.map((n, i) => `<option value="${i + 1}"${(params.decimoPrazo2Mes ?? DECIMO_PARAMS_PADRAO.prazo2Mes) === i + 1 ? ' selected' : ''}>${n}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-hint">FGTS e INSS incidem aqui, sobre o 13º integral (até 20/12).</div>
                </div>
            </div>
            <div class="form-row">
                <div class="field">
                    ${pLabel('Dias para gerar o avo', 'decimoDiasParaAvo')}
                    <input class="input" id="fpDecAvo" type="number" min="1" max="31" step="1" value="${params.decimoDiasParaAvo ?? DECIMO_PARAMS_PADRAO.diasParaAvo}">
                    <div class="field-hint">Mês trabalhado com este mínimo conta 1/12 integral (Lei 4.090 art. 1º §2º: 15 dias).</div>
                </div>
                <div class="field">
                    ${pLabel('Faltas injustificadas descontam o avo', 'decimoDescontarFaltas')}
                    <label class="flex" style="gap:8px;align-items:center;margin-top:6px;cursor:pointer">
                        <span class="switch"><input type="checkbox" id="fpDecFaltas" ${(params.decimoDescontarFaltas ?? DECIMO_PARAMS_PADRAO.descontarFaltas) ? 'checked' : ''}><span class="track"></span></span>
                        <span>Descontar</span>
                    </label>
                    <div class="field-hint">Só faltas <strong>injustificadas</strong>. Licença médica, férias e falta justificada são tempo de serviço e nunca descontam.</div>
                </div>
            </div>
            <div class="field" style="margin-bottom:0">
                ${pLabel('Alerta de prazo (dias)', 'decimoAlertaDias')}
                <input class="input" id="fpDecAlerta" type="number" min="1" max="180" step="1" value="${params.decimoAlertaDias ?? DECIMO_PARAMS_PADRAO.alertaDias}">
                <div class="field-hint">Antecedência do aviso de parcela a vencer, no sino de notificações e na aba.</div>
            </div>
            <button class="btn btn-primary mt-16" id="fpDecSave">${icon('check')} Salvar 13º salário</button>
        </div>

        <div class="card">
            <div class="card-title">Dados de exemplo</div>
            <div class="card-sub" style="margin-bottom:16px">Gera ~20 funcionários fictícios com lançamentos e folha do ano para validar os KPIs. Limpe antes de usar o sistema com dados reais.</div>
            <div class="flex">
                <button class="btn btn-secondary" id="seedGerar">${icon('plus')} Gerar dados de exemplo</button>
                <button class="btn btn-ghost" id="seedLimpar" style="color:var(--danger)">${icon('trash')} Limpar dados de exemplo</button>
            </div>
        </div>
        </div>`;

    cont.querySelectorAll('[data-param-info]').forEach(btn => {
        btn.onclick = () => openParamInfo(btn.dataset.paramInfo);
    });

    // ---- Resumo das faixas de INSS (chips) + botão que abre o modal de edição ----
    const inssFaixasAtuais = () => (params.inssFaixas && params.inssFaixas.length ? params.inssFaixas : INSS_FAIXAS_PADRAO)
        .slice().sort((a, b) => a.ate - b.ate);
    const renderInssChips = () => {
        const box = document.getElementById('fpInssChips');
        box.innerHTML = inssFaixasAtuais().map((f, i, arr) => `
            <span class="inss-chip">
                <span class="inss-chip-faixa">${fmtBRL(i === 0 ? 0 : arr[i - 1].ate)} – ${fmtBRL(f.ate)}</span>
                <span class="inss-chip-aliq">${fmtPct(f.aliquota, 2)}</span>
            </span>`).join('');
    };
    renderInssChips();
    document.getElementById('fpInssEditar').onclick = () => formInssFaixas(params, () => { renderInssChips(); });

    document.getElementById('seedGerar').onclick = async () => {
        const existente = await DB.getObj(SEED_PATH);
        if (existente) return toast('Já existem dados de exemplo. Limpe antes de gerar novamente.', 'error');
        if (!await confirmDialog({ title: 'Gerar dados de exemplo', message: 'Serão criados cargos, unidades, benefícios, ~20 funcionários, lançamentos e folha fictícios. Continuar?', confirmText: 'Gerar' })) return;
        const btn = document.getElementById('seedGerar');
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Gerando...';
        try {
            await gerarDadosExemplo();
            toast('Dados de exemplo criados. Explore o Dashboard e os Resultados.');
        } catch (e) { console.error(e); toast('Erro ao gerar: ' + e.message, 'error'); }
        renderCfgTab();
    };
    document.getElementById('seedLimpar').onclick = async () => {
        if (!await confirmDialog({ title: 'Limpar dados de exemplo', message: 'Todos os registros fictícios serão excluídos permanentemente (dados reais são preservados). Continuar?', confirmText: 'Limpar', danger: true })) return;
        const btn = document.getElementById('seedLimpar');
        btn.disabled = true;
        try {
            const ok = await limparDadosExemplo();
            toast(ok ? 'Dados de exemplo removidos.' : 'Nenhum dado de exemplo encontrado.', ok ? 'success' : 'info');
        } catch (e) { console.error(e); toast('Erro ao limpar: ' + e.message, 'error'); }
        renderCfgTab();
    };

    document.getElementById('fpSave').onclick = async () => {
        const alertaFerias = Number(document.getElementById('fpFeriasAlerta').value);
        if (!(alertaFerias >= 1 && alertaFerias <= 365))
            return toast('O alerta de prazo legal deve ficar entre 1 e 365 dias.', 'error');
        const alertaAso = Number(document.getElementById('fpAsoAlerta').value);
        if (!(alertaAso >= 1 && alertaAso <= 365))
            return toast('O alerta de vencimento do ASO deve ficar entre 1 e 365 dias.', 'error');
        const novos = {
            fgtsPct: Number(document.getElementById('fpFgts').value) || 0,
            diasExperiencia: Number(document.getElementById('fpExp').value) || 90,
            salarioMinimo: Number(document.getElementById('fpSalMin').value) || 0,
            insalubridadeBase: document.getElementById('fpInsalBase').value,
            feriasAlertaLegalDias: alertaFerias,
            asoAlertaDias: alertaAso
        };
        // Preserva o bloco de banco de horas: os dois cards gravam no mesmo path e um
        // DB.set completo aqui apagaria o que o outro salvou.
        await DB.set(PATHS.parametros, { ...params, ...novos });
        Object.assign(params, novos);
        // Os setters leem o conjunto INTEIRO de parâmetros do seu domínio, e o card de Férias
        // grava no mesmo path. Passar só `novos` faria este save zerar dias/terço/abono para
        // o padrão até o próximo reload — o mesmo erro que o spread acima evita no banco.
        setFeriasParams(params);
        setAsoParams(params);
        toast('Parâmetros salvos.');
    };

    document.getElementById('fpBhSave').onclick = async () => {
        const alertaBh = Number(document.getElementById('fpBhAlerta').value);
        if (!(alertaBh >= 1 && alertaBh <= 365))
            return toast('O alerta de fechamento do ciclo deve ficar entre 1 e 365 dias.', 'error');
        // Teto é HH:MM: parseHHMM devolve null quando não consegue ler, e null não pode
        // virar 0 em silêncio — 0 aqui significa "sem teto", que é outra coisa.
        const teto = parseHHMM(document.getElementById('fpBhTeto').value);
        if (teto == null || teto < 0)
            return toast('Teto mensal inválido. Use o formato HH:MM (ex: 10:00) ou 00:00 para sem teto.', 'error');
        const adicional = Number(document.getElementById('fpBhAdicional').value);
        if (!(adicional >= 0 && adicional <= 200))
            return toast('O adicional de hora extra deve ficar entre 0 e 200%.', 'error');

        const novos = {
            bhCicloMeses: Number(document.getElementById('fpBhCiclo').value) || 6,
            bhAlertaDias: alertaBh,
            bhTetoMensalMin: teto,
            bhAdicionalPct: adicional
        };
        await DB.set(PATHS.parametros, { ...params, ...novos });
        Object.assign(params, novos);
        setBhParams(novos);
        toast('Parâmetros de banco de horas salvos.');
    };

    document.getElementById('fpFerSave').onclick = async () => {
        const dias = Number(document.getElementById('fpFerDias').value);
        if (!(dias >= 1 && dias <= 60))
            return toast('Os dias por período devem ficar entre 1 e 60.', 'error');
        const vencMeses = Number(document.getElementById('fpFerVenc').value);
        if (!(vencMeses >= 12 && vencMeses <= 60))
            return toast('O prazo para vencer as férias deve ficar entre 12 e 60 meses.', 'error');
        const terco = Number(document.getElementById('fpFerTerco').value);
        if (!(terco >= 0 && terco <= 100))
            return toast('O terço constitucional deve ficar entre 0 e 100%.', 'error');
        // O piso é constitucional: convenção pode dar mais, nunca menos que 1/3. Aviso em vez
        // de bloqueio — quem opera a folha pode ter um motivo que o sistema não conhece.
        if (terco < 33.33 && !await confirmDialog({
            title: 'Terço abaixo do mínimo legal',
            message: `${fmtPct(terco, 2)} é <strong>menor que o mínimo constitucional</strong> de 33,33% (art. 7º XVII CF).<br><br>
                Convenção coletiva pode ampliar o terço, nunca reduzi-lo. Salvar mesmo assim?`,
            confirmText: 'Salvar assim mesmo', danger: true
        })) return;
        const abono = Number(document.getElementById('fpFerAbono').value);
        if (!(abono >= 0 && abono <= 30))
            return toast('O máximo de abono deve ficar entre 0 e 30 dias.', 'error');
        if (abono > dias / 3 && !await confirmDialog({
            title: 'Abono acima de 1/3',
            message: `${abono} dias é mais que <strong>1/3 de ${dias}</strong> (${Math.floor(dias / 3)} dias), o limite do art. 143 da CLT.<br><br>Salvar mesmo assim?`,
            confirmText: 'Salvar assim mesmo', danger: true
        })) return;
        const mediaMeses = Number(document.getElementById('fpFerMediaMeses').value);
        if (!(mediaMeses >= 1 && mediaMeses <= 12))
            return toast('Os meses da média de HE devem ficar entre 1 e 12.', 'error');

        const novos = {
            feriasDiasPorCiclo: dias,
            feriasMesesVencimento: vencMeses,
            feriasTercoPct: terco,
            feriasAbonoMaxDias: abono,
            feriasMediaHe: document.getElementById('fpFerMediaHe').checked,
            feriasMediaHeMeses: mediaMeses
        };
        await DB.set(PATHS.parametros, { ...params, ...novos });
        Object.assign(params, novos);
        setFeriasParams({ ...params, ...novos });
        toast('Parâmetros de férias salvos.');
    };

    document.getElementById('fpDecSave').onclick = async () => {
        const p1d = Number(document.getElementById('fpDecP1Dia').value);
        const p2d = Number(document.getElementById('fpDecP2Dia').value);
        if (!(p1d >= 1 && p1d <= 31) || !(p2d >= 1 && p2d <= 31))
            return toast('Os dias dos prazos devem ficar entre 1 e 31.', 'error');
        const avo = Number(document.getElementById('fpDecAvo').value);
        if (!(avo >= 1 && avo <= 31))
            return toast('Os dias para gerar o avo devem ficar entre 1 e 31.', 'error');
        const alerta = Number(document.getElementById('fpDecAlerta').value);
        if (!(alerta >= 1 && alerta <= 180))
            return toast('O alerta de prazo deve ficar entre 1 e 180 dias.', 'error');

        const p1m = Number(document.getElementById('fpDecP1Mes').value);
        const p2m = Number(document.getElementById('fpDecP2Mes').value);
        // A 2ª parcela depois da 1ª: invertidos, o abatimento do "já pago" sairia na ordem
        // errada e a 1ª parcela viria sempre zerada.
        if (p2m * 100 + p2d <= p1m * 100 + p1d)
            return toast('O prazo da 2ª parcela deve ser posterior ao da 1ª.', 'error');

        // Aviso, não bloqueio: os prazos legais são 30/11 e 20/12, mas quem opera a folha pode
        // ter um motivo (acordo coletivo antecipando) que o sistema não conhece.
        const legal = p1m === 11 && p1d === 30 && p2m === 12 && p2d === 20;
        if (!legal && !await confirmDialog({
            title: 'Prazos diferentes do legal',
            message: `A Lei 4.749 art. 2º fixa <strong>30/11</strong> para a 1ª parcela e <strong>20/12</strong> para a 2ª.<br><br>
                Antecipar é permitido; atrasar sujeita a empresa a multa administrativa. Salvar assim mesmo?`,
            confirmText: 'Salvar assim mesmo', danger: true
        })) return;

        const avoLegal = avo === 15;
        if (!avoLegal && !await confirmDialog({
            title: 'Avo diferente do legal',
            message: `A Lei 4.090 art. 1º §2º conta o avo a partir de <strong>15 dias</strong> trabalhados no mês.<br><br>
                Exigir mais que 15 dias <strong>reduz o direito do funcionário</strong> abaixo do mínimo legal. Salvar assim mesmo?`,
            confirmText: 'Salvar assim mesmo', danger: true
        })) return;

        const novos = {
            decimoPrazo1Dia: p1d, decimoPrazo1Mes: p1m,
            decimoPrazo2Dia: p2d, decimoPrazo2Mes: p2m,
            decimoDiasParaAvo: avo,
            decimoDescontarFaltas: document.getElementById('fpDecFaltas').checked,
            decimoAlertaDias: alerta
        };
        await DB.set(PATHS.parametros, { ...params, ...novos });
        Object.assign(params, novos);
        // Conjunto inteiro, não só `novos` — mesmo motivo do card de Férias.
        setDecimoParams({ ...params, ...novos });
        // A aba do 13º precisa reler: os avos e os prazos mudaram.
        decimoState.carregado = false;
        toast('Parâmetros de 13º salvos.');
    };
}

// ============ BACKUP ============
// Exporta/restaura o banco inteiro (todos os PATHS) num único arquivo .json, e permite
// zerar tudo. As duas ações que alteram dado (restaurar e apagar) passam por
// confirmarComSenha() — mesma senha de login, não só um "tem certeza?" — porque são
// irreversíveis e cobrem TODO o sistema, não um registro isolado.
async function renderCfgBackup() {
    const cont = document.getElementById('cfgContent');
    cont.innerHTML = `
        <div class="bkp-grid">
            <div class="bkp-card">
                <div class="bkp-card-ico bkp-ico-info">${icon('launch')}</div>
                <h3>Baixar backup</h3>
                <p>Exporta todos os dados do sistema — funcionários, folha, lançamentos, banco de horas e configurações — em um único arquivo <code>.json</code>.</p>
                <button class="btn btn-secondary" id="bkpExportar">${icon('launch')} Baixar backup (.json)</button>
            </div>
            <div class="bkp-card">
                <div class="bkp-card-ico bkp-ico-info">${icon('paperclip')}</div>
                <h3>Restaurar backup</h3>
                <p>Substitui os dados atuais pelo conteúdo de um arquivo <code>.json</code> exportado anteriormente por este sistema. Tudo que não estiver no arquivo é perdido.</p>
                <input type="file" accept="application/json,.json" id="bkpArquivo" hidden>
                <button class="btn btn-secondary" id="bkpImportarBtn">${icon('paperclip')} Selecionar arquivo .json</button>
            </div>
            <div class="bkp-card bkp-card-danger">
                <div class="bkp-card-ico bkp-ico-danger">${icon('trash')}</div>
                <h3>Apagar todos os dados</h3>
                <p>Remove permanentemente todos os registros do banco de dados deste sistema — funcionários, folha, lançamentos, usuários e configurações. Não pode ser desfeito.</p>
                <button class="btn btn-danger" id="bkpApagarBtn">${icon('trash')} Apagar todos os dados</button>
            </div>
        </div>`;

    document.getElementById('bkpExportar').onclick = backupBaixar;
    const inputFile = document.getElementById('bkpArquivo');
    document.getElementById('bkpImportarBtn').onclick = () => inputFile.click();
    inputFile.addEventListener('change', () => {
        const file = inputFile.files[0];
        inputFile.value = '';
        if (file) backupRestaurarFluxo(file);
    });
    document.getElementById('bkpApagarBtn').onclick = backupApagarFluxo;
}

// Lê o valor bruto (não a versão em array de DB.getAll) de cada PATH — é o formato que
// DB.set() espera de volta na restauração, sem reconstrução.
async function backupColeta() {
    const dados = {};
    for (const path of Object.values(PATHS)) dados[path] = await DB.getObj(path);
    return { app: 'curriculolamic', versao: 1, geradoEm: new Date().toISOString(), geradoPor: currentUser?.nome || null, dados };
}

async function backupBaixar() {
    const btn = document.getElementById('bkpExportar');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Gerando backup...';
    try {
        const dump = await backupColeta();
        const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-curriculolamic-${hoje()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Backup gerado.');
    } catch (e) {
        toast(e.message || 'Erro ao gerar backup.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

function backupRestaurarFluxo(file) {
    confirmarComSenha({
        titulo: 'Restaurar backup',
        aviso: `Isso vai <strong>substituir todos os dados atuais</strong> pelo conteúdo de "${escapeHtml(file.name)}". Tudo que não estiver no arquivo será perdido, incluindo lançamentos feitos depois deste backup.`,
        confirmText: 'Restaurar e substituir tudo',
        onConfirm: async (m, btn) => {
            btn.innerHTML = '<span class="spinner"></span> Restaurando...';
            const texto = await file.text();
            let parsed;
            try { parsed = JSON.parse(texto); } catch { throw new Error('Arquivo inválido: não é um JSON válido.'); }
            const dados = parsed && typeof parsed.dados === 'object' && parsed.dados ? parsed.dados : null;
            if (!dados) throw new Error('Arquivo não reconhecido como backup deste sistema.');
            for (const path of Object.values(PATHS)) await DB.set(path, dados[path] ?? null);
            toast('Backup restaurado. Recarregando...');
            m.close();
            setTimeout(() => location.reload(), 900);
        }
    });
}

function backupApagarFluxo() {
    confirmarComSenha({
        titulo: 'Apagar todos os dados',
        aviso: 'Isso vai <strong>apagar permanentemente</strong> todos os funcionários, a folha, lançamentos, usuários e configurações deste sistema. Não há como desfazer — considere baixar um backup antes de continuar.',
        confirmText: 'Apagar tudo',
        onConfirm: async (m, btn) => {
            btn.innerHTML = '<span class="spinner"></span> Apagando...';
            for (const path of Object.values(PATHS)) await DB.set(path, null);
            toast('Todos os dados foram apagados.');
            m.close();
            setTimeout(() => location.reload(), 900);
        }
    });
}

// Modal de confirmação para ações destrutivas que afetam o banco inteiro — exige reentrar a
// senha do usuário logado (não só clicar "confirmar"). `onConfirm(modal, botão)` roda só
// depois da senha bater; erros lançados dentro dela viram toast e reabilitam o botão.
function confirmarComSenha({ titulo, aviso, confirmText, onConfirm }) {
    const m = openModal({
        title: titulo,
        size: 'modal-sm',
        body: `
            <div class="bkp-warn">
                ${icon('alert')}
                <p>${aviso}</p>
            </div>
            <div class="field" style="margin-top:16px">
                <label>Confirme sua senha para continuar <span class="req">*</span></label>
                <input class="input" id="bkpSenhaConf" type="password" autocomplete="current-password" placeholder="Sua senha atual">
                <div class="field-error" id="bkpSenhaErro" style="display:none"></div>
            </div>`,
        footer: ''
    });
    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-danger" data-confirm>${escapeHtml(confirmText)}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;

    const pwdEl = m.body.querySelector('#bkpSenhaConf');
    const erroEl = m.body.querySelector('#bkpSenhaErro');
    const btnConfirm = m.footer.querySelector('[data-confirm]');
    const original = btnConfirm.innerHTML;
    setTimeout(() => pwdEl.focus(), 30);
    pwdEl.addEventListener('keydown', e => { if (e.key === 'Enter') btnConfirm.click(); });

    btnConfirm.onclick = async () => {
        const senha = pwdEl.value;
        erroEl.style.display = 'none';
        if (!senha) { erroEl.textContent = 'Digite sua senha.'; erroEl.style.display = 'block'; return; }

        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<span class="spinner"></span> Verificando...';
        try {
            if (!(await confirmarSenhaDados(senha))) {
                erroEl.textContent = 'Senha incorreta.';
                erroEl.style.display = 'block';
                btnConfirm.disabled = false;
                btnConfirm.innerHTML = original;
                return;
            }
            await onConfirm(m, btnConfirm);
        } catch (e) {
            toast(e.message || 'Erro ao processar.', 'error');
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = original;
        }
    };
}
