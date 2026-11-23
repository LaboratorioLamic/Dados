// Utilitários de UI do painel admin (toast + barra de carregamento)
// e o bloqueio de devtools, que vale para a página inteira.
(function () {

function showWarning(message) {
    const warningMessage = document.getElementById('cfg-warning-message');
    const warningText = document.getElementById('cfg-warning-text');
    if (!warningMessage || !warningText) return;
    warningText.textContent = message;
    warningMessage.style.display = 'block';
    setTimeout(() => { warningMessage.style.display = 'none'; }, 3000);
}

let loadingBarAnimationId = null;
let loadingBarStart = null;

function showLoadingBar() {
    const overlay = document.getElementById('cfg-loading-overlay');
    const bar = document.getElementById('cfg-loading-bar');
    if (!overlay || !bar) return;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    bar.style.width = '0%';
    loadingBarStart = null;
    if (loadingBarAnimationId) cancelAnimationFrame(loadingBarAnimationId);
    function step(timestamp) {
        if (!loadingBarStart) loadingBarStart = timestamp;
        const elapsed = timestamp - loadingBarStart;
        const duration = 15000;
        const baseProgress = Math.min(98, (elapsed / duration) * 98);
        const variation = (Math.random() - 0.5) * 2 * (1 - Math.min(elapsed, duration) / duration);
        const progress = Math.min(98, Math.max(0, baseProgress + variation));
        bar.style.width = `${progress}%`;
        if (elapsed < duration) {
            loadingBarAnimationId = requestAnimationFrame(step);
        } else {
            bar.style.width = '98%';
        }
    }
    loadingBarAnimationId = requestAnimationFrame(step);
}

function hideLoadingBar() {
    const overlay = document.getElementById('cfg-loading-overlay');
    const bar = document.getElementById('cfg-loading-bar');
    if (!overlay || !bar) return;
    if (loadingBarAnimationId) { cancelAnimationFrame(loadingBarAnimationId); loadingBarAnimationId = null; }
    bar.style.width = '100%';
    setTimeout(() => {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        bar.style.width = '0%';
    }, 800);
}

function cancelLoadingBar() {
    if (loadingBarAnimationId) { cancelAnimationFrame(loadingBarAnimationId); loadingBarAnimationId = null; }
    const overlay = document.getElementById('cfg-loading-overlay');
    const bar = document.getElementById('cfg-loading-bar');
    if (overlay) { overlay.classList.remove('active'); overlay.setAttribute('aria-hidden', 'true'); }
    if (bar) bar.style.width = '0%';
}

// ─── Modal de confirmação (substitui confirm() e prompt() do navegador) ───
// Uso: await showConfirm({ title, message, details, requireWord, tone, confirmText })
// Resolve true quando o usuário confirma e false quando cancela.
function showConfirm(options) {
    const config = options || {};
    const modal = document.getElementById('cfg-confirm-modal');
    const content = document.getElementById('cfg-confirm-content');
    const icon = document.getElementById('cfg-confirm-icon');
    const titleEl = document.getElementById('cfg-confirm-title');
    const messageEl = document.getElementById('cfg-confirm-message');
    const detailsEl = document.getElementById('cfg-confirm-details');
    const field = modal?.querySelector('.confirm-field');
    const input = document.getElementById('cfg-confirm-input');
    const errorEl = document.getElementById('cfg-confirm-error');
    const okBtn = document.getElementById('cfg-confirm-ok');
    const cancelBtn = document.getElementById('cfg-confirm-cancel');

    // Sem o modal na página (ex.: uso fora do portal), volta para o confirm nativo.
    if (!modal || !content || !input || !okBtn || !cancelBtn) {
        return Promise.resolve(window.confirm(config.message || 'Confirmar?'));
    }

    const requireWord = config.requireWord || null;
    const isNeutral = config.tone === 'neutral';

    content.classList.toggle('is-neutral', isNeutral);
    icon.innerHTML = `<i class="fas ${config.icon || (isNeutral ? 'fa-circle-question' : 'fa-triangle-exclamation')}"></i>`;
    titleEl.textContent = config.title || 'Confirmar ação';
    messageEl.textContent = config.message || '';
    messageEl.style.display = config.message ? 'block' : 'none';
    okBtn.textContent = config.confirmText || 'Confirmar';

    detailsEl.innerHTML = '';
    for (const detail of config.details || []) {
        const item = document.createElement('li');
        if (typeof detail === 'string') {
            item.textContent = detail;
        } else {
            item.textContent = detail.text;
            if (detail.alert) item.classList.add('is-alert');
        }
        detailsEl.appendChild(item);
    }

    // A palavra de confirmação só aparece nas ações mais destrutivas.
    field.style.display = requireWord ? 'block' : 'none';
    field.querySelector('label').innerHTML = `Digite <strong>${requireWord || ''}</strong> para confirmar`;
    input.value = '';
    input.placeholder = requireWord || '';
    errorEl.classList.remove('active');
    okBtn.disabled = false;

    modal.style.display = 'flex';
    setTimeout(() => (requireWord ? input : okBtn).focus(), 60);

    return new Promise(resolve => {
        function cleanup(result) {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            input.removeEventListener('keydown', onKey);
            document.removeEventListener('keydown', onEscape);
            resolve(result);
        }

        function onConfirm() {
            if (requireWord && input.value.trim().toUpperCase() !== requireWord.toUpperCase()) {
                errorEl.textContent = `Digite ${requireWord} para continuar.`;
                errorEl.classList.add('active');
                content.classList.add('error');
                setTimeout(() => content.classList.remove('error'), 400);
                input.focus();
                return;
            }
            cleanup(true);
        }

        function onCancel() { cleanup(false); }
        function onBackdrop(event) { if (event.target === modal) cleanup(false); }
        function onKey(event) { if (event.key === 'Enter') { event.preventDefault(); onConfirm(); } }
        function onEscape(event) { if (event.key === 'Escape') cleanup(false); }

        okBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        input.addEventListener('keydown', onKey);
        document.addEventListener('keydown', onEscape);
    });
}

// ─── Bloqueio de devtools (página inteira, portal do aluno incluso) ───
function ctrlShiftKey(event, key) {
    return event.ctrlKey && event.shiftKey && event.keyCode === key.charCodeAt(0);
}

document.onkeydown = function (event) {
    if (
        event.keyCode === 123 ||
        ctrlShiftKey(event, 'I') ||
        ctrlShiftKey(event, 'J') ||
        ctrlShiftKey(event, 'C') ||
        (event.ctrlKey && event.keyCode === 'U'.charCodeAt(0)) ||
        (event.ctrlKey && event.keyCode === 'S'.charCodeAt(0))
    ) {
        event.preventDefault();
        return false;
    }
};

document.addEventListener('contextmenu', function (evento) { evento.preventDefault(); });

window.UniAdmin = window.UniAdmin || {};
Object.assign(window.UniAdmin, { showWarning, showLoadingBar, hideLoadingBar, cancelLoadingBar, showConfirm });
})();
