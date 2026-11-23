// Backup, importação/exportação e status das configurações

// FUNÇÕES DE BACKUP E CONFIGURAÇÕES
function updateConfigStatus() {
    const total = AGENDA_IDS.reduce((soma, id) => soma + appointmentsDe(id).length, 0);
    document.getElementById('total-appointments').innerText = total;
}

function exportData() {
    const agendasExport = {};
    AGENDA_IDS.forEach(id => agendasExport[id] = appointmentsDe(id));
    const total = AGENDA_IDS.reduce((soma, id) => soma + appointmentsDe(id).length, 0);

    const backupData = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        agendas: agendasExport,
        appointments: appointments,   // compatibilidade com backups v1.0 (agenda ativa)
        agendaAtiva: currentAgendaId,
        atendentesList: atendentesList,
        metadata: {
            totalAppointments: total,
            firebaseConnected: !!database,
            exportType: 'full_backup'
        }
    };

    const dataStr = JSON.stringify(backupData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `respiroLamic_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification('✅ Backup exportado com sucesso! Arquivo salvo como: respiroLamic_backup_' + new Date().toISOString().split('T')[0] + '.json', 'success');
}

// Nós do banco que acompanham os agendamentos. `users` e `config` ficam de fora: o acesso agora
// vem do Dados LAMIC e o backup antigo traz senhas.
const NOS_RESTAURAVEIS = ['imgBlobs', 'holidays', 'blockedSlots', 'motivosPerda', 'geoBairros', 'auditLog'];

// Aceita três formatos:
//   • backup do app v2.0  → { agendas: { respiratorio: [..], coletaDomiciliar: [..] } }
//   • backup do app v1.0  → { appointments: [..] } (agenda respiratória)
//   • exportação JSON do banco (Console Firebase) → { agendas: { 'coleta-domiciliar': { appointments: {..} } }, imgBlobs, ... }
function _lerBackup(backupData) {
    const porAgenda = {};
    const ags = backupData.agendas;
    if (ags && typeof ags === 'object') {
        AGENDA_IDS.forEach(id => {
            if (Array.isArray(ags[id])) { porAgenda[id] = ags[id]; return; }
            const pasta = getAgenda(id).fbPath.split('/').pop();   // agendas/coleta-domiciliar → coleta-domiciliar
            const no = ags[pasta]?.appointments;
            if (no && typeof no === 'object') porAgenda[id] = _toAppointmentList(no);
        });
    } else if (Array.isArray(backupData.appointments)) {
        porAgenda[AGENDA_PADRAO] = backupData.appointments;
    }
    const extras = {};
    NOS_RESTAURAVEIS.forEach(n => { if (backupData[n] && typeof backupData[n] === 'object') extras[n] = backupData[n]; });
    return { porAgenda, extras };
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const backupData = JSON.parse(e.target.result);
            const { porAgenda, extras } = _lerBackup(backupData);

            const alvos = Object.keys(porAgenda);
            if (!alvos.length) throw new Error('Formato de backup inválido');

            const total = alvos.reduce((soma, id) => soma + porAgenda[id].length, 0);
            const resumo = alvos.map(id => `• ${getAgenda(id).nome}: ${porAgenda[id].length}`).join('\n');
            const nomesExtras = Object.keys(extras);
            const semImagens = !extras.imgBlobs && alvos.some(id => porAgenda[id].some(a => JSON.stringify(a).includes('"tipo":"imagem"')));

            const confirmImport = confirm(
                `⚠️ ATENÇÃO!\n\n` +
                `Você está prestes a importar ${total} agendamentos:\n${resumo}\n\n` +
                (nomesExtras.length ? `Também serão restaurados: ${nomesExtras.join(', ')}.\n\n` : '') +
                (semImagens ? `Este arquivo não traz as imagens anexadas (imgBlobs). As imagens que já estão no banco continuam; as que não estão ficarão sem abrir.\n\n` : '') +
                `Isso SUBSTITUIRÁ os dados atuais dessas agendas.\n\n` +
                `Deseja continuar?`
            );
            if (!confirmImport) return;

            showNotification('Importando backup… não feche a página.', 'info');
            const erros = [];
            for (const id of alvos) {
                const lista = porAgenda[id].map(app => {
                    if (!app.status) app.status = app.chkConcluido ? 'Concluído' : 'Agendado';
                    return app;
                });
                setAppointments(lista, id);
                try { await saveAppointmentsToFirebase(id); }
                catch (err) { erros.push(`${getAgenda(id).nome}: ${err.message || err}`); }
            }
            for (const n of nomesExtras) {
                try { await database.ref(n).set(JSON.parse(JSON.stringify(extras[n]))); }
                catch (err) { erros.push(`${n}: ${err.message || err}`); }
            }

            // Restaurar lista de atendentes se existir
            if (backupData.atendentesList && Array.isArray(backupData.atendentesList)) {
                atendentesList = backupData.atendentesList;
                updateFilterDropdowns();
            }

            renderHomeCards();
            renderTable();
            renderCalendar();
            updateDatalists();
            updateConfigStatus();

            if (erros.length) showNotification('❌ Backup importado com erros: ' + erros.join(' | '), 'error');
            else showNotification(`✅ Backup importado com sucesso! ${total} agendamentos restaurados.`, 'success');
        } catch (error) {
            showNotification('❌ Erro ao importar backup: ' + error.message + '. Verifique se o arquivo é um backup válido.', 'error');
        }
    };
    reader.readAsText(file);

    // Limpar o input para permitir importar o mesmo arquivo novamente
    event.target.value = '';
}


// Navega diretamente (uso interno)
function switchTabDirect(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    markActiveTab(tab);
    if (tab === 'inicio') renderHomeCards();
    if (tab === 'dashboard') renderCalendar();
    if (tab === 'indicadores') renderIndicadores();
    if (tab === 'config') { updateConfigStatus(); updateConfigSectionVisibility(); }
}

const _origSwitchTab = switchTab;
switchTab = function(tab) {
    if (tab === 'config' && !isAdmin()) {
        showNotification('Acesso restrito a administradores.', 'warning');
        return;
    }
    _origSwitchTab(tab);
    if (tab === 'config') { updateConfigStatus(); updateConfigSectionVisibility(); }
};
