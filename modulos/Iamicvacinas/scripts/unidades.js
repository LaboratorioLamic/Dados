// ─── UNIDADES DE COLETA ──────────────────────────────────────────────────────
// Onde a vacina é aplicada quando o Local da Aplicação é "Laboratório".
// Fonte: cadastro de unidades do RH (rh_unidades, no Dados LAMIC). Aqui é só
// leitura: criar, renomear ou excluir unidade se faz no RH.
// Agendamentos antigos guardam o id do cadastro antigo do ImunoGest
// (vacinas/unidades). Esse cadastro fica intacto e cada unidade antiga com o
// MESMO nome de uma unidade do RH passa a valer como ela (id do RH), sem
// duplicar na lista. Sem par no RH, ela só aparece no histórico.

const UNIDADE_CAMPOS_END = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'];

// Só decide quem VÊ a aba de unidades (consulta); criar/editar é sempre no RH
function canGerenciarUnidades() { return isCurrentUserAdmin() || hasPerm('gerenciar_unidades'); }

function _nomeExatoUnidade(n) {
    return String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
// "01 - UNIDADE NTO" -> "NTO": sem número/“unidade” na frente (usado só se não houver nome exato)
function _chaveUnidade(n) {
    return _nomeExatoUnidade(n).replace(/^\d+\s*[-–.]\s*/, '').replace(/\bUNIDADE\b/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
}

function montarUnidades() {
    const rh = Object.entries(unidadesRh || {}).filter(([, u]) => u && u.nome)
        .map(([id, u]) => ({ id, nome: u.nome, enderecoTexto: u.endereco || '', ativo: true, rh: true }));
    const unico = (lista) => lista.length === 1 ? lista[0].id : null;
    const legado = (unidadesLegado || []).map(u => {
        // 1º nome igual (ignora acento/maiúscula/espaços); 2º nome sem número/"unidade" — só se for único
        let rhId = unico(rh.filter(x => _nomeExatoUnidade(x.nome) === _nomeExatoUnidade(u.nome)));
        if (!rhId) rhId = unico(rh.filter(x => _chaveUnidade(x.nome) === _chaveUnidade(u.nome)));
        return { ...u, ativo: false, legado: true, rhId };
    });
    unidades = rh.concat(legado);
}

function _unidadeCrua(id) {
    if (id == null || id === '') return null;
    return unidades.find(u => String(u.id) === String(id)) || null;
}

// Unidade antiga com par no RH responde como a unidade do RH.
function unidadeById(id) {
    const u = _unidadeCrua(id);
    if (u && u.legado && u.rhId) return _unidadeCrua(u.rhId) || u;
    return u;
}

function unidadeNome(id) {
    const u = unidadeById(id);
    if (u) return u.nome;
    return id ? 'Unidade removida' : '';
}

function unidadesOrdenadas() {
    return unidades.filter(u => !u.legado)
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}

function unidadeEnderecoResumo(u) {
    if (!u) return '';
    if (u.enderecoTexto) return u.enderecoTexto;
    if (!u.endereco) return '';
    const e = u.endereco;
    const rua = [e.logradouro, e.numero].filter(Boolean).join(', ');
    return [rua, e.bairro, [e.cidade, e.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ');
}

// Agendamentos da unidade: pelo id do RH ou por unidade antiga ligada a ela
function _usosUnidade(u) {
    if (typeof appointments === 'undefined') return 0;
    const ids = new Set([String(u.id)]);
    if (!u.legado) unidades.forEach(x => { if (x.legado && String(x.rhId) === String(u.id)) ids.add(String(x.id)); });
    return appointments.filter(a => a.endereco && a.endereco.unidadeId != null && ids.has(String(a.endereco.unidadeId))).length;
}

function _escUnid(t) { return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ─── LISTA SUSPENSA NO AGENDAMENTO ───────────────────────────────────────────
// Só unidades ativas entram na lista. A exceção é a unidade já gravada num
// agendamento antigo (`incluirId`): sem ela na lista o select cairia para vazio
// e o registro perderia a unidade só por ter sido reaberto.
function populateUnidadeSelects(incluirId) {
    ['reg-unidade', 'grpend-unidade'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const anterior = sel.value;
        const lista = unidadesOrdenadas();
        const antiga = _unidadeCrua(incluirId);
        // antiga sem par no RH: entra na lista só para o registro não perder a unidade
        if (antiga && antiga.legado && !antiga.rhId) lista.push(antiga);
        // antiga com par: o agendamento reaberto passa a apontar para o id do RH
        const doRh = antiga && antiga.legado && antiga.rhId ? antiga.rhId : null;
        sel.innerHTML = '<option value="">Selecione a unidade...</option>' + lista.map(u => {
            const inativa = u.legado ? ' (antiga)' : '';
            return `<option value="${u.id}">${u.nome}${inativa}</option>`;
        }).join('');
        if (!lista.length) {
            sel.innerHTML = '<option value="">Nenhuma unidade cadastrada</option>';
        }
        // Restaura a escolha anterior quando ela ainda existe na lista.
        if (anterior && lista.some(u => String(u.id) === String(anterior))) sel.value = anterior;
        else if (doRh && String(anterior) === String(incluirId)) sel.value = doRh;
    });
}

// ─── CADASTRO (Configurações → Unidades) ─────────────────────────────────────

let _editUnidadeId = null;
let _pendingDeleteUnidadeId = null;

function renderUnidadesList() {
    const el = document.getElementById('unidades-list');
    if (!el) return;
    const lista = unidadesOrdenadas();
    const semPar = unidades.filter(u => u.legado && !u.rhId);
    const badge = document.getElementById('unidades-count-badge');
    if (badge) badge.textContent = lista.length + (lista.length === 1 ? ' unidade' : ' unidades');

    const card = (u, antiga) => {
        const usos = _usosUnidade(u);
        const resumo = unidadeEnderecoResumo(u);
        const ini = (_chaveUnidade(u.nome) || '?').split(' ').slice(0, 2).map(w => w[0]).join('');
        return `<div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm ${antiga ? 'opacity-70' : ''}">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${antiga ? 'from-slate-400 to-slate-500' : 'from-clinic-600 to-clinic-700'} flex items-center justify-center shrink-0 shadow-sm">
                    <span class="text-white font-black text-xs">${_escUnid(ini)}</span>
                </div>
                <div class="min-w-0">
                    <h5 class="font-black text-navy-900 text-sm truncate flex items-center gap-1.5">${_escUnid(u.nome)}
                        ${antiga ? '<span class="inline-flex items-center px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 text-[9px] font-black rounded-full uppercase">Sem par no RH</span>' : ''}</h5>
                    <p class="text-[10px] text-slate-400 font-semibold truncate">${_escUnid(resumo) || 'Sem endereço informado'}</p>
                    <p class="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                        <i class="fas fa-syringe text-[9px]"></i> ${usos} agendamento${usos !== 1 ? 's' : ''}</p>
                </div>
            </div>
        </div>`;
    };

    el.innerHTML = (lista.length ? lista.map(u => card(u, false)).join('') : `<div class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><i class="fas fa-hospital text-slate-300 text-2xl"></i></div>
            <p class="text-sm font-black text-slate-400 uppercase tracking-wider">Nenhuma unidade no RH</p>
            <p class="text-xs text-slate-300 mt-1">Cadastre em Dados LAMIC › RH › Configurações › Unidades</p></div>`)
        + (semPar.length ? `<p class="text-[10px] font-black text-amber-600 uppercase tracking-wider pt-4">Unidades antigas sem nome igual no RH (ficam só no histórico; crie no RH com o mesmo nome para ligar)</p>`
            + semPar.map(u => card(u, true)).join('') : '');
}

function resetUnidadeForm() {
    _editUnidadeId = null;
    const form = document.getElementById('unidade-form');
    if (form) form.reset();
    document.getElementById('unidade-form-title').textContent = 'Nova Unidade';
    document.getElementById('unidade-form-icon').className = 'fas fa-plus text-clinic-600 text-xs';
}

function editUnidade(id) {
    showNotification('Unidades vêm do RH (Dados LAMIC). Cadastre ou edite lá.', 'info'); return;
    if (!checkPerm('gerenciar_unidades')) return;
    const u = unidadeById(id);
    if (!u) return;
    _editUnidadeId = u.id;
    document.getElementById('unidade-nome').value = u.nome || '';
    const end = u.endereco || {};
    UNIDADE_CAMPOS_END.forEach(c => {
        const el = document.getElementById('unidade-' + c);
        if (el) el.value = end[c] || '';
    });
    document.getElementById('unidade-form-title').textContent = 'Editar Unidade';
    document.getElementById('unidade-form-icon').className = 'fas fa-pen text-clinic-600 text-xs';
    document.getElementById('unidade-nome').focus();
}

// Mesma consulta do endereço do agendamento, sem a máquina de prefixos: aqui há
// um único formulário e ele não concorre com nenhum outro.
async function buscarCepUnidade() {
    const cepEl = document.getElementById('unidade-cep');
    if (!cepEl) return;
    const cep = cepEl.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        if (data.erro) { showNotification('CEP não encontrado.', 'error'); return; }
        const set = (campo, valor) => {
            const el = document.getElementById('unidade-' + campo);
            if (el && valor) el.value = String(valor).toUpperCase();
        };
        set('logradouro', data.logradouro);
        set('bairro', data.bairro);
        set('cidade', data.localidade);
        set('estado', data.uf);
        document.getElementById('unidade-numero')?.focus();
    } catch (err) {
        showNotification('Não foi possível consultar o CEP. Verifique sua conexão.', 'error');
    }
}

function saveUnidade(e) {
    if (e && e.preventDefault) e.preventDefault();
    showNotification('Unidades vêm do RH (Dados LAMIC). Cadastre ou edite lá.', 'info'); return;
    e.preventDefault();
    if (!checkPerm('gerenciar_unidades')) return;

    const nome = document.getElementById('unidade-nome').value.trim().toUpperCase();
    if (!nome) { showNotification('Informe o nome da unidade.', 'error'); return; }

    const dup = unidades.find(u => String(u.nome || '').toUpperCase() === nome && String(u.id) !== String(_editUnidadeId));
    if (dup) { showNotification('Já existe uma unidade com este nome.', 'error'); return; }

    const endereco = {};
    UNIDADE_CAMPOS_END.forEach(c => {
        const v = (document.getElementById('unidade-' + c)?.value || '').trim();
        endereco[c] = c === 'cep' ? v : v.toUpperCase();
    });

    const labels = { nome: 'Nome', cep: 'CEP', logradouro: 'Logradouro', numero: 'Número', bairro: 'Bairro', cidade: 'Cidade', estado: 'UF' };
    const achatar = u => ({ nome: u.nome, ...(u.endereco || {}) });

    if (_editUnidadeId != null) {
        const idx = unidades.findIndex(u => String(u.id) === String(_editUnidadeId));
        if (idx > -1) {
            const antes = achatar(unidades[idx]);
            unidades[idx] = { ...unidades[idx], nome, endereco };
            const changes = computeChanges(antes, achatar(unidades[idx]), labels);
            if (changes.length) logAudit('Editado', 'unidade', unidades[idx].id, nome, null, changes);
        }
        showNotification('Unidade atualizada com sucesso!', 'success');
    } else {
        const nova = { id: Date.now(), nome, ativo: true, endereco };
        unidades.push(nova);
        logAudit('Criado', 'unidade', nova.id, nome, unidadeEnderecoResumo(nova) || null);
        showNotification('Unidade cadastrada com sucesso!', 'success');
    }

    saveUnidades();
    resetUnidadeForm();
    renderUnidadesList();
    populateUnidadeSelects();
}

function toggleUnidadeAtiva(id) {
    showNotification('Unidades vêm do RH (Dados LAMIC). Cadastre ou edite lá.', 'info'); return;
    if (!checkPerm('gerenciar_unidades')) return;
    const idx = unidades.findIndex(u => String(u.id) === String(id));
    if (idx < 0) return;
    const ativa = unidades[idx].ativo !== false;
    unidades[idx].ativo = !ativa;
    logAudit('Editado', 'unidade', unidades[idx].id, unidades[idx].nome,
        ativa ? 'Unidade desativada' : 'Unidade reativada');
    saveUnidades();
    renderUnidadesList();
    populateUnidadeSelects();
    showNotification(ativa ? 'Unidade desativada.' : 'Unidade reativada.', 'success');
}

// Excluir some com a unidade do histórico dos agendamentos; por isso só passa
// quando nenhum agendamento aponta para ela. Para tirar de circulação sem perder
// o histórico existe o botão de desativar.
function deleteUnidade(id) {
    showNotification('Unidades vêm do RH (Dados LAMIC). Cadastre ou edite lá.', 'info'); return;
    if (!checkPerm('gerenciar_unidades')) return;
    const u = unidadeById(id);
    if (!u) return;
    const usos = (typeof appointments !== 'undefined')
        ? appointments.filter(a => a.endereco && String(a.endereco.unidadeId) === String(u.id)).length
        : 0;
    if (usos > 0) {
        showNotification(`Não é possível excluir: ${usos} agendamento(s) usam esta unidade. Desative-a em vez de excluir.`, 'error');
        return;
    }
    showConfirmDanger(`Excluir a unidade "${u.nome}"?`, () => {
        unidades = unidades.filter(x => String(x.id) !== String(u.id));
        logAudit('Excluído', 'unidade', u.id, u.nome, unidadeEnderecoResumo(u) || null);
        saveUnidades();
        resetUnidadeForm();
        renderUnidadesList();
        populateUnidadeSelects();
        showNotification('Unidade excluída.', 'success');
    });
}
