// ─── BOOTSTRAP / INITIALIZATION (from index.html lines ~6643-6669) ───────────

document.addEventListener('DOMContentLoaded', () => {
    const loadingEl = document.getElementById('loading-overlay');
    sessaoDados().catch(e => { e.etapa = 'leitura do Dados LAMIC (uids/usuarios/grupos)'; throw e; })
        .then(ok => ok ? initFromFirebase().then(() => true).catch(e => { e.etapa = 'leitura do nó /vacinas'; throw e; }) : false).then(ok => {
        if (!ok || !vincularUsuarioAtual()) return;
        setupRealtimeSync();
        document.getElementById('dash-ano-base').value = new Date().getFullYear();
        if (typeof initDashPeriodoFilters === 'function') initDashPeriodoFilters();
        populatePatientDatalist(); populateVaccineSelects(); renderVaccines(); renderPatients();
        if (typeof populateUnidadeSelects === 'function') populateUnidadeSelects();
const initTab = getFirstAllowedTab() || 'agenda';
        switchTab(initTab);
        updateExpiryBadge();
        updateContactsBadge();
        updateSemLoteBadge();
        initAuth();
        _appReady = true;
        if (loadingEl) loadingEl.style.display = 'none';
        if (window.LamicCarregando) window.LamicCarregando.fim(); 
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('expiry-panel');
            if (!panel) return;
            // Protege todos os sinos de vencimento (Produtos, Estoque, Lotes, Movimentação)
            const clickedBell = e.target.closest('[title="Alertas de vencimento de lotes"]');
            if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !clickedBell) {
                panel.classList.add('hidden');
                panel.classList.remove('flex');
            }
        });
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('contacts-panel');
            if (!panel) return;
            const clickedBell = e.target.closest('#btn-contacts-bell');
            if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !clickedBell) {
                panel.classList.add('hidden');
                panel.classList.remove('flex');
            }
        });
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('semlote-panel');
            if (!panel) return;
            const clickedBell = e.target.closest('#btn-semlote-bell');
            if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !clickedBell) {
                panel.classList.add('hidden');
                panel.classList.remove('flex');
            }
        });
    }).catch(err => {
        console.error('[FB] initFromFirebase:', err);
        if (window.LamicCarregando) window.LamicCarregando.fim(); 
        if (loadingEl) loadingEl.innerHTML = '<div class="text-center p-8"><i class="fas fa-exclamation-triangle text-red-500 text-5xl mb-4 block"></i><p class="text-white font-black uppercase tracking-widest text-sm">Erro ao conectar ao servidor</p><p class="text-slate-400 text-xs mt-3 max-w-sm">' + (String(err && (err.code || err.message) || '').toLowerCase().includes('permission')
            ? 'Sem permissão no banco: publique as regras do Firebase (nó <b>vacinas</b>) e confira se o seu grupo no Dados LAMIC tem o link <b>LAMIC Vacinas</b> liberado.'
            : 'Verifique a conexão com a internet e as regras do Firebase Realtime Database, depois recarregue a página.')
            + '</p><p class="text-slate-500 text-[10px] mt-3 font-mono max-w-sm break-all">' + (String(err && (err.code || err.message) || err) + (err && err.etapa ? ' · ' + err.etapa : '')).replace(/</g, '&lt;') + '</p></div>';
    });
});
