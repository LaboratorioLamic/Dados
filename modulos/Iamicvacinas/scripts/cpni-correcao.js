// ─── CORREÇÃO CPNI (aba de Configurações) ─────────────────────────────────────
// Permite revisar/corrigir, depois de já importado, o mapeamento entre um
// imunobiológico da planilha do CPNI (cpniImunoMap) e a vacina do catálogo.
// Trocar a vacina associada:
//   1) atualiza cpniImunoMap[key].vaccineId — vale para as PRÓXIMAS importações;
//   2) reatribui em massa TODOS os agendamentos já importados (importedCPNI:true)
//      que hoje apontam para a vacina antiga, para a vacina nova.
// Também permite correção em massa direta por vacina (sem passar pelo mapa),
// para os casos em que o registro ficou com vaccineId errado por qualquer motivo.

let _cpniCorrFilter = ''; // texto de busca (nome do imuno ou da vacina)

function _cpniCorrEntries() {
    // Uma linha por chave do mapa, já resolvendo nome/vaccineId em formato
    // legado (number) ou novo ({nome, vaccineId}).
    return Object.keys(cpniImunoMap).map(key => {
        const entry = cpniImunoMap[key];
        const vaccineId = cpniMapEntryVaccineId(entry);
        const nome = cpniMapEntryNome(entry) || key;
        const vac = vaccineId ? vaccines.find(v => v.id == vaccineId) : null;
        const qtdImportados = vaccineId
            ? appointments.filter(a => a.importedCPNI && a.vaccineId == vaccineId).length
            : 0;
        return { key, nome, vaccineId, vac, qtdImportados };
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function renderCpniCorrecao() {
    const list = document.getElementById('cpni-corr-list');
    if (!list) return;
    const termo = normalizeStr(_cpniCorrFilter);
    const entries = _cpniCorrEntries().filter(e =>
        !termo || normalizeStr(e.nome).includes(termo) || (e.vac && normalizeStr(e.vac.nome).includes(termo))
    );

    document.getElementById('cpni-corr-count').textContent = entries.length;

    if (!entries.length) {
        list.innerHTML = '<p class="text-center text-slate-400 text-sm py-8 font-bold">Nenhum imunobiológico mapeado ainda. O mapeamento é criado ao importar uma planilha do CPNI.</p>';
        return;
    }

    list.innerHTML = entries.map(e => {
        const semVacina = !e.vac;
        return `<div class="flex items-center gap-3 p-3 bg-white border ${semVacina ? 'border-amber-300' : 'border-slate-200'} rounded-xl">
            <div class="flex-1 min-w-0">
                <p class="font-black text-navy-900 text-sm truncate" title="${e.nome.replace(/"/g,'&quot;')}">${e.nome}</p>
                <p class="text-[10px] ${semVacina ? 'text-amber-600' : 'text-slate-400'} font-bold">
                    ${semVacina ? 'Sem vacina associada' : `${e.qtdImportados} registro(s) importado(s) associado(s)`}
                </p>
            </div>
            <div class="relative w-[260px] shrink-0" id="cpni-corr-wrap-${e.key}">
                <input type="text" id="cpni-corr-search-${e.key}" data-key="${e.key}" autocomplete="off"
                    oninput="_cpniCorrFilterDropdown('${e.key}')" onfocus="_cpniCorrFilterDropdown('${e.key}')" onblur="_cpniCorrHideDropdown('${e.key}')"
                    placeholder="Pesquisar vacina..." value="${e.vac ? e.vac.nome.replace(/"/g,'&quot;') : ''}"
                    class="w-full border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold uppercase focus:ring-2 focus:ring-clinic-500 outline-none">
                <input type="hidden" id="cpni-corr-value-${e.key}" value="${e.vaccineId || ''}">
                <div id="cpni-corr-dropdown-${e.key}" class="hidden absolute z-[10] left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-y-auto" style="max-height:200px;"></div>
            </div>
            <button type="button" onclick="_cpniCorrApply('${e.key}')" title="Aplicar: atualiza o mapeamento e reatribui os registros já importados"
                class="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition">
                <i class="fas fa-check text-xs"></i>
            </button>
        </div>`;
    }).join('');
}

function _cpniCorrSetFilter(val) {
    _cpniCorrFilter = val;
    renderCpniCorrecao();
}

function _cpniCorrFilterDropdown(key) {
    const input = document.getElementById(`cpni-corr-search-${key}`);
    const dd = document.getElementById(`cpni-corr-dropdown-${key}`);
    if (!input || !dd) return;
    const val = normalizeStr(input.value);
    const ativos = vaccines.filter(v => v.ativo !== false);
    const matches = (val ? ativos.filter(v => {
        if (normalizeStr(v.nome).includes(val)) return true;
        if (v.mnemonico && normalizeStr(v.mnemonico).includes(val)) return true;
        return vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && normalizeStr(l.fabricante).includes(val));
    }) : ativos).sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR'));

    if (!matches.length) { dd.innerHTML = '<div class="px-3 py-2 text-xs text-slate-400 font-bold">Nenhuma vacina encontrada</div>'; dd.classList.remove('hidden'); return; }
    dd.innerHTML = matches.map(v =>
        `<div class="px-3 py-2 hover:bg-clinic-50 hover:text-clinic-700 cursor-pointer text-sm font-bold text-navy-900 border-b border-slate-100 last:border-0 transition uppercase"
              onmousedown="_cpniCorrSelectVaccine('${key}',${v.id},'${v.nome.replace(/'/g,"\\'")}')">
            <span>${v.nome}</span>
            ${v.mnemonico ? `<br><span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case mt-0.5">${v.mnemonico}</span>` : ''}
        </div>`
    ).join('');
    dd.classList.remove('hidden');
}

function _cpniCorrHideDropdown(key) {
    setTimeout(() => { const dd = document.getElementById(`cpni-corr-dropdown-${key}`); if (dd) dd.classList.add('hidden'); }, 150);
}

function _cpniCorrSelectVaccine(key, vaccineId, nome) {
    document.getElementById(`cpni-corr-search-${key}`).value = nome;
    document.getElementById(`cpni-corr-value-${key}`).value = vaccineId;
    document.getElementById(`cpni-corr-dropdown-${key}`).classList.add('hidden');
}

// Aplica a troca de associação para uma chave do mapa: atualiza cpniImunoMap
// (próximas importações) e reatribui em massa os agendamentos importados que
// hoje estão com a vacina antiga.
function _cpniCorrApply(key) {
    const canEdit = (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin()) || (typeof hasPerm === 'function' && hasPerm('aplicar'));
    if (!canEdit) { showNotification('Apenas usuários com permissão de aplicador podem corrigir associações do CPNI.', 'error'); return; }

    const valEl = document.getElementById(`cpni-corr-value-${key}`);
    const newVaccineId = Number(valEl?.value) || null;
    if (!newVaccineId || !vaccines.find(v => v.id == newVaccineId)) {
        showNotification('Selecione uma vacina válida da lista.', 'error');
        return;
    }

    const entry = cpniImunoMap[key];
    const oldVaccineId = cpniMapEntryVaccineId(entry);
    const nome = cpniMapEntryNome(entry) || key;
    const vacNova = vaccines.find(v => v.id == newVaccineId);

    if (oldVaccineId == newVaccineId) {
        showNotification('Essa já é a vacina associada — nenhuma alteração feita.', 'info');
        return;
    }

    const doTroca = () => {
        // 1) Atualiza o mapa para as próximas importações
        cpniSetMapEntry(cpniImunoMap, key, nome, newVaccineId);

        // 2) Reatribui em massa os agendamentos já importados com a vacina antiga
        let reatribuidos = 0;
        if (oldVaccineId) {
            appointments.forEach(a => {
                if (a.importedCPNI && a.vaccineId == oldVaccineId) {
                    a.vaccineId = newVaccineId;
                    reatribuidos++;
                }
            });
        }

        const vacAntiga = oldVaccineId ? vaccines.find(v => v.id == oldVaccineId) : null;
        logAudit('Editado', 'correcao_cpni', key, nome,
            `Associação corrigida: ${vacAntiga ? vacAntiga.nome : '—'} → ${vacNova.nome} | ${reatribuidos} registro(s) importado(s) reatribuído(s)`);

        saveAll();
        renderCpniCorrecao();
        renderPatients(); renderCalendar(); renderTable(); renderDashboard();
        if (typeof updateExpiryBadge === 'function') updateExpiryBadge();
        showNotification(`Associação corrigida: ${reatribuidos} registro(s) importado(s) reatribuído(s) para ${vacNova.nome}.`, 'success');
    };

    const qtdAfetada = oldVaccineId ? appointments.filter(a => a.importedCPNI && a.vaccineId == oldVaccineId).length : 0;
    if (qtdAfetada > 0) {
        const vacAntiga = vaccines.find(v => v.id == oldVaccineId);
        showConfirmDanger(
            `Reatribuir ${qtdAfetada} registro(s) importado(s) de "${vacAntiga ? vacAntiga.nome : '—'}" para "${vacNova.nome}"?\n\nIsso corrige TODOS os agendamentos do CPNI que hoje apontam para a vacina antiga, não apenas os deste imunobiológico.`,
            doTroca
        );
    } else {
        doTroca();
    }
}
