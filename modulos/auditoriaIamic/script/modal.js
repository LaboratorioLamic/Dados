// === MODAL & FORM LOGIC (CRUD, LIXEIRA, HISTÓRICO, LIST MANAGER) ===

// --- MODAL & FORM LOGIC (CORRIGIDA) ---

// Bloqueia o campo de responsáveis se o usuário parcial for apenas revisor do item
function _applyRespFieldLock(respKey, item) {
    if (typeof msSetDisabled !== 'function') return;
    if (!currentuser || userIsAdmin()) { msSetDisabled(respKey, false); return; }
    const perm = _normTriPerm(currentuser.canEditCards, 'total');
    if (perm !== 'parcial') { msSetDisabled(respKey, false); return; }
    const meId   = String(currentuser.id || '').trim();
    const meName = String(currentuser.name || currentuser.user || '').trim().toLowerCase();
    const _hasMe = (raw) => {
        if (!raw) return false;
        try {
            const arr = JSON.parse(String(raw));
            const vals = Array.isArray(arr) ? arr : [String(arr)];
            return vals.some(v => { const vs = String(v).trim(); return (meId && vs === meId) || vs.toLowerCase() === meName; });
        } catch { const vs = String(raw).trim(); return (meId && vs === meId) || vs.toLowerCase() === meName; }
    };
    const isResp = _hasMe(item?.responsavelTecnico || item?.responsavel);
    // bloqueia se NÃO é responsável (mesmo que seja revisor)
    msSetDisabled(respKey, !isResp);
}

function resetModal(prefix) {
    // 1. Resetar campos comuns
    document.getElementById(`${prefix}Titulo`).value = '';
    document.getElementById(`${prefix}Descricao`).value = '';
    const _anexosCont = document.getElementById(`${prefix}Anexos`);
    if (_anexosCont) _anexosCont.innerHTML = '';
    if (typeof clearAnexosUpload === 'function') clearAnexosUpload(prefix);

    // Lida com Responsáveis e Revisores (multi-select)
    var _msPrefix = prefix;
    if (typeof msResetPrefix === 'function') msResetPrefix(_msPrefix);
    if (typeof msSetDisabled === 'function') msSetDisabled(_msPrefix + '-resp', false);
    // Garante também o hidden input limpo (fallback)
    var respEl = document.getElementById(`${prefix}Responsavel`);
    if (respEl) respEl.value = '';
    if (prefix !== 'mant') {
        const revEl = document.getElementById(`${prefix}Revisor`);
        if (revEl) revEl.value = '';
    }

        // Marcador (select)
        const markEl = document.getElementById(`${prefix}Marcador`);
        if (markEl && markEl.options.length > 0) markEl.selectedIndex = 0;

    // Reset Programação de Status
    if (typeof setSchedStatusValues === 'function') setSchedStatusValues(prefix, '', '');
    setTimeout(() => { if (typeof updateSchedStatusVisibility === 'function') updateSchedStatusVisibility(prefix); }, 0);

    // Define o Setor
    if ((prefix === 'ativ' || prefix === 'audit' || prefix === 'doc') && typeof smsReset === 'function') {
        smsReset(prefix);
    } else {
        document.getElementById(`${prefix}Setor`).value = '';
    }

    // Define o Status (seleciona o primeiro, se houver)
    if (document.getElementById(`${prefix}Status`).options.length > 0) {
        document.getElementById(`${prefix}Status`).selectedIndex = 0;
    }

    // 2. Resetar campos específicos e cálculos

    if (prefix === 'audit') {
        document.getElementById('auditDataPublicacao').value = today();
        document.getElementById('auditDataPrevisao').value = today();
        document.getElementById('auditFlagDias').value = '';
        document.getElementById('auditRotina').value = 'pontual';
        document.getElementById('auditFrequencia').value = 1;
        document.getElementById('auditFrequenciaWrap').style.display = 'none';
        document.getElementById('auditDiaSemanaWrap').style.display = 'none';
        document.getElementById('auditDataPrevisao').readOnly = false;
        document.querySelectorAll('#auditWeekdays .wd-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('auditCategoria').value = '';
    } else if (prefix === 'ativ') {
        document.getElementById('ativDataInicio').value = today();
        document.getElementById('ativDataConclusao').value = today();
        document.getElementById('ativFlagDias').value = '';
        document.getElementById('ativCategoria').value = '';
    } else if (prefix === 'mant') {
        document.getElementById('mantUltima').value = today();
        document.getElementById('mantIntervalo').value = 30;
        document.getElementById('mantEmpresaResponsavel').value = '';
        document.getElementById('mantResponsavelTecnico').value = '';
        document.getElementById('mantResponsavelManutencao').value = '';
        document.getElementById('mantFlagDias').value = '';
        document.getElementById('mantCategoria').value = '';
        document.getElementById('mantTipo').value = '';
        calculateNextDate('mant');
    } else if (prefix === 'doc') {
        document.getElementById('docDataCriacao').value = today();
        document.getElementById('docDataProximaRevisao').value = today();
        document.getElementById('docRotina').value = 'pontual';
        document.getElementById('docFrequencia').value = 1;
        document.getElementById('docFrequenciaWrap').style.display = 'none';
        document.getElementById('docDiaSemanaWrap').style.display = 'none';
        document.getElementById('docDataProximaRevisao').readOnly = false;
        document.querySelectorAll('#docWeekdays .wd-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('docFlagDias').value = '';
        document.getElementById('docCategoria').value = '';
    }

    // 3. Chamar onCategoryChange após definir a categoria (se a categoria existir)
    var catEl = document.getElementById(`${prefix}Categoria`);
    if (catEl) onCategoryChange(prefix);

    // 4. Limpar checklist
    if (typeof clearChecklist === 'function') clearChecklist(prefix);

    // 5. Resetar drawer para primeira aba
    const _drawerIds = { audit: 'modalAuditoria', ativ: 'modalAtividades', doc: 'modalDocumentos', mant: 'modalManutencao' };
    const drawer = document.getElementById(_drawerIds[prefix]);
    if (drawer) {
        drawer.querySelectorAll('.drawer-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        drawer.querySelectorAll('.drawer-tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
    }
}


    document.getElementById('addBtn').onclick = () => {
        originalItem = null;

        const _currentUserName = currentuser ? (currentuser.name || currentuser.user || '') : '';

        if (currentTab === 'ocorrencias') {
            if (typeof window.ocOpenNew === 'function') window.ocOpenNew();
            return;
        }
        if (currentTab === 'rnc') {
            if (typeof window.rncOpenNew === 'function') window.rncOpenNew();
            return;
        }

        if (currentTab === 'auditoria') {
            editingAuditId = null;
            resetModal('audit');
            if (_currentUserName && typeof msSetValue === 'function') msSetValue('audit-resp', [_currentUserName]);
            openFormDrawer('modalAuditoria');
        } else if (currentTab === 'atividades') {
            editingAtivId = null;
            resetModal('ativ');
            if (_currentUserName && typeof msSetValue === 'function') msSetValue('ativ-resp', [_currentUserName]);
            openFormDrawer('modalAtividades');
        } else if (currentTab === 'manutencao') {
            editingMantId = null;
            resetModal('mant');
            if (_currentUserName) {
                const mantRespEl = document.getElementById('mantResponsavelTecnico');
                if (mantRespEl) mantRespEl.value = _currentUserName;
            }
            openFormDrawer('modalManutencao');
        } else if (currentTab === 'documentos') {
            editingDocId = null;
            resetModal('doc');
            if (_currentUserName && typeof msSetValue === 'function') msSetValue('doc-resp', [_currentUserName]);
            openFormDrawer('modalDocumentos');
        }
    };


    // Função para sincronizar referências em todos os cards quando um item de lista é alterado
    function syncReferenceAcrossCards(cardType, fieldName, oldValue, newValue) {
        if (!oldValue || oldValue === newValue) return; // Não atualiza se não mudou

        // Função auxiliar para atualizar cards de um tipo
        const updateCardArray = (cardArray) => {
            cardArray.forEach(card => {
                if (card[fieldName] === oldValue) {
                    card[fieldName] = newValue;
                }
            });
        };

        // Atualiza o tipo de card correto
        if (cardType === 'audit' || cardType === 'auditoria') {
            updateCardArray(audits);
        } else if (cardType === 'ativ' || cardType === 'atividades') {
            updateCardArray(activities);
        } else if (cardType === 'mant' || cardType === 'manutencao') {
            updateCardArray(maintenances);
        } else if (cardType === 'doc' || cardType === 'documentos') {
            updateCardArray(documents);
        }
    }

    function editItem(id, tab) {
        // Resolve item primeiro para checar permissão parcial
        let _itemForPerm = null;
        if (tab === 'audit' || tab === 'auditoria') _itemForPerm = audits.find(a => a.id === id);
        else if (tab === 'atividades')   _itemForPerm = activities.find(a => a.id === id);
        else if (tab === 'documentos')   _itemForPerm = documents.find(a => a.id === id);
        if (!_itemForPerm) _itemForPerm = [...(audits||[]),...(activities||[]),...(documents||[])].find(a => a.id === id);
        if (!userCanEditCards(_itemForPerm)) {
            alert('Você não tem permissão para editar este registro.');
            return;
        }

        // Busca o item em todos os arrays se não encontrar no tab especificado
        let item = null;
        let finalTab = tab;

        if (tab === 'audit' || tab === 'auditoria') {
            item = audits.find(a => a.id === id);
            finalTab = 'auditoria';
        } else if (tab === 'ativ' || tab === 'atividades') {
            item = activities.find(a => a.id === id);
            finalTab = 'atividades';
        } else if (tab === 'mant' || tab === 'manutencao') {
            item = maintenances.find(m => m.id === id);
            finalTab = 'manutencao';
        } else if (tab === 'doc' || tab === 'documentos') {
            item = documents.find(d => d.id === id);
            finalTab = 'documentos';
        }

        // Se não encontrou, tenta procurar em todos os arrays
        if (!item) {
            item = audits.find(a => a.id === id);
            if (item) finalTab = 'auditoria';
            else {
                item = activities.find(a => a.id === id);
                if (item) finalTab = 'atividades';
                else {
                    item = maintenances.find(m => m.id === id);
                    if (item) finalTab = 'manutencao';
                    else {
                        item = documents.find(d => d.id === id);
                        if (item) finalTab = 'documentos';
                    }
                }
            }
        }

        if (!item) {
            alert('Item não encontrado.');
            return;
        }

        if (finalTab === 'auditoria') {
            editingAuditId = id;
            document.getElementById('auditTitulo').value = item.titulo;
            document.getElementById('auditDescricao').value = item.descricao;
            if (typeof smsSetValue === 'function') smsSetValue('audit', item.setor || '');
            document.getElementById('auditCategoria').value = item.categoria;
            onCategoryChange('audit');
            var auditSubEl = document.getElementById('auditSub');
            if (auditSubEl) auditSubEl.value = item.subcategoria || '';
            document.getElementById('auditStatus').value = item.status;
            document.getElementById('auditDataPublicacao').value = item.dataPublicacao;
            document.getElementById('auditDataPrevisao').value = item.dataPrevisao;
            if (typeof msSetValue === 'function') {
                msSetValue('audit-resp', item.responsavel || '');
                msSetValue('audit-rev',  item.revisor     || '');
            }
            _applyRespFieldLock('audit-resp', item);
            document.getElementById('auditFlagDias').value = item.flagDias;
            // Rotina
            const rotina = item.rotina || 'pontual';
            document.getElementById('auditRotina').value = rotina;
            document.getElementById('auditFrequencia').value = item.frequencia || 1;
            // Restaurar dias da semana selecionados
            document.querySelectorAll('#auditWeekdays .wd-btn').forEach(b => b.classList.remove('active'));
            if (rotina === 'diasemana' && Array.isArray(item.diasSemana)) {
                item.diasSemana.forEach(d => {
                    const btn = document.querySelector(`#auditWeekdays .wd-btn[data-day="${d}"]`);
                    if (btn) btn.classList.add('active');
                });
            }
            if (typeof onAuditRotinaChange === 'function') onAuditRotinaChange(true);
            document.getElementById('auditMarcador').value = item.marcador || '';
            if (typeof setSchedStatusValues === 'function') setSchedStatusValues('audit', item.overdueStatus || '', item.alertStatus || '', item.resetChecklistOnAutoStatus || false);
            setTimeout(() => { if (typeof updateSchedStatusVisibility === 'function') updateSchedStatusVisibility('audit'); }, 0);
            restoreAnexos('audit', item.anexos);
            if (typeof restoreChecklist === 'function') restoreChecklist('audit', item.checklist, item.checklistPublicacao);
            openFormDrawer('modalAuditoria');
        } else if (finalTab === 'atividades') {
            editingAtivId = id;
            document.getElementById('ativTitulo').value = item.titulo;
            document.getElementById('ativDescricao').value = item.descricao;
            if (typeof smsSetValue === 'function') smsSetValue('ativ', item.setor || '');
            document.getElementById('ativCategoria').value = item.categoria;
            onCategoryChange('ativ');
            var ativSubEl = document.getElementById('ativSub');
            if (ativSubEl) ativSubEl.value = item.subcategoria || '';
            document.getElementById('ativStatus').value = item.status;
            document.getElementById('ativDataInicio').value = item.dataInicio;
            document.getElementById('ativDataConclusao').value = item.dataConclusao;
            if (typeof msSetValue === 'function') {
                msSetValue('ativ-resp', item.responsavel || '');
                msSetValue('ativ-rev',  item.revisor     || '');
            }
            _applyRespFieldLock('ativ-resp', item);
            document.getElementById('ativFlagDias').value = item.flagDias;
            document.getElementById('ativMarcador').value = item.marcador || '';
            restoreAnexos('ativ', item.anexos);
            if (typeof restoreChecklist === 'function') restoreChecklist('ativ', item.checklist, item.checklistPublicacao);
            openFormDrawer('modalAtividades');
        } else if (finalTab === 'manutencao') {
            editingMantId = id;
            document.getElementById('mantTitulo').value = item.titulo;
            document.getElementById('mantDescricao').value = item.descricao;
            document.getElementById('mantSetor').value = setorArr(item.setor)[0] || '';
            document.getElementById('mantCategoria').value = item.categoria;
            onCategoryChange('mant');
            document.getElementById('mantItem').value = item.item;
            document.getElementById('mantTipo').value = item.tipo || '';
            document.getElementById('mantUltima').value = item.ultima;
            document.getElementById('mantIntervalo').value = (item.intervalo ?? ''); // permite vazio
            let mantResp = item.responsavelTecnico;
            if (Array.isArray(mantResp)) mantResp = mantResp[0];
            else if (typeof mantResp === 'string' && mantResp.startsWith('[')) {
                try { mantResp = JSON.parse(mantResp)[0]; } catch {}
            }
            document.getElementById('mantResponsavelTecnico').value = mantResp || '';
            document.getElementById('mantResponsavelManutencao').value = item.responsavelManutencao || '';
            document.getElementById('mantEmpresaResponsavel').value = item.empresaResponsavel || '';
            document.getElementById('mantStatus').value = item.status;
            document.getElementById('mantFlagDias').value = item.flagDias; // Corrigido
            calculateNextDate('mant');
            restoreAnexos('mant', item.anexos);
            document.getElementById('mantMarcador').value = item.marcador || '';
            openFormDrawer('modalManutencao');
        } else if (finalTab === 'documentos') {
            editingDocId = id;
            document.getElementById('docTitulo').value = item.titulo;
            document.getElementById('docDescricao').value = item.descricao;
            if (typeof smsSetValue === 'function') smsSetValue('doc', item.setor || '');
            document.getElementById('docCategoria').value = item.categoria;
            onCategoryChange('doc');
            var docSubEl = document.getElementById('docSub');
            if (docSubEl) docSubEl.value = item.subcategoria || '';
            document.getElementById('docStatus').value = item.status;
            document.getElementById('docDataCriacao').value = item.dataCriacao;
            document.getElementById('docDataProximaRevisao').value = item.dataProximaRevisao || '';
            // Rotina
            const docRotina = item.rotina || 'pontual';
            document.getElementById('docRotina').value = docRotina;
            document.getElementById('docFrequencia').value = item.frequencia || 1;
            document.querySelectorAll('#docWeekdays .wd-btn').forEach(b => b.classList.remove('active'));
            if (docRotina === 'diasemana' && Array.isArray(item.diasSemana)) {
                item.diasSemana.forEach(d => {
                    const btn = document.querySelector(`#docWeekdays .wd-btn[data-day="${d}"]`);
                    if (btn) btn.classList.add('active');
                });
            }
            if (typeof onDocRotinaChange === 'function') onDocRotinaChange(true);
            if (typeof msSetValue === 'function') {
                msSetValue('doc-resp', item.responsavel || '');
                msSetValue('doc-rev',  item.revisor     || '');
            }
            _applyRespFieldLock('doc-resp', item);
            document.getElementById('docFlagDias').value = item.flagDias;
            restoreAnexos('doc', item.anexos);
            document.getElementById('docMarcador').value = item.marcador || '';
            if (typeof setSchedStatusValues === 'function') setSchedStatusValues('doc', item.overdueStatus || '', item.alertStatus || '', item.resetChecklistOnAutoStatus || false);
            setTimeout(() => { if (typeof updateSchedStatusVisibility === 'function') updateSchedStatusVisibility('doc'); }, 0);
            if (typeof restoreChecklist === 'function') restoreChecklist('doc', item.checklist, item.checklistPublicacao);
            openFormDrawer('modalDocumentos');
        }

    }

    function deleteItem(id, tab) {
        if (!currentuser) {
            alert('Você precisa estar logado para excluir registros.');
            return;
        }
        // Resolve item para checar permissão parcial
        let _itemForDelPerm = [...(audits||[]),...(activities||[]),...(documents||[]),...(maintenances||[])].find(a => a.id === id);
        if (!userCanDeleteCards(_itemForDelPerm)) {
            alert('Você não tem permissão para excluir este registro.');
            return;
        }
        showConfirmDanger({
            title: 'Mover para a lixeira?',
            message: 'Os dados serão preservados e podem ser restaurados por um administrador.',
            confirmLabel: 'Mover para lixeira',
            requireReason: false,
            onConfirm: () => _doDeleteItem(id, tab, '')
        });
        return;
    }

    function _doDeleteItem(id, tab, reason) {
        // SOFT DELETE: Marcar item como deleted ao invés de remover do array
        const now = new Date().toISOString();
        const deletedBy = currentuser.email || currentuser.name || 'unknown';

        let item = null;
        if (tab === 'auditoria' || tab === 'audit') {
            item = audits.find(a => String(a.id) === String(id));
            if (item) {
                item.deleted = true;
                item.deletedAt = now;
                item.deletedBy = deletedBy;
                item.deletedReason = reason || '';
            }
        }
        else if (tab === 'atividades' || tab === 'ativ') {
            item = activities.find(a => String(a.id) === String(id));
            if (item) {
                item.deleted = true;
                item.deletedAt = now;
                item.deletedBy = deletedBy;
                item.deletedReason = reason || '';
            }
        }
        else if (tab === 'manutencao' || tab === 'mant') {
            item = maintenances.find(m => String(m.id) === String(id));
            if (item) {
                item.deleted = true;
                item.deletedAt = now;
                item.deletedBy = deletedBy;
                item.deletedReason = reason || '';
            }
        }
        else if (tab === 'documentos' || tab === 'doc') {
            item = documents.find(d => String(d.id) === String(id));
            if (item) {
                item.deleted = true;
                item.deletedAt = now;
                item.deletedBy = deletedBy;
                item.deletedReason = reason || '';
            }
        }

        if (item) {
            if (typeof showToast === 'function') showToast('Item movido para a lixeira. Dados preservados.', 'success');
            saveAll();
            renderCards();
            updateTrashBadge();
        }
    }

    // SOFT DELETE: Função para restaurar itens deletados (apenas admin)
    function restoreDeletedItem(id, tab) {
        if (!userIsAdmin()) {
            alert('Apenas administradores podem restaurar itens deletados.');
            return;
        }

        showConfirmDanger({
            title: 'Restaurar item?',
            message: 'O item será restaurado da lixeira e voltará a aparecer normalmente.',
            confirmLabel: 'Restaurar',
            requireReason: false,
            onConfirm: () => _doRestoreDeletedItem(id, tab)
        });
        return;
    }

    function _doRestoreDeletedItem(id, tab) {
        let item = null;
        if (tab === 'auditoria' || tab === 'audit') {
            item = audits.find(a => String(a.id) === String(id));
        }
        else if (tab === 'atividades' || tab === 'ativ') {
            item = activities.find(a => String(a.id) === String(id));
        }
        else if (tab === 'manutencao' || tab === 'mant') {
            item = maintenances.find(m => String(m.id) === String(id));
        }
        else if (tab === 'documentos' || tab === 'doc') {
            item = documents.find(d => String(d.id) === String(id));
        }

        if (item && item.deleted) {
            item.deleted = false;
            item.restoredAt = new Date().toISOString();
            item.restoredBy = currentuser.email || currentuser.name || 'admin';

            // Adicionar ao histórico a ação de restauração
            if (!item.historico) item.historico = [];
            item.historico.push({
                timestamp: new Date().toISOString(),
                usuario: item.restoredBy,
                acao: 'Restaurado',
                detalhes: [`Item restaurado pelo usuário ${item.restoredBy}`]
            });

            if (typeof window.showGlobalLoading === 'function') window.showGlobalLoading('Restaurando item...');
            saveAll().finally(() => {
                if (typeof window.hideGlobalLoading === 'function') window.hideGlobalLoading();
                if (typeof showToast === 'function') showToast('Item restaurado com sucesso!', 'success');
                renderCards();

                // Atualizar a lixeira se estiver aberta
                if (document.getElementById('modalTrashBin').style.display === 'flex') {
                    openTrashBin();
                }
                updateTrashBadge();
            });
        }
    }

    function getTrashCount() {
        if (currentTab === 'auditoria') {
            return audits.filter(item => item && item.deleted).length;
        }
        if (currentTab === 'atividades') {
            return activities.filter(item => item && item.deleted).length;
        }
        if (currentTab === 'manutencao') {
            return maintenances.filter(item => item && item.deleted).length;
        }
        if (currentTab === 'documentos') {
            return documents.filter(item => item && item.deleted).length;
        }
        return 0;
    }

    function updateTrashBadge() {
        const badge = document.getElementById('trashBadge');
        if (!badge) return;
        const count = getTrashCount();
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.textContent = '';
            badge.classList.add('hidden');
        }
    }

    // SOFT DELETE: Função para abrir e exibir lixeira (apenas itens da aba atual)
    function openTrashBin() {
        const trashContent = document.getElementById('trashContent');
        trashContent.innerHTML = '';

        // Coletar apenas os itens deletados da aba atual
        let deletedItems = [];

        if (currentTab === 'auditoria') {
            audits.forEach(a => {
                if (a.deleted) {
                    deletedItems.push({
                        id: a.id,
                        tab: 'auditoria',
                        titulo: a.titulo,
                        tipo: 'Rotina',
                        setor: a.setor,
                        deletedAt: a.deletedAt,
                        deletedBy: a.deletedBy,
                        deletedReason: a.deletedReason
                    });
                }
            });
        } else if (currentTab === 'atividades') {
            activities.forEach(a => {
                if (a.deleted) {
                    deletedItems.push({
                        id: a.id,
                        tab: 'atividades',
                        titulo: a.titulo,
                        tipo: 'Atividade',
                        setor: a.setor,
                        deletedAt: a.deletedAt,
                        deletedBy: a.deletedBy,
                        deletedReason: a.deletedReason
                    });
                }
            });
        } else if (currentTab === 'manutencao') {
            maintenances.forEach(m => {
                if (m.deleted) {
                    deletedItems.push({
                        id: m.id,
                        tab: 'manutencao',
                        titulo: m.titulo || m.categoria,
                        tipo: 'Manutenção',
                        setor: m.setor,
                        deletedAt: m.deletedAt,
                        deletedBy: m.deletedBy,
                        deletedReason: m.deletedReason
                    });
                }
            });
        } else if (currentTab === 'documentos') {
            documents.forEach(d => {
                if (d.deleted) {
                    deletedItems.push({
                        id: d.id,
                        tab: 'documentos',
                        titulo: d.titulo,
                        tipo: 'Documento',
                        setor: d.setor,
                        deletedAt: d.deletedAt,
                        deletedBy: d.deletedBy,
                        deletedReason: d.deletedReason
                    });
                }
            });
        }

        if (deletedItems.length === 0) {
            trashContent.innerHTML = '<div style="text-align:center; padding:40px; color:#6b7280;"><i class="fas fa-check-circle" style="font-size:48px; margin-bottom:16px; display:block;"></i>Nenhum item na lixeira</div>';
        } else {
            // Ordenar por data de deletação (mais recente primeiro)
            deletedItems.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

            let html = '<table style="width:100%; border-collapse:collapse; font-size:14px;">';
            html += '<thead><tr style="border-bottom:2px solid var(--border); background:var(--bg);">';
            html += '<th style="padding:12px; text-align:left; font-weight:600;">Título</th>';
            html += '<th style="padding:12px; text-align:left; font-weight:600;">Tipo</th>';
            html += '<th style="padding:12px; text-align:left; font-weight:600;">Setor</th>';
            html += '<th style="padding:12px; text-align:left; font-weight:600;">Deletado por</th>';
            html += '<th style="padding:12px; text-align:left; font-weight:600;">Data</th>';
            html += '<th style="padding:12px; text-align:left; font-weight:600;">Exclusão automática</th>';
            html += '<th style="padding:12px; text-align:center; font-weight:600;">Ações</th>';
            html += '</tr></thead><tbody>';

            deletedItems.forEach(item => {
                const deletedDate = new Date(item.deletedAt).toLocaleDateString('pt-BR') + ' ' + new Date(item.deletedAt).toLocaleTimeString('pt-BR');
                const isAdmin = userIsAdmin();
                const _exp = (typeof window.trashExpiry === 'function') ? window.trashExpiry(item.deletedAt) : null;
                let expCell = 'ND';
                if (_exp) {
                    const _dateStr = _exp.expiresAt.toLocaleDateString('pt-BR');
                    const _warn = _exp.daysLeft <= 7;
                    const _faltam = _exp.expired ? 'exclusão pendente'
                        : (_exp.daysLeft === 1 ? 'falta 1 dia' : 'faltam ' + _exp.daysLeft + ' dias');
                    expCell = `<div style="font-size:12px; color:#6b7280;">${_dateStr}</div>` +
                        `<div style="font-size:11px; font-weight:600; color:${_warn ? '#ef4444' : '#f59e0b'};"><i class="fas fa-clock" style="margin-right:4px;"></i>${_faltam}</div>`;
                }

                html += `<tr style="border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='rgba(37,99,235,0.05)'" onmouseout="this.style.background='transparent'">
                    <td style="padding:12px; font-weight:500;">${item.titulo}</td>
                    <td style="padding:12px;"><span style="background:var(--accent); color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:500;">${item.tipo}</span></td>
                    <td style="padding:12px;">${(typeof setorText === 'function' ? setorText(item.setor) : item.setor) || 'ND'}</td>
                    <td style="padding:12px;">${item.deletedBy || 'desconhecido'}</td>
                    <td style="padding:12px; font-size:12px; color:#6b7280;">${deletedDate}</td>
                    <td style="padding:12px;">${expCell}</td>
                    <td style="padding:12px; text-align:center; white-space:nowrap;">
                        <button onclick="closeModal('modalTrashBin'); openView(${item.id}, '${item.tab}')" title="Visualizar" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:500; margin-right:4px; transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${isAdmin ? `<button onclick="restoreDeletedItem(${item.id}, '${item.tab}')" title="Restaurar" style="background:#22c55e; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:500; margin-right:4px; transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                            <i class="fas fa-undo"></i>
                        </button>` : ''}
                        ${isAdmin ? `<button onclick="permanentlyDeleteItem(${item.id}, '${item.tab}')" title="Deletar permanentemente" style="background:#ef4444; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:500; transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                            <i class="fas fa-times"></i>
                        </button>` : ''}
                    </td>
                </tr>`;
            });

            html += '</tbody></table>';
            trashContent.innerHTML = html;
        }

        document.getElementById('modalTrashBin').style.display = 'flex';
    }

    // SOFT DELETE: Função para deletar permanentemente (apenas admin)
    function permanentlyDeleteItem(id, tab) {
        if (!userIsAdmin()) {
            showConfirmDanger({
                title: 'Acesso negado',
                message: 'Apenas administradores podem deletar permanentemente itens.',
                confirmLabel: 'Entendi',
                onConfirm: () => {}
            });
            return;
        }

        showPermanentDeleteConfirm({
            title: '⚠️ Deleção Permanente',
            message: 'O item será <strong>removido para sempre</strong> e não poderá ser recuperado.<br>Esta ação é irreversível.',
            onConfirm: (reason) => {
                let deletedItem = null;
                let tipoLabel = '';

                if (tab === 'auditoria' || tab === 'audit') {
                    const index = audits.findIndex(a => String(a.id) === String(id));
                    if (index > -1) { deletedItem = audits[index]; tipoLabel = 'Rotina'; audits.splice(index, 1); }
                }
                else if (tab === 'atividades' || tab === 'ativ') {
                    const index = activities.findIndex(a => String(a.id) === String(id));
                    if (index > -1) { deletedItem = activities[index]; tipoLabel = 'Atividade'; activities.splice(index, 1); }
                }
                else if (tab === 'manutencao' || tab === 'mant') {
                    const index = maintenances.findIndex(m => String(m.id) === String(id));
                    if (index > -1) { deletedItem = maintenances[index]; tipoLabel = 'Manutenção'; maintenances.splice(index, 1); }
                }
                else if (tab === 'documentos' || tab === 'doc') {
                    const index = documents.findIndex(d => String(d.id) === String(id));
                    if (index > -1) { deletedItem = documents[index]; tipoLabel = 'Documento'; documents.splice(index, 1); }
                }

                if (deletedItem) {
                    // Apaga imagens (anexos do card + de publicações) para não deixar órfãos
                    if (typeof window._deleteItemImgBlobs === 'function') window._deleteItemImgBlobs(deletedItem);
                    if (!masterLists.deletionHistory) masterLists.deletionHistory = [];
                    masterLists.deletionHistory.push({
                        histId: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                        titulo: deletedItem.titulo || deletedItem.categoria || '—',
                        tipo: tipoLabel,
                        tab: tab,
                        setor: deletedItem.setor || '',
                        deletedAt: deletedItem.deletedAt || '',
                        deletedBy: deletedItem.deletedBy || '',
                        deletedReason: deletedItem.deletedReason || '',
                        permanentlyDeletedAt: new Date().toISOString(),
                        permanentlyDeletedBy: (currentuser && (currentuser.email || currentuser.name)) || 'desconhecido',
                        permanentReason: reason || ''
                    });
                    // Ação irreversível: bloqueia a tela até a gravação confirmar, pra
                    // evitar clique duplo ou navegação no meio de uma exclusão permanente.
                    if (typeof window.showGlobalLoading === 'function') window.showGlobalLoading('Excluindo permanentemente...');
                    saveAll().finally(() => {
                        if (typeof window.hideGlobalLoading === 'function') window.hideGlobalLoading();
                        openTrashBin();
                        updateTrashBadge();
                        if (typeof showToast === 'function') showToast('Item deletado permanentemente.', 'error');
                    });
                }
            }
        });
    }

    window.openDeletionHistory = function() {
        const history = (masterLists.deletionHistory || []).slice().reverse();
        const isAdmin = userIsAdmin();
        const content = document.getElementById('deletionHistoryContent');

        if (history.length === 0) {
            content.innerHTML = '<div style="text-align:center; padding:40px; color:#6b7280;"><i class="fas fa-check-circle" style="font-size:48px; margin-bottom:16px; display:block;"></i>Nenhuma exclusão permanente registrada</div>';
        } else {
            let html = '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
            html += '<thead><tr style="border-bottom:2px solid var(--border); background:var(--bg);">';
            html += '<th style="padding:10px 12px; text-align:left; font-weight:600;">Título</th>';
            html += '<th style="padding:10px 12px; text-align:left; font-weight:600;">Tipo</th>';
            html += '<th style="padding:10px 12px; text-align:left; font-weight:600;">Setor</th>';
            html += '<th style="padding:10px 12px; text-align:left; font-weight:600;">Motivo da exclusão</th>';
            html += '<th style="padding:10px 12px; text-align:left; font-weight:600;">Excluído por</th>';
            html += '<th style="padding:10px 12px; text-align:left; font-weight:600;">Data</th>';
            if (isAdmin) html += '<th style="padding:10px 12px; text-align:center; font-weight:600;">Ações</th>';
            html += '</tr></thead><tbody>';

            history.forEach(entry => {
                const dateStr = entry.permanentlyDeletedAt
                    ? new Date(entry.permanentlyDeletedAt).toLocaleDateString('pt-BR') + ' ' + new Date(entry.permanentlyDeletedAt).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})
                    : '—';
                const motivo = entry.permanentReason || entry.deletedReason || '—';
                const motivoHtml = `<span title="${motivo.replace(/"/g,'&quot;')}" style="display:inline-block;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;">${motivo}</span>`;
                html += `<tr style="border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.04)'" onmouseout="this.style.background='transparent'">
                    <td style="padding:10px 12px; font-weight:500;">${entry.titulo}</td>
                    <td style="padding:10px 12px;"><span style="background:var(--accent); color:white; padding:3px 7px; border-radius:4px; font-size:11px; font-weight:500;">${entry.tipo}</span></td>
                    <td style="padding:10px 12px; color:#6b7280;">${setorText(entry.setor) || '—'}</td>
                    <td style="padding:10px 12px; font-size:12px; color:#374151;">${motivoHtml}</td>
                    <td style="padding:10px 12px; font-size:12px; color:#6b7280;">${entry.permanentlyDeletedBy}</td>
                    <td style="padding:10px 12px; font-size:12px; color:#6b7280; white-space:nowrap;">${dateStr}</td>
                    ${isAdmin ? `<td style="padding:10px 12px; text-align:center;">
                        <button onclick="removeDeletionHistoryEntry('${entry.histId}')" title="Remover do histórico" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px; transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>` : ''}
                </tr>`;
            });

            html += '</tbody></table>';
            content.innerHTML = html;
        }

        document.getElementById('modalDeletionHistory').style.display = 'flex';
    };

    window.removeDeletionHistoryEntry = function(histId) {
        if (!userIsAdmin()) return;
        showConfirmDanger({
            title: 'Remover do histórico',
            message: 'Deseja remover este registro do histórico de exclusões?',
            confirmLabel: 'Remover',
            requireReason: false,
            onConfirm: () => {
                masterLists.deletionHistory = (masterLists.deletionHistory || []).filter(e => e.histId !== histId);
                saveAll();
                openDeletionHistory();
                if (typeof showToast === 'function') showToast('Registro removido do histórico.', 'warning');
            }
        });
    };

    // Anexos Logic — delegado ao sistema de upload (upload.js)
    function getAnexos(prefix) {
        if (typeof getAnexosUpload === 'function') return getAnexosUpload(prefix);
        return [];
    }

    function restoreAnexos(prefix, list) {
        if (typeof restoreAnexosUpload === 'function') restoreAnexosUpload(prefix, list);
    }

    // View Modal e Histórico com Paginação
    // ---- Popover de status (view modal) ----

    var _STATUS_TAB_MAP = {
        auditoria:    { statusKey: 'auditStatus',  colOrderKey: 'kanban_audit_col_order', dateField: 'dataPublicacao', getItems: () => audits,       setItems: v => audits = v },
        atividades:   { statusKey: 'ativStatus',   colOrderKey: 'kanban_ativ_col_order',  dateField: 'dataConclusao',  getItems: () => activities,   setItems: v => activities = v },
        documentos:   { statusKey: 'docStatus',    colOrderKey: 'kanban_doc_col_order',   dateField: null,             getItems: () => documents,    setItems: v => documents = v },
        manutencao:   { statusKey: 'mantStatus',   colOrderKey: 'kanban_mant_col_order',  dateField: null,             getItems: () => maintenances, setItems: v => maintenances = v }
    };

    function toggleStatusPopover(event) {
        event.stopPropagation();
        var pop = document.getElementById('statusPopover');
        var btn = document.getElementById('viewModalStatus');
        if (!pop) return;
        if (pop.classList.contains('active')) {
            closeStatusPopover();
            return;
        }
        var tab = window._currentViewTab;
        var cfg = _STATUS_TAB_MAP[tab];
        if (!cfg || !userCanEditCards) return;
        var item = (cfg.getItems() || []).find(i => i.id === window._currentViewId);
        if (!item || item.deleted || !userCanEditCards(item)) return;

        renderStatusPopover(item, tab, cfg);
        pop.classList.add('active');
        if (btn) btn.classList.add('popover-open');
        document.addEventListener('click', _statusPopoverOutsideClick);
    }

    function _statusPopoverOutsideClick(e) {
        var pop = document.getElementById('statusPopover');
        var btn = document.getElementById('viewModalStatus');
        if (!pop) return;
        if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
        closeStatusPopover();
    }

    function closeStatusPopover() {
        var pop = document.getElementById('statusPopover');
        var btn = document.getElementById('viewModalStatus');
        if (pop) pop.classList.remove('active');
        if (btn) btn.classList.remove('popover-open');
        document.removeEventListener('click', _statusPopoverOutsideClick);
    }

    function renderStatusPopover(item, tab, cfg) {
        var pop = document.getElementById('statusPopover');
        if (!pop) return;
        var list = (typeof _kbGetSortedStatuses === 'function')
            ? _kbGetSortedStatuses(cfg)
            : ((masterLists && masterLists[cfg.statusKey]) ? masterLists[cfg.statusKey] : []);
        var itemsHtml = list.map(function(s) {
            var color = colorMap[s.color] || colorMap['default'];
            var isCurrent = s.name === item.status;
            return '<button type="button" class="status-popover-item' + (isCurrent ? ' current' : '') + '" onclick="selectNewStatus(\'' + s.name.replace(/'/g, "\\'") + '\')">' +
                '<span class="status-popover-dot" style="color:' + color + ';background:' + color + '"></span>' +
                '<span>' + s.name + '</span>' +
                (isCurrent ? '<i class="fas fa-check"></i>' : '') +
                '</button>';
        }).join('');
        pop.innerHTML = '<div class="status-popover-label">Alterar status</div>' + itemsHtml;
    }

    function selectNewStatus(newStatus) {
        closeStatusPopover();
        var tab = window._currentViewTab;
        var cfg = _STATUS_TAB_MAP[tab];
        if (!cfg) return;
        var items = cfg.getItems() || [];
        var item = items.find(i => i.id === window._currentViewId);
        if (!item || item.status === newStatus) return;

        var isConcluido = _kbStatusIsConcluido(newStatus, { statusKey: cfg.statusKey });
        var _prevIsConcluido = _kbStatusIsConcluido(item.status, { statusKey: cfg.statusKey });
        // Só bloqueia se está ALTERANDO para concluído, não se já estava concluído
        var _isConcluindo = isConcluido && !_prevIsConcluido;
        if (_isConcluindo && !canSetConcluido(item.checklist, item)) {
            if (typeof showToast === 'function') showToast('Conclua todos os itens do checklist de publicação antes de marcar como Concluído.', 'error');
            return;
        }

        var _apply = function(dateVal, removeMarker) {
            var prevStatus = item.status;
            item.status = newStatus;
            item._statusChangedOnce = true;
            if (dateVal && cfg.dateField) item[cfg.dateField] = dateVal;
            if (removeMarker) item.marcador = '';

            if (!Array.isArray(item.historico)) item.historico = [];
            item.historico.push({
                timestamp: new Date().toISOString(),
                acao: 'Alteração de Status',
                usuario: currentuser ? (currentuser.name || currentuser.user) : 'Sistema',
                detalhes: [{ campo: 'Status', de: prevStatus, para: newStatus }],
                snapshot: _safeSnapshot(item)
            });

            // Mesmo feedback do kanban: overlay enquanto o novo status vai pro banco
            if (typeof window._saveAllWithLoading === 'function') {
                window._saveAllWithLoading('Movendo card para "' + newStatus + '"...');
            } else {
                saveAll();
            }
            renderViewContent(item.id, tab);
            if (typeof renderCards === 'function') renderCards();
            if (typeof isKanbanActive === 'function' && isKanbanActive(tab) && typeof renderKanban === 'function') renderKanban();
        };

        if (isConcluido && cfg.dateField && typeof window.showConclusaoDateModal === 'function') {
            window.showConclusaoDateModal('', function(dateStr, removeMarker) { _apply(dateStr, removeMarker); }, null);
            return;
        }

        // Saindo de Concluído → inicia novo ciclo de publicação (em Rotinas, pergunta
        // antes se o checklist deve ser resetado para a nova competência).
        if (_prevIsConcluido && !isConcluido && typeof window.handleSaindoDeConcluido === 'function') {
            window.handleSaindoDeConcluido(item, {
                askUser: tab === 'auditoria',
                onContinue: function() { _apply(null); }
            });
            return;
        }

        _apply(null);
    }

    window.toggleStatusPopover = toggleStatusPopover;
    window.selectNewStatus = selectNewStatus;
    window.closeStatusPopover = closeStatusPopover;

    function openView(id, tab) {
        currentHistoryPage = 1; // Garante que a primeira página seja carregada
        currentViewItemId = id;
        currentViewTab = tab;
        // Nova sessão de visualização: descarta qualquer estado pendente de checklist anterior
        window._checklistPendingDirty = false;
        window._checklistPendingSnapshot = null;
        renderViewContent(id, tab);
    }

    function changeHistoryPage(id, tab, direction) {
        currentHistoryPage += direction;

        // Normaliza o tab para garantir consistência
        let normalizedTab = tab;
        if (tab === 'audit') normalizedTab = 'auditoria';
        else if (tab === 'ativ') normalizedTab = 'atividades';
        else if (tab === 'mant' || tab === 'manutencao') normalizedTab = 'manutencao';
        else if (tab === 'doc' || tab === 'documentos') normalizedTab = 'documentos';

        renderViewContent(id, normalizedTab);
    }

var _MARKER_COLOR_MAP = {
    blue: '#2563eb', green: '#16a34a', red: '#dc2626',
    orange: '#ea580c', yellow: '#ca8a04', purple: '#9333ea',
    default: '#64748b'
};

var _MARKER_TAB_MAP = {
    auditoria:    { listKey: 'auditMarcadores', getItems: () => audits,       setItems: v => audits = v },
    atividades:   { listKey: 'ativMarcadores',  getItems: () => activities,   setItems: v => activities = v },
    documentos:   { listKey: 'docMarcadores',   getItems: () => documents,    setItems: v => documents = v },
    manutencao:   { listKey: 'mantMarcadores',  getItems: () => maintenances, setItems: v => maintenances = v }
};

function _markerFieldHtml(item) {
    var _esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var hasMarker = !!(item && item.marcador);
    var bg = hasMarker ? (_MARKER_COLOR_MAP[item.marcadorCor] || _MARKER_COLOR_MAP['default']) : null;
    var btnContent = hasMarker
        ? '<span style="display:inline-flex;align-items:center;gap:5px;background:' + bg + ';color:#fff;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600;">' +
          '<i class="fas fa-bookmark" style="font-size:10px"></i> ' + _esc(item.marcador) + '</span>'
        : '<span class="marker-field-empty"><i class="fas fa-plus"></i> Adicionar marcador</span>';
    return { html: '<button type="button" class="marker-field-btn" id="viewModalMarkerBtn" onclick="toggleMarkerPopover(event)">' +
        btnContent + '<i class="fas fa-chevron-down marker-field-chevron"></i></button>' +
        '<div class="marker-popover" id="markerPopover"></div>' };
}

function toggleMarkerPopover(event) {
    event.stopPropagation();
    var pop = document.getElementById('markerPopover');
    var btn = document.getElementById('viewModalMarkerBtn');
    if (!pop) return;
    if (pop.classList.contains('active')) {
        closeMarkerPopover();
        return;
    }
    var tab = window._currentViewTab;
    var cfg = _MARKER_TAB_MAP[tab];
    if (!cfg) return;
    var item = (cfg.getItems() || []).find(i => i.id === window._currentViewId);
    if (!item || item.deleted || (typeof userCanEditCards === 'function' && !userCanEditCards(item))) return;

    renderMarkerPopover(item, tab, cfg);
    pop.classList.add('active');
    if (btn) btn.classList.add('popover-open');
    document.addEventListener('click', _markerPopoverOutsideClick);
}

function _markerPopoverOutsideClick(e) {
    var pop = document.getElementById('markerPopover');
    var btn = document.getElementById('viewModalMarkerBtn');
    if (!pop) return;
    if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
    closeMarkerPopover();
}

function closeMarkerPopover() {
    var pop = document.getElementById('markerPopover');
    var btn = document.getElementById('viewModalMarkerBtn');
    if (pop) pop.classList.remove('active');
    if (btn) btn.classList.remove('popover-open');
    document.removeEventListener('click', _markerPopoverOutsideClick);
}

function renderMarkerPopover(item, tab, cfg) {
    var pop = document.getElementById('markerPopover');
    if (!pop) return;
    var list = (masterLists && masterLists[cfg.listKey]) ? masterLists[cfg.listKey] : [];
    var _esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,"\\'"); };

    var itemsHtml;
    if (list.length === 0) {
        itemsHtml = '<button type="button" class="marker-popover-item marker-popover-add" onclick="closeMarkerPopover();openListManager(\'marcadores\')">' +
            '<i class="fas fa-plus"></i><span>Adicionar marcador</span></button>';
    } else {
        itemsHtml = list.filter(function(m) { return m && !m.deleted && m.name; }).map(function(m) {
            var color = _MARKER_COLOR_MAP[m.color] || _MARKER_COLOR_MAP['default'];
            var isCurrent = m.name === item.marcador;
            return '<button type="button" class="marker-popover-item' + (isCurrent ? ' current' : '') + '" onclick="selectItemMarker(\'' + _esc(m.name) + '\',\'' + (m.color || 'default') + '\')">' +
                '<span class="marker-popover-dot" style="color:' + color + ';background:' + color + '"></span>' +
                '<span>' + _esc(m.name) + '</span>' +
                (isCurrent ? '<i class="fas fa-check"></i>' : '') +
                '</button>';
        }).join('') +
        (item.marcador ? '<div class="marker-popover-sep"></div><button type="button" class="marker-popover-item marker-popover-clear" onclick="selectItemMarker(\'\',\'\')"><i class="fas fa-ban"></i><span>Remover marcador</span></button>' : '');
    }
    pop.innerHTML = '<div class="status-popover-label">Marcador</div>' + itemsHtml;
}

function selectItemMarker(newMarker, newColor) {
    closeMarkerPopover();
    var tab = window._currentViewTab;
    var cfg = _MARKER_TAB_MAP[tab];
    if (!cfg) return;
    var items = cfg.getItems() || [];
    var item = items.find(i => i.id === window._currentViewId);
    if (!item || item.marcador === newMarker) return;

    var prevMarker = item.marcador || '(nenhum)';
    item.marcador = newMarker || '';
    item.marcadorCor = newMarker ? (newColor || 'default') : '';

    if (!Array.isArray(item.historico)) item.historico = [];
    item.historico.push({
        timestamp: new Date().toISOString(),
        acao: 'Alteração de Marcador',
        usuario: currentuser ? (currentuser.name || currentuser.user) : 'Sistema',
        detalhes: [{ campo: 'Marcador', de: prevMarker, para: newMarker || '(nenhum)' }],
        snapshot: _safeSnapshot(item)
    });

    saveAll();
    renderViewContent(item.id, tab);
    if (typeof renderCards === 'function') renderCards();
    if (typeof isKanbanActive === 'function' && isKanbanActive(tab) && typeof renderKanban === 'function') renderKanban();
}

window.toggleMarkerPopover = toggleMarkerPopover;
window.closeMarkerPopover = closeMarkerPopover;
window.selectItemMarker = selectItemMarker;

function renderViewContent(id, tab) {
    if (typeof closeStatusPopover === 'function') closeStatusPopover();
    var item, statusList, finalTab = tab;

    // Normaliza o tab para os valores esperados
    if (tab === 'audit') finalTab = 'auditoria';
    else if (tab === 'ativ') finalTab = 'atividades';
    else if (tab === 'mant' || tab === 'manutencao') finalTab = 'manutencao';
    else if (tab === 'doc' || tab === 'documentos') finalTab = 'documentos';

    // Tenta encontrar o item no array correto
    if (finalTab === 'auditoria') {
        item = audits.find(i => i.id === id);
        statusList = masterLists.auditStatus;
    } else if (finalTab === 'atividades') {
        item = activities.find(i => i.id === id);
        statusList = masterLists.ativStatus;
    } else if (finalTab === 'manutencao') {
        item = maintenances.find(i => i.id === id);
        statusList = masterLists.mantStatus;
    } else if (finalTab === 'documentos') {
        item = documents.find(i => i.id === id);
        statusList = masterLists.docStatus;
    }

    // Se não encontrou, procura em todos os arrays
    if (!item) {
        item = audits.find(i => i.id === id);
        if (item) { finalTab = 'auditoria'; statusList = masterLists.auditStatus; }
        else {
            item = activities.find(i => i.id === id);
            if (item) { finalTab = 'atividades'; statusList = masterLists.ativStatus; }
            else {
                item = maintenances.find(i => i.id === id);
                if (item) { finalTab = 'manutencao'; statusList = masterLists.mantStatus; }
                else {
                    item = documents.find(i => i.id === id);
                    if (item) { finalTab = 'documentos'; statusList = masterLists.docStatus; }
                }
            }
        }
    }

    if (!item) return;

    // Guarda referência global
    window._currentViewId = id;
    window._currentViewTab = finalTab;

    var statusObj = (statusList || []).find(s => s.name === item.status) || { color: 'default' };
    var statusColorVar = colorMap[statusObj.color] || colorMap['default'];

    // ── Ícone e meta ──────────────────────────────────────────
    const iconMap = {
        auditoria: 'fa-clipboard-check',
        atividades: 'fa-tasks',
        documentos: 'fa-file-alt',
        manutencao: 'fa-wrench'
    };
    const tabLabelMap = {
        auditoria: 'Rotinas',
        atividades: 'Atividade',
        documentos: 'Documento',
        manutencao: 'Manutenção'
    };

    // ── Atualiza header do modal ──────────────────────────────
    const titleEl = document.getElementById('viewModalTitle');
    const metaEl = document.getElementById('viewModalMeta');
    const iconWrap = document.getElementById('viewModalIconWrap');
    const statusEl = document.getElementById('viewModalStatus');
    const statusTextEl = document.getElementById('viewModalStatusText');
    if (titleEl) titleEl.textContent = item.titulo + (item.deleted ? ' [DELETADO]' : '');
    if (metaEl) metaEl.textContent = `${tabLabelMap[finalTab] || ''} · ${(typeof setorText === 'function' ? setorText(item.setor) : item.setor) || ''} · ${item.categoria || ''}`;
    if (iconWrap) iconWrap.innerHTML = `<i class="fas ${iconMap[finalTab] || 'fa-file'}"></i>`;
    if (statusTextEl) statusTextEl.textContent = item.status;
    if (statusEl) statusEl.style.background = statusColorVar;

    // ── Edit button ───────────────────────────────────────────
    var btnEdit = document.getElementById('btnViewEdit');
    if (btnEdit) btnEdit.style.display = (userCanEditCards(item) && !item.deleted) ? 'inline-flex' : 'none';

    // ── Publicar button ───────────────────────────────────────
    var btnPublicar = document.getElementById('btnPublicar');
    var _canPub = typeof userCanPublish === 'function' ? userCanPublish(item) : true;
    var _showPublish = finalTab !== 'manutencao' && !item.deleted && _canPub;
    if (btnPublicar) {
        btnPublicar.dataset.canPub = _showPublish ? 'true' : 'false';
        var _activeTab = document.querySelector('.view-modal-tab.active');
        var _activeTabName = _activeTab ? _activeTab.getAttribute('onclick').match(/switchViewTab\('(\w+)'/)[1] : 'info';
        btnPublicar.style.display = (_showPublish && _activeTabName === 'publicacoes') ? 'inline-flex' : 'none';
    }

    // ── INFO TAB ──────────────────────────────────────────────
    var detailsCards = '';
    if (finalTab === 'auditoria') {
        const rotinaLabelAudit = { pontual: 'Pontual', anual: 'Anual', mensal: 'Mensal', semanal: 'Semanal', diasemana: 'Dia da semana' }[item.rotina || 'pontual'] || 'Pontual';
        const freqUnitAudit = { anual: 'ano(s)', mensal: 'mês(es)', semanal: 'semana(s)' }[item.rotina];
        const freqLabelAudit = freqUnitAudit && item.frequencia ? `A cada ${item.frequencia} ${freqUnitAudit}` : (item.rotina === 'diasemana' ? 'Semanal (dia fixo)' : null);
        detailsCards = _viewCards([
            ['Setor', item.setor], ['Categoria', item.categoria],
            ['Responsável', item.responsavel], ['Revisor', item.revisor],
            ['Auditor', item.auditor],
            ['Rotina', rotinaLabelAudit],
            ['Frequência', freqLabelAudit],
            ['Publicação', formatBR(item.dataPublicacao)],
            ['Previsão', formatBR(item.dataPrevisao)],
            ['Marcador', _markerFieldHtml(item)],
            ['Alerta', item.flagDias === 0 ? 'N/A' : item.flagDias + ' dias antes'],
            ['Ao Alertar →', item.alertStatus || null],
            ['Ao Vencer →', item.overdueStatus || null]
        ]);
    } else if (finalTab === 'atividades') {
        detailsCards = _viewCards([
            ['Setor', item.setor], ['Categoria', item.categoria],
            ['Responsável', item.responsavel], ['Revisor', item.revisor],
            ['Data Início', formatBR(item.dataInicio)], ['Data Conclusão', formatBR(item.dataConclusao)],
            ['Marcador', _markerFieldHtml(item)],
            ['Alerta', item.flagDias === 0 ? 'N/A' : item.flagDias + ' dias antes']
        ]);
    } else if (finalTab === 'manutencao') {
        const isNA = isBlankPeriodicity(item.intervalo);
        detailsCards = _viewCards([
            ['Setor', item.setor], ['Tipo', item.tipo], ['Categoria', item.categoria],
            ['Equipamento', item.item],
            ['Periodicidade', isNA ? 'N/A' : item.intervalo + ' dias'],
            ['Última', formatBR(item.ultima)],
            ['Próxima', isNA ? 'N/A' : formatBR(item.proxima)],
            ['Resp. Técnico', item.responsavelTecnico],
            ['Resp. Manutenção', item.responsavelManutencao],
            ['Empresa', item.empresaResponsavel],
            ['Marcador', _markerFieldHtml(item)],
            ['Alerta', item.flagDias === 0 ? 'N/A' : item.flagDias + ' dias antes']
        ]);
    } else if (finalTab === 'documentos') {
        const rotinaLabelDoc = { pontual: 'Pontual', anual: 'Anual', mensal: 'Mensal', semanal: 'Semanal', diasemana: 'Dia da semana' }[item.rotina || 'pontual'] || 'Pontual';
        const freqUnitDoc = { anual: 'ano(s)', mensal: 'mês(es)', semanal: 'semana(s)' }[item.rotina];
        const freqLabelDoc = freqUnitDoc && item.frequencia ? `A cada ${item.frequencia} ${freqUnitDoc}` : (item.rotina === 'diasemana' ? 'Semanal (dia fixo)' : null);
        detailsCards = _viewCards([
            ['Setor', item.setor], ['Categoria', item.categoria],
            ['Responsável', item.responsavel], ['Revisor', item.revisor],
            ['Rotina', rotinaLabelDoc],
            ['Frequência', freqLabelDoc],
            ['Data do Documento', formatBR(item.dataCriacao)],
            ['Próx. Revisão', item.dataProximaRevisao ? formatBR(item.dataProximaRevisao) : 'N/A'],
            ['Marcador', _markerFieldHtml(item)],
            ['Alerta', item.flagDias === 0 ? 'N/A' : item.flagDias + ' dias antes'],
            ['Ao Alertar →', item.alertStatus || null],
            ['Ao Vencer →', item.overdueStatus || null]
        ]);
    }

    // Aba checklist: ocultar para documentos
    const _noChecklistTab = finalTab === 'documentos';
    document.querySelectorAll('.view-modal-tab').forEach(t => {
        const match = t.getAttribute('onclick')?.match(/switchViewTab\('(\w+)'/);
        if (match && match[1] === 'checklist') t.style.display = _noChecklistTab ? 'none' : '';
    });

    // Checklist mini-progress no info tab
    const checklist = item.checklist || [];
    let checklistProgress = '';
    if (!_noChecklistTab && checklist.length > 0) {
        const done = checklist.filter(c => c.checked).length;
        const pct = Math.round((done / checklist.length) * 100);
        checklistProgress = `
            <div style="margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;">
                    <span><i class="fas fa-check-square" style="color:#22c55e;margin-right:4px;"></i>Checklist</span>
                    <span>${done}/${checklist.length} (${pct}%)</span>
                </div>
                <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#22c55e,#16a34a);border-radius:3px;transition:width 0.4s;"></div>
                </div>
            </div>`;
    }

    const deletedBanner = item.deleted ? `
        <div style="background:#fff5f5;border:1.5px solid #fca5a5;border-radius:12px;padding:14px 16px;margin-bottom:16px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#dc2626;">
                <i class="fas fa-trash-alt"></i> Item na lixeira
            </div>
            <div style="font-size:12px;color:#6b7280;">
                <span style="font-weight:600;">Excluído por:</span> ${item.deletedBy || 'desconhecido'} &nbsp;·&nbsp;
                <span style="font-weight:600;">Em:</span> ${item.deletedAt ? new Date(item.deletedAt).toLocaleString('pt-BR') : 'ND'}
            </div>
            ${item.deletedReason ? `<div style="font-size:12px;color:#374151;background:#fee2e2;border-radius:8px;padding:8px 10px;margin-top:2px;"><span style="font-weight:700;color:#dc2626;">Motivo:</span> ${item.deletedReason.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
        </div>` : '';

    const infoHtml = `
        ${deletedBanner}
        <div class="view-info-grid">${detailsCards}</div>
        ${checklistProgress}
        <div>
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Descrição</div>
            <div class="view-desc-block">${(item.descricao || 'Sem descrição.').replace(/\n/g, '<br>')}</div>
        </div>`;

    document.getElementById('viewContent').innerHTML = infoHtml;

    // ── Checklist tab ─────────────────────────────────────────
    if (typeof renderViewChecklist === 'function') renderViewChecklist(item, finalTab);

    // ── Anexos tab ────────────────────────────────────────────
    if (typeof renderViewAnexos === 'function') renderViewAnexos(item);

    // Badge de anexos
    const anexosBadge = document.getElementById('anexosTabBadge');
    if (anexosBadge) {
        const anexosCount = (item.anexos || []).length;
        anexosBadge.textContent = anexosCount;
        anexosBadge.style.display = anexosCount > 0 ? '' : 'none';
    }

    // ── Publicações tab ───────────────────────────────────────
    window._pubSubtabAtivo = 'Todos';
    document.querySelectorAll('.pub-subtab').forEach(b => { b.classList.toggle('active', b.dataset.tipo === 'Todos'); });
    const _subtabsEl = document.getElementById('pubSubtabs');
    const _tabsComTipo = ['auditoria', 'atividades'];
    if (_subtabsEl) _subtabsEl.style.display = _tabsComTipo.includes(finalTab) ? '' : 'none';
    if (typeof renderViewPublicacoes === 'function') renderViewPublicacoes(item);

    // Badge
    const badge = document.getElementById('pubTabBadge');
    if (badge) {
        const count = (item.publicacoes || []).length;
        badge.textContent = count;
        badge.style.display = count > 0 ? '' : 'none';
    }

    // Reset to first tab
    document.querySelectorAll('.view-modal-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.view-tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));

    document.getElementById('viewModal').style.display = 'flex';
}

function _viewCards(pairs) {
    const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const _renderVal = (val) => {
        if (val === null || val === undefined || val === '') return '<span class="view-info-nd">ND</span>';
        if (val && typeof val === 'object' && val.html !== undefined) return val.html || '<span class="view-info-nd">ND</span>';
        try {
            const p = JSON.parse(val);
            if (Array.isArray(p) && p.length > 0) {
                // Tenta resolver cada item como ID de usuário; filtra os não-encontrados
                const names = p.map(id => {
                    const name = typeof resolveUserId === 'function' ? resolveUserId(String(id)) : null;
                    return name || null;
                }).filter(Boolean);
                if (names.length > 0) {
                    return `<div class="view-info-chips">${names.map(n => `<span class="view-info-chip"><i class="fas fa-user-circle"></i>${_esc(n)}</span>`).join('')}</div>`;
                }
                return '<span class="view-info-nd">ND</span>';
            }
        } catch (_) {}
        return _esc(val) || '<span class="view-info-nd">ND</span>';
    };
    const _renderSetor = (val) => {
        const arr = (typeof setorArr === 'function') ? setorArr(val) : (val ? [val] : []);
        if (!arr.length) return '<span class="view-info-nd">ND</span>';
        return `<div class="view-info-chips">${arr.map(s => `<span class="view-info-chip"><i class="fas fa-building"></i>${_esc(s)}</span>`).join('')}</div>`;
    };
    return pairs.filter(([, val]) => val !== null && val !== undefined).map(([label, val]) =>
        `<div class="view-info-card${label === 'Marcador' ? ' view-info-card-marker' : ''}"><label>${label}</label><div>${label === 'Setor' ? _renderSetor(val) : _renderVal(val)}</div></div>`
    ).join('');
}

// Função utilitária para alternar a exibição dos detalhes do histórico
window.toggleHistoryDetails = function(el) {
    const item = el.closest('.history-item');
    if (!item) return;
    item.classList.toggle('expanded');
};

// --- DRAWER DE HISTÓRICO ---
window._historyDrawerPage = 1;

window.openHistoryDrawer = function() {
    var drawer = document.getElementById('historyDrawer');
    var backdrop = document.getElementById('historyDrawerBackdrop');
    if (!drawer) return;
    window._historyDrawerPage = 1;
    drawer.classList.add('open');
    backdrop.classList.add('open');
    renderHistoryDrawer();
};

window.closeHistoryDrawer = function() {
    var drawer = document.getElementById('historyDrawer');
    var backdrop = document.getElementById('historyDrawerBackdrop');
    if (!drawer) return;
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
};

window._hdPickerYear = new Date().getFullYear();
window._hdFilterMonth = null; // { year, month } or null

window.toggleHistoryMonthPicker = function() {
    var picker = document.getElementById('hdMonthPicker');
    if (!picker) return;
    var isOpen = picker.classList.contains('open');
    if (isOpen) { picker.classList.remove('open'); return; }
    window._hdPickerYear = window._hdFilterMonth ? window._hdFilterMonth.year : new Date().getFullYear();
    hdRenderMonthGrid();
    picker.classList.add('open');
    setTimeout(function() {
        document.addEventListener('click', hdPickerOutsideClick, { once: true });
    }, 0);
};

function hdPickerOutsideClick(e) {
    var picker = document.getElementById('hdMonthPicker');
    var btn = document.getElementById('btnHistoryCalendar');
    if (picker && !picker.contains(e.target) && btn && !btn.contains(e.target)) {
        picker.classList.remove('open');
    } else if (picker && picker.classList.contains('open')) {
        document.addEventListener('click', hdPickerOutsideClick, { once: true });
    }
}

window.hdChangeYear = function(delta) {
    window._hdPickerYear += delta;
    hdRenderMonthGrid();
};

function hdRenderMonthGrid() {
    var yearEl = document.getElementById('hdPickerYear');
    var grid = document.getElementById('hdMonthGrid');
    var clearBtn = document.getElementById('hdClearFilter');
    if (!yearEl || !grid) return;
    yearEl.textContent = window._hdPickerYear;
    var months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    grid.innerHTML = months.map(function(m, i) {
        var active = window._hdFilterMonth && window._hdFilterMonth.year === window._hdPickerYear && window._hdFilterMonth.month === i;
        return '<button class="hd-mp-month' + (active ? ' active' : '') + '" onclick="hdSelectMonth(' + i + ')">' + m + '</button>';
    }).join('');
    if (clearBtn) clearBtn.style.display = window._hdFilterMonth ? 'flex' : 'none';
}

window.hdSelectMonth = function(monthIndex) {
    window._hdFilterMonth = { year: window._hdPickerYear, month: monthIndex };
    var picker = document.getElementById('hdMonthPicker');
    if (picker) picker.classList.remove('open');
    var btn = document.getElementById('btnHistoryCalendar');
    if (btn) btn.classList.add('active');
    window._historyDrawerPage = 1;
    renderHistoryDrawer();
};

window.hdClearMonthFilter = function() {
    window._hdFilterMonth = null;
    var btn = document.getElementById('btnHistoryCalendar');
    if (btn) btn.classList.remove('active');
    var picker = document.getElementById('hdMonthPicker');
    if (picker) picker.classList.remove('open');
    window._historyDrawerPage = 1;
    renderHistoryDrawer();
};

window.renderHistoryDrawer = function() {
    var id = window._currentViewId;
    var finalTab = window._currentViewTab;
    if (id === undefined || !finalTab) return;

    var item;
    if (finalTab === 'auditoria') item = audits.find(i => i.id === id);
    else if (finalTab === 'atividades') item = activities.find(i => i.id === id);
    else if (finalTab === 'manutencao') item = maintenances.find(i => i.id === id);
    else if (finalTab === 'documentos') item = documents.find(i => i.id === id);
    if (!item) return;

    var allHistory = (item.historico || []).slice().reverse().map((entry, revIndex) => ({
        entry,
        originalIndex: (item.historico.length - 1) - revIndex
    })).filter(h => !h.entry.deleted);

    if (window._hdFilterMonth) {
        var fy = window._hdFilterMonth.year, fm = window._hdFilterMonth.month;
        allHistory = allHistory.filter(h => {
            var d = new Date(h.entry.timestamp);
            return d.getFullYear() === fy && d.getMonth() === fm;
        });
    }

    var itemsPerPage = 10;
    var totalItems = allHistory.length;
    var totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    window._historyDrawerPage = Math.min(Math.max(1, window._historyDrawerPage), totalPages);
    var start = (window._historyDrawerPage - 1) * itemsPerPage;
    var paginated = allHistory.slice(start, start + itemsPerPage);

    var isAdmin = userIsAdmin();

    var typeColors = {
        'Criação': '#22c55e',
        'Criado': '#22c55e',
        'Edição': '#3b82f6',
        'Editado': '#3b82f6',
        'Atualização': '#3b82f6',
        'Restauração': '#f59e0b',
    };

    function getTypeColor(acao) {
        for (var k in typeColors) { if (acao && acao.toLowerCase().includes(k.toLowerCase())) return typeColors[k]; }
        return '#6b7280';
    }
    function getTypeLabel(acao) {
        if (!acao) return 'AÇÃO';
        if (acao.toLowerCase().includes('cria')) return 'CRIADO';
        if (acao.toLowerCase().includes('edit') || acao.toLowerCase().includes('atualiz')) return 'EDITADO';
        if (acao.toLowerCase().includes('restaur')) return 'RESTAURADO';
        return 'AÇÃO';
    }

    var bodyHtml = paginated.length === 0
        ? '<div class="history-drawer-empty"><i class="fas fa-inbox"></i><p>Nenhuma alteração registrada.</p></div>'
        : paginated.map((h, idx) => {
            var date = new Date(h.entry.timestamp);
            var dateStr = date.toLocaleDateString('pt-BR');
            var timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            var color = getTypeColor(h.entry.acao);
            var label = getTypeLabel(h.entry.acao);
            var _rawUsr = h.entry.usuario || '';
            var usuario = (_rawUsr && typeof resolveUserId === 'function') ? (resolveUserId(_rawUsr) || _rawUsr) : _rawUsr;

            var detailsArray = [];
            if (h.entry.detalhes) {
                if (Array.isArray(h.entry.detalhes)) detailsArray = h.entry.detalhes;
                else if (typeof h.entry.detalhes === 'object') {
                    detailsArray = Object.keys(h.entry.detalhes).filter(k => k !== 'silentChanged').map(k => h.entry.detalhes[k]);
                }
            }

            var changesHtml = detailsArray.length > 0
                ? detailsArray.map(d => {
                    if (typeof d === 'object' && d !== null) {
                        if (d.campo) {
                            var from = d.de != null ? String(d.de) : 'vazio';
                            var to   = d.para != null ? String(d.para) : 'vazio';
                            return `<div class="hd-change-row">
                                <span class="hd-change-field">${d.campo}</span>
                                <span class="hd-change-from">${from.length > 50 ? from.slice(0,50)+'…' : from}</span>
                                <i class="fas fa-arrow-right hd-change-arrow"></i>
                                <span class="hd-change-to">${to.length > 50 ? to.slice(0,50)+'…' : to}</span>
                            </div>`;
                        }
                        return `<div class="hd-change-row"><span class="hd-change-field" style="color:#6b7280;">${JSON.stringify(d)}</span></div>`;
                    }
                    var str = String(d);
                    // Strings com HTML (checklist, descrição) — renderiza direto
                    if (str.includes('<') && str.includes('>')) {
                        return `<div class="hd-change-row" style="display:block;">${str}</div>`;
                    }
                    var parts = str.match(/^(.+?):\s*(.*?)\s*(?:→|&rarr;)\s*(.+)$/);
                    if (parts) {
                        var from = parts[2].length > 50 ? parts[2].slice(0,50)+'…' : parts[2];
                        var to   = parts[3].length > 50 ? parts[3].slice(0,50)+'…' : parts[3];
                        return `<div class="hd-change-row">
                            <span class="hd-change-field">${parts[1]}</span>
                            <span class="hd-change-from">${from || 'vazio'}</span>
                            <i class="fas fa-arrow-right hd-change-arrow"></i>
                            <span class="hd-change-to">${to}</span>
                        </div>`;
                    }
                    return `<div class="hd-change-row"><span class="hd-change-field" style="color:#6b7280;">${str.length > 120 ? str.slice(0,120)+'…' : str}</span></div>`;
                }).join('')
                : '';

            var deleteBtn = isAdmin
                ? `<button class="hd-delete-btn" title="Excluir" onclick="event.stopPropagation(); deleteHistoryEntry(${id}, '${finalTab}', ${h.originalIndex})"><i class="fas fa-trash"></i> Excluir Registro</button>`
                : '';

            var filteredIndex = start + idx;
            return `
            <div class="hd-item" onclick="toggleHdItem(this)">
                <div class="hd-item-top">
                    <div class="hd-item-dot" style="background:${color}"></div>
                    <div class="hd-item-content">
                        <div class="hd-item-meta">
                            ${usuario ? `<span class="hd-user"><i class="fas fa-user"></i> ${usuario}</span>` : ''}
                            <span class="hd-badge" style="background:${color}20; color:${color}; border-color:${color}40;">${label}</span>
                            <span class="hd-date">${dateStr} às ${timeStr}</span>
                        </div>
                        <div class="hd-item-title">${h.entry.acao}</div>
                    </div>
                    <div class="hd-item-actions">
                        <button class="hd-view-btn" title="Ver snapshot" onclick="event.stopPropagation(); viewHistoryItem(${id}, '${finalTab}', ${filteredIndex})"><i class="fas fa-eye"></i></button>
                        <span class="hd-toggle-icon"><i class="fas fa-chevron-down"></i></span>
                    </div>
                </div>
                <div class="hd-item-body">
                    <div class="hd-item-body-inner">
                        ${changesHtml || '<span style="color:#94a3b8; font-size:12px; font-style:italic;">Sem detalhes adicionais.</span>'}
                        ${deleteBtn}
                    </div>
                </div>
            </div>`;
        }).join('');

    document.getElementById('historyDrawerBody').innerHTML = bodyHtml;

    var paginationHtml = totalPages > 1 ? `
        <span style="color:#94a3b8; font-size:12px;">${start + 1}–${Math.min(start + itemsPerPage, totalItems)} de ${totalItems}</span>
        <div style="display:flex; gap:6px;">
            <button ${window._historyDrawerPage === 1 ? 'disabled' : ''} onclick="window._historyDrawerPage--; renderHistoryDrawer()"><i class="fas fa-chevron-left"></i> Anterior</button>
            <button ${window._historyDrawerPage === totalPages ? 'disabled' : ''} onclick="window._historyDrawerPage++; renderHistoryDrawer()">Próximo <i class="fas fa-chevron-right"></i></button>
        </div>
    ` : `<span style="color:#94a3b8; font-size:12px;">${totalItems} registro${totalItems !== 1 ? 's' : ''}</span>`;

    document.getElementById('historyDrawerPagination').innerHTML = paginationHtml;
};

window.toggleHdItem = function(el) {
    el.classList.toggle('open');
};

async function viewHistoryItem(id, tab, historyIndex) {
    var finalTab = tab;
    if (tab === 'audit') finalTab = 'auditoria';
    else if (tab === 'ativ') finalTab = 'atividades';
    else if (tab === 'mant' || tab === 'manutencao') finalTab = 'manutencao';
    else if (tab === 'doc' || tab === 'documentos') finalTab = 'documentos';

    var item;
    if (finalTab === 'auditoria') item = audits.find(i => i.id === id);
    else if (finalTab === 'atividades') item = activities.find(i => i.id === id);
    else if (finalTab === 'manutencao') item = maintenances.find(i => i.id === id);
    else if (finalTab === 'documentos') item = documents.find(i => i.id === id);
    if (!item) return;

    var history = item.historico || [];
    var allHistory = history.slice().reverse().map((entry, revIndex) => ({
        entry, originalIndex: history.length - 1 - revIndex
    })).filter(h => h.entry.acao !== 'Restauração de Backup');

    if (historyIndex < 0 || historyIndex >= allHistory.length) return;
    var h = allHistory[historyIndex];

    var date = new Date(h.entry.timestamp);
    var dateStr = date.toLocaleDateString('pt-BR');
    var timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Resolve nos dois formatos: `snapshot` inline (antigo) ou `snapId` apontando
    // para /cardSnapshots (atual, carregado sob demanda — só aqui, no clique).
    var snap = await window._resolveHistorySnapshot(h.entry, item);

    // Helper: converte valor para string legível, truncando se necessário
    function _val(v, maxLen) {
        maxLen = maxLen || 60;
        if (v === null || v === undefined || v === '') return 'N/A';
        if (typeof v === 'object') {
            if (Array.isArray(v)) {
                var s = v.map(x => typeof x === 'object' ? (x.name || x.titulo || x.texto || JSON.stringify(x)) : String(x)).join(', ');
                return s.length > maxLen ? s.slice(0, maxLen) + '…' : s || 'N/A';
            }
            var s2 = v.name || v.titulo || v.texto || v.value || JSON.stringify(v);
            return String(s2).length > maxLen ? String(s2).slice(0, maxLen) + '…' : String(s2);
        }
        var str = String(v);
        return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
    }
    function _date(v) { return v ? formatBR(v) : 'N/A'; }
    function _valUser(v) {
        if (!v) return 'N/A';
        var ids;
        try { var p = JSON.parse(String(v)); ids = Array.isArray(p) ? p.map(String) : [String(p)]; }
        catch { ids = [String(v)]; }
        var names = ids.map(id => (typeof resolveUserId === 'function' ? resolveUserId(id) : null) || id).filter(Boolean);
        return names.length ? names.join(', ') : 'N/A';
    }

    // Monta pares [label, valor] por tipo
    var pairs = [];
    if (finalTab === 'auditoria') {
        pairs = [
            ['Setor', _val(snap.setor)], ['Categoria', _val(snap.categoria)],
            ['Responsável', _valUser(snap.responsavel)], ['Revisor', _valUser(snap.revisor)],
            ['Auditor', _valUser(snap.auditor)], ['Status', _val(snap.status)],
            ['Data Publicação', _date(snap.dataPublicacao)], ['Previsão', _date(snap.dataPrevisao)]
        ];
    } else if (finalTab === 'atividades') {
        pairs = [
            ['Setor', _val(snap.setor)], ['Categoria', _val(snap.categoria)],
            ['Responsável', _valUser(snap.responsavel)], ['Revisor', _valUser(snap.revisor)],
            ['Status', _val(snap.status)],
            ['Data Início', _date(snap.dataInicio)], ['Data Conclusão', _date(snap.dataConclusao)]
        ];
    } else if (finalTab === 'manutencao') {
        const isNA = isBlankPeriodicity(snap.intervalo);
        pairs = [
            ['Setor', _val(snap.setor)], ['Tipo', _val(snap.tipo)],
            ['Categoria', _val(snap.categoria)], ['Equipamento', _val(snap.item)],
            ['Status', _val(snap.status)],
            ['Periodicidade', isNA ? 'N/A' : `${snap.intervalo} dias`],
            ['Última Manutenção', _date(snap.ultima)], ['Próxima Manutenção', isNA ? 'N/A' : _date(snap.proxima)],
            ['Resp. Técnico', _valUser(snap.responsavelTecnico)], ['Empresa', _val(snap.empresaResponsavel)]
        ];
    } else if (finalTab === 'documentos') {
        const rotinaLabelSnDoc = { pontual: 'Pontual', anual: 'Anual', mensal: 'Mensal', semanal: 'Semanal', diasemana: 'Dia da semana' }[snap.rotina || 'pontual'] || 'Pontual';
        pairs = [
            ['Setor', _val(snap.setor)], ['Categoria', _val(snap.categoria)],
            ['Responsável', _valUser(snap.responsavel)], ['Revisor', _valUser(snap.revisor)],
            ['Rotina', rotinaLabelSnDoc], ['Status', _val(snap.status)],
            ['Data do Documento', _date(snap.dataCriacao)],
            ['Próx. Revisão', snap.dataProximaRevisao ? _date(snap.dataProximaRevisao) : 'N/A']
        ];
    }

    // Cards grid igual ao view modal
    var cardsHtml = `<div class="view-info-grid">${pairs.map(([label, val]) =>
        `<div class="view-info-card">
            <label>${label}</label>
            <div>${val}</div>
        </div>`
    ).join('')}</div>`;

    // Descrição
    var desc = _val(snap.descricao, 300);
    var descHtml = `<div class="view-desc-block" style="margin-bottom:16px;">${desc !== 'N/A' ? desc.replace(/\n/g,'<br>') : '<span style="color:#94a3b8;font-style:italic;">Sem descrição.</span>'}</div>`;

    // Modificações — corrige [object Object]
    var modEntries = [];
    if (h.entry.detalhes) {
        if (Array.isArray(h.entry.detalhes)) modEntries = h.entry.detalhes;
        else if (typeof h.entry.detalhes === 'object') {
            modEntries = Object.keys(h.entry.detalhes)
                .filter(k => k !== 'silentChanged')
                .map(k => h.entry.detalhes[k]);
        }
    }
    var modHtml = modEntries.length > 0 ? `
        <div style="margin-bottom:16px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Modificações</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
                ${modEntries.map(d => {
                    // Objeto estruturado {campo, de, para}
                    if (typeof d === 'object' && d !== null) {
                        if (d.campo) {
                            var from = _val(d.de, 50), to = _val(d.para, 50);
                            return `<div class="hd-change-row">
                                <span class="hd-change-field">${d.campo}</span>
                                <span class="hd-change-from">${from}</span>
                                <i class="fas fa-arrow-right hd-change-arrow"></i>
                                <span class="hd-change-to">${to}</span>
                            </div>`;
                        }
                        return `<div class="hd-change-row"><span class="hd-change-field" style="color:#475569;">${_val(d, 100)}</span></div>`;
                    }
                    var str = String(d);
                    // Strings que já contêm HTML (checklist, descrição, anexos) — renderiza direto
                    if (str.includes('<') && str.includes('>')) {
                        return `<div class="hd-change-row" style="display:block;">${str}</div>`;
                    }
                    // Formato "Campo: de → para" ou "Campo: de &rarr; para"
                    var parts = str.match(/^(.+?):\s*(.*?)\s*(?:→|&rarr;)\s*(.+)$/);
                    if (parts) {
                        var from = parts[2].length > 50 ? parts[2].slice(0,50)+'…' : parts[2];
                        var to   = parts[3].length > 50 ? parts[3].slice(0,50)+'…' : parts[3];
                        return `<div class="hd-change-row">
                            <span class="hd-change-field">${parts[1]}</span>
                            <span class="hd-change-from">${from || 'vazio'}</span>
                            <i class="fas fa-arrow-right hd-change-arrow"></i>
                            <span class="hd-change-to">${to}</span>
                        </div>`;
                    }
                    var truncated = str.length > 120 ? str.slice(0,120)+'…' : str;
                    return `<div class="hd-change-row"><span class="hd-change-field" style="color:#475569;">${truncated}</span></div>`;
                }).join('')}
            </div>
        </div>` : '';

    // Anexos
    var anexos = snap.anexos || [];
    var anexosHtml = anexos.length > 0 ? `
        <div>
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Anexos</div>
            <div class="view-anexos-grid">${anexos.map(a => {
                var name = a.titulo || a.url || 'Arquivo';
                if (a.tipo === 'imagem' && a.fileId) {
                    var nm = String(name).replace(/"/g, '&quot;').replace(/</g, '&lt;');
                    return `<button type="button" class="view-anexo-card" title="${nm}" onclick="openImgLightboxBlob('${String(a.fileId).replace(/'/g, '')}', this.title)">
                    <i class="fas fa-file-image anexo-icon"></i>
                    <span class="anexo-name">${nm.length > 30 ? nm.slice(0,30)+'…' : nm}</span>
                </button>`;
                }
                return `<a href="${a.url}" target="_blank" class="view-anexo-card">
                    <i class="fas fa-file anexo-icon"></i>
                    <span class="anexo-name">${name.length > 30 ? name.slice(0,30)+'…' : name}</span>
                </a>`;
            }).join('')}</div>
        </div>` : '';

    // Atualiza título e meta no header
    document.getElementById('historyViewTitle').textContent = snap.titulo || 'Registro';
    var metaEl = document.getElementById('historyViewMeta');
    var _snapUsr = h.entry.usuario || '';
    var _snapUsrName = (_snapUsr && typeof resolveUserId === 'function') ? (resolveUserId(_snapUsr) || _snapUsr) : _snapUsr;
    if (metaEl) metaEl.textContent = `${h.entry.acao} • ${dateStr} às ${timeStr}${_snapUsrName ? ' • ' + _snapUsrName : ''}`;

    document.getElementById('historyViewContent').innerHTML = cardsHtml + descHtml + modHtml + anexosHtml;
    document.getElementById('historyViewModal').style.display = 'flex';
}

    window.deleteHistoryEntry = function deleteHistoryEntry(id, tab, historyIndex) {
        showConfirmDanger({
            title: 'Excluir registro do histórico?',
            message: 'Esta entrada será removida permanentemente do histórico de alterações.',
            confirmLabel: 'Excluir',
            requireReason: false,
            onConfirm: () => _doDeleteHistoryEntry(id, tab, historyIndex)
        });
        return;
    }

    function _doDeleteHistoryEntry(id, tab, historyIndex) {
        let item;
        let finalTab = tab;

        // Normaliza o tab
        if (tab === 'audit') finalTab = 'auditoria';
        else if (tab === 'ativ') finalTab = 'atividades';
        else if (tab === 'mant' || tab === 'manutencao') finalTab = 'manutencao';
        else if (tab === 'doc' || tab === 'documentos') finalTab = 'documentos';

        if (finalTab === 'auditoria') { item = audits.find(i => i.id === id); }
        else if (finalTab === 'atividades') { item = activities.find(i => i.id === id); }
        else if (finalTab === 'manutencao') { item = maintenances.find(i => i.id === id); }
        else if (finalTab === 'documentos') { item = documents.find(i => i.id === id); }

        // Se não encontrou, tenta procurar em todos os arrays
        if (!item) {
            item = audits.find(i => i.id === id);
            if (item) finalTab = 'auditoria';
            else {
                item = activities.find(i => i.id === id);
                if (item) finalTab = 'atividades';
                else {
                    item = maintenances.find(i => i.id === id);
                    if (item) finalTab = 'manutencao';
                    else {
                        item = documents.find(i => i.id === id);
                        if (item) finalTab = 'documentos';
                    }
                }
            }
        }

        if (!item || !Array.isArray(item.historico) || item.historico.length === 0) return;

        if (historyIndex < 0 || historyIndex >= item.historico.length) return;

        // SOFT DELETE: Marcar entrada de histórico como deletada
        const historyEntry = item.historico[historyIndex];
        if (historyEntry) {
            historyEntry.deleted = true;
            historyEntry.deletedAt = new Date().toISOString();
            historyEntry.deletedBy = currentuser.email || currentuser.name || 'admin';
        }

        saveAll();
        renderViewContent(id, tab);
        if (typeof renderHistoryDrawer === 'function') renderHistoryDrawer();
    }

    window.editCurrentViewItem = function editCurrentViewItem() {
        if (!currentViewItemId || !currentViewTab) return;
        const _vItem = [...(audits||[]),...(activities||[]),...(documents||[])].find(a => a.id === currentViewItemId);
        if (!userCanEditCards(_vItem)) {
            alert('Você não tem permissão para editar este registro.');
            return;
        }

        const _idToEdit = currentViewItemId, _tabToEdit = currentViewTab;
        const _proceed = () => {
            closeModal('viewModal');
            editItem(_idToEdit, _tabToEdit);
        };
        // Checklist com marcações pendentes: aguarda a decisão do usuário (aplicar/descartar)
        // antes de trocar para o formulário de edição.
        if (window._checklistPendingDirty && typeof window._checklistGuardedClose === 'function') {
            window._checklistGuardedClose(_proceed);
            return;
        }
        _proceed();
    }

    // List Manager & Color Selection
    function openListManager(genericKey) {
        let isStatus = false;
        let listname;

        if (genericKey === 'setores') {
            currentListKey = 'setores';
            listname = 'SETORES';
        } else if (genericKey === 'categorias') {
            if(currentTab === 'auditoria') currentListKey = 'auditCategorias';
            else if(currentTab === 'atividades') currentListKey = 'ativCategorias';
            else if(currentTab === 'manutencao') currentListKey = 'mantCategorias';
            else currentListKey = 'docCategorias';
            listname = 'CATEGORIA';
        } else if (genericKey === 'subcategorias' || genericKey === 'itens') {

            const prefix = getTabPrefix(currentTab);
            const catSelect = document.getElementById(`${prefix}Categoria`);

            if (!catSelect) {
                 alert(`Elemento de Categoria (${prefix}Categoria) não encontrado. Verifique se você abriu o modal correspondente à aba ativa.`);
                 return;
            }

            const cat = catSelect.value;

            if (!cat) { alert("Selecione uma Categoria antes de gerenciar Subcategorias/Itens."); return; }

            let subcatMapKey;
            if(currentTab === 'auditoria') subcatMapKey = 'auditSubcats';
            else if(currentTab === 'atividades') subcatMapKey = 'ativSubcats';
            else if(currentTab === 'manutencao') subcatMapKey = 'mantItens';
            else subcatMapKey = 'docSubcats';

            currentListKey = `${subcatMapKey}_${cat}`;
            listname = `SUBCATEGORIAS / ITENS DE: ${cat}`;

        } else if (genericKey === 'status') {
            if(currentTab === 'auditoria') currentListKey = 'auditStatus';
            else if(currentTab === 'atividades') currentListKey = 'ativStatus';
            else if(currentTab === 'manutencao') currentListKey = 'mantStatus';
            else currentListKey = 'docStatus';
            isStatus = true;
            listname = 'STATUS';
        } else if (genericKey === 'marcadores') {
            const markerTab = window._currentViewTab || currentTab;
            if(markerTab === 'auditoria') currentListKey = 'auditMarcadores';
            else if(markerTab === 'atividades') currentListKey = 'ativMarcadores';
            else if(markerTab === 'manutencao') currentListKey = 'mantMarcadores';
            else currentListKey = 'docMarcadores';
            isStatus = true; // usa a mesma lógica de objetos com cor
            listname = 'MARCADORES';
        } else if (genericKey === 'tipos') {
            if(currentTab === 'manutencao') {
                currentListKey = 'mantTipos';
                listname = 'TIPOS';
            } else {
                alert('Tipos disponíveis apenas para Manutenção.');
                return;
            }
        } else if (genericKey === 'responsaveis') {
            currentListKey = 'responsaveis';
            listname = 'RESPONSÁVEIS';
        } else {
            currentListKey = genericKey;
            listname = genericKey.toUpperCase();
        }

        document.getElementById('listTitle').textContent = `Gerenciar: ${listname}`;
        const body = document.getElementById('listBody');
        body.innerHTML = '';

        if(isStatus) {
            document.getElementById('colorPickerContainer').style.display = 'block';
            selectColor('default', document.querySelector('.bg-default'));
        } else {
            document.getElementById('colorPickerContainer').style.display = 'none';
        }

        let listToRender;
        let baseKey = currentListKey.split('_')[0];

        if (currentListKey.includes('_')) {
            const cat = currentListKey.split('_')[1];
            masterLists[baseKey] = masterLists[baseKey] || {};
            listToRender = masterLists[baseKey][cat] || [];
        } else {
            listToRender = masterLists[currentListKey] || [];
        }

        // SOFT DELETE: Filtrar itens deletados da lista
        listToRender = listToRender.filter(item => {
            if (typeof item === 'object') {
                return !item.deleted;
            }
            // Para strings simples (não-objeto)
            return !item.deleted;
        });

        // Para responsáveis, verifica quais são usuários cadastrados
        const userNames = new Set();
        if (currentListKey === 'responsaveis' && typeof users !== 'undefined') {
            users.forEach(user => {
                if (user.name) userNames.add(user.name);
            });
        }

        listToRender.forEach(val => {
            let displayHtml = '', itemVal = '';
            if (typeof val === 'object') {
                // Verifica se é um objeto com propriedade 'name' (status/marcador) ou 'value' (soft delete)
                if (val.name !== undefined) {
                    // É um status/marcador com nome e cor
                    const colorVar = colorMap[val.color] || colorMap['default'];
                    displayHtml = `<span class="color-dot" style="background-color:${colorVar}"></span>${val.name}`;
                    itemVal = val.name;
                } else if (val.value !== undefined) {
                    // É um item marcado para soft delete (conversão de string para objeto)
                    displayHtml = val.value;
                    itemVal = val.value;
                } else {
                    // Objeto malformado - pular
                    return;
                }
            } else {
                // Deve ser uma string simples
                displayHtml = val;
                itemVal = val;
            }

            // Para responsáveis, verifica se é um usuário cadastrado
            const isUser = currentListKey === 'responsaveis' && userNames.has(itemVal);
            const canEdit = !isUser;
            const canDelete = !isUser;

            const escVal = itemVal.replace(/'/g, "\\'");
            body.innerHTML += `<tr>
                <td class="list-item-cell" data-name="${_escAttr(itemVal)}">${displayHtml}${isUser ? ' <span style="color: #666; font-size: 11px;">(Usuário cadastrado)</span>' : ''}</td>
                <td>
                    <div class="list-actions">
                        ${canEdit ? `<i class="fas fa-pen edit-icon" onclick="editListItem('${currentListKey}','${escVal}')" title="Editar nome"></i>` : ''}
                        ${canDelete ? `<i class="fas fa-trash remove-icon" onclick="removeFromList('${currentListKey}','${escVal}')" title="Excluir"></i>` : ''}
                    </div>
                </td>
            </tr>`;
        });

        const input = document.getElementById('newListItem');
        input.value = '';
        input.onkeydown = (e) => {
            if(e.key === 'Enter') addToList();
        };

        // Para responsáveis, adiciona evento de input para validar em tempo real
        if (currentListKey === 'responsaveis') {
            input.oninput = () => {
                const addBtn = document.querySelector('button[onclick="addToList()"]');

                if (typeof users !== 'undefined') {
                    const userNames = new Set();
                    users.forEach(user => {
                        if (user.name) userNames.add(user.name);
                    });

                    const isValidUser = userNames.has(input.value.trim());
                    addBtn.disabled = !isValidUser && input.value.trim() !== '';
                    addBtn.style.opacity = (!isValidUser && input.value.trim() !== '') ? '0.5' : '1';
                    addBtn.style.cursor = (!isValidUser && input.value.trim() !== '') ? 'not-allowed' : 'pointer';

                    if (!isValidUser && input.value.trim() !== '') {
                        addBtn.title = 'Apenas usuários cadastrados podem ser adicionados como responsáveis';
                    } else {
                        addBtn.title = '';
                    }
                }
            };
        }


        document.getElementById('modalListManager').style.display = 'flex';
    }

    function _escAttr(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function selectColor(color, el) {
        selectedColorTemp = color;
        document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
    }

    function addToList() {
        const val = document.getElementById('newListItem').value.trim();
        if (!val) return;

        const isStatus = currentListKey.toLowerCase().includes('status');
        const isMarcadorList = currentListKey.toLowerCase().includes('marcadores');
        const isSubcat = currentListKey.includes('_');

        // Guarda a categoria e a subcategoria/ item atualmente selecionados no modal da aba ativa
        const prefix = getTabPrefix(currentTab);
        const currentCatSelect = document.getElementById(`${prefix}Categoria`);
        const selectedCategoryBefore = currentCatSelect ? currentCatSelect.value : null;
        let currentSubSelect = null;
        if (prefix === 'mant') {
            currentSubSelect = document.getElementById(`${prefix}Item`);
        } else {
            currentSubSelect = document.getElementById(`${prefix}Sub`);
        }
        const selectedSubBefore = currentSubSelect ? currentSubSelect.value : null;

        let list;
        if (isSubcat) {
            const [baseKey, cat] = currentListKey.split('_');
            masterLists[baseKey][cat] = masterLists[baseKey][cat] || [];
            list = masterLists[baseKey][cat];
        } else {
            list = masterLists[currentListKey];
        }

        if (isStatus || isMarcadorList) {
            const existing = list.find(s => s.name === val);
            if (existing) {
                if (!existing.deleted) return; // já existe e está ativo
                existing.deleted = false;      // revive item soft-deletado
                existing.color = selectedColorTemp;
            } else {
                list.push({ name: val, color: selectedColorTemp });
            }
        } else {
            const existingIdx = list.findIndex(v => (typeof v === 'object' ? v.value : v) === val);
            if (existingIdx >= 0) {
                if (typeof list[existingIdx] === 'object' && list[existingIdx].deleted) {
                    list[existingIdx] = val; // revive item soft-deletado (volta a ser string simples)
                } else {
                    return; // já existe e está ativo
                }
            } else {
                list.push(val);
            }
        }

        // Ordenação - Função robusta para comparar valores que podem ser strings ou objetos
        list.sort((a, b) => {
            const aVal = String(typeof a === 'object' ? a.name : a) || '';
            const bVal = String(typeof b === 'object' ? b.name : b) || '';
            return aVal.localeCompare(bVal);
        });

        saveAll(); populateSelects();

        // Restaura categoria e subcategoria/item após recriar os selects
        if (selectedCategoryBefore) {
            const restoredCat = document.getElementById(`${prefix}Categoria`);
            if (restoredCat) {
                restoredCat.value = selectedCategoryBefore;
                // Recarrega a lista de subcategorias/itens para a categoria correta
                onCategoryChange(prefix);

                if (selectedSubBefore) {
                    const restoredSub = prefix === 'mant'
                        ? document.getElementById(`${prefix}Item`)
                        : document.getElementById(`${prefix}Sub`);
                    if (restoredSub) restoredSub.value = selectedSubBefore;
                }
            }
        }

        // Reabre o mesmo tipo de lista que estava sendo editada
        if (isSubcat) {
            openListManager('subcategorias');
        } else if (isStatus) {
            openListManager('status');
        } else if (isMarcadorList) {
            openListManager('marcadores');
        } else if (currentListKey === 'setores') {
            openListManager('setores');
        } else if (currentListKey === 'mantTipos') {
            openListManager('tipos');
        } else {
            openListManager('categorias');
        }
    }

    function editListItem(key, val) {
        // Ativa edição inline na própria linha da lista, em vez de um prompt() nativo
        const cell = document.querySelector(`#listBody td.list-item-cell[data-name="${CSS.escape(val)}"]`);
        if (!cell) return;

        const original = cell.innerHTML;
        cell.innerHTML = `<input type="text" class="list-item-edit-input" value="${_escAttr(val)}" style="width:100%">`;
        const inp = cell.querySelector('input');
        inp.focus();
        inp.select();

        let done = false;
        const cancel = () => { if (done) return; done = true; cell.innerHTML = original; };
        const commit = () => {
            if (done) return; done = true;
            const newName = inp.value;
            if (!newName || newName.trim() === '' || newName.trim() === val) { cell.innerHTML = original; return; }
            _applyListItemRename(key, val, newName.trim());
        };

        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        inp.addEventListener('blur', commit);
    }

    function _applyListItemRename(key, val, trimmedNewName) {
        const isStatus = key.toLowerCase().includes('status');
        const isMarcadorList = key.toLowerCase().includes('marcadores');
        const isObjectList = isStatus || isMarcadorList;
        const isSubcat = key.includes('_');

        // Atualiza na lista mestra
        let list;
        if (isSubcat) {
            const [baseKey, cat] = key.split('_');
            masterLists[baseKey] = masterLists[baseKey] || {};
            masterLists[baseKey][cat] = masterLists[baseKey][cat] || [];
            list = masterLists[baseKey][cat];
        } else {
            list = masterLists[key];
        }

        // Verifica se o novo nome já existe
        if (isObjectList) {
            if (list.some(item => item.name === trimmedNewName)) {
                alert('Já existe um item com este nome.');
                return;
            }
            const itemIndex = list.findIndex(item => item.name === val);
            if (itemIndex !== -1) {
                list[itemIndex].name = trimmedNewName;
            }
        } else {
            if (list.includes(trimmedNewName)) {
                alert('Já existe um item com este nome.');
                return;
            }
            const itemIndex = list.indexOf(val);
            if (itemIndex !== -1) {
                list[itemIndex] = trimmedNewName;
            }
        }

        // Atualiza todos os cards que usam este item
        const updateCards = (cards, fieldName) => {
            cards.forEach(card => {
                if (card[fieldName] === val) {
                    card[fieldName] = trimmedNewName;
                }
            });
        };

        // Identifica qual campo atualizar baseado na chave da lista
        if (key === 'setores') {
            // Setor pode ser multi-valor (JSON de array): renomeia dentro do array
            [audits, activities, maintenances, documents, window.ocorrencias || [], window.rncItems || []].forEach(cards => {
                cards.forEach(card => { card.setor = setorRename(card.setor, val, trimmedNewName); });
            });
        } else if (key === 'auditCategorias') {
            updateCards(audits, 'categoria');
        } else if (key === 'ativCategorias') {
            updateCards(activities, 'categoria');
        } else if (key === 'mantCategorias') {
            updateCards(maintenances, 'categoria');
        } else if (key === 'docCategorias') {
            updateCards(documents, 'categoria');
        } else if (key.startsWith('auditSubcats_')) {
            updateCards(audits, 'subcategoria');
        } else if (key.startsWith('ativSubcats_')) {
            updateCards(activities, 'subcategoria');
        } else if (key.startsWith('docSubcats_')) {
            updateCards(documents, 'subcategoria');
        } else if (key.startsWith('mantItens_')) {
            updateCards(maintenances, 'item');
        } else if (key === 'mantTipos') {
            updateCards(maintenances, 'tipo');
        } else if (isStatus) {
            // Identifica qual tipo de status baseado na chave exata
            if (key === 'auditStatus') {
                audits.forEach(card => {
                    if (card.status === val) card.status = trimmedNewName;
                });
            } else if (key === 'ativStatus') {
                activities.forEach(card => {
                    if (card.status === val) card.status = trimmedNewName;
                });
            } else if (key === 'mantStatus') {
                maintenances.forEach(card => {
                    if (card.status === val) card.status = trimmedNewName;
                });
            } else if (key === 'docStatus') {
                documents.forEach(card => {
                    if (card.status === val) card.status = trimmedNewName;
                });
            }
        } else if (isMarcadorList) {
            // Identifica qual tipo de marcador baseado na chave exata
            if (key === 'auditMarcadores') {
                audits.forEach(card => {
                    if (card.marcador === val) card.marcador = trimmedNewName;
                });
            } else if (key === 'ativMarcadores') {
                activities.forEach(card => {
                    if (card.marcador === val) card.marcador = trimmedNewName;
                });
            } else if (key === 'mantMarcadores') {
                maintenances.forEach(card => {
                    if (card.marcador === val) card.marcador = trimmedNewName;
                });
            } else if (key === 'docMarcadores') {
                documents.forEach(card => {
                    if (card.marcador === val) card.marcador = trimmedNewName;
                });
            }
        }

        // Ordena a lista - Função robusta para comparar valores que podem ser strings ou objetos
        list.sort((a, b) => {
            const aVal = String(typeof a === 'object' ? a.name : a) || '';
            const bVal = String(typeof b === 'object' ? b.name : b) || '';
            return aVal.localeCompare(bVal);
        });

        // Guarda seleções antes de recarregar
        const prefix = getTabPrefix(currentTab);
        const currentCatSelect = document.getElementById(`${prefix}Categoria`);
        const selectedCategoryBefore = currentCatSelect ? currentCatSelect.value : null;
        let currentSubSelect = null;
        if (prefix === 'mant') {
            currentSubSelect = document.getElementById(`${prefix}Item`);
        } else {
            currentSubSelect = document.getElementById(`${prefix}Sub`);
        }
        const selectedSubBefore = currentSubSelect ? currentSubSelect.value : null;

        saveAll(); populateSelects();

        // Atualiza os cards se estiver em uma aba de cards
        if (currentTab !== 'dashboard' && currentTab !== 'backup' && currentTab !== 'configuracoes') {
            renderCards();
        } else if (currentTab === 'dashboard') {
            renderDashboard();
        }

        // Restaura seleções após recarregar
        if (selectedCategoryBefore) {
            const restoredCat = document.getElementById(`${prefix}Categoria`);
            if (restoredCat) {
                restoredCat.value = selectedCategoryBefore;
                onCategoryChange(prefix);
                if (selectedSubBefore) {
                    const restoredSub = prefix === 'mant'
                        ? document.getElementById(`${prefix}Item`)
                        : document.getElementById(`${prefix}Sub`);
                    if (restoredSub) restoredSub.value = selectedSubBefore;
                }
            }
        }

        // Reabre o mesmo tipo de lista
        if (isSubcat) {
            openListManager('subcategorias');
        } else if (isStatus) {
            openListManager('status');
        } else if (isMarcadorList) {
            openListManager('marcadores');
        } else if (key === 'setores') {
            openListManager('setores');
        } else if (key === 'mantTipos') {
            openListManager('tipos');
        } else {
            openListManager('categorias');
        }
    }

    function removeFromList(key, val) {
        const isStatus = key.toLowerCase().includes('status');
        const isMarcadorList = key.toLowerCase().includes('marcadores');
        const isObjectList = isStatus || isMarcadorList;
        const isSubcat = key.includes('_');
        const isSetor = key === 'setores';

        let typeLabel = 'item';
        if (isSetor) typeLabel = 'setor';
        else if (isStatus) typeLabel = 'status';
        else if (isMarcadorList) typeLabel = 'marcador';
        else if (isSubcat) typeLabel = 'subcategoria';
        else typeLabel = 'categoria';

        const typeIcon = isSetor ? 'fa-building'
            : isStatus ? 'fa-tag'
            : isMarcadorList ? 'fa-bookmark'
            : isSubcat ? 'fa-layer-group'
            : 'fa-folder';

        showConfirmDanger({
            title: `Excluir ${typeLabel}?`,
            message: `O ${typeLabel} <strong>"${val}"</strong> será removido da lista.<br>Esta ação pode ser revertida pelo administrador.`,
            confirmLabel: `Excluir ${typeLabel}`,
            icon: typeIcon,
            requireReason: false,
            onConfirm: () => _doRemoveFromList(key, val, isStatus, isMarcadorList, isObjectList, isSubcat, isSetor)
        });
    }

    function _doRemoveFromList(key, val, isStatus, isMarcadorList, isObjectList, isSubcat, isSetor) {
        // Guarda a categoria e a subcategoria/ item atualmente selecionados no modal da aba ativa
        const prefix = getTabPrefix(currentTab);
        const currentCatSelect = document.getElementById(`${prefix}Categoria`);
        const selectedCategoryBefore = currentCatSelect ? currentCatSelect.value : null;
        let currentSubSelect = null;
        if (prefix === 'mant') {
            currentSubSelect = document.getElementById(`${prefix}Item`);
        } else {
            currentSubSelect = document.getElementById(`${prefix}Sub`);
        }
        const selectedSubBefore = currentSubSelect ? currentSubSelect.value : null;

        let list;
        if (isSubcat) {
            const [baseKey, cat] = key.split('_');
            list = masterLists[baseKey][cat];
            if (isObjectList) {
                const itemToDelete = list.find(s => s.name === val);
                if (itemToDelete) {
                    itemToDelete.deleted = true;
                    itemToDelete.deletedAt = new Date().toISOString();
                    itemToDelete.deletedBy = currentuser.email || currentuser.name || 'unknown';
                }
            } else {
                const index = list.indexOf(val);
                if (index > -1) {
                    list[index] = { value: val, deleted: true, deletedAt: new Date().toISOString() };
                }
            }
            masterLists[baseKey][cat] = list;
        } else {
            list = masterLists[key];
            if (isObjectList) {
                const itemToDelete = list.find(s => s.name === val);
                if (itemToDelete) {
                    itemToDelete.deleted = true;
                    itemToDelete.deletedAt = new Date().toISOString();
                    itemToDelete.deletedBy = currentuser.email || currentuser.name || 'unknown';
                }
            } else {
                const index = list.indexOf(val);
                if (index > -1) {
                    list[index] = { value: val, deleted: true, deletedAt: new Date().toISOString() };
                }
            }
        }

        saveAll(); populateSelects();

        // Restaura categoria e subcategoria/item após recriar os selects
        if (selectedCategoryBefore) {
            const restoredCat = document.getElementById(`${prefix}Categoria`);
            if (restoredCat) {
                restoredCat.value = selectedCategoryBefore;
                onCategoryChange(prefix);
                if (selectedSubBefore) {
                    const restoredSub = prefix === 'mant'
                        ? document.getElementById(`${prefix}Item`)
                        : document.getElementById(`${prefix}Sub`);
                    if (restoredSub) restoredSub.value = selectedSubBefore;
                }
            }
        }

        // Reabre o mesmo tipo de lista que estava sendo editada
        if (isSubcat) {
            openListManager('subcategorias');
        } else if (isStatus) {
            openListManager('status');
        } else if (isMarcadorList) {
            openListManager('marcadores');
        } else if (isSetor) {
            openListManager('setores');
        } else if (key === 'mantTipos') {
            openListManager('tipos');
        } else {
            openListManager('categorias');
        }
    }
    function closeModal(id) {
        function _doCloseModal() {
            document.getElementById(id).style.display = 'none';
            if (id === 'viewModal') {
                closeHistoryDrawer();
                closeStatusPopover();
                if (typeof window._flushChecklistSave === 'function') window._flushChecklistSave();
            }
            // Cancelar/fechar a publicação descarta imagens enviadas mas não publicadas.
            // Se a publicação foi salva, o blob já está referenciado e é preservado.
            if (id === 'modalPublicacao' && typeof window._discardSessionImgBlobs === 'function') {
                window._discardSessionImgBlobs('pub');
            }
        }
        // Checklist com marcações pendentes: avisa antes de fechar o viewModal
        if (id === 'viewModal' && typeof window._checklistGuardedClose === 'function') {
            window._checklistGuardedClose(_doCloseModal);
            return;
        }
        _doCloseModal();
    }

    const FORM_DRAWER_IDS = ['modalAuditoria', 'modalAtividades', 'modalDocumentos', 'modalManutencao'];

    function openFormDrawer(id) {
        closeHistoryDrawer();
        FORM_DRAWER_IDS.forEach(did => {
            const el = document.getElementById(did);
            if (el) el.classList.remove('open');
        });
        const drawer = document.getElementById(id);
        const backdrop = document.getElementById('formDrawerBackdrop');
        const fab = document.getElementById('addBtn');
        if (drawer) drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
        if (fab) fab.classList.add('open');

        // Mostra botão Duplicar apenas ao editar (não ao criar novo)
        const _dupMap = {
            'modalAuditoria':   { btn: 'btnDuplicateAudit',    id: editingAuditId },
            'modalAtividades':  { btn: 'btnDuplicateAtiv',      id: editingAtivId  },
            'modalDocumentos':  { btn: 'btnDuplicateDoc',       id: editingDocId   },
        };
        const _dm = _dupMap[id];
        if (_dm) {
            const _dupBtn = document.getElementById(_dm.btn);
            if (_dupBtn) _dupBtn.style.display = _dm.id ? '' : 'none';
        }

        // Sincroniza os inputs de autocomplete com os valores atuais dos selects
        if (typeof window.acSyncAll === 'function') window.acSyncAll();

        // Começa a rastrear alterações não salvas deste drawer
        if (typeof window._armDrawerDirty === 'function') window._armDrawerDirty(id);
    }

    // Drawers que pedem confirmação antes de descartar o que foi digitado.
    const GUARDED_DRAWER_IDS = ['modalAtividades', 'modalRnc'];

    // Fechamento vindo da UI (X, Cancelar, backdrop, ESC): se o drawer aberto
    // estiver na lista guardada e tiver alterações, confirma antes de descartar.
    // Os fluxos de salvar continuam chamando closeFormDrawer() direto.
    window.closeFormDrawerGuarded = function() {
        const openId = [...FORM_DRAWER_IDS, 'modalRnc', 'modalOcorrencia']
            .find(did => { const el = document.getElementById(did); return el && el.classList.contains('open'); });

        // A RNC tem seu próprio fechamento (dropdowns, blobs) — delega pra ele.
        if (openId === 'modalRnc') {
            if (typeof window.rncCloseDrawerGuarded === 'function') window.rncCloseDrawerGuarded();
            else closeFormDrawer();
            return;
        }
        if (openId && GUARDED_DRAWER_IDS.includes(openId) && typeof window._confirmDiscardDrawer === 'function') {
            window._confirmDiscardDrawer(openId, closeFormDrawer);
            return;
        }
        closeFormDrawer();
    };

    function closeFormDrawer() {
        if (typeof window._resetDrawerDirty === 'function') window._resetDrawerDirty();
        // Cancelar/fechar um drawer descarta imagens enviadas mas não salvas.
        // Se o item foi salvo, o blob já está referenciado e é preservado.
        if (typeof window._discardSessionImgBlobs === 'function') {
            ['audit', 'ativ', 'doc', 'mant', 'oc', 'rnc'].forEach(ctx => window._discardSessionImgBlobs(ctx));
        }
        FORM_DRAWER_IDS.forEach(did => {
            const el = document.getElementById(did);
            if (el) el.classList.remove('open');
        });
        const _oc = document.getElementById('modalOcorrencia');
        if (_oc) _oc.classList.remove('open');
        const _rnc = document.getElementById('modalRnc');
        if (_rnc) _rnc.classList.remove('open');
        const backdrop = document.getElementById('formDrawerBackdrop');
        const fab = document.getElementById('addBtn');
        if (backdrop) backdrop.classList.remove('open');
        if (fab) fab.classList.remove('open');
    }
