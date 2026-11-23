// === UTILITÁRIOS GERAIS ===

// ── Setor multi-valor (Atividades) ───────────────────────────────────────
// item.setor pode ser: string única (legado / demais módulos) ou um JSON
// stringificado de array (Atividades, multi-setor). Estas funções normalizam
// os dois formatos pra todo código compartilhado (permissão, filtro,
// agrupamento, ordenação, cards) continuar funcionando sem duplicar lógica.
// Achata recursivamente (cobre registros com JSON aninhado, ex.: '["[\"X\"]"]'),
// remove vazios/espaços e duplicados — sempre devolve nomes "limpos".
window.setorArr = function (raw) {
    const out = [];
    const push = (v) => {
        if (v === null || v === undefined) return;
        if (Array.isArray(v)) { v.forEach(push); return; }
        const s = String(v).trim();
        if (!s) return;
        if (s.startsWith('[')) {
            try {
                const p = JSON.parse(s);
                if (Array.isArray(p)) { p.forEach(push); return; }
            } catch (_) {}
        }
        if (!out.includes(s)) out.push(s);
    };
    push(raw);
    return out;
};
// Formato canônico de gravação: JSON stringificado do array (vazio → '').
window.setorSerialize = function (raw) {
    const arr = setorArr(raw);
    return arr.length ? JSON.stringify(arr) : '';
};
// Renomeia um setor dentro do valor bruto, preservando o formato canônico.
// Retorna o valor original quando o setor não está presente.
window.setorRename = function (raw, oldName, newName) {
    const arr = setorArr(raw);
    if (!arr.includes(oldName)) return raw;
    return setorSerialize(arr.map(s => (s === oldName ? newName : s)));
};
// Remove um setor do valor bruto, preservando o formato canônico.
window.setorRemove = function (raw, name) {
    const arr = setorArr(raw);
    if (!arr.includes(name)) return raw;
    return setorSerialize(arr.filter(s => s !== name));
};
// Match case-insensitive (usado pelos filtros de Ocorrências e RNC).
window.setorMatchesAnyCI = function (raw, list) {
    const wanted = (Array.isArray(list) ? list : [list]).map(s => String(s || '').trim().toLowerCase());
    return setorArr(raw).some(s => wanted.includes(s.toLowerCase()));
};
const _setorEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Balões (chips) com todos os setores — views/modais de detalhe.
window.setorChipsHtml = function (raw, emptyHtml) {
    const arr = setorArr(raw);
    if (!arr.length) return emptyHtml !== undefined ? emptyHtml : '<span class="view-info-nd">ND</span>';
    return `<span class="view-info-chips">${arr.map(s => `<span class="view-info-chip"><i class="fas fa-building"></i>${_setorEsc(s)}</span>`).join('')}</span>`;
};
// Primeiro setor + balão "+N" (padrão card-resp-extra) — cards e tabelas.
window.setorCompactHtml = function (raw, emptyText) {
    const arr = setorArr(raw);
    if (!arr.length) return _setorEsc(emptyText !== undefined ? emptyText : 'ND');
    const badge = arr.length > 1 ? `<span class="card-resp-extra" title="${_setorEsc(arr.slice(1).join(', '))}">+${arr.length - 1}</span>` : '';
    return `<span class="card-resp-wrap" title="${_setorEsc(arr.join(', '))}"><span class="card-resp-name">${_setorEsc(arr[0])}</span>${badge}</span>`;
};
// Texto pra exibição simples (ex.: título de view, filtros de agrupamento) —
// junta todos os setores com vírgula.
window.setorText = function (raw) {
    return setorArr(raw).join(', ');
};
// Retorna { first, extra } pra exibição em cards: primeiro setor + contagem
// dos demais, no mesmo padrão usado para Responsáveis (card-resp-extra).
window.setorDisplay = function (raw) {
    const arr = setorArr(raw);
    if (!arr.length) return { first: '', extra: 0 };
    return { first: arr[0], extra: arr.length - 1 };
};
// Linha de card (ícone + setor compacto) — mesmo markup em todos os módulos.
window.setorCardRow = function (raw, rowClass) {
    return `<div class="${rowClass || 'card-info-row'}"><i class="fas fa-building"></i>${setorCompactHtml(raw)}</div>`;
};
// Usado nos filtros de permissão (allowedSetores) e no filtro de setor da UI:
// true se QUALQUER setor do item bater com a lista/valor informado.
window.setorMatchesAny = function (raw, allowedOrValue) {
    const itemSetores = setorArr(raw);
    if (Array.isArray(allowedOrValue)) {
        return itemSetores.some(s => allowedOrValue.includes(s));
    }
    return itemSetores.includes(allowedOrValue);
};

// ── Overlay global de carregamento ───────────────────────────────────────
// Usado por qualquer fluxo que precisa bloquear a tela inteira enquanto uma
// gravação no Firebase está em andamento (ex.: aplicar checklist), pra o
// usuário nunca ficar com a sensação de sistema travado sem feedback.
window.showGlobalLoading = function(message) {
    let overlay = document.getElementById('globalLoadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'globalLoadingOverlay';
        overlay.className = 'global-loading-overlay';
        overlay.innerHTML = '<div class="global-loading-spinner"></div><div class="global-loading-text"></div>';
        document.body.appendChild(overlay);
    }
    overlay.querySelector('.global-loading-text').textContent = message || 'Salvando alterações...';
    overlay.style.display = 'flex';
};
window.hideGlobalLoading = function() {
    const overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
};

// Executa saveAll() com o overlay global de carregamento por cima, escondendo-o
// quando a gravação no Firebase termina. Usado em ações onde a UI já mostra o
// resultado antes da confirmação do banco (ex.: mover card de status no kanban),
// pra o usuário não achar que já acabou enquanto o save ainda está no ar.
// Teto de 15s: rede lenta/offline nunca deixa o overlay preso na tela.
window._saveAllWithLoading = function(message) {
    if (typeof saveAll !== 'function') return Promise.resolve();
    if (typeof window.showGlobalLoading === 'function') window.showGlobalLoading(message || 'Salvando alterações...');

    var finished = false;
    var maxWait = setTimeout(done, 15000);
    function done() {
        if (finished) return;
        finished = true;
        clearTimeout(maxWait);
        if (typeof window.hideGlobalLoading === 'function') window.hideGlobalLoading();
    }

    var p;
    try { p = saveAll(); } catch (e) { done(); throw e; }
    if (p && typeof p.then === 'function') { p.then(done, done); return p; }
    done();
    return Promise.resolve();
};

// ── Lixeira: expiração automática (30 dias) ──────────────────────────────
// Cards na lixeira (deleted=true) são temporários e apagados permanentemente
// 30 dias após deletedAt. Helpers abaixo calculam prazo/data e fazem o purge.
window.TRASH_RETENTION_DAYS = 30;

// Retorna { expiresAt: Date, daysLeft: int, expired: bool } a partir de deletedAt.
// daysLeft nunca fica negativo (mín. 0). Se deletedAt inválido, retorna null.
window.trashExpiry = function(deletedAt) {
    if (!deletedAt) return null;
    const del = new Date(deletedAt);
    if (isNaN(del)) return null;
    const expiresAt = new Date(del.getTime() + window.TRASH_RETENTION_DAYS * 86400000);
    const msLeft = expiresAt.getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
    return { expiresAt: expiresAt, daysLeft: daysLeft, expired: msLeft <= 0 };
};

// Texto pronto p/ UI: "Exclusão em dd/mm/aaaa · faltam N dias".
window.trashExpiryLabel = function(deletedAt) {
    const e = window.trashExpiry(deletedAt);
    if (!e) return '';
    const dateStr = e.expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (e.expired) return 'Exclusão em ' + dateStr + ' · exclusão pendente';
    const faltam = e.daysLeft === 1 ? 'falta 1 dia' : 'faltam ' + e.daysLeft + ' dias';
    return 'Exclusão em ' + dateStr + ' · ' + faltam;
};

// Remove in-place de `arr` os itens deletados há mais de 30 dias.
// Retorna array com os itens removidos (vazio se nada). Limpa blobs de imagem
// (base64 em /imgBlobs) de cada item removido para não deixar órfãos no banco.
// Notificações são derivadas em runtime e somem junto; kanbanOrder guarda ordem
// de colunas (por nome de status), não referencia cards — nada a limpar lá.
window.purgeExpiredTrash = function(arr) {
    if (!Array.isArray(arr)) return [];
    const removed = [];
    for (let i = arr.length - 1; i >= 0; i--) {
        const item = arr[i];
        if (item && item.deleted && item.deletedAt) {
            const e = window.trashExpiry(item.deletedAt);
            if (e && e.expired) {
                if (typeof window._deleteItemImgBlobs === 'function') {
                    try { window._deleteItemImgBlobs(item); } catch (_) {}
                }
                arr.splice(i, 1);
                removed.push(item);
            }
        }
    }
    return removed;
};

// Validação de campos obrigatórios num drawer de registro
// fields: [{ id, label, type }]  type: 'input'|'select'|'ms' (multi-select)
// Retorna true se tudo ok, false se há erro (mostra toast e marca campo)
window._validateRequiredFields = function(fields) {
    let firstError = null;
    fields.forEach(function(f) {
        const el = document.getElementById(f.id);
        const fg = el && el.closest('.field-group');
        if (fg) fg.classList.remove('field-error');
    });
    for (const f of fields) {
        const el = document.getElementById(f.id);
        const empty = !el || !el.value || !el.value.trim();
        if (empty) {
            const fg = el && el.closest('.field-group');
            if (fg) fg.classList.add('field-error');
            if (!firstError) {
                firstError = f;
                if (el) el.focus();
            }
        }
    }
    if (firstError) {
        showToast('O campo "' + firstError.label + '" é obrigatório.', 'error');
        return false;
    }
    return true;
};

// ── Guarda de alterações não salvas em drawers de registro ───────────────
// Marca um drawer como "sujo" assim que o usuário digita/altera qualquer campo
// dentro dele, para que fechar (X, Cancelar, backdrop, ESC) peça confirmação
// antes de descartar. Preenchimentos programáticos da abertura (editar card,
// msSetValue, acSyncAll, renderMarkerChips) NÃO contam: o rastreio só é armado
// _DRAWER_DIRTY_ARM_MS depois de abrir.
const _DRAWER_DIRTY_ARM_MS = 450;
window._drawerDirty = Object.create(null);
window._drawerDirtyArmedAt = Infinity;

// Chamado ao abrir um drawer: zera o estado e agenda o início do rastreio.
// Só um drawer fica aberto por vez, então zera o mapa inteiro: evita herdar o
// "sujo" de um drawer que foi trocado por outro sem passar por closeFormDrawer().
window._armDrawerDirty = function(drawerId) {
    window._resetDrawerDirty();
    window._drawerDirtyArmedAt = Date.now() + _DRAWER_DIRTY_ARM_MS;
};

// Chamado ao fechar/salvar: o drawer deixa de ter alterações pendentes.
window._resetDrawerDirty = function(drawerId) {
    if (drawerId) delete window._drawerDirty[drawerId];
    else window._drawerDirty = Object.create(null);
};

window._isDrawerDirty = function(drawerId) { return !!window._drawerDirty[drawerId]; };

window._markDrawerDirty = function(el) {
    if (Date.now() < window._drawerDirtyArmedAt) return;
    const drawer = el && el.closest && el.closest('.form-drawer.open');
    if (drawer && drawer.id) window._drawerDirty[drawer.id] = true;
};

// Digitação em input/textarea/select dentro de um drawer aberto.
['input', 'change'].forEach(function(evt) {
    document.addEventListener(evt, function(e) { window._markDrawerDirty(e.target); }, true);
});

// Interações que alteram dados sem disparar input/change (chips, multi-select,
// checklist e anexos). Lista explícita para não marcar sujo em cliques neutros
// como trocar de aba do drawer ou apenas abrir um dropdown.
const _DRAWER_DIRTY_CLICK_SEL = [
    '.ms-option',            // escolher responsável/revisor no multi-select
    '.ms-tags button',       // remover um responsável/revisor já escolhido
    '.sms-option',           // escolher setor no multi-select de Atividades
    '.sms-tags button',      // remover um setor já escolhido
    '.rnc-class-chip',       // classificação da RNC (crítica/maior/menor)
    '.rnc-ac-option',        // marcador e autocompletes da RNC
    '.checklist-add-btn',    // adicionar item de checklist
    '.checklist-editor button',
    '[data-dirty-on-click]'
].join(',');
document.addEventListener('click', function(e) {
    const hit = e.target && e.target.closest && e.target.closest(_DRAWER_DIRTY_CLICK_SEL);
    if (hit) window._markDrawerDirty(hit);
}, true);

// Diálogo padrão de descarte. onDiscard só roda se o usuário confirmar.
// Se o drawer não estiver sujo, fecha direto (sem perguntar nada).
window._confirmDiscardDrawer = function(drawerId, onDiscard) {
    if (!window._isDrawerDirty(drawerId)) { onDiscard(); return; }
    window._showConfirmDialog({
        title: 'Descartar alterações?',
        message: 'Você começou a preencher este registro. Se sair agora, <strong>tudo o que foi digitado será perdido</strong>.',
        confirmLabel: 'Descartar',
        confirmClass: 'confirm-dlg-btn--danger',
        cancelLabel: 'Continuar editando',
        icon: 'fa-triangle-exclamation',
        iconClass: 'confirm-dlg-icon--warn',
        onConfirm: function() { window._resetDrawerDirty(drawerId); onDiscard(); }
    });
};

// Toast notifications
window.showToast = function(msg, type = 'info', duration = 3500) {
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast-msg toast-${type}`;
    el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-hide');
        setTimeout(() => el.remove(), 250);
    }, duration);
};

// Diálogo de confirmação elegante (substitui window.confirm)
// _showConfirmDialog({ title, message, confirmLabel, confirmClass, cancelLabel, onConfirm })
window._showConfirmDialog = function({ title = 'Confirmar', message = '', confirmLabel = 'Confirmar', confirmClass = '', cancelLabel = 'Cancelar', iconClass = 'confirm-dlg-icon--warn', icon = 'fa-exclamation-triangle', onConfirm } = {}) {
    const existing = document.getElementById('_confirmDlgOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = '_confirmDlgOverlay';
    overlay.className = 'confirm-dlg-overlay';
    overlay.innerHTML = `
        <div class="confirm-dlg-box">
            <div class="confirm-dlg-icon ${iconClass}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="confirm-dlg-title">${title}</div>
            <div class="confirm-dlg-message">${message}</div>
            <div class="confirm-dlg-actions">
                <button class="confirm-dlg-btn confirm-dlg-btn--cancel" id="_confirmDlgCancel">${cancelLabel}</button>
                <button class="confirm-dlg-btn ${confirmClass || 'confirm-dlg-btn--primary'}" id="_confirmDlgOk">${confirmLabel}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => { overlay.classList.add('confirm-dlg-out'); setTimeout(() => overlay.remove(), 220); };
    overlay.querySelector('#_confirmDlgCancel').addEventListener('click', close);
    overlay.querySelector('#_confirmDlgOk').addEventListener('click', () => { close(); if (typeof onConfirm === 'function') onConfirm(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    requestAnimationFrame(() => overlay.classList.add('confirm-dlg-open'));
};

// Modal de confirmação de deleção PERMANENTE — exige digitar "SIM"
// showPermanentDeleteConfirm({ title, message, onConfirm })
window.showPermanentDeleteConfirm = function({ title, message, onConfirm } = {}) {
    const existing = document.getElementById('permDeleteModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'permDeleteModal';
    overlay.className = 'confirm-danger-overlay';

    overlay.innerHTML = `
        <div class="confirm-danger-box perm-delete-box">
            <div class="perm-delete-header-bar"></div>
            <div class="perm-delete-icon-wrap">
                <i class="fas fa-skull"></i>
            </div>
            <div class="confirm-danger-title">${title || '⚠️ Deleção Permanente'}</div>
            <div class="confirm-danger-message perm-delete-msg">${message || 'Esta ação é <strong>irreversível</strong>. O item será removido para sempre.'}</div>
            <div class="perm-delete-input-wrap">
                <label class="perm-delete-label" style="margin-bottom:6px;">Motivo da exclusão <span style="color:#9ca3af;font-weight:400;">(opcional)</span></label>
                <textarea id="permDeleteReason" class="perm-delete-input" rows="2" placeholder="Descreva o motivo..." style="resize:vertical;min-height:52px;font-family:inherit;"></textarea>
            </div>
            <div class="perm-delete-input-wrap" style="margin-top:10px;">
                <label class="perm-delete-label">Digite <span class="perm-delete-keyword">SIM</span> para confirmar:</label>
                <input id="permDeleteInput" class="perm-delete-input" type="text" placeholder="SIM" autocomplete="off" spellcheck="false" />
                <div class="perm-delete-input-hint" id="permDeleteHint"></div>
            </div>
            <div class="confirm-danger-actions">
                <button class="confirm-danger-cancel" id="permDeleteCancel">Cancelar</button>
                <button class="confirm-danger-confirm perm-delete-confirm-btn" id="permDeleteOk" disabled>
                    <i class="fas fa-trash-alt"></i> Deletar Permanentemente
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#permDeleteInput');
    const btn = overlay.querySelector('#permDeleteOk');
    const hint = overlay.querySelector('#permDeleteHint');

    function _checkPermForm() {
        const sim = input.value.trim() === 'SIM';
        btn.disabled = !sim;
        btn.style.opacity = sim ? '1' : '0.45';
        if (input.value.trim().length > 0 && !sim) {
            input.classList.add('perm-delete-input--error');
            input.classList.remove('perm-delete-input--ok');
            hint.textContent = 'Digite exatamente: SIM';
        } else if (sim) {
            input.classList.remove('perm-delete-input--error');
            input.classList.add('perm-delete-input--ok');
            hint.textContent = '';
        } else {
            input.classList.remove('perm-delete-input--error', 'perm-delete-input--ok');
            hint.textContent = '';
        }
    }

    input.addEventListener('input', _checkPermForm);

    overlay.querySelector('#permDeleteCancel').onclick = () => overlay.remove();
    btn.onclick = () => {
        if (input.value.trim() !== 'SIM') return;
        const reason = (overlay.querySelector('#permDeleteReason')?.value || '').trim();
        overlay.remove();
        if (typeof onConfirm === 'function') onConfirm(reason);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    setTimeout(() => input.focus(), 80);
};

// Modal de confirmação de exclusão (vermelho, moderno) com campo de motivo obrigatório
// showConfirmDanger({ title, message, confirmLabel, icon, onConfirm, requireReason })
// onConfirm recebe (reason: string). requireReason=false omite o campo de motivo.
// icon: classe FontAwesome (ex: 'fa-folder', 'fa-building'). Padrão: 'fa-trash-alt'.
window.showConfirmDanger = function({ title, message, confirmLabel, icon, onConfirm, requireReason = true } = {}) {
    const existing = document.getElementById('confirmDangerModal');
    if (existing) existing.remove();

    const iconClass = icon || 'fa-trash-alt';

    const overlay = document.createElement('div');
    overlay.id = 'confirmDangerModal';
    overlay.className = 'confirm-danger-overlay';

    overlay.innerHTML = `
        <div class="confirm-danger-box">
            <div class="confirm-danger-header-art">
                <div class="cdh-circle-lg"></div>
                <div class="cdh-circle-sm"></div>
                <div class="confirm-danger-icon-wrap">
                    <i class="fas ${iconClass}"></i>
                </div>
            </div>
            <div class="confirm-danger-body">
                <div class="confirm-danger-title">${title || 'Confirmar exclusão'}</div>
                <div class="confirm-danger-message">${message || 'Esta ação não pode ser desfeita.'}</div>
                ${requireReason ? `
                <div class="perm-delete-input-wrap" style="margin-top:4px;width:100%;">
                    <label class="perm-delete-label">Motivo da exclusão <span style="color:#dc2626;">*</span></label>
                    <textarea id="confirmDangerReason" class="perm-delete-input" rows="2" placeholder="Descreva o motivo..." style="font-family:inherit;font-size:13px;letter-spacing:normal;resize:vertical;min-height:60px;font-weight:400;"></textarea>
                    <div class="perm-delete-input-hint" id="confirmDangerHint"></div>
                </div>` : ''}
                <div class="confirm-danger-actions">
                    <button class="confirm-danger-cancel" id="confirmDangerCancel">Cancelar</button>
                    <button class="confirm-danger-confirm" id="confirmDangerOk" ${requireReason ? 'disabled style="opacity:0.45;"' : ''}>
                        <i class="fas ${iconClass}"></i> ${confirmLabel || 'Excluir'}
                    </button>
                </div>
            </div>
        </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#confirmDangerCancel').onclick = () => overlay.remove();

    const btn = overlay.querySelector('#confirmDangerOk');

    if (requireReason) {
        const textarea = overlay.querySelector('#confirmDangerReason');
        const hint = overlay.querySelector('#confirmDangerHint');

        textarea.addEventListener('input', () => {
            const val = textarea.value.trim();
            if (val.length >= 3) {
                btn.disabled = false;
                btn.style.opacity = '1';
                hint.textContent = '';
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.45';
                hint.textContent = val.length > 0 ? 'Motivo muito curto (mínimo 3 caracteres)' : '';
            }
        });

        btn.onclick = () => {
            const reason = textarea.value.trim();
            if (reason.length < 3) return;
            overlay.remove();
            if (typeof onConfirm === 'function') onConfirm(reason);
        };

        document.body.appendChild(overlay);
        setTimeout(() => textarea?.focus(), 50);
    } else {
        btn.onclick = () => {
            overlay.remove();
            if (typeof onConfirm === 'function') onConfirm('');
        };
        document.body.appendChild(overlay);
    }
};

// Modal de aviso: não é possível concluir item atrasado (documentos)
window.showOverdueConcluiModal = function() {
    const existing = document.getElementById('overdueConcluiModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'overdueConcluiModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease;';

    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:0;width:420px;max-width:92vw;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.18),0 4px 16px rgba(0,0,0,0.1);animation:slideUp .18s ease;">
            <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:22px 24px 18px;display:flex;align-items:center;gap:14px;">
                <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas fa-hourglass-end" style="color:#fff;font-size:20px;"></i>
                </div>
                <div>
                    <div style="color:#fff;font-size:16px;font-weight:700;line-height:1.2;">Item em Atraso</div>
                    <div style="color:rgba(255,255,255,0.82);font-size:12px;margin-top:2px;">Ação não permitida</div>
                </div>
            </div>
            <div style="padding:22px 24px;">
                <p style="margin:0 0 8px;color:#1e293b;font-size:14px;font-weight:600;line-height:1.5;">
                    Não é possível marcar como <strong>Concluído</strong> um item com prazo vencido.
                </p>
                <p style="margin:0 0 20px;color:#64748b;font-size:13px;line-height:1.6;">
                    Para concluir este item, atualize a data de previsão para uma data futura ou atual antes de alterar o status.
                </p>
                <div style="display:flex;justify-content:flex-end;">
                    <button id="overdueConcluiOkBtn" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;padding:10px 28px;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .15s;box-shadow:0 2px 8px rgba(245,158,11,0.35);">
                        Entendi
                    </button>
                </div>
            </div>
        </div>`;

    overlay.querySelector('#overdueConcluiOkBtn').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
};

// Remove 'historico' do snapshot para evitar aninhamento exponencial no Firebase
window._safeSnapshot = function(item) {
    const copy = JSON.parse(JSON.stringify(item));
    delete copy.historico;
    return copy;
};

    // --- UTILITÁRIOS ---
    var today = () => new Date().toISOString().split('T')[0];
    var currentYear = new Date().getFullYear();
    var currentMonth = new Date().getMonth();
    var formatBR = dateStr => {
        if (!dateStr) return 'ND';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };
    var truncateText = (text, max = 55) => {
        const s = String(text || '');
        if (s.length <= max) return s;
        if (max <= 3) return '.'.repeat(max);
        return s.slice(0, max - 3).trimEnd() + '...';
    };
    var daysDiff = dateStr => {
        if (!dateStr) return Infinity;
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return Infinity;
        return Math.ceil((d - new Date()) / (1000*60*60*24));
    };

    // Retorna true se o item está atrasado (data de previsão/revisão no passado)
    window.isItemOverdue = function(item, tab) {
        let dateStr = null;
        if (tab === 'documentos' || tab === 'doc') dateStr = item.dataProximaRevisao;
        if (!dateStr) return false;
        return daysDiff(dateStr) < 0;
    };

    // Gera um id numérico único para itens das coleções. Multiplicar o timestamp
    // por 1000 e somar um sufixo aleatório evita colisões quando dois itens são
    // criados no mesmo milissegundo (inclusive entre sessões/dispositivos). IDs
    // colididos seriam fundidos no merge 3-vias (Map por id) → perda de dados.
    function generateId() {
        return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    }
    if (typeof window !== 'undefined') window.generateId = generateId;

    // Função para limpar responsáveis que não são usuários cadastrados
    function cleanInvalidResponsaveis() {
        // Preserva JSON arrays de multi-select; sanitiza undefined/null para string vazia
        const sanitizeField = (val) => {
            if (val === null || val === undefined) return '';
            const s = String(val);
            if (!s.trim()) return '';
            try {
                const parsed = JSON.parse(s);
                if (Array.isArray(parsed)) {
                    const cleaned = parsed.filter(r => r !== null && r !== undefined && String(r).trim());
                    return cleaned.length ? JSON.stringify(cleaned) : '';
                }
            } catch (_) {}
            return s;
        };

        [audits, activities, documents].forEach(arr => {
            arr.forEach(item => {
                item.responsavel = sanitizeField(item.responsavel);
                item.revisor     = sanitizeField(item.revisor);
            });
        });

        maintenances.forEach(item => {
            if (item.responsavelTecnico !== undefined) {
                item.responsavelTecnico = sanitizeField(item.responsavelTecnico);
            }
        });
    }

    function cleanMalformedItems() {
        // Remove itens [object Object] e objetos malformados de todas as listas do masterLists
        const cleanList = (list) => {
            if (!Array.isArray(list)) return list;

            return list.filter(item => {
                // Rejeita itens que são [object Object] (strings que resultariam nisso)
                if (item === '[object Object]') return false;

                // Rejeita objetos sem propriedades de valor úteis
                if (typeof item === 'object' && item !== null) {
                    // Se é um objeto de status/marcador, verifica se tem 'name'
                    if (item.name !== undefined) return true;
                    // Se é um objeto de soft delete, verifica se tem 'value' e ainda não foi marcado deleted permanentemente
                    if (item.value !== undefined && !item.deleted) return true;
                    // Se tem propriedades úteis (não é totalmente vazio), mantém
                    if (Object.keys(item).length > 0 && !item.deleted) return true;
                    // Se é vazio ou só tem 'deleted', rejeita
                    return false;
                }

                // Strings vazias são rejeitadas
                if (typeof item === 'string' && item.trim() === '') return false;

                // Mantém itens válidos (strings com conteúdo)
                return true;
            });
        };

        // Limpa todas as listas no masterLists
        Object.keys(masterLists).forEach(key => {
            const list = masterLists[key];

            if (Array.isArray(list)) {
                // Listas simples
                masterLists[key] = cleanList(list);
            } else if (typeof list === 'object' && list !== null) {
                // Listas aninhadas (como mantItens, auditSubcats, etc)
                Object.keys(list).forEach(subKey => {
                    if (Array.isArray(list[subKey])) {
                        list[subKey] = cleanList(list[subKey]);
                    }
                });
            }
        });
    }
    var isBlankPeriodicity = val => {
        if (val === null || val === undefined) return true;
        const s = String(val).trim();
        if (s === '') return true;
        const n = Number(s);
        return !Number.isFinite(n) || n <= 0;
    };

    // Cards (Manutenção/Documentos):
    // - "Data" = publicação/criação (sempre)
    // - "Próx" = próxima (ou N/A quando periodicidade estiver vazia)
    var getMaintenanceCardDate = item => item?.ultima; // publicação (última manutenção)
    var getMaintenanceDeadlineDate = item => (isBlankPeriodicity(item?.intervalo) ? null : item?.proxima);
    var getDocumentCardDate = item => item?.dataCriacao; // publicação (criação)
    var getDocumentDeadlineDate = item => item?.dataProximaRevisao || null;

    // Normalização de texto (corrige mismatch no mobile por Unicode/acentos)
    // Resolve um campo responsavel/revisor (JSON array de IDs) para array de nomes lowercase
    window._parseUserField = function(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) {
            return raw.map(v => {
                const name = typeof resolveUserId === 'function' ? resolveUserId(String(v)) : null;
                return (name || String(v)).trim().toLowerCase();
            }).filter(Boolean);
        }
        try {
            const p = JSON.parse(String(raw));
            const arr = Array.isArray(p) ? p : (p ? [String(p)] : []);
            return arr.map(v => {
                const name = typeof resolveUserId === 'function' ? resolveUserId(String(v)) : null;
                return (name || String(v)).trim().toLowerCase();
            }).filter(Boolean);
        } catch {
            const name = typeof resolveUserId === 'function' ? resolveUserId(String(raw)) : null;
            return [(name || String(raw)).trim().toLowerCase()].filter(Boolean);
        }
    };

    // Função auxiliar para normalizar responsável — resolve IDs para nomes, retorna string lowercase
    function normalizeResponsavel(responsavel) {
        return typeof _parseUserField === 'function'
            ? _parseUserField(responsavel).join(' ')
            : (responsavel ? String(responsavel).trim().toLowerCase() : '');
    }

    function normalizeText(input) {
        let s = (input ?? '').toString();
        // remove zero-width chars comuns em teclado mobile
        s = s.replace(/[​-‍﻿]/g, '');
        s = s.trim().toLowerCase();
        // normaliza acentos para comparação mais robusta
        try {
            s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
        } catch (_) {
            // ignore - navegadores antigos
        }
        // colapsa espaços
        s = s.replace(/\s+/g, ' ');
        return s;
    }

    // Busca por título (lupa)
    var titleSearchCardsEnabled = false;
    var titleSearchCardsQuery = '';
    var titleSearchDashEnabled = false;
    var titleSearchDashQuery = '';

    function setTitleSearchEnabled(context, enabled) {
        if (context === 'dash') {
            titleSearchDashEnabled = enabled;
            if (!enabled) {
                titleSearchDashQuery = '';
                const inEl = document.getElementById('dashTitleSearchInput');
                if (inEl) inEl.value = '';
                const dd = document.getElementById('dashTitleSearchDropdown');
                if (dd) dd.style.display = 'none';
            }
            renderDashboard();
        } else {
            titleSearchCardsEnabled = enabled;
            if (!enabled) {
                titleSearchCardsQuery = '';
                const inEl = document.getElementById('titleSearchInput');
                if (inEl) inEl.value = '';
                const dd = document.getElementById('titleSearchDropdown');
                if (dd) dd.style.display = 'none';
            }
            renderCards();
        }
    }

    function toggleTitleSearch(context) {
        const dropdownId = context === 'dash' ? 'dashTitleSearchDropdown' : 'titleSearchDropdown';
        const inputId = context === 'dash' ? 'dashTitleSearchInput' : 'titleSearchInput';
        const dd = document.getElementById(dropdownId);
        if (!dd) return;
        const isOpen = dd.style.display !== 'none';
        if (isOpen) {
            dd.style.display = 'none';
            setTitleSearchEnabled(context, false);
        } else {
            dd.style.display = 'block';
            setTitleSearchEnabled(context, true);
            const inEl = document.getElementById(inputId);
            if (inEl) inEl.focus();
        }
    }

    function onTitleSearchInput(context) {
        const inputId = context === 'dash' ? 'dashTitleSearchInput' : 'titleSearchInput';
        const inEl = document.getElementById(inputId);
        const q = normalizeText(inEl?.value || '');
        if (context === 'dash') {
            titleSearchDashQuery = q;
            if (titleSearchDashEnabled) renderDashboard();
        } else {
            titleSearchCardsQuery = q;
            const searchOpen = document.getElementById('fbarSearchWrap')?.classList.contains('open');
            if (searchOpen) titleSearchCardsEnabled = true;
            if (titleSearchCardsEnabled) renderCards();
        }
    }

    // NOVO: Dicionário para mapear chaves de objeto para nomes de exibição
    var fieldnames = {
        // Auditoria
        auditTitulo: 'Título', auditDescricao: 'Descrição', auditSetor: 'Setor', auditCategoria: 'Categoria',
        auditSub: 'Subcategoria', auditStatus: 'Status', auditDataPublicacao: 'Data Publicação',
        auditDataPrevisao: 'Data Previsão', auditResponsavel: 'Responsável', auditAuditor: 'Auditor', auditFlagDias: 'Alerta (Dias)',
        auditMarcador: 'Marcador',

        // Atividades
        ativTitulo: 'Título', ativDescricao: 'Descrição', ativSetor: 'Setor', ativCategoria: 'Categoria',
        ativSub: 'Subcategoria', ativStatus: 'Status', ativDataInicio: 'Data Início',
        ativDataConclusao: 'Data Conclusão', ativResponsavel: 'Responsável', ativFlagDias: 'Alerta (Dias)',
        ativMarcador: 'Marcador',

        // Manutenção
        mantTitulo: 'Título', mantDescricao: 'Descrição', mantSetor: 'Setor', mantCategoria: 'Categoria',
        mantItem: 'Item/Equipamento', mantTipo: 'Tipo', mantUltima: 'Última Manutenção', mantIntervalo: 'Periodicidade (Dias)',
        mantResponsavelTecnico: 'Responsável Técnico', mantResponsavelManutencao: 'Responsável Manutenção',
        mantStatus: 'Status', mantFlagDias: 'Alerta (Dias)', mantProxima: 'Próxima Manutenção',
        mantMarcador: 'Marcador',

        // Documentos
        docTitulo: 'Título', docDescricao: 'Descrição', docSetor: 'Setor', docCategoria: 'Categoria',
        docSub: 'Subcategoria', docStatus: 'Status', docDataCriacao: 'Data do Documento',
        docRotina: 'Rotina', docFrequencia: 'Frequência', docResponsavel: 'Responsável', docRevisor: 'Revisor',
        docFlagDias: 'Alerta (Dias)', docProximaRevisao: 'Próxima Revisão',
        docMarcador: 'Marcador',

        // Anexos (Não é uma propriedade direta, mas ajuda a exibir a mudança)
        anexos: 'Anexos'
    };

    // NOVO: Função para calcular e formatar as mudanças
    function calculateChanges(original, current) {
    var changes = [];
    var silentChanged = false;

    // Se o status mudou nesta edição, o card deixa de ser "novo" imediatamente
    if (original && current && original.status !== current.status) {
        current._statusChangedOnce = true;
    }

    // Lista de chaves técnicas que não devem gerar log de texto, mas disparam o salvamento
    var ignoreKeys = ['id', 'historico', 'type', 'proxima', 'dataProximaRevisao', 'anexos', 'marcadorCor'];

    var fieldOrder = [
        'titulo', 'descricao', 'setor', 'categoria', 'subcategoria',
        'item', 'tipo', 'status', 'dataPublicacao', 'dataPrevisao',
        'dataInicio', 'dataConclusao', 'ultima', 'intervalo',
        'dataCriacao', 'rotina', 'frequencia', 'diasSemana', 'responsavel', 'auditor',
        'responsavelTecnico', 'responsavelManutencao', 'revisor',
        'flagDias', 'marcador'
    ];

    // Mapeamento de chaves do objeto para nomes legíveis
    var displayNames = {
        titulo: 'Título',
        descricao: 'Descrição',
        setor: 'Setor',
        categoria: 'Categoria',
        subcategoria: 'Subcategoria',
        item: 'Equipamento',
        status: 'Status',
        dataPublicacao: 'Data Publicação',
        dataPrevisao: 'Data Previsão',
        responsavel: 'Responsável',
        auditor: 'Auditor',
        flagDias: 'Alerta (Dias)',
        dataInicio: 'Data Início',
        dataConclusao: 'Data Conclusão',
        ultima: 'Última Manutenção',
        intervalo: 'Periodicidade',
        tipo: 'Tipo',
        responsavelTecnico: 'Resp. Técnico',
        responsavelManutencao: 'Resp. Manutenção',
        dataCriacao: 'Data do Documento',
        rotina: 'Rotina',
        frequencia: 'Frequência',
        revisor: 'Revisor',
        marcador: 'Marcador'
    };

    // Itera sobre todas as chaves do objeto atual
    for (const key in current) {
        if (ignoreKeys.includes(key)) continue;

        // Tratamento especial para checklist e checklistPublicacao (array de objetos)
        if (key === 'checklist' || key === 'checklistPublicacao') {
            const label = key === 'checklistPublicacao' ? 'Checklist de Publicação' : 'Checklist';
            const origList = (original && Array.isArray(original[key])) ? original[key] : [];
            const currList = Array.isArray(current[key]) ? current[key] : [];
            if (JSON.stringify(origList) !== JSON.stringify(currList)) {
                const clLines = [];
                const maxLen = Math.max(origList.length, currList.length);
                for (let i = 0; i < maxLen; i++) {
                    const o = origList[i];
                    const c = currList[i];
                    if (!o && c) {
                        clLines.push(`${label}: item adicionado — <strong>${c.texto || '(sem nome)'}</strong>`);
                    } else if (o && !c) {
                        clLines.push(`${label}: item removido — <strong>${o.texto || '(sem nome)'}</strong>`);
                    } else if (o && c) {
                        const nome = c.texto || o.texto || `Item ${i + 1}`;
                        if (o.texto !== c.texto) {
                            clLines.push(`${label}: renomeado — <strong>${o.texto || '(vazio)'}</strong> &rarr; <strong>${c.texto || '(vazio)'}</strong>`);
                        }
                        if (!!o.checked !== !!c.checked) {
                            clLines.push(`${label}: <strong>${nome}</strong> — ${c.checked ? 'marcado como concluído' : 'desmarcado'}`);
                        }
                    }
                }
                if (clLines.length > 0) clLines.forEach(l => changes.push(l));
                else silentChanged = true;
            }
            continue;
        }

        // Normalização para comparação (trata null/undefined/'' como string vazia)
        let valOriginal = original && original[key] !== undefined && original[key] !== null && original[key] !== '' ? String(original[key]).trim() : '';
        let valCurrent = current[key] !== undefined && current[key] !== null && current[key] !== '' ? String(current[key]).trim() : '';

        if (valOriginal !== valCurrent) {
            // Se mudou status ou marcador, consideramos "mudança silenciosa" (salva mas não detalha se for só isso)
            if (key === 'status' || key === 'marcador') {
                silentChanged = true;
            }

            const label = displayNames[key] || key;

            // Formatação de datas para o histórico ficar legível
            let displayOrig = valOriginal;
            let displayCurr = valCurrent;

            if (key.toLowerCase().includes('data') || key === 'ultima' || key === 'proxima') {
                displayOrig = (original[key] !== undefined && original[key] !== null && original[key] !== '') ? formatBR(original[key]) : 'vazio';
                displayCurr = (current[key] !== undefined && current[key] !== null && current[key] !== '') ? formatBR(current[key]) : 'vazio';
            }

            if (key === 'descricao') {
                const descHtml = `
                    <div style="margin-top:4px;">
                        <strong>Descrição antiga:</strong><br>
                        <div style="margin-left:10px; margin-top:2px; color:#ff6868;">${valOriginal.replace(/\n/g, '<br>') || '(vazio)'}</div>
                    </div>
                    <div style="margin-top:4px;">
                        <strong>Descrição nova:</strong><br>
                        <div style="margin-left:10px; margin-top:2px; color:#059669;">${valCurrent.replace(/\n/g, '<br>') || '(vazio)'}</div>
                    </div>
                `.trim();
                changes.push(descHtml);
            } else {
                // Outros campos (Título, Setor, etc)
                const label = displayNames[key] || key;
                let displayOrig = valOriginal;
                let displayCurr = valCurrent;

                if (key.toLowerCase().includes('data') || key === 'ultima') {
                    displayOrig = original[key] ? formatBR(original[key]) : 'vazio';
                    displayCurr = current[key] ? formatBR(current[key]) : 'vazio';
                }

                // Campos de usuário: resolve IDs para nomes legíveis
                const userFields = ['responsavel', 'revisor', 'responsavelTecnico', 'responsavelManutencao', 'auditor'];
                if (userFields.includes(key)) {
                    const _resolveUserDisplay = (raw) => {
                        if (!raw) return 'vazio';
                        let ids;
                        try { const p = JSON.parse(String(raw)); ids = Array.isArray(p) ? p.map(String) : [String(p)]; }
                        catch { ids = [String(raw)]; }
                        const names = ids.map(id => (typeof resolveUserId === 'function' ? resolveUserId(id) : null) || id).filter(Boolean);
                        return names.length ? names.join(', ') : 'vazio';
                    };
                    displayOrig = _resolveUserDisplay(original ? original[key] : null);
                    displayCurr = _resolveUserDisplay(current[key]);
                }

                changes.push(`${label}: <strong>${displayOrig || 'vazio'}</strong> &rarr; <strong>${displayCurr || 'vazio'}</strong>`);
            }
        }
    }

    // Verificação de anexos
    var origAnexos = original.anexos || [];
    var currAnexos = current.anexos || [];
    if (JSON.stringify(origAnexos) !== JSON.stringify(currAnexos)) {
        const added = currAnexos.filter(a => !origAnexos.some(o => (o.titulo || o.name || '') === (a.titulo || a.name || '') && (o.url || '') === (a.url || '')));
        const removed = origAnexos.filter(o => !currAnexos.some(a => (a.titulo || a.name || '') === (o.titulo || o.name || '') && (a.url || '') === (o.url || '')));
        if (added.length > 0 || removed.length > 0) {
            let anexoDetails = [];
            if (added.length > 0) {
                anexoDetails.push(`<strong>Anexos adicionados:</strong><br>${added.map(a => `<a href="${a.url || '#'}" target="_blank">${a.titulo || a.name || 'Anexo'}</a>`).join('<br>')}`);
            }
            if (removed.length > 0) {
                anexoDetails.push(`<strong>Anexos removidos:</strong><br>${removed.map(a => `${a.titulo || a.name || 'Anexo'}`).join('<br>')}`);
            }
            changes.push(anexoDetails.join('<br>'));
        } else {
            silentChanged = true; // if only order changed or other differences
        }
    }

    // Adiciona propriedade auxiliar para controle do fluxo de salvamento
    changes.silentChanged = silentChanged;
    return changes;
}


// Retorna true se o item é recorrente e concluído — doc com periodicidade > 0.
// Esses itens continuam sendo monitorados pelo prazo mesmo após conclusão.
function isConcludedRecurring(item, tabType) {
    if (typeof _kbStatusIsConcluido === 'function' ? !_kbStatusIsConcluido(item.status || '') : !/conclu/i.test(item.status || '')) return false;
    if (tabType === 'auditoria' || tabType === 'audit') {
        // Rotina não-pontual continua monitorando prazo mesmo concluída
        return item.rotina && item.rotina !== 'pontual';
    }
    if (tabType === 'documentos' || tabType === 'doc') {
        return item.rotina && item.rotina !== 'pontual';
    }
    return false;
}

// Retorna true se o status "Concluído" é permitido dado o checklist.
// Só bloqueia itens marcados como requiredForPub=true; se nenhum tiver, libera.
function canSetConcluido(checklist, item) {
    // Bloqueia se checklist geral tiver itens obrigatórios não marcados
    if (checklist && checklist.length > 0) {
        const required = checklist.filter(function(c) { return !!c.requiredForPub; });
        if (required.length > 0 && !required.every(function(c) { return !!c.checked; })) return false;
    }
    // Bloqueia se checklistPublicacao tiver itens obrigatórios (requiredForPub) não
    // concluídos no ciclo atual. Itens opcionais não bloqueiam — o próprio formulário
    // de registro de publicação só exige os obrigatórios para salvar (ver
    // salvarPublicacao em publicacoes.js), então exigir 100% aqui (incluindo
    // opcionais) travava a conclusão mesmo com a publicação corretamente registrada.
    if (item && Array.isArray(item.checklistPublicacao) && item.checklistPublicacao.length > 0) {
        var pubCLRequired = item.checklistPublicacao.filter(function(c) { return !!c.requiredForPub; });
        if (pubCLRequired.length > 0) {
            var currentCycle = item.pubCycleId || 1;
            var currentDateRef = item.dataPublicacao || item.dataConclusao || null;
            var _key = function(c) { return c.id || ('t:' + (c.texto || '').trim()); };
            var doneKeys = new Set();
            (item.publicacoes || []).forEach(function(pub) {
                var isCurr = pub.pubCycleId ? pub.pubCycleId === currentCycle : pub.dataConclusaoRef === currentDateRef;
                if (!isCurr) return;
                (pub.checklistSnapshot || []).forEach(function(snap) { if (snap.checked) doneKeys.add(_key(snap)); });
            });
            if (!pubCLRequired.every(function(c) { return doneKeys.has(_key(c)); })) return false;
        }
    }
    return true;
}

    var colorMap = {
        'blue': 'var(--c-blue)',
        'green': 'var(--c-green)',
        'red': 'var(--c-red)',
        'orange': 'var(--c-orange)',
        'yellow': 'var(--c-yellow)',
        'purple': 'var(--c-purple)',
        'default': 'var(--c-default)'
    };

// Abre modal solicitando data de conclusão ao mover/salvar como Concluído.
// onConfirm(dateStr) — dateStr em formato 'YYYY-MM-DD'
// onCancel() — chamado se o usuário fechar sem confirmar
window.showConclusaoDateModal = function(currentDate, onConfirm, onCancel) {
    var existing = document.getElementById('_conclusaoDateModal');
    if (existing) existing.remove();

    var today = new Date();
    var todayStr = today.getFullYear() + '-'
        + String(today.getMonth() + 1).padStart(2, '0') + '-'
        + String(today.getDate()).padStart(2, '0');
    var defaultVal = currentDate || todayStr;

    var overlay = document.createElement('div');
    overlay.id = '_conclusaoDateModal';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'display:flex', 'align-items:center', 'justify-content:center',
        'background:rgba(0,0,0,0.55)', 'backdrop-filter:blur(3px)',
        'animation:fadeIn .15s ease'
    ].join(';');

    overlay.innerHTML = `
        <div style="
            background:var(--card-bg, #ffffff);
            border:1px solid var(--border, #e2e8f0);
            border-radius:16px;
            padding:32px 28px 24px;
            min-width:320px;
            max-width:90vw;
            box-shadow:0 24px 60px rgba(0,0,0,0.15);
            display:flex;flex-direction:column;gap:20px;
            animation:slideUp .18s ease;
        ">
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="
                    width:40px;height:40px;border-radius:10px;
                    background:rgba(16,185,129,0.15);
                    display:flex;align-items:center;justify-content:center;
                    flex-shrink:0;
                ">
                    <i class="fas fa-check-circle" style="color:#10b981;font-size:18px;"></i>
                </div>
                <div>
                    <div style="font-weight:700;font-size:15px;color:var(--text, #0f172a);">Concluído</div>
                    <div style="font-size:12px;color:var(--text-light,#64748b);margin-top:2px;">Informe a data de conclusão</div>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;">
                <label style="font-size:12px;font-weight:600;color:var(--text-light,#64748b);text-transform:uppercase;letter-spacing:.5px;">
                    Data de Conclusão
                </label>
                <input id="_conclusaoDateInput" type="date" value="${defaultVal}" style="
                    background:var(--bg, #f1f5f9);
                    border:1.5px solid var(--border,#e2e8f0);
                    border-radius:8px;
                    color:var(--text,#0f172a);
                    font-size:14px;
                    padding:10px 12px;
                    outline:none;
                    width:100%;
                    box-sizing:border-box;
                    cursor:pointer;
                " onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='var(--border,#e2e8f0)'">
            </div>

            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text,#0f172a);cursor:pointer;user-select:none;">
                <input id="_conclusaoRemoveMarkerInput" type="checkbox" checked style="width:15px;height:15px;cursor:pointer;accent-color:#10b981;">
                Remover marcadores deste item
            </label>

            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button id="_conclusaoCancelBtn" style="
                    background:transparent;
                    border:1.5px solid var(--border,#e2e8f0);
                    border-radius:8px;
                    color:var(--text-light,#64748b);
                    font-size:13px;font-weight:600;
                    padding:9px 20px;cursor:pointer;
                    transition:border-color .15s,color .15s;
                " onmouseover="this.style.borderColor='var(--border-strong,#cbd5e1)';this.style.color='var(--text,#0f172a)'"
                   onmouseout="this.style.borderColor='var(--border,#e2e8f0)';this.style.color='var(--text-light,#64748b)'">
                    Cancelar
                </button>
                <button id="_conclusaoConfirmBtn" style="
                    background:#10b981;
                    border:none;border-radius:8px;
                    color:#fff;font-size:13px;font-weight:700;
                    padding:9px 22px;cursor:pointer;
                    transition:background .15s;
                    display:flex;align-items:center;gap:8px;
                " onmouseover="this.style.background='#059669'"
                   onmouseout="this.style.background='#10b981'">
                    <i class="fas fa-check"></i> Confirmar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    function _close() { overlay.remove(); }

    overlay.querySelector('#_conclusaoCancelBtn').addEventListener('click', function() {
        _close();
        if (typeof onCancel === 'function') onCancel();
    });

    overlay.querySelector('#_conclusaoConfirmBtn').addEventListener('click', function() {
        var val = document.getElementById('_conclusaoDateInput').value;
        var removeMarker = document.getElementById('_conclusaoRemoveMarkerInput').checked;
        _close();
        if (typeof onConfirm === 'function') onConfirm(val || todayStr, removeMarker);
    });

    // Fechar clicando no overlay
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            _close();
            if (typeof onCancel === 'function') onCancel();
        }
    });

    // Enter confirma
    overlay.querySelector('#_conclusaoDateInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') overlay.querySelector('#_conclusaoConfirmBtn').click();
        if (e.key === 'Escape') overlay.querySelector('#_conclusaoCancelBtn').click();
    });

    setTimeout(function() {
        var inp = document.getElementById('_conclusaoDateInput');
        if (inp) inp.focus();
    }, 50);
};
