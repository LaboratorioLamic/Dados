// Motivos de perda

// MOTIVOS DE PERDA
function loadMotivosPerdaFromFirebase() {
    return database.ref('motivosPerda').once('value').then(snapshot => {
        const data = snapshot.val();
        motivosPerdaList = data ? Object.values(data) : [];
        updateMotivosPerdaSelect();
    }).catch(() => {
        motivosPerdaList = JSON.parse(localStorage.getItem('motivosPerda') || '[]');
        updateMotivosPerdaSelect();
    });
}

function saveMotivosPerdaToFirebase() {
    const obj = {};
    motivosPerdaList.forEach((m, i) => { obj[i] = m; });
    database.ref('motivosPerda').set(obj).catch(() => {});
    localStorage.setItem('motivosPerda', JSON.stringify(motivosPerdaList));
    updateMotivosPerdaSelect();
}

function updateMotivosPerdaSelect() {
    const sel = document.getElementById('reg-motivo-perda');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— Selecione um motivo —</option>' +
        motivosPerdaList.map(m => `<option value="${m}"${m === current ? ' selected' : ''}>${m}</option>`).join('');
}

function openMotivosPerdaModal() {
    renderMotivosPerdaList();
    document.getElementById('modal-motivos-perda').classList.add('active');
}

function closeMotivosPerdaModal() {
    document.getElementById('modal-motivos-perda').classList.remove('active');
    document.getElementById('input-novo-motivo').value = '';
}

function renderMotivosPerdaList() {
    const container = document.getElementById('lista-motivos-perda');
    if (motivosPerdaList.length === 0) {
        container.innerHTML = '<p class="text-slate-400 text-xs text-center py-4">Nenhum motivo cadastrado.</p>';
        return;
    }
    container.innerHTML = motivosPerdaList.map((m, i) => `
        <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <span id="motivo-text-${i}" class="flex-1 text-sm text-slate-700">${m}</span>
            <input id="motivo-input-${i}" type="text" value="${m}" class="flex-1 hidden border border-slate-200 rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" onkeydown="if(event.key==='Enter'){saveEditMotivo(${i});}">
            <button onclick="startEditMotivo(${i})" id="btn-edit-motivo-${i}" class="text-slate-400 hover:text-blue-500 transition-colors px-1"><i class="fas fa-pen text-xs"></i></button>
            <button onclick="saveEditMotivo(${i})" id="btn-save-motivo-${i}" class="text-green-500 hover:text-green-700 transition-colors px-1 hidden"><i class="fas fa-check text-xs"></i></button>
            <button onclick="deleteMotivoPerda(${i})" class="text-slate-400 hover:text-red-500 transition-colors px-1"><i class="fas fa-trash text-xs"></i></button>
        </div>
    `).join('');
}

function addMotivoPerda() {
    const input = document.getElementById('input-novo-motivo');
    const val = input.value.trim();
    if (!val) return;
    if (motivosPerdaList.includes(val)) {
        showNotification('Este motivo já existe na lista.', 'warning', 3000);
        return;
    }
    motivosPerdaList.push(val);
    saveMotivosPerdaToFirebase();
    input.value = '';
    renderMotivosPerdaList();
    addMotivoAuditLog('motivo_add', val, null);
}

function startEditMotivo(i) {
    document.getElementById(`motivo-text-${i}`).classList.add('hidden');
    document.getElementById(`motivo-input-${i}`).classList.remove('hidden');
    document.getElementById(`btn-edit-motivo-${i}`).classList.add('hidden');
    document.getElementById(`btn-save-motivo-${i}`).classList.remove('hidden');
    document.getElementById(`motivo-input-${i}`).focus();
}

function saveEditMotivo(i) {
    const val = document.getElementById(`motivo-input-${i}`).value.trim();
    if (!val) return;
    const oldVal = motivosPerdaList[i];
    if (val === oldVal) { renderMotivosPerdaList(); return; }
    motivosPerdaList[i] = val;
    saveMotivosPerdaToFirebase();
    renderMotivosPerdaList();
    addMotivoAuditLog('motivo_edit', val, oldVal);
}

function deleteMotivoPerda(i) {
    const removed = motivosPerdaList[i];
    motivosPerdaList.splice(i, 1);
    saveMotivosPerdaToFirebase();
    renderMotivosPerdaList();
    addMotivoAuditLog('motivo_delete', null, removed);
}
