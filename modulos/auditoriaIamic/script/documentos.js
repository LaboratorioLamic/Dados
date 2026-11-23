    function saveDocumento() {
        originalItem = null;

        const dataCriacao = document.getElementById('docDataCriacao').value;
        const rotinaVal = document.getElementById('docRotina').value;
        const freqVal = Number(document.getElementById('docFrequencia').value) || 1;
        const selectedDays = Array.from(document.querySelectorAll('#docWeekdays .wd-btn.active')).map(b => Number(b.dataset.day));
        const dataProximaRevisao = document.getElementById('docDataProximaRevisao').value;

        const isNew = !editingDocId;
        let item = isNew ? { id: (typeof generateId === 'function' ? generateId() : Date.now()), historico: [], type: 'doc' } : documents.find(d => d.id === editingDocId);

        const selectedDocMarkerName = document.getElementById('docMarcador').value;
        const docMarkerObj = (masterLists.docMarcadores || []).find(m => m.name === selectedDocMarkerName);

        let responsavel = (typeof msGetValue === 'function') ? msGetValue('doc-resp') : [];
        let revisor     = (typeof msGetValue === 'function') ? msGetValue('doc-rev')  : [];
        if (!Array.isArray(responsavel)) responsavel = responsavel ? [responsavel] : [];
        if (!Array.isArray(revisor))     revisor     = revisor     ? [revisor]     : [];

        if (typeof _checkPartialPermOnSave === 'function' && !_checkPartialPermOnSave(isNew, responsavel, revisor)) return;

        if (!isNew && !userIsAdmin()) {
            if (!responsavel.length) {
                const prev = item.responsavel;
                try { responsavel = Array.isArray(prev) ? prev : (prev ? JSON.parse(prev) : []); } catch { responsavel = prev ? [prev] : []; }
            }
            if (!revisor.length) {
                const prev = item.revisor;
                try { revisor = Array.isArray(prev) ? prev : (prev ? JSON.parse(prev) : []); } catch { revisor = prev ? [prev] : []; }
            }
        }

        responsavel = JSON.stringify(responsavel);
        revisor     = JSON.stringify(revisor);

        const _setorArrDoc = (typeof smsGetValue === 'function') ? smsGetValue('doc') : [];
        const _setorFieldGroupDoc = document.getElementById('sms-doc')?.closest('.field-group');
        if (_setorFieldGroupDoc) _setorFieldGroupDoc.classList.toggle('field-error', !_setorArrDoc.length);
        if (!_setorArrDoc.length) {
            if (typeof showToast === 'function') showToast('É necessário selecionar ao menos um Setor para salvar o registro.', 'error');
            document.getElementById('sms-doc')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (typeof _validateRequiredFields === 'function') {
            if (!_validateRequiredFields([
                { id: 'docTitulo',    label: 'Título' },
                { id: 'docCategoria', label: 'Categoria' },
            ])) return;
        }

        const _respArrDoc = JSON.parse(responsavel || '[]');
        if (!_respArrDoc.length) {
            if (typeof showToast === 'function') showToast('É necessário ao menos um Responsável para salvar o registro.', 'error');
            document.getElementById('ms-doc-resp-input')?.focus();
            return;
        }

        const _newChecklistPubDoc = (typeof getChecklistPub === 'function') ? getChecklistPub('doc') : (item.checklistPublicacao || []);
        if (!isNew && typeof syncChecklistPublicacaoHistory === 'function') syncChecklistPublicacaoHistory(item, _newChecklistPubDoc);

        const newItem = {
            ...item,
            titulo: document.getElementById('docTitulo').value,
            descricao: document.getElementById('docDescricao').value,
            setor: JSON.stringify(_setorArrDoc),
            categoria: document.getElementById('docCategoria').value,
            subcategoria: '',
            status: document.getElementById('docStatus').value,
            dataCriacao,
            dataProximaRevisao,
            rotina: rotinaVal,
            frequencia: freqVal,
            diasSemana: rotinaVal === 'diasemana' ? selectedDays : [],
            responsavel: responsavel,
            revisor: revisor,
            flagDias: +document.getElementById('docFlagDias').value,
            marcador: docMarkerObj ? docMarkerObj.name : '',
            marcadorCor: docMarkerObj ? docMarkerObj.color : 'default',
            overdueStatus: document.getElementById('docOverdueStatus').value || '',
            alertStatus: document.getElementById('docAlertStatus')?.value || '',
            resetChecklistOnAutoStatus: (typeof getSchedResetChecklist === 'function') ? getSchedResetChecklist('doc') : false,
            anexos: getAnexos('doc'),
            checklist: (typeof getChecklist === 'function') ? getChecklist('doc') : (item.checklist || []),
            checklistPublicacao: _newChecklistPubDoc,
            historico: item && Array.isArray(item.historico) ? [...item.historico] : []
        };

        if (isNew) {
            newItem.createdAt = new Date().toISOString();
            newItem.historico.push({ timestamp: new Date().toISOString(), acao: 'Criação do Registro', usuario: currentuser ? (currentuser.name || currentuser.user) : 'Sistema', snapshot: _safeSnapshot(newItem) });
            documents.push(newItem);
        } else {
            if (!originalItem) {
                originalItem = JSON.parse(JSON.stringify(item));
            }
            if (!newItem.historico || !Array.isArray(newItem.historico)) {
                newItem.historico = originalItem.historico ? [...originalItem.historico] : [];
            }

            const _docIsConcluido = typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(newItem.status) : /conclu/i.test(newItem.status);
            const _docWasConcluido = typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(originalItem.status) : /conclu/i.test(originalItem.status);
            if (_docIsConcluido && typeof isItemOverdue === 'function' && isItemOverdue(newItem, 'doc')) {
                showOverdueConcluiModal();
                return;
            }
            // Só bloqueia se está ALTERANDO para concluído, não se já era concluído
            const _docIsConcluindo = _docIsConcluido && !_docWasConcluido;
            if (_docIsConcluindo && !canSetConcluido(newItem.checklist, newItem)) {
                if (typeof showToast === 'function') showToast('Conclua todos os itens do checklist de publicação antes de marcar como Concluído.', 'error');
                return;
            }
            if (_docIsConcluido && typeof checkSchedWarnBeforeConcluido === 'function' && !window._schedWarnPassed_doc) {
                checkSchedWarnBeforeConcluido(newItem, 'documentos').then(ok => {
                    if (!ok) return;
                    window._schedWarnPassed_doc = true;
                    saveDocumento();
                    window._schedWarnPassed_doc = false;
                });
                return;
            }
            window._schedWarnPassed_doc = false;

            // Saindo de Concluído → incrementa ciclo de publicação
            const _prevWasConcluidoDoc = typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(originalItem.status) : /conclu/i.test(originalItem.status);
            const _newNotConcluidoDoc = !_docIsConcluido;
            if (_prevWasConcluidoDoc && _newNotConcluidoDoc) {
                newItem.pubCycleId = (newItem.pubCycleId || 1) + 1;
            }

            const changes = calculateChanges(originalItem, newItem);
            if (changes.length > 0) {
                newItem.historico.push({
                    timestamp: new Date().toISOString(),
                    acao: 'Edição de Dados',
                    usuario: currentuser ? (currentuser.name || currentuser.user) : 'Sistema',
                    detalhes: changes,
                    snapshot: _safeSnapshot(originalItem)
                });
            }
            documents = documents.map(d => d.id === editingDocId ? newItem : d);
        }

        saveAll(); closeFormDrawer(); renderCards();
        if (typeof isCalendarActive === 'function' && isCalendarActive()) renderCalendar();
    }

    function duplicateDocumento() {
        if (!userCanEditCards()) {
            alert('Você não tem permissão para duplicar cards. Seu acesso está configurado como somente leitura.');
            return;
        }

        const originalDocDup = editingDocId ? documents.find(d => d.id === editingDocId) : null;
        const dupChecklistDoc = originalDocDup ? JSON.parse(JSON.stringify({ checklist: originalDocDup.checklist || [], checklistPublicacao: originalDocDup.checklistPublicacao || [] })) : null;
        if (dupChecklistDoc && typeof resetChecklistItems === 'function') resetChecklistItems(dupChecklistDoc);
        const rotinaValDup = document.getElementById('docRotina').value;
        const formData = {
            title: document.getElementById('docTitulo').value,
            categoria: document.getElementById('docCategoria').value,
            setor: (typeof smsGetValue === 'function') ? JSON.stringify(smsGetValue('doc')) : document.getElementById('docSetor').value,
            status: document.getElementById('docStatus').value,
            dataCriacao: document.getElementById('docDataCriacao').value,
            dataProximaRevisao: document.getElementById('docDataProximaRevisao').value,
            rotina: rotinaValDup,
            frequencia: Number(document.getElementById('docFrequencia').value) || 1,
            diasSemana: Array.from(document.querySelectorAll('#docWeekdays .wd-btn.active')).map(b => Number(b.dataset.day)),
            responsavel: (typeof msGetValue === 'function') ? JSON.stringify(msGetValue('doc-resp')) : document.getElementById('docResponsavel').value,
            revisor:     (typeof msGetValue === 'function') ? JSON.stringify(msGetValue('doc-rev'))  : document.getElementById('docRevisor').value,
            flagDias: document.getElementById('docFlagDias').value,
            marcador: document.getElementById('docMarcador').value,
            marcadorCor: (() => { const n = document.getElementById('docMarcador').value; const mk = (masterLists.docMarcadores || []).find(m => m.name === n); return mk ? mk.color : 'default'; })(),
            descricao: document.getElementById('docDescricao').value,
            overdueStatus: document.getElementById('docOverdueStatus')?.value || '',
            alertStatus: document.getElementById('docAlertStatus')?.value || '',
            resetChecklistOnAutoStatus: (typeof getSchedResetChecklist === 'function') ? getSchedResetChecklist('doc') : false,
            anexos: typeof getAnexos === 'function' ? getAnexos('doc') : []
        };

        closeFormDrawer();

        setTimeout(() => {
            editingDocId = null;
            resetModal('doc');

            document.getElementById('docTitulo').value = formData.title;
            document.getElementById('docCategoria').value = formData.categoria;
            if (typeof smsSetValue === 'function') smsSetValue('doc', formData.setor || '');
            document.getElementById('docStatus').value = formData.status;
            document.getElementById('docDataCriacao').value = formData.dataCriacao;
            document.getElementById('docDataProximaRevisao').value = formData.dataProximaRevisao;
            document.getElementById('docRotina').value = formData.rotina;
            document.getElementById('docFrequencia').value = formData.frequencia;
            document.querySelectorAll('#docWeekdays .wd-btn').forEach(b => b.classList.remove('active'));
            formData.diasSemana.forEach(d => {
                const btn = document.querySelector(`#docWeekdays .wd-btn[data-day="${d}"]`);
                if (btn) btn.classList.add('active');
            });
            if (typeof msSetValue === 'function') { msSetValue('doc-resp', formData.responsavel || ''); msSetValue('doc-rev', formData.revisor || ''); }
            document.getElementById('docFlagDias').value = formData.flagDias;
            document.getElementById('docMarcador').value = formData.marcador;
            document.getElementById('docDescricao').value = formData.descricao;

            if (typeof restoreAnexos === 'function') restoreAnexos('doc', formData.anexos);

            // Duplica a Programação de Status Concluído (se houver)
            if (typeof setSchedStatusValues === 'function') {
                setSchedStatusValues('doc', formData.overdueStatus, formData.alertStatus, formData.resetChecklistOnAutoStatus);
            }

            if (typeof restoreChecklist === 'function') restoreChecklist('doc', dupChecklistDoc?.checklist, dupChecklistDoc?.checklistPublicacao);

            onCategoryChange('doc');
            if (typeof onDocRotinaChange === 'function') onDocRotinaChange(true);
            openFormDrawer('modalDocumentos');
        }, 200);
    }

// ─── ROTINA DE DOCUMENTOS ────────────────────────────────────────────────────

window.onDocRotinaChange = function(skipCalc) {
    const rotina = document.getElementById('docRotina').value;
    const freqWrap = document.getElementById('docFrequenciaWrap');
    const wdWrap = document.getElementById('docDiaSemanaWrap');
    const dpInput = document.getElementById('docDataProximaRevisao');

    const isPontual = rotina === 'pontual';
    const isDiaSemana = rotina === 'diasemana';

    freqWrap.style.display = (!isPontual && !isDiaSemana) ? '' : 'none';
    wdWrap.style.display = isDiaSemana ? '' : 'none';

    dpInput.readOnly = isDiaSemana;
    dpInput.style.background = isDiaSemana ? '#f1f5f9' : '';
    dpInput.style.cursor = isDiaSemana ? 'not-allowed' : '';

    if (!skipCalc && !isPontual) calcDocDataPrevisao();
};

window.toggleDocWeekday = function(btn) {
    btn.classList.toggle('active');
    calcDocDataPrevisao();
};

window.calcDocDataPrevisao = function() {
    const rotina = document.getElementById('docRotina').value;
    const freq = Number(document.getElementById('docFrequencia').value) || 1;
    const dpInput = document.getElementById('docDataProximaRevisao');
    const criacaoDate = document.getElementById('docDataCriacao').value;

    const base = criacaoDate ? new Date(criacaoDate + 'T00:00:00') : new Date();

    if (rotina === 'pontual') return;

    let next = new Date(base);

    if (rotina === 'anual') {
        next.setFullYear(next.getFullYear() + freq);
    } else if (rotina === 'mensal') {
        next.setMonth(next.getMonth() + freq);
    } else if (rotina === 'semanal') {
        next.setDate(next.getDate() + freq * 7);
    } else if (rotina === 'diario') {
        next.setDate(next.getDate() + freq);
    } else if (rotina === 'diasemana') {
        const activeDays = Array.from(document.querySelectorAll('#docWeekdays .wd-btn.active')).map(b => Number(b.dataset.day));
        if (activeDays.length === 0) { dpInput.value = ''; return; }
        const tomorrow = new Date(base);
        tomorrow.setDate(tomorrow.getDate() + 1);
        for (let i = 0; i < 14; i++) {
            const d = new Date(tomorrow);
            d.setDate(tomorrow.getDate() + i);
            if (activeDays.includes(d.getDay())) { next = d; break; }
        }
    }

    dpInput.value = next.toISOString().split('T')[0];
};

(function() {
    const dpCriacao = document.getElementById('docDataCriacao');
    const handler = () => {
        if (document.getElementById('docRotina').value !== 'pontual') calcDocDataPrevisao();
    };
    if (dpCriacao) {
        dpCriacao.addEventListener('change', handler);
        dpCriacao.addEventListener('input', handler);
    }
})();
