// ─── BACKUP FUNCTIONS (from index.html lines ~6564-6641) ─────────────────────

function downloadBackup() {
    if (!checkPerm('backup')) return;
    const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        patients, vaccines, appointments, cancelReasons, holidays, vaccineLots, stockMovements,
        appUsers, appGroups, unidades: unidadesLegado, cpniImunoMap
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `imunogest_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Backup exportado com sucesso!', 'success');
}

function prepareBackupUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.patients || !data.vaccines) throw new Error('Formato inválido');
            pendingBackupData = data;
            document.getElementById('backup-file-label').textContent = file.name;
            document.getElementById('backup-file-name').classList.remove('hidden');
            document.getElementById('backup-confirm-area').classList.remove('hidden');
            document.getElementById('backup-confirm-input').value = '';
            checkBackupConfirm();
        } catch(err) {
            showNotification('Arquivo inválido. Selecione um backup válido do ImunoGest.', 'error');
            pendingBackupData = null;
            document.getElementById('backup-confirm-area').classList.add('hidden');
            document.getElementById('backup-file-name').classList.add('hidden');
        }
    };
    reader.readAsText(file);
}

function checkBackupConfirm() {
    const val = document.getElementById('backup-confirm-input').value.trim().toUpperCase();
    const btn = document.getElementById('btn-confirm-backup');
    const ok  = val === 'SIM' && !!pendingBackupData;
    btn.disabled = !ok;
    btn.className = ok
        ? 'w-full py-2.5 bg-red-600 text-white font-black rounded-xl text-xs uppercase hover:bg-red-700 transition cursor-pointer shadow-md'
        : 'w-full py-2.5 bg-red-200 text-red-400 font-black rounded-xl text-xs uppercase cursor-not-allowed transition';
}

// Importação: aceita o backup do ImunoGest (listas) e o export completo do Firebase (objetos por id),
// que traz também contatos, auditoria e configurações. Antes de gravar, liga cada usuário a uma conta
// do Dados LAMIC pelo CPF e, se não houver, pelo nome completo; o id numérico é mantido. Quando o nome no
// Dados é diferente, as publicações (aplicador, vendedor, pagoPor, usuario, autor) são renomeadas juntas.
async function doBackupUpload() {
    if (!checkPerm('backup')) return;
    if (!pendingBackupData) return;
    const d = pendingBackupData;
    const arr = v => Array.isArray(v) ? v.filter(x => x != null) : _fbToArr(v);
    const limpar = () => {
        pendingBackupData = null;
        document.getElementById('backup-file-input').value = '';
        document.getElementById('backup-file-name').classList.add('hidden');
        document.getElementById('backup-confirm-area').classList.add('hidden');
        document.getElementById('backup-confirm-input').value = '';
    };

    const novosVaccines = arr(d.vaccines);
    const vaccineIds = new Set(novosVaccines.map(v => v.id));
    const allAppointments = arr(d.appointments);
    const orphans = allAppointments.filter(a => !vaccineIds.has(a.vaccineId));
    if (orphans.length > 0) {
        const names = orphans.slice(0, 20).map(a => `• ${a.doseAtual || 'Dose ?'} (ID vacina: ${a.vaccineId})`).join('\n');
        if (!confirm(`⚠️ ${orphans.length} agendamento(s) referenciam vacinas inexistentes neste backup e serão removidos:\n\n${names}\n\nDeseja continuar mesmo assim?`)) return limpar();
    }

    // ── vínculo com o Dados LAMIC
    let du = {}, pv = {};
    try {
        du = (await rootDb.ref('usuarios').once('value')).val() || {};
        pv = (await rootDb.ref('privado').once('value')).val() || {};
    } catch (e) {
        showNotification('Só um administrador do Dados LAMIC pode importar (precisa ler os CPFs para vincular os usuários).', 'error');
        return;
    }
    const porCpf = {};
    Object.entries(pv).forEach(([l, v]) => { const c = _cpfDig(v && v.cpf); if (c && du[l]) porCpf[c] = l; });
    const users = arr(d.appUsers).map(u => ({ ...u }));
    const usados = new Set(), rel = { ja: 0, cpf: 0, nome: 0, sem: [] }, renomes = [];
    users.forEach(u => { if (u.dadosLogin && du[u.dadosLogin]) usados.add(u.dadosLogin); });
    users.forEach(u => {
        delete u.senhaHash;
        let l = u.dadosLogin && du[u.dadosLogin] ? u.dadosLogin : null;
        if (l) rel.ja++;
        if (!l) { const c = _cpfDig(u.cpf); if (c && porCpf[c] && !usados.has(porCpf[c])) { l = porCpf[c]; rel.cpf++; } }
        if (!l) {
            const m = Object.keys(du).filter(k => !usados.has(k) && _nomeChave(du[k].nome) === _nomeChave(u.nome));
            if (m.length === 1) { l = m[0]; rel.nome++; }
        }
        if (!l) { rel.sem.push(u.nome); delete u.dadosLogin; return; }
        usados.add(l); u.dadosLogin = l; u.login = l;
        const nn = String(du[l].nome || '').toUpperCase().trim();
        if (nn && nn !== u.nome) { renomes.push([u.nome, nn]); u.nome = nn; }
    });

    const temContatos = d.patientContacts !== undefined, temAuditoria = d.auditLog !== undefined;
    const msg = `Importar para o banco do Dados LAMIC (nó /vacinas)?\n\n`
        + `Pacientes: ${arr(d.patients).length} · Vacinas: ${novosVaccines.length} · Agendamentos: ${allAppointments.length - orphans.length}\n`
        + `Usuários: ${users.length} → vinculados ${rel.ja + rel.cpf + rel.nome} (já vinculados ${rel.ja}, CPF ${rel.cpf}, nome ${rel.nome}), sem conta no Dados ${rel.sem.length}`
        + (rel.sem.length ? `\n  Sem conta (mantidos para o histórico): ${rel.sem.join(', ')}` : '')
        + (renomes.length ? `\n\nNomes ajustados ao Dados (publicações renomeadas juntas): ${renomes.length}` : '')
        + (temContatos ? '' : `\n\n⚠️ Este arquivo NÃO traz contatos dos pacientes, auditoria nem configurações (backup do app). Os atuais serão mantidos. Para trazer tudo, use o export JSON do Firebase do banco antigo.`)
        + `\n\nOs dados atuais do ImunoGest serão substituídos.`;
    if (!confirm(msg)) return limpar();

    patients       = arr(d.patients);
    vaccines       = novosVaccines;
    appointments   = allAppointments.filter(a => vaccineIds.has(a.vaccineId));
    cancelReasons  = _normalizeSimpleArr(d.cancelReasons);
    holidays       = _normalizeSimpleArr(d.holidays);
    vaccineLots    = arr(d.vaccineLots);
    stockMovements = arr(d.stockMovements);
    if (temContatos) patientContacts = arr(d.patientContacts);
    appUsers = users;
    if (d.appGroups) appGroups = arr(d.appGroups);
    if (d.cpniImunoMap) cpniImunoMap = d.cpniImunoMap;
    if (d.unidades) { unidadesLegado = arr(d.unidades); montarUnidades(); }   // cadastro antigo; a lista oficial vem do RH
    renomes.forEach(([a, b]) => renomearReferencias(a, b));

    const up = {
        patients: _arrToFbObj(patients), vaccines: _arrToFbObj(vaccines), appointments: _arrToFbObj(appointments),
        cancelReasons, holidays, vaccineLots: _arrToFbObj(vaccineLots), stockMovements: _arrToFbObj(stockMovements),
        patientContacts: _arrToFbObj(patientContacts), cpniImunoMap,
        appUsers: _arrToFbObj(appUsers), appGroups: _arrToFbObj(appGroups), unidades: _arrToFbObj(unidadesLegado)
    };
    if (temAuditoria) up.auditLog = _arrToFbObj(arr(d.auditLog));
    if (d.appSettings) up.appSettings = d.appSettings;
    try {
        await db.ref().update(up);
    } catch (e) {
        showNotification('Erro ao gravar a importação: ' + (e.message || e), 'error');
        return;
    }
    limpar();
    showNotification(`Backup importado: ${rel.ja + rel.cpf + rel.nome} usuário(s) vinculados ao Dados LAMIC. Recarregando…`, 'success');
    setTimeout(() => location.reload(), 1500);
}
