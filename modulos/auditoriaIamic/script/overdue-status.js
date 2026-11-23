// === PROGRAMAÇÃO DE STATUS CONCLUÍDO v3 (dois dropdowns lado a lado) ===

var _SCHED_CFG = {
    audit: { statusKey: 'auditStatus' },
    doc:   { statusKey: 'docStatus'   }
};

// Tipo ativo por prefixo: null | 'overdue' | 'alert'
var _schedType = { audit: null, doc: null };

// Toggle habilitado por prefixo
var _schedEnabled = { audit: false, doc: false };

// Fecha todos os painéis abertos (inclusive de outros prefixos)
function _schedCloseAll(exceptPanel) {
    ['audit','doc'].forEach(p => {
        ['Type','Status'].forEach(k => {
            const panel = document.getElementById(`${p}Sched${k}Panel`);
            if (panel && panel !== exceptPanel && panel.style.display !== 'none') {
                panel.style.display = 'none';
                const btn = document.getElementById(`${p}Sched${k}Btn`);
                if (btn) btn.classList.remove('sched-open');
            }
        });
    });
}

// Clique fora fecha os painéis
document.addEventListener('click', function(e) {
    if (!e.target.closest('.sched-dropdown-wrap')) _schedCloseAll(null);
});

// ---------- API pública ----------

window.schedToggleEnabled = function(prefix) {
    _schedEnabled[prefix] = !_schedEnabled[prefix];
    _applyToggleUI(prefix);
    if (!_schedEnabled[prefix]) {
        // Desligar: zera tudo
        _schedType[prefix] = null;
        const ovEl = document.getElementById(`${prefix}OverdueStatus`);
        const alEl = document.getElementById(`${prefix}AlertStatus`);
        if (ovEl) ovEl.value = '';
        if (alEl) alEl.value = '';
        _updateTypeBtnUI(prefix);
        _updateStatusBtnUI(prefix);
        const statusBtn = document.getElementById(`${prefix}SchedStatusBtn`);
        if (statusBtn) statusBtn.disabled = true;
        _schedCloseAll(null);
    }
};

function _applyToggleUI(prefix) {
    const btn  = document.getElementById(`${prefix}SchedToggle`);
    const body = document.getElementById(`${prefix}SchedBoxBody`);
    const on   = _schedEnabled[prefix];
    if (btn)  btn.classList.toggle('sched-toggle-on', on);
    if (body) body.style.display = on ? '' : 'none';
}

window.schedToggleDropdown = function(prefix, kind) {
    const capKind = kind === 'type' ? 'Type' : 'Status';
    const panelId = `${prefix}Sched${capKind}Panel`;
    const btnId   = `${prefix}Sched${capKind}Btn`;
    const panel   = document.getElementById(panelId);
    const btn     = document.getElementById(btnId);
    if (!panel || !btn) return;

    // Se status btn está disabled, ignora
    if (btn.disabled) return;

    const isOpen = panel.style.display !== 'none';
    _schedCloseAll(null);

    if (!isOpen) {
        panel.style.display = '';
        btn.classList.add('sched-open');
        if (kind === 'status') _renderStatusOptions(prefix);
        if (kind === 'status') {
            const search = document.getElementById(`${prefix}SchedSearch`);
            if (search) { search.value = ''; _renderStatusOptions(prefix); search.focus(); }
        }
    }
};

window.schedPickType = function(prefix, type) {
    _schedType[prefix] = type;

    // Limpa o hidden input do tipo que NÃO foi selecionado (só um ativo por vez)
    const otherHidden = type === 'overdue' ? `${prefix}AlertStatus` : `${prefix}OverdueStatus`;
    const otherEl = document.getElementById(otherHidden);
    if (otherEl) otherEl.value = '';

    // Fecha painel de tipo
    const panel = document.getElementById(`${prefix}SchedTypePanel`);
    const btn   = document.getElementById(`${prefix}SchedTypeBtn`);
    if (panel) panel.style.display = 'none';
    if (btn) btn.classList.remove('sched-open');

    _updateTypeBtnUI(prefix);

    // Habilita botão de status e reseta o texto para o novo tipo
    const statusBtn = document.getElementById(`${prefix}SchedStatusBtn`);
    if (statusBtn) statusBtn.disabled = false;

    // Limpa o botão de status ao trocar de tipo
    const currentHidden = type === 'overdue' ? `${prefix}OverdueStatus` : `${prefix}AlertStatus`;
    const currentEl = document.getElementById(currentHidden);
    if (currentEl) currentEl.value = '';
    _updateStatusBtnUI(prefix);
};

window.schedPickStatus = function(prefix, value) {
    const type = _schedType[prefix];
    if (!type) return;

    const hiddenId = type === 'overdue' ? `${prefix}OverdueStatus` : `${prefix}AlertStatus`;
    const el = document.getElementById(hiddenId);
    if (el) el.value = value;

    // Fecha painel
    const panel = document.getElementById(`${prefix}SchedStatusPanel`);
    const btn   = document.getElementById(`${prefix}SchedStatusBtn`);
    if (panel) panel.style.display = 'none';
    if (btn) btn.classList.remove('sched-open');

    _updateStatusBtnUI(prefix);
};

window.schedFilterStatus = function(prefix) {
    _renderStatusOptions(prefix);
};

// Restaura valores ao editar item existente
window.setSchedStatusValues = function(prefix, overdueVal, alertVal, resetCl) {
    const ovEl = document.getElementById(`${prefix}OverdueStatus`);
    const alEl = document.getElementById(`${prefix}AlertStatus`);
    if (ovEl) ovEl.value = overdueVal || '';
    if (alEl) alEl.value = alertVal   || '';

    // Determina qual tipo mostrar com base nos valores salvos (só um por vez)
    if (overdueVal && overdueVal !== '') {
        _schedType[prefix] = 'overdue';
        if (alEl) alEl.value = ''; // garante que o outro está limpo
    } else if (alertVal && alertVal !== '') {
        _schedType[prefix] = 'alert';
        if (ovEl) ovEl.value = ''; // garante que o outro está limpo
    } else {
        _schedType[prefix] = null;
    }

    const hasValue = !!_schedType[prefix];
    _schedEnabled[prefix] = hasValue;
    _applyToggleUI(prefix);
    _updateTypeBtnUI(prefix);
    const statusBtn = document.getElementById(`${prefix}SchedStatusBtn`);
    if (statusBtn) statusBtn.disabled = !hasValue;
    _updateStatusBtnUI(prefix);

    // Restaura toggle reset checklist (padrão marcado para novos registros)
    const resetEl = document.getElementById(`${prefix}ResetChecklistOnAuto`);
    if (resetEl) resetEl.checked = resetCl === undefined ? true : !!resetCl;
};

// Lê o valor do toggle de reset de checklist
window.getSchedResetChecklist = function(prefix) {
    const el = document.getElementById(`${prefix}ResetChecklistOnAuto`);
    return el ? el.checked : false;
};

// Compat: resetModal chama isso
window.setOverdueStatusValue = function(prefix, value) {
    setSchedStatusValues(prefix, value, '');
};

// Chamado após populateSelects
window.updateSchedStatusVisibility = function(prefix) {
    _updateTypeBtnUI(prefix);
    const statusBtn = document.getElementById(`${prefix}SchedStatusBtn`);
    if (statusBtn) statusBtn.disabled = !_schedType[prefix];
    _updateStatusBtnUI(prefix);
};

// ---------- UI interna ----------

function _updateTypeBtnUI(prefix) {
    const type = _schedType[prefix];
    const btn  = document.getElementById(`${prefix}SchedTypeBtn`);
    const text = document.getElementById(`${prefix}SchedTypeText`);
    const icon = document.getElementById(`${prefix}SchedTypeIcon`);
    const checkOv = document.getElementById(`${prefix}TypeCheckOverdue`);
    const checkAl = document.getElementById(`${prefix}TypeCheckAlert`);

    if (!btn) return;

    btn.classList.remove('sched-type-overdue', 'sched-type-alert', 'sched-has-value');

    if (type === 'overdue') {
        if (text) text.textContent = 'Ao Vencer';
        if (icon) icon.innerHTML = '<i class="fas fa-hourglass-end"></i>';
        btn.classList.add('sched-type-overdue', 'sched-has-value');
    } else if (type === 'alert') {
        if (text) text.textContent = 'Ao Alertar';
        if (icon) icon.innerHTML = '<i class="fas fa-bell"></i>';
        btn.classList.add('sched-type-alert', 'sched-has-value');
    } else {
        if (text) text.textContent = 'Selecionar tipo';
        if (icon) icon.innerHTML = '<i class="fas fa-calendar-alt"></i>';
    }

    if (checkOv) checkOv.style.display = type === 'overdue' ? '' : 'none';
    if (checkAl) checkAl.style.display = type === 'alert'   ? '' : 'none';
}

function _updateStatusBtnUI(prefix) {
    const type     = _schedType[prefix];
    const btn      = document.getElementById(`${prefix}SchedStatusBtn`);
    const text     = document.getElementById(`${prefix}SchedStatusText`);

    if (!btn) return;

    btn.classList.remove('sched-has-value');

    if (!type) {
        if (text) text.textContent = 'Selecionar status';
        return;
    }

    const hiddenId = type === 'overdue' ? `${prefix}OverdueStatus` : `${prefix}AlertStatus`;
    const value    = document.getElementById(hiddenId)?.value || '';

    if (value) {
        if (text) text.textContent = value;
        btn.classList.add('sched-has-value');
    } else {
        if (text) text.textContent = 'Selecionar status';
    }
}

function _renderStatusOptions(prefix) {
    const cfg        = _SCHED_CFG[prefix];
    if (!cfg) return;
    const type       = _schedType[prefix];
    const container  = document.getElementById(`${prefix}SchedStatusOptions`);
    if (!container) return;

    const statusList = (masterLists[cfg.statusKey] || []).filter(s => s && !s.deleted && s.name && (typeof _kbStatusIsFinal === 'function' ? !_kbStatusIsFinal(s.name, cfg) : (!/conclu/i.test(s.name) && !/cancel/i.test(s.name))));
    const hiddenId   = type === 'overdue' ? `${prefix}OverdueStatus` : `${prefix}AlertStatus`;
    const current    = document.getElementById(hiddenId)?.value || '';
    const isOverdue  = type === 'overdue';

    const search = document.getElementById(`${prefix}SchedSearch`);
    const q = search ? search.value.trim().toLowerCase() : '';

    const filtered = statusList.filter(s => !q || s.name.toLowerCase().includes(q));
    const selClass = isOverdue ? 'sched-opt-selected--overdue' : 'sched-opt-selected';

    let html = '';

    if (!q) {
        const noneSelected = current === '';
        html += `<div class="sched-status-opt-item sched-opt-none ${noneSelected ? selClass : ''}"
            onclick="schedPickStatus('${prefix}','')">
            <span class="sched-status-opt-dot"></span>
            <span>Não alterar</span>
            ${noneSelected ? '<i class="fas fa-check" style="margin-left:auto;color:#8b5cf6;font-size:10px;"></i>' : ''}
        </div>`;
    }

    filtered.forEach(s => {
        const esc     = s.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const isSelected = current === s.name;
        html += `<div class="sched-status-opt-item ${isSelected ? selClass : ''}"
            onclick="schedPickStatus('${prefix}','${esc}')">
            <span class="sched-status-opt-dot"></span>
            <span>${s.name}</span>
            ${isSelected ? '<i class="fas fa-check" style="margin-left:auto;color:#8b5cf6;font-size:10px;"></i>' : ''}
        </div>`;
    });

    if (!html) html = '<div style="padding:12px 14px;color:#94a3b8;font-size:12px;text-align:center;">Nenhum status encontrado</div>';
    container.innerHTML = html;
}

// === ALERTA: item tem programação com condição já atingida ===
// Retorna Promise<boolean> — true = usuário quer continuar, false = cancelou
window.checkSchedWarnBeforeConcluido = function(item, tab) {
    return new Promise(resolve => {
        if (!item) { resolve(true); return; }

        const hasOverdue = !!item.overdueStatus;
        const hasAlert   = !!item.alertStatus;
        if (!hasOverdue && !hasAlert) { resolve(true); return; }

        // Verifica se alguma condição já está atingida
        const now      = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const deadline = tab === 'documentos' ? item.dataProximaRevisao : item.dataPrevisao;

        let conditionMet = false;
        let conditionLabel = '';

        if (deadline) {
            const flagDays     = item.flagDias || 0;
            const deadlineDate = new Date(deadline + 'T00:00:00');
            const diffDays     = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

            if (hasOverdue && deadline <= todayStr) {
                conditionMet  = true;
                conditionLabel = `<strong>Ao Vencer</strong> → mover para <em>${item.overdueStatus}</em> (prazo já atingido)`;
            } else if (hasAlert && flagDays > 0 && diffDays <= flagDays && diffDays >= 0) {
                conditionMet  = true;
                conditionLabel = `<strong>Ao Alertar</strong> → mover para <em>${item.alertStatus}</em> (dentro do período de alerta)`;
            }
        }

        if (!conditionMet) { resolve(true); return; }

        // Mostra modal de aviso
        const existing = document.getElementById('schedWarnModal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'schedWarnModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';

        overlay.innerHTML = `
            <div style="background:#fff;border-radius:18px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.22);overflow:hidden;animation:schedWarnIn 0.2s ease;">
                <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:18px 20px 16px;display:flex;align-items:center;gap:12px;">
                    <div style="width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas fa-triangle-exclamation" style="color:#fff;font-size:17px;"></i>
                    </div>
                    <div>
                        <div style="font-size:14px;font-weight:700;color:#fff;letter-spacing:0.2px;">Programação Automática Ativa</div>
                        <div style="font-size:11.5px;color:rgba(255,255,255,0.85);margin-top:2px;">Condição de alteração automática já foi atingida</div>
                    </div>
                </div>
                <div style="padding:18px 20px;">
                    <p style="font-size:13px;color:#334155;line-height:1.6;margin:0 0 10px;">
                        Este card possui uma programação configurada:
                    </p>
                    <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:10px 14px;font-size:12.5px;color:#78350f;margin-bottom:14px;">
                        <i class="fas fa-bolt" style="color:#f59e0b;margin-right:6px;"></i>${conditionLabel}
                    </div>
                    <p style="font-size:12.5px;color:#64748b;line-height:1.55;margin:0 0 18px;">
                        Para concluir este item, <strong>altere ou remova a data de previsão</strong> para que a programação automática não entre em conflito com o status Concluído.
                    </p>
                    <div style="display:flex;justify-content:flex-end;">
                        <button id="schedWarnCancel" style="padding:9px 22px;border:none;border-radius:9px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(245,158,11,0.35);">
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
            <style>@keyframes schedWarnIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}</style>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#schedWarnCancel').onclick = () => { overlay.remove(); resolve(false); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
};

// === APLICAR PROGRAMAÇÃO DE STATUS ===
// Só age em itens com status Concluído

window.applyOverdueStatuses = function() {
    const now      = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let changed    = false;

    function checkArray(arr, getDeadline, getFlag) {
        arr.forEach(item => {
            if (!item || item.deleted) return;
            if (typeof _kbStatusIsConcluido === 'function' ? !_kbStatusIsConcluido(item.status) : !/conclu/i.test(item.status)) return;

            const hasOverdue = !!item.overdueStatus;
            const hasAlert   = !!item.alertStatus;
            if (!hasOverdue && !hasAlert) return;

            const deadline = getDeadline(item);
            if (!deadline) return;

            const flagDays     = getFlag ? (getFlag(item) || 0) : 0;
            const deadlineDate = new Date(deadline + 'T00:00:00');
            const diffDays     = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

            // Ao Alertar: dentro do período
            if (hasAlert && flagDays > 0 && diffDays <= flagDays && diffDays >= 0 && item.status !== item.alertStatus) {
                _applyChange(item, item.alertStatus, 'Status alterado automaticamente (período de alerta)');
                changed = true;
            }

            // Ao Vencer: deadline passou
            if (hasOverdue && deadline < todayStr && item.status !== item.overdueStatus) {
                _applyChange(item, item.overdueStatus, 'Status alterado automaticamente (vencimento)');
                changed = true;
            }
        });
    }

    function _applyChange(item, newStatus, acao) {
        const prev  = item.status;
        const _wasConcluido = typeof _kbStatusIsConcluido === 'function'
            ? _kbStatusIsConcluido(prev) : /conclu/i.test(prev || '');
        const _isConcluido = typeof _kbStatusIsConcluido === 'function'
            ? _kbStatusIsConcluido(newStatus) : /conclu/i.test(newStatus || '');
        item.status = newStatus;
        // Saindo de Concluído por programação automática: inicia um novo ciclo de
        // publicação para que a próxima publicação abra um novo grupo de conclusão
        // com o checklist zerado (quando a programação pedir reset).
        if (_wasConcluido && !_isConcluido && typeof window.startNewPubCycle === 'function') {
            window.startNewPubCycle(item, { resetChecklist: !!item.resetChecklistOnAutoStatus });
        } else if (item.resetChecklistOnAutoStatus && typeof resetChecklistItems === 'function') {
            resetChecklistItems(item);
        }
        (item.historico = item.historico || []).push({
            timestamp: new Date().toISOString(),
            acao,
            usuario: 'Sistema',
            detalhes: [{ campo: 'Status', de: prev, para: newStatus }]
        });
    }

    checkArray(audits,    i => i.dataPrevisao,       i => i.flagDias);
    checkArray(documents, i => i.dataProximaRevisao, i => i.flagDias);

    if (changed) saveAll();
};
