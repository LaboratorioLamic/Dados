// ════════════════════════════════════════════════════════════
// DIÁLOGOS DO SISTEMA — substituem confirm() / prompt() do navegador
// ════════════════════════════════════════════════════════════
// uiConfirmar({ tipo, titulo, mensagem, detalhe, confirmar, cancelar }) → Promise<boolean>
// uiPrompt({ tipo, titulo, mensagem, valor, placeholder, multilinha, confirmar }) → Promise<string|null>
//   tipo: 'perigo' (excluir) | 'aviso' (padrão) | 'info' | 'sucesso' — define a cor
//   icone: opcional, troca o ícone do tipo (editar, mover, sair...)
//   mensagem/detalhe aceitam HTML — escape o que vier do usuário com uiEsc().
// Cancelar, clicar fora ou Esc resolvem false / null.

let _uiDialogoAberto = null;

const _UI_CONF_ICO = {
  perigo:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>',
  aviso:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  sucesso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  editar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  mover:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
  sair:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
};

function uiEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uiDialogoAberto() { return !!_uiDialogoAberto; }

function _uiDialogo({ tipo = 'aviso', icone, titulo, mensagem = '', detalhe = '', confirmar = 'Confirmar', cancelar = 'Cancelar', campo = null }) {
  if (_uiDialogoAberto) _uiDialogoAberto(null);
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = `ui-conf ui-conf-${tipo}`;
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'ui-conf-tit');
    const campoHTML = !campo ? '' : campo.multilinha
      ? `<textarea class="field-textarea ui-conf-campo" rows="3" placeholder="${uiEsc(campo.placeholder || '')}">${uiEsc(campo.valor || '')}</textarea>`
      : `<input type="text" class="field-input ui-conf-campo" placeholder="${uiEsc(campo.placeholder || '')}" value="${uiEsc(campo.valor || '')}">`;
    el.innerHTML = `<div class="ui-conf-box">
      <div class="ui-conf-ico">${_UI_CONF_ICO[icone] || _UI_CONF_ICO[tipo] || _UI_CONF_ICO.aviso}</div>
      <div class="ui-conf-tit" id="ui-conf-tit">${uiEsc(titulo)}</div>
      ${mensagem ? `<div class="ui-conf-msg">${mensagem}</div>` : ''}
      ${detalhe ? `<div class="ui-conf-det">${detalhe}</div>` : ''}
      ${campoHTML}
      <div class="ui-conf-acoes">
        <button type="button" class="btn btn-outline" data-r="0">${uiEsc(cancelar)}</button>
        <button type="button" class="btn ui-conf-ok" data-r="1">${uiEsc(confirmar)}</button>
      </div>
    </div>`;
    const input = el.querySelector('.ui-conf-campo');
    const anterior = document.activeElement;
    const focaveis = () => [...el.querySelectorAll('.ui-conf-campo, button')];
    const tecla = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(false); }
      else if (e.key === 'Enter' && input && e.target === input && !campo.multilinha) { e.preventDefault(); fechar(true); }
      else if (e.key === 'Tab') {
        // Foco preso dentro da janela
        const f = focaveis(), prim = f[0], ult = f[f.length - 1];
        if (e.shiftKey && document.activeElement === prim) { e.preventDefault(); ult.focus(); }
        else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); prim.focus(); }
      }
    };
    const fechar = ok => {
      if (_uiDialogoAberto !== fechar) return;
      if (ok && input && campo.obrigatorio && !input.value.trim()) { input.classList.add('ui-conf-erro'); input.focus(); return; }
      _uiDialogoAberto = null;
      document.removeEventListener('keydown', tecla, true);
      el.classList.remove('aberto');
      setTimeout(() => el.remove(), 180);
      try { anterior?.focus?.(); } catch (e) { /* elemento já saiu da tela */ }
      resolve(campo ? (ok ? input.value : null) : !!ok);
    };
    _uiDialogoAberto = fechar;
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => fechar(b.dataset.r === '1')));
    input?.addEventListener('input', () => input.classList.remove('ui-conf-erro'));
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('aberto'));
    // Com campo: foco no campo. Excluir começa no "Cancelar" (Enter não apaga por engano).
    if (input) { input.focus(); input.select?.(); }
    else el.querySelector(tipo === 'perigo' ? '[data-r="0"]' : '[data-r="1"]').focus();
  });
}

function uiConfirmar(opts) { return _uiDialogo({ ...opts, campo: null }); }

function uiPrompt({ valor = '', placeholder = '', multilinha = false, obrigatorio = true, confirmar = 'Salvar', tipo = 'info', ...resto }) {
  return _uiDialogo({ tipo, confirmar, ...resto, campo: { valor, placeholder, multilinha, obrigatorio } });
}
