    function saveAtividade() {
        originalItem = null;

        const isNew = !editingAtivId;
        let item = isNew ? { id: (typeof generateId === 'function' ? generateId() : Date.now()), historico: [], type: 'ativ' } : activities.find(a => a.id === editingAtivId);

        const selectedAtivMarkerName = document.getElementById('ativMarcador').value;
        const ativMarkerObj = (masterLists.ativMarcadores || []).find(m => m.name === selectedAtivMarkerName);

        let responsavel = (typeof msGetValue === 'function') ? msGetValue('ativ-resp') : [];
        let revisor     = (typeof msGetValue === 'function') ? msGetValue('ativ-rev')  : [];
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

        const _setorArrAtiv = (typeof smsGetValue === 'function') ? smsGetValue('ativ') : [];
        const _setorFieldGroupAtiv = document.getElementById('sms-ativ')?.closest('.field-group');
        if (_setorFieldGroupAtiv) _setorFieldGroupAtiv.classList.toggle('field-error', !_setorArrAtiv.length);
        if (!_setorArrAtiv.length) {
            if (typeof showToast === 'function') showToast('É necessário selecionar ao menos um Setor para salvar o registro.', 'error');
            document.getElementById('sms-ativ')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (typeof _validateRequiredFields === 'function') {
            if (!_validateRequiredFields([
                { id: 'ativTitulo',    label: 'Título' },
                { id: 'ativCategoria', label: 'Categoria' },
            ])) return;
        }

        const _respArrAtiv = JSON.parse(responsavel || '[]');
        if (!_respArrAtiv.length) {
            if (typeof showToast === 'function') showToast('É necessário ao menos um Responsável para salvar o registro.', 'error');
            document.getElementById('ms-ativ-resp-input')?.focus();
            return;
        }

        const _newChecklistPubAtiv = (typeof getChecklistPub === 'function') ? getChecklistPub('ativ') : (item.checklistPublicacao || []);
        if (!isNew && typeof syncChecklistPublicacaoHistory === 'function') syncChecklistPublicacaoHistory(item, _newChecklistPubAtiv);

        const newItem = {
            ...item,
            titulo: document.getElementById('ativTitulo').value,
            descricao: document.getElementById('ativDescricao').value,
            setor: JSON.stringify(_setorArrAtiv),
            categoria: document.getElementById('ativCategoria').value,
            subcategoria: '',
            status: document.getElementById('ativStatus').value,
            dataInicio: document.getElementById('ativDataInicio').value,
            dataConclusao: document.getElementById('ativDataConclusao').value,
            responsavel: responsavel,
            revisor: revisor,
            flagDias: +document.getElementById('ativFlagDias').value,
            marcador: ativMarkerObj ? ativMarkerObj.name : '',
            marcadorCor: ativMarkerObj ? ativMarkerObj.color : 'default',
            anexos: getAnexos('ativ'),
            checklist: (typeof getChecklist === 'function') ? getChecklist('ativ') : (item.checklist || []),
            checklistPublicacao: _newChecklistPubAtiv,
            historico: item && Array.isArray(item.historico) ? [...item.historico] : []
        };

        if (isNew) {
            newItem.createdAt = new Date().toISOString();
            newItem.historico.push({ timestamp: new Date().toISOString(), acao: 'Criação do Registro', usuario: currentuser ? (currentuser.name || currentuser.user) : 'Sistema', snapshot: _safeSnapshot(newItem) });
            activities.push(newItem);
        } else {
            if (!originalItem) {
                originalItem = JSON.parse(JSON.stringify(item));
            }
            if (!newItem.historico || !Array.isArray(newItem.historico)) {
                newItem.historico = originalItem.historico ? [...originalItem.historico] : [];
            }

            // Bloqueia apenas quando ALTERANDO para concluído, não se já era concluído
            const _gestIsConcluido = (typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(newItem.status) : /conclu/i.test(newItem.status));
            const _gestWasConcluido = (typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(originalItem.status) : /conclu/i.test(originalItem.status));
            const _gestIsConcluindo = _gestIsConcluido && !_gestWasConcluido;
            if (_gestIsConcluindo && !canSetConcluido(newItem.checklist, newItem)) {
                if (typeof showToast === 'function') showToast('Conclua todos os itens do checklist de publicação antes de marcar como Concluído.', 'error');
                return;
            }

            const _isConcluindo = (typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(newItem.status) : /conclu/i.test(newItem.status))
                && !(typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(originalItem.status) : /conclu/i.test(originalItem.status));

            const _commitAtiv = function(newItemFinal) {
                const changes = calculateChanges(originalItem, newItemFinal);
                if (changes.length > 0) {
                    newItemFinal.historico.push({
                        timestamp: new Date().toISOString(),
                        acao: 'Edição de Dados',
                        usuario: currentuser ? (currentuser.name || currentuser.user) : 'Sistema',
                        detalhes: changes,
                        snapshot: _safeSnapshot(originalItem)
                    });
                }
                activities = activities.map(a => a.id === editingAtivId ? newItemFinal : a);
                saveAll(); closeFormDrawer(); renderCards();
                if (typeof isCalendarActive === 'function' && isCalendarActive()) renderCalendar();
            };

            if (_isConcluindo && typeof window.showConclusaoDateModal === 'function') {
                window.showConclusaoDateModal(
                    '',
                    function(dateStr, removeMarker) {
                        newItem.dataConclusao = dateStr;
                        if (removeMarker) newItem.marcador = '';
                        _commitAtiv(newItem);
                    },
                    null
                );
                return;
            }

            // Saindo de Concluído → incrementa ciclo de publicação
            const _prevWasConcluidoAtiv = typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(originalItem.status) : /conclu/i.test(originalItem.status);
            const _newNotConcluidoAtiv = !(typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(newItem.status) : /conclu/i.test(newItem.status));
            if (_prevWasConcluidoAtiv && _newNotConcluidoAtiv) {
                newItem.pubCycleId = (newItem.pubCycleId || 1) + 1;
            }

            _commitAtiv(newItem);
            return;
        }

        saveAll(); closeFormDrawer(); renderCards();
        if (typeof isCalendarActive === 'function' && isCalendarActive()) renderCalendar();
    }

    function duplicateAtividade() {
        if (!userCanEditCards()) {
            alert('Você não tem permissão para duplicar cards. Seu acesso está configurado como somente leitura.');
            return;
        }

        const originalAtivDup = editingAtivId ? activities.find(a => a.id === editingAtivId) : null;
        const dupChecklistAtiv = originalAtivDup ? JSON.parse(JSON.stringify({ checklist: originalAtivDup.checklist || [], checklistPublicacao: originalAtivDup.checklistPublicacao || [] })) : null;
        if (dupChecklistAtiv && typeof resetChecklistItems === 'function') resetChecklistItems(dupChecklistAtiv);
        const formData = {
            titulo: document.getElementById('ativTitulo').value,
            descricao: document.getElementById('ativDescricao').value,
            setor: (typeof smsGetValue === 'function') ? JSON.stringify(smsGetValue('ativ')) : '',
            categoria: document.getElementById('ativCategoria').value,
            subcategoria: '',
            status: document.getElementById('ativStatus').value,
            dataInicio: document.getElementById('ativDataInicio').value,
            dataConclusao: document.getElementById('ativDataConclusao').value,
            responsavel: (typeof msGetValue === 'function') ? JSON.stringify(msGetValue('ativ-resp')) : document.getElementById('ativResponsavel').value,
            revisor:     (typeof msGetValue === 'function') ? JSON.stringify(msGetValue('ativ-rev'))  : document.getElementById('ativRevisor').value,
            flagDias: document.getElementById('ativFlagDias').value,
            marcador: document.getElementById('ativMarcador').value,
            marcadorCor: (() => { const n = document.getElementById('ativMarcador').value; const mk = (masterLists.ativMarcadores || []).find(m => m.name === n); return mk ? mk.color : 'default'; })(),
            anexos: typeof getAnexos === 'function' ? getAnexos('ativ') : []
        };

        closeFormDrawer();

        setTimeout(() => {
            editingAtivId = null;
            resetModal('ativ');

            document.getElementById('ativTitulo').value = formData.titulo;
            document.getElementById('ativDescricao').value = formData.descricao;
            if (typeof smsSetValue === 'function') smsSetValue('ativ', formData.setor);
            document.getElementById('ativCategoria').value = formData.categoria;
            document.getElementById('ativStatus').value = formData.status;
            document.getElementById('ativDataInicio').value = formData.dataInicio;
            document.getElementById('ativDataConclusao').value = formData.dataConclusao;
            if (typeof msSetValue === 'function') { msSetValue('ativ-resp', formData.responsavel || ''); msSetValue('ativ-rev', formData.revisor || ''); }
            document.getElementById('ativFlagDias').value = formData.flagDias;
            document.getElementById('ativMarcador').value = formData.marcador;

            if (typeof restoreAnexos === 'function') restoreAnexos('ativ', formData.anexos);

            if (typeof restoreChecklist === 'function') restoreChecklist('ativ', dupChecklistAtiv?.checklist, dupChecklistAtiv?.checklistPublicacao);

            onCategoryChange('ativ');
            openFormDrawer('modalAtividades');
        }, 200);
    }
