// ─── VACCINE MANAGEMENT ───────────────────────────────────────────────────────

// ── Almoxarifado: estado dos filtros ──
let vaccineFilter = 'ativos'; // ativos | inativos | ambos
let loteFilter = 'ativos';    // ativos | inativos | ambos
// switchAlmoxModulo / setLoteFilter / renderAlmoxLotes vivem em almoxarifado.js

function setVaccineFilter(tipo) {
    vaccineFilter = tipo;
    document.querySelectorAll('.vf-btn').forEach(b => {
        b.classList.remove('bg-green-600', 'text-white', 'shadow');
        b.classList.add('text-slate-500', 'hover:bg-white');
    });
    const active = document.getElementById('vf-btn-' + tipo);
    if (active) { active.classList.add('bg-green-600', 'text-white', 'shadow'); active.classList.remove('text-slate-500', 'hover:bg-white'); }
    renderVaccines();
}

function renderVaccines() {
    const search = normalizeStr(document.getElementById('filter-vaccine')?.value || '');
    const tbody = document.getElementById('vaccines-body'); tbody.innerHTML = '';
    const sorted = [...vaccines]
        .filter(v => {
            const matchNome = !search || normalizeStr(v.nome).includes(search) ||
                (v.mnemonico && normalizeStr(v.mnemonico).includes(search)) ||
                vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && normalizeStr(l.fabricante).includes(search));
            if (matchNome) {
                const ativo = v.ativo !== false;
                if (vaccineFilter === 'ativos') return ativo;
                if (vaccineFilter === 'inativos') return !ativo;
                return true;
            }
            return false;
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    sorted.forEach(v => {
        // Esquema a partir dos esquemas por faixa etária
        let schema = '';
        if (v.esquemas && v.esquemas.length) {
            schema = v.esquemas.map(esq => {
                const faixa = esq.minAnos != null ? formatFaixaEtaria(esq) : 'Qualquer idade';
                return `${faixa}: ${esquemaSemDoses(esq) ? 'somente reforço' : `${esq.numDoses || 1}D`}`;
            }).join('<br>');
            const nReforcos = getVaccineReforcos(v).length;
            if (nReforcos) schema += nReforcos > 1 ? ` + ${nReforcos} Reforços` : ' + Reforço';
            if (v.doseUnica) schema += ' (+ D. Única)';
        } else {
            const nReforcos = getVaccineReforcos(v).length;
            const reforcoSuffix = nReforcos > 1 ? ` + ${nReforcos} Reforços` : nReforcos === 1 ? ' + Reforço' : '';
            schema = v.doseUnica ? `${v.numDoses} Dose(s) (+ Dose Única)` : `${v.numDoses} Dose(s)${reforcoSuffix}`;
        }

        let idadeMinStr = '';
        if (v.esquemas && v.esquemas.length > 0) {
            idadeMinStr = v.esquemas.map(esq => {
                const faixa = formatFaixaEtaria(esq);
                if (esquemaSemDoses(esq)) return `${faixa} — somente reforço`;
                const nd = esq.numDoses || 1;
                return `${faixa} — ${nd} dose${nd > 1 ? 's' : ''}`;
            }).join('<br>');
        } else if(v.idadeMinimaAnos > 0 || v.idadeMinimaMeses > 0) {
            const faixaStr = v.idadeMinimaAnos > 0 && v.idadeMinimaMeses > 0
                ? `${v.idadeMinimaAnos} ano(s) ${v.idadeMinimaMeses} mês(es)`
                : v.idadeMinimaAnos > 0 ? `${v.idadeMinimaAnos} ano(s)` : `${v.idadeMinimaMeses} mês(es)`;
            const nd = v.numDoses || 1;
            idadeMinStr = `${faixaStr} — ${nd} dose${nd > 1 ? 's' : ''}`;
        } else {
            idadeMinStr = 'Sem restrição';
        }

        const ativo = v.ativo !== false;
const est = (typeof getVaccineEstoque === 'function') ? getVaccineEstoque(v.id) : { disponivel:0, reservado:0 };
        const estCls = est.disponivel <= 0 ? 'bg-red-100 text-red-700' : est.disponivel <= (v.estoqueMinimo || 5) ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
        const today = new Date(); today.setHours(0,0,0,0);
        const twoMonths = new Date(); twoMonths.setMonth(twoMonths.getMonth() + 2); twoMonths.setHours(0,0,0,0);
        const lotesAbertos = (typeof vaccineLots !== 'undefined') ? vaccineLots.filter(l => l.vaccineId == v.id && l.status === 'aberto') : [];
        const totalLotes = lotesAbertos.length;
        const lotesVencendo = lotesAbertos.filter(l => { if (!l.validade) return false; const d = new Date(l.validade + 'T00:00:00'); return d >= today && d <= twoMonths; }).length;
        const lotesVencidos = lotesAbertos.filter(l => l.validade && new Date(l.validade + 'T00:00:00') < today).length;
        const avencerCls = lotesVencidos > 0 ? 'bg-red-100 text-red-700' : lotesVencendo > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';
        const avencerVal = lotesVencidos > 0 ? `${lotesVencidos} vencido${lotesVencidos > 1 ? 's' : ''}` : lotesVencendo > 0 ? `${lotesVencendo} lote${lotesVencendo > 1 ? 's' : ''}` : '—';
        tbody.innerHTML += `<tr class="hover:bg-slate-50 transition ${!ativo ? 'opacity-50' : ''}">
            <td class="p-3 font-bold text-slate-700">${v.nome}${v.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case ml-1.5">${v.mnemonico}</span>` : ''}</td>
            <td class="p-3 text-xs">${idadeMinStr}</td>
            <td class="p-3 text-xs font-bold text-green-600">${formatCurrency(v.valor)}</td>
            <td class="p-3 text-center">
                <span class="px-2.5 py-1 rounded-full text-xs font-black ${totalLotes > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}">${totalLotes}</span>
            </td>
            <td class="p-3 text-center">
                <span class="px-2.5 py-1 rounded-full text-xs font-black ${avencerCls}">${avencerVal}</span>
            </td>
            <td class="p-3 text-center">
                <span class="px-2.5 py-1 rounded-full text-xs font-black ${estCls}">${est.disponivel + est.reservado}</span>
                ${est.reservado > 0 ? `<span class="block text-[9px] text-indigo-500 font-bold mt-0.5">${est.reservado} reserv.</span>` : ''}
            </td>
            <td class="p-3 text-center">
                <span class="px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-600">${v.estoqueMinimo || 5}</span>
            </td>
            <td class="p-3 text-center">
                <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase ${ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">${ativo ? 'Ativa' : 'Inativa'}</span>
            </td>
            <td class="p-3 text-center">
                <div class="flex justify-center gap-2">
                    ${permBtn('criar_produtos', `<button onclick="editVaccine(${v.id})" class="h-8 w-8 bg-slate-100 hover:bg-clinic-600 hover:text-white rounded transition shadow-sm" title="Editar"><i class="fas fa-pen text-[10px]"></i></button>`)}
                    ${permBtn('edicao_lotes', `<button onclick="openVaccineViewModal(${v.id})" class="h-8 w-8 bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white rounded transition shadow-sm" title="Ver Estoque"><i class="fas fa-chart-bar text-[10px]"></i></button>`)}
                    ${permBtn('criar_produtos', `<button onclick="toggleVaccineStatus(${v.id})" class="h-8 w-8 ${ativo ? 'bg-green-50 text-green-600 hover:bg-green-500' : 'bg-orange-50 text-orange-500 hover:bg-orange-500'} hover:text-white rounded transition shadow-sm" title="${ativo ? 'Desativar' : 'Ativar'}"><i class="fas ${ativo ? 'fa-toggle-on' : 'fa-toggle-off'} text-[10px]"></i></button>`)}

                </div>
            </td>
        </tr>`;
    });
    populateVaccineSelects();
}

// ─── ESQUEMAS VACINAIS POR FAIXA ETÁRIA ───────────────────────────────────────
function formatFaixaEtaria(esq) {
    const minStr = esq.minAnos > 0 && esq.minMeses > 0 ? `${esq.minAnos}a ${esq.minMeses}m`
        : esq.minAnos > 0 ? `${esq.minAnos} ano(s)`
        : esq.minMeses > 0 ? `${esq.minMeses} mês(es)`
        : '0 meses';
    const hasMax = esq.maxAnos != null && esq.maxAnos !== '' || esq.maxMeses != null && esq.maxMeses !== '';
    if (!hasMax) return `A partir de ${minStr}`;
    const maxStr = (esq.maxAnos > 0 && esq.maxMeses > 0) ? `${esq.maxAnos}a ${esq.maxMeses}m`
        : esq.maxAnos > 0 ? `${esq.maxAnos} ano(s)`
        : `${esq.maxMeses} mês(es)`;
    return `${minStr} até ${maxStr}`;
}

function renderEsquemas() {
    const container = document.getElementById('container-esquemas');
    const hint = document.getElementById('esquemas-empty-hint');
    if (!_esquemas.length) { container.innerHTML = ''; hint.classList.remove('hidden'); return; }
    hint.classList.add('hidden');
    container.innerHTML = _esquemas.map((esq, idx) => {
        const faixaStr = esq.minAnos != null ? formatFaixaEtaria(esq) : 'Faixa não definida';
        const hasFaixa = esq.minAnos != null;
        const numD = esq.numDoses === 0 ? 0 : (esq.numDoses || 1);
        // "0 doses" (somente reforço) só é ofertado quando existe um único esquema.
        const permiteZero = _esquemas.length === 1;
        let intervalosHtml = '';
        if (numD > 1) {
            const cols = numD - 1 === 1 ? 'grid-cols-1' : numD - 1 === 2 ? 'grid-cols-2' : 'grid-cols-3';
            intervalosHtml = `<div class="grid ${cols} gap-2 mt-2">`;
            for (let i = 2; i <= numD; i++) {
                const val = esq.intervalos && esq.intervalos[i-2] != null ? esq.intervalos[i-2] : 30;
                intervalosHtml += `<div><label class="block text-[9px] font-bold text-slate-400 mb-0.5">D${i-1}→D${i}</label><input type="number" min="1" value="${val}" onchange="updateEsquemaIntervalo(${idx},${i-1},this.value)" class="w-full border border-slate-200 rounded py-1 px-2 text-xs focus:ring-1 focus:ring-clinic-500 outline-none"></div>`;
            }
            intervalosHtml += '</div>';
        }
        return `<div class="border-2 ${hasFaixa ? 'border-blue-300' : 'border-slate-200'} rounded-xl p-3 bg-white shadow-sm">
            <div class="flex items-center gap-2 min-w-0">
                <button type="button" onclick="openFaixaEtariaModal(${idx})" class="flex-shrink-0 flex items-center gap-1.5 border-2 ${hasFaixa ? 'border-green-400 text-green-700 bg-green-50 hover:bg-green-100' : 'border-slate-300 text-slate-500 hover:bg-slate-50'} text-[10px] font-black uppercase px-2.5 py-1 rounded-lg transition">
                    <i class="fas fa-child text-[9px]"></i>
                    <span class="whitespace-nowrap">${hasFaixa ? faixaStr : 'Faixa etária'}</span>
                </button>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Doses:</label>
                    <select onchange="updateEsquemaDoses(${idx},this.value)" class="border border-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-clinic-500 outline-none">
                        ${permiteZero ? `<option value="0" ${numD===0?'selected':''}>0</option>` : ''}
                        <option value="1" ${numD==1?'selected':''}>1</option>
                        <option value="2" ${numD==2?'selected':''}>2</option>
                        <option value="3" ${numD==3?'selected':''}>3</option>
                        <option value="4" ${numD==4?'selected':''}>4</option>
                    </select>
                </div>
                ${numD === 1 ? (() => {
                    const repete = esq.repete || false;
                    const repeteKnobClass = repete ? 'translate-x-4' : 'translate-x-0.5';
                    const repeteBgClass = repete ? 'bg-clinic-600' : 'bg-slate-300';
                    return `<div class="flex items-center gap-1 flex-shrink-0">
                        <label class="text-[10px] font-bold text-slate-400 uppercase">Repete</label>
                        <button type="button" onclick="toggleEsquemaRepete(${idx})" class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${repeteBgClass}" aria-pressed="${repete}">
                            <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${repeteKnobClass}"></span>
                        </button>
                        ${repete ? `<input type="number" min="1" value="${esq.repeteMeses || ''}" placeholder="Mês" onchange="updateEsquemaRepeteMeses(${idx},this.value)" class="w-14 border border-slate-200 rounded py-1 px-1.5 text-xs focus:ring-1 focus:ring-clinic-500 outline-none" title="Repetir após quantos meses">` : ''}
                    </div>`;
                })() : ''}
                <div class="flex-1"></div>
                <button type="button" onclick="removeEsquema(${idx})" class="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition" title="Remover esquema"><i class="fas fa-trash text-[10px]"></i></button>
            </div>
            ${intervalosHtml}
            ${numD === 0 ? `<p class="mt-2 text-[10px] font-bold text-indigo-600 leading-snug"><i class="fas fa-circle-info mr-1"></i>Somente reforço: nenhuma dose primária. Obrigatório cadastrar ao menos 1 reforço, e o 1º reforço é a dose atual (sem intervalo em meses).</p>` : ''}
        </div>`;
    }).join('');
}

function addEsquemaVacinal() {
    // 0 doses só existe com esquema único: ao adicionar um segundo, o esquema
    // "somente reforço" volta para 1 dose.
    _esquemas.forEach(esq => { if (esquemaSemDoses(esq)) { esq.numDoses = 1; esq.intervalos = []; } });
    _esquemas.push({ minAnos: null, minMeses: null, maxAnos: null, maxMeses: null, numDoses: 1, intervalos: [] });
    renderEsquemas();
    renderReforcos();
}

function removeEsquema(idx) {
    _esquemas.splice(idx, 1);
    renderEsquemas();
    renderReforcos();
}

function updateEsquemaDoses(idx, val) {
    const n = Number(val);
    _esquemas[idx].numDoses = n;
    if (n === 0) {
        _esquemas[idx].intervalos = [];
        _esquemas[idx].repete = false;
        _esquemas[idx].repeteMeses = null;
        // Somente reforço exige ao menos 1 reforço; o 1º não tem intervalo em meses.
        if (!_reforcos.length) _reforcos.push({ meses: null, doseAtual: true });
        _reforcos[0].meses = null;
        _reforcos[0].doseAtual = true;
        renderEsquemas();
        renderReforcos();
        return;
    }
    // Saiu de "somente reforço": o 1º reforço volta a aceitar aprazamento em meses.
    if (_reforcos.length) _reforcos[0].doseAtual = false;
    if (!_esquemas[idx].intervalos) _esquemas[idx].intervalos = [];
    // Pré-preenche intervalos faltantes com o default exibido na UI (30 dias),
    // garantindo que o modelo salvo == o que o admin vê.
    for (let i = 0; i < n - 1; i++) {
        if (_esquemas[idx].intervalos[i] == null) _esquemas[idx].intervalos[i] = 30;
    }
    _esquemas[idx].intervalos.length = Math.max(0, n - 1);
    if (n !== 1) { _esquemas[idx].repete = false; _esquemas[idx].repeteMeses = null; }
    renderEsquemas();
    renderReforcos();
}

function updateEsquemaIntervalo(idx, posIdx, val) {
    if (!_esquemas[idx].intervalos) _esquemas[idx].intervalos = [];
    _esquemas[idx].intervalos[posIdx - 1] = Number(val);
}

function toggleEsquemaRepete(idx) {
    _esquemas[idx].repete = !(_esquemas[idx].repete || false);
    if (!_esquemas[idx].repete) _esquemas[idx].repeteMeses = null;
    renderEsquemas();
}

function updateEsquemaRepeteMeses(idx, val) {
    _esquemas[idx].repeteMeses = Number(val) || null;
}

function openFaixaEtariaModal(idx) {
    const esq = _esquemas[idx];
    document.getElementById('faixa-etaria-target-idx').value = idx;
    document.getElementById('faixa-min-anos').value = esq.minAnos != null ? esq.minAnos : 0;
    document.getElementById('faixa-min-meses').value = esq.minMeses != null ? esq.minMeses : 0;
    document.getElementById('faixa-max-anos').value = esq.maxAnos != null ? esq.maxAnos : '';
    document.getElementById('faixa-max-meses').value = esq.maxMeses != null ? esq.maxMeses : '';
    document.getElementById('modal-faixa-etaria').classList.add('active');
}

function confirmarFaixaEtaria() {
    const idx = Number(document.getElementById('faixa-etaria-target-idx').value);
    const minAnos = Number(document.getElementById('faixa-min-anos').value) || 0;
    const minMeses = Number(document.getElementById('faixa-min-meses').value) || 0;
    const maxAnosRaw = document.getElementById('faixa-max-anos').value;
    const maxMesesRaw = document.getElementById('faixa-max-meses').value;
    _esquemas[idx].minAnos = minAnos;
    _esquemas[idx].minMeses = minMeses;
    _esquemas[idx].maxAnos = maxAnosRaw !== '' ? Number(maxAnosRaw) : null;
    _esquemas[idx].maxMeses = maxMesesRaw !== '' ? Number(maxMesesRaw) : null;
    document.getElementById('modal-faixa-etaria').classList.remove('active');
    renderEsquemas();
}

// ─── REFORÇOS (até REFORCO_MAX) ───────────────────────────────────────────────
function renderReforcos() {
    const container = document.getElementById('container-reforcos');
    const hint = document.getElementById('reforcos-empty-hint');
    const btnAdd = document.getElementById('btn-add-reforco');
    if (!container) return;
    // Esquema somente reforço (0 doses): o 1º reforço é a dose atual, sem intervalo.
    const somenteReforco = _esquemas.length === 1 && esquemaSemDoses(_esquemas[0]);
    if (!_reforcos.length) { container.innerHTML = ''; if (hint) hint.classList.remove('hidden'); }
    else {
        if (hint) hint.classList.add('hidden');
        container.innerHTML = _reforcos.map((r, idx) => {
            const isDoseAtual = idx === 0 && (somenteReforco || !!r.doseAtual);
            const campoHtml = isDoseAtual
                ? `<span class="text-[10px] font-black text-indigo-600 uppercase">Dose atual — sem intervalo em meses</span>`
                : `<label class="text-[10px] font-black text-slate-400 uppercase">Após</label>
            <input type="number" min="1" step="1" placeholder="12" inputmode="numeric" value="${r.meses != null ? r.meses : ''}" onchange="updateReforcoMeses(${idx}, this.value)" class="w-16 border border-slate-200 rounded-lg py-1.5 px-2 focus:ring-2 focus:ring-clinic-500 outline-none text-sm font-bold text-center">
            <span class="text-[10px] font-black text-slate-400 uppercase">meses (opcional)</span>`;
            const removivel = !(isDoseAtual && _reforcos.length === 1);
            return `<div class="flex items-center gap-2 border-2 border-indigo-200 rounded-xl p-2.5 bg-indigo-50/40">
            <span class="flex-shrink-0 text-[10px] font-black text-indigo-700 uppercase px-2 py-1 bg-white rounded-lg border border-indigo-200">${reforcoLabel(idx + 1)}</span>
            ${campoHtml}
            <div class="flex-1"></div>
            ${removivel ? `<button type="button" onclick="removeReforco(${idx})" class="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition" title="Remover reforço"><i class="fas fa-trash text-[10px]"></i></button>` : `<span class="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-300" title="Obrigatório no esquema somente reforço"><i class="fas fa-lock text-[10px]"></i></span>`}
        </div>`;
        }).join('');
    }
    if (btnAdd) btnAdd.disabled = _reforcos.length >= REFORCO_MAX;
}

function addReforco() {
    if (_reforcos.length >= REFORCO_MAX) return;
    _reforcos.push({ meses: null, doseAtual: false });
    renderReforcos();
}

function removeReforco(idx) {
    const somenteReforco = _esquemas.length === 1 && esquemaSemDoses(_esquemas[0]);
    if (somenteReforco && idx === 0 && _reforcos.length === 1) {
        showNotification('Esquema com 0 doses exige ao menos 1 reforço.', 'error');
        return;
    }
    _reforcos.splice(idx, 1);
    renderReforcos();
}

function updateReforcoMeses(idx, val) {
    const somenteReforco = _esquemas.length === 1 && esquemaSemDoses(_esquemas[0]);
    if (somenteReforco && idx === 0) { _reforcos[0].meses = null; return; }
    _reforcos[idx].meses = parseInt(val, 10) || null;
}

function _setDoseZero(on) {
    const btn  = document.getElementById('btn-dose-zero-toggle');
    const knob = document.getElementById('btn-dose-zero-knob');
    const inp  = document.getElementById('vac-dose-zero');
    const wrap = document.getElementById('dose-zero-idade-wrap');
    if (!btn) return;
    if (on) {
        btn.classList.replace('bg-slate-200', 'bg-indigo-600');
        knob.classList.replace('translate-x-1', 'translate-x-6');
        btn.setAttribute('aria-pressed', 'true');
        inp.value = '1';
        if (wrap) { wrap.classList.remove('hidden'); wrap.classList.add('flex'); }
    } else {
        btn.classList.replace('bg-indigo-600', 'bg-slate-200');
        knob.classList.replace('translate-x-6', 'translate-x-1');
        btn.setAttribute('aria-pressed', 'false');
        inp.value = '0';
        if (wrap) { wrap.classList.add('hidden'); wrap.classList.remove('flex'); }
        const anosInp = document.getElementById('vac-dose-zero-anos');
        const mesesInp = document.getElementById('vac-dose-zero-meses');
        if (anosInp) anosInp.value = '';
        if (mesesInp) mesesInp.value = '';
    }
}
function toggleDoseZero() { _setDoseZero(document.getElementById('vac-dose-zero').value !== '1'); }


function openVaccineModal() {
    if (!checkPerm('criar_produtos')) return;
    document.getElementById('vacina-form').reset();
    document.getElementById('vac-id').value = '';
    _setDoseZero(false);
    _esquemas = [];
    renderEsquemas();
    _reforcos = [];
    renderReforcos();
    const btnDel = document.getElementById('btn-delete-vacina');
    if (btnDel) btnDel.classList.add('hidden');
    document.getElementById('modal-vacina').classList.add('active');
}

function editVaccine(id) {
    if (!checkPerm('criar_produtos')) return;
    const v = vaccines.find(x=>x.id==id); if(!v) return;
    document.getElementById('vac-id').value = v.id;
    document.getElementById('vac-nome').value = v.nome;
    document.getElementById('vac-mnemonico').value = v.mnemonico || '';
    _reforcos = getVaccineReforcos(v).map(r => ({
        meses: r.meses != null ? r.meses : null,
        doseAtual: !!r.doseAtual
    }));
    _setDoseZero(v.doseZero);
    document.getElementById('vac-dose-zero-anos').value = v.doseZeroMinAnos != null ? v.doseZeroMinAnos : '';
    document.getElementById('vac-dose-zero-meses').value = v.doseZeroMinMeses != null ? v.doseZeroMinMeses : '';
    document.getElementById('vac-valor').value = String(v.valor || '').replace('R$', '').trim();
    document.getElementById('vac-estoque-minimo').value = v.estoqueMinimo != null ? v.estoqueMinimo : '';
    if (v.esquemas && v.esquemas.length) {
        _esquemas = JSON.parse(JSON.stringify(v.esquemas));
    } else {
        const intervalos = v.intervalos && v.intervalos.length ? v.intervalos : (v.intervaloDias > 0 ? [v.intervaloDias] : []);
        _esquemas = [{ minAnos: v.idadeMinimaAnos || 0, minMeses: v.idadeMinimaMeses || 0, maxAnos: null, maxMeses: null, numDoses: v.numDoses || 1, intervalos }];
    }
    renderEsquemas();
    // Depois dos esquemas: o layout do 1º reforço depende de haver esquema com 0 doses.
    renderReforcos();
    const btnDel = document.getElementById('btn-delete-vacina');
    if (btnDel) {
        const canDel = isCurrentUserAdmin() || hasPerm('criar_produtos');
        const inUse = appointments.some(a => a.vaccineId == id);
        btnDel.classList.toggle('hidden', !canDel || inUse);
    }
    document.getElementById('modal-vacina').classList.add('active');
}

function deleteVaccineFromModal() {
    const id = document.getElementById('vac-id').value;
    if (!id) return;
    deleteVaccine(Number(id));
    document.getElementById('modal-vacina').classList.remove('active');
}

function saveVaccine(e) {
    e.preventDefault();
    if (!_esquemas.length) { showNotification('Adicione ao menos um esquema vacinal antes de salvar.', 'error'); return; }
    if (_esquemas.some(esq => esq.repete && !esq.repeteMeses)) { showNotification('Informe o intervalo em meses para o campo "Repete" antes de salvar.', 'error'); return; }
    // Somente reforço (0 doses): permitido apenas com esquema único e ao menos 1 reforço.
    const somenteReforco = _esquemas.length === 1 && esquemaSemDoses(_esquemas[0]);
    if (_esquemas.some(esquemaSemDoses) && !somenteReforco) {
        showNotification('Esquema com 0 doses só é permitido quando há um único esquema vacinal.', 'error'); return;
    }
    if (somenteReforco && !_reforcos.length) {
        showNotification('Esquema com 0 doses exige ao menos 1 reforço.', 'error'); return;
    }
    if (somenteReforco) _reforcos[0].meses = null; // 1º reforço = dose atual
    // Dose única = inferida automaticamente: algum esquema tem apenas 1 dose
    const doseUnica = _esquemas.some(esq => (esq.numDoses || 1) === 1 && !esquemaSemDoses(esq));
    const id = document.getElementById('vac-id').value;
    const existing = vaccines.find(x => x.id == id);
    // Normaliza intervalos de cada esquema: preenche slots faltantes com 30 (default UI)
    // para que o que foi exibido seja de fato persistido.
    _esquemas.forEach(esq => {
        const nd = esquemaSemDoses(esq) ? 0 : (esq.numDoses || 1);
        if (!esq.intervalos) esq.intervalos = [];
        for (let i = 0; i < nd - 1; i++) {
            if (esq.intervalos[i] == null) esq.intervalos[i] = 30;
        }
        esq.intervalos.length = Math.max(0, nd - 1);
    });
    // numDoses e intervalos derivados do maior esquema (retrocompatibilidade com agendamentos)
    const _nd = esq => esquemaSemDoses(esq) ? 0 : (esq.numDoses || 1);
    const maiorEsquema = _esquemas.length ? _esquemas.reduce((a, b) => _nd(b) > _nd(a) ? b : a, _esquemas[0]) : null;
    const n = maiorEsquema ? _nd(maiorEsquema) : 1;
    const intervalosBase = maiorEsquema && maiorEsquema.intervalos && maiorEsquema.intervalos.length ? maiorEsquema.intervalos : [];
    // Retrocompatibilidade de idadeMinima
    const primeiroEsquema = _esquemas.find(esq => esq.minAnos != null);
    const idadeMinimaAnos = primeiroEsquema ? (primeiroEsquema.minAnos || 0) : 0;
    const idadeMinimaMeses = primeiroEsquema ? (primeiroEsquema.minMeses || 0) : 0;
    // meses: 0 (não null) para reforço sem aprazamento — o Firebase remove chaves
    // nulas e um reforço {meses:null} seria apagado do array ao salvar, sumindo da
    // tela. 0 é gravado normalmente e lido como "sem intervalo em meses".
    const reforcos = _reforcos.slice(0, REFORCO_MAX).map((r, i) => ({
        meses: r.meses != null ? r.meses : 0,
        // Marca explícita do 1º reforço que É a dose atual (esquema com 0 doses).
        doseAtual: somenteReforco && i === 0
    }));
    const v = {
        id: id ? Number(id) : Date.now(), nome: document.getElementById('vac-nome').value.toUpperCase(),
        mnemonico: document.getElementById('vac-mnemonico').value.toUpperCase().trim() || null,
        numDoses: n, intervalos: intervalosBase, intervaloDias: intervalosBase[0] || 0,
        reforcos,
        // Legado: mantidos derivados do 1º reforço para compatibilidade.
        reforco: reforcos.length > 0,
        reforcoMeses: reforcos.length > 0 ? reforcos[0].meses : null,
        doseUnica,
        doseZero: document.getElementById('vac-dose-zero').value === '1',
        doseZeroMinAnos: document.getElementById('vac-dose-zero').value === '1'
            ? (parseInt(document.getElementById('vac-dose-zero-anos').value, 10) || 0) : null,
        doseZeroMinMeses: document.getElementById('vac-dose-zero').value === '1'
            ? (parseInt(document.getElementById('vac-dose-zero-meses').value, 10) || 0) : null,
        idadeMinimaAnos, idadeMinimaMeses,
        esquemas: JSON.parse(JSON.stringify(_esquemas)),
        valor: document.getElementById('vac-valor').value,
        estoqueMinimo: parseInt(document.getElementById('vac-estoque-minimo').value, 10) || 5,
        ativo: existing ? (existing.ativo !== false) : true
    };
    const isNewVac = !id;
    const oldVac = isNewVac ? null : vaccines.find(x => x.id == v.id);
    const _reforcosStr = rs => rs.length ? rs.map((r, i) => `${reforcoLabel(i+1)}${r.meses ? ' após ' + r.meses + 'm' : ''}`).join(', ') : '—';
    const oldVacFlat = oldVac ? {...oldVac, intervalosStr: (oldVac.intervalos||[]).join('/') || '—', reforcoStr: _reforcosStr(getVaccineReforcos(oldVac)), doseUnicaStr: oldVac.doseUnica ? 'Sim' : 'Não'} : null;
    const newVacFlat = {...v, intervalosStr: (v.intervalos||[]).join('/') || '—', reforcoStr: _reforcosStr(reforcos), doseUnicaStr: v.doseUnica ? 'Sim' : 'Não'};
    if(id) vaccines = vaccines.map(x=>x.id==v.id?v:x); else vaccines.push(v);
    const vacChanges = isNewVac ? null : computeChanges(oldVacFlat, newVacFlat, {nome:'Nome', numDoses:'Doses', intervalosStr:'Intervalos', reforcoStr:'Reforço(s)', doseUnicaStr:'Dose Única', idadeMinimaAnos:'Idade Mín. (Anos)', idadeMinimaMeses:'Idade Mín. (Meses)', valor:'Valor'});
    logAudit(isNewVac ? 'Criado' : 'Editado', 'vacina', v.id, v.nome, isNewVac ? `${v.numDoses} dose(s) | Valor: ${v.valor}` : null, vacChanges);
    // Flush imediato (sem esperar o debounce de 300ms): fecha o modal e evita
    // perder a gravação caso o usuário atualize a página logo em seguida.
    if (typeof _fbSaveNow === 'function') _fbSaveNow(); else saveAll();
    renderVaccines(); updateExpiryBadge(); closeModals(); showNotification('Vacina salva!','success');
}

function toggleVaccineStatus(id) {
    if (!checkPerm('criar_produtos')) return;
    const idx = vaccines.findIndex(x => x.id == id);
    if(idx < 0) return;
    const wasAtivo = vaccines[idx].ativo !== false;
    vaccines[idx].ativo = !wasAtivo;
    logAudit('Editado', 'vacina', vaccines[idx].id, vaccines[idx].nome, `Vacina ${wasAtivo ? 'desativada' : 'ativada'}`);
    saveAll(); renderVaccines();
    showNotification(`Vacina ${wasAtivo ? 'desativada' : 'ativada'} com sucesso!`, wasAtivo ? 'info' : 'success');
}

function deleteVaccine(id) {
    if (!checkPerm('criar_produtos')) return;
    const v = vaccines.find(x => x.id == id);
    if(!v) return;
    const inUse = appointments.some(a => a.vaccineId == id);
    if(inUse) { showNotification('Não é possível excluir: vacina possui agendamentos vinculados. Desative-a em vez de excluir.', 'error'); return; }
    showConfirmDanger(`Excluir a vacina "${v.nome}" permanentemente?`, () => {
        logAudit('Excluído', 'vacina', id, v.nome);
        vaccines = vaccines.filter(x => x.id != id);
        vaccineLots = vaccineLots.filter(l => l.vaccineId != id);
        saveAll(); renderVaccines(); updateExpiryBadge();
        showNotification('Vacina excluída!', 'success');
    });
}

// ─── GESTÃO DE LOTES ──────────────────────────────────────────────────────────
function openLoteModal(vaccineId) {
    currentLoteModalVaccineId = vaccineId;
    const v = vaccines.find(x => x.id == vaccineId);
    document.getElementById('lote-modal-vaccine-name').innerText = v ? v.nome : '';
    document.getElementById('novo-lote-fabricante').value = '';
    document.getElementById('novo-lote-fabnome').value = '';
    document.getElementById('novo-lote-numero').value = '';
    document.getElementById('novo-lote-validade').value = '';
    document.getElementById('novo-lote-custo').value = '';
    if (typeof aplicarVisibilidadeCusto === 'function') aplicarVisibilidadeCusto();
    atualizarCustoUnitPreview('novo');
    switchLoteTab('abertos');
    document.getElementById('modal-lotes').classList.add('active');
}

function switchLoteTab(tab) {
    document.getElementById('lote-abertos-list').classList.toggle('hidden', tab !== 'abertos');
    document.getElementById('lote-fechados-list').classList.toggle('hidden', tab !== 'fechados');
    const btnAbertos = document.getElementById('tab-lote-abertos');
    const btnFechados = document.getElementById('tab-lote-fechados');
    if (tab === 'abertos') {
        btnAbertos.className = 'flex-1 py-3 text-xs font-black uppercase tracking-widest text-green-700 bg-white border-b-2 border-green-500 transition';
        btnFechados.className = 'flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 border-b-2 border-transparent transition';
    } else {
        btnFechados.className = 'flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-600 bg-white border-b-2 border-slate-500 transition';
        btnAbertos.className = 'flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 border-b-2 border-transparent transition';
    }
    renderLoteLists();
}

function renderLoteLists() {
    const abertos = vaccineLots.filter(l => l.vaccineId == currentLoteModalVaccineId && l.status === 'aberto').sort((a, b) => new Date(a.validade) - new Date(b.validade));
    const fechados = vaccineLots.filter(l => l.vaccineId == currentLoteModalVaccineId && l.status === 'fechado');
    const today = new Date(); today.setHours(0,0,0,0);
    const twoMonths = new Date(); twoMonths.setMonth(twoMonths.getMonth() + 2);

    function lotCard(l, isAberto) {
        const exp = new Date(l.validade + 'T00:00:00');
        const expired = exp < today;
        const nearExpiry = !expired && exp <= twoMonths;
        const emUso = appointments.some(a => a.loteId == l.id || a.loteNumero === l.numero);
        const est = (typeof getLoteEstoque === 'function') ? getLoteEstoque(l.id) : { disponivel:'—', reservado:'—', total:'—' };
        const custo = (typeof getLoteCusto === 'function' && canSeeCusto()) ? getLoteCusto(l.id) : null;
        let badgeHtml = '';
        if (expired) badgeHtml = `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-600">VENCIDO</span>`;
        else if (nearExpiry) badgeHtml = `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-600">VENCENDO</span>`;
        return `
        <div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer" onclick="editLote(${l.id})">
            <div>
                <p class="font-black text-navy-900 text-sm">Lote: ${l.numero}</p>
                ${(l.fabricante || l.fabricanteNome || l.fornecedor) ? `<p class="text-[10px] text-slate-400 font-bold mt-0.5">${[l.fabricante, l.fabricanteNome, l.fornecedor].filter(Boolean).join(' · ')}</p>` : ''}
                <p class="text-[10px] text-slate-500 font-bold ${(l.fabricante || l.fabricanteNome || l.fornecedor) ? '' : 'mt-0.5'}">Validade: ${l.validade.split('-').reverse().join('/')} ${badgeHtml}</p>
                <p class="text-[10px] font-bold mt-1 flex gap-2">
                    <span class="text-green-600"><i class="fas fa-box-open mr-0.5"></i>Disp: ${est.disponivel}</span>
                    <span class="text-indigo-600"><i class="fas fa-lock mr-0.5"></i>Reserv: ${est.reservado}</span>
                    <span class="text-slate-400"><i class="fas fa-layer-group mr-0.5"></i>Total: ${est.disponivel + est.reservado}</span>
                </p>
                ${custo ? `<p class="text-[10px] font-bold mt-0.5 text-amber-600"><i class="fas fa-tag mr-0.5"></i>Custo unitário: ${custo.informado ? `${fmtCusto(custo.unit)}/dose` : '—'}</p>` : ''}
                ${emUso ? '<p class="text-[9px] text-slate-400 font-bold mt-0.5"><i class="fas fa-link mr-1"></i>Em uso em agendamentos</p>' : ''}
            </div>
            <div class="flex gap-2" onclick="event.stopPropagation()">
                ${isAberto
                    ? permBtn('edicao_lotes', `<button onclick="toggleLoteStatus(${l.id},'fechado')" class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black hover:bg-slate-200 transition" title="Fechar lote"><i class="fas fa-lock mr-1"></i>Fechar</button>`)
                    : permBtn('edicao_lotes', `<button onclick="toggleLoteStatus(${l.id},'aberto')" class="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-[10px] font-black hover:bg-green-100 transition" title="Abrir lote"><i class="fas fa-lock-open mr-1"></i>Abrir</button>`)
                }
                ${!emUso ? permBtn('edicao_lotes', `<button onclick="deleteLote(${l.id})" class="h-7 w-7 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-[10px] flex items-center justify-center transition"><i class="fas fa-trash"></i></button>`) : ''}
            </div>
        </div>`;
    }

    const aEl = document.getElementById('lote-abertos-list');
    const fEl = document.getElementById('lote-fechados-list');
    aEl.innerHTML = abertos.length ? abertos.map(l => lotCard(l, true)).join('') : '<p class="text-center text-slate-400 text-sm py-6 font-bold">Nenhum lote aberto.</p>';
    fEl.innerHTML = fechados.length ? fechados.map(l => lotCard(l, false)).join('') : '<p class="text-center text-slate-400 text-sm py-6 font-bold">Nenhum lote fechado.</p>';
}

function addLote() {
    if (!checkPerm('edicao_lotes')) return;
    const fabricante = document.getElementById('novo-lote-fabricante').value.trim();
    const fabricanteNome = document.getElementById('novo-lote-fabnome').value.trim();
    const numero = document.getElementById('novo-lote-numero').value.trim().toUpperCase();
    const validade = document.getElementById('novo-lote-validade').value;
    const quantidade = parseInt(document.getElementById('novo-lote-qtd').value, 10) || 0;
    const fornecedor = document.getElementById('novo-lote-fornecedor').value.trim();
    const nota = document.getElementById('novo-lote-nota').value.trim();
    const custoUnit = (typeof canSeeCusto === 'function' && canSeeCusto()) ? parseCusto(document.getElementById('novo-lote-custo').value) : null;
    if (!numero || !validade) { showNotification('Informe o número do lote e a validade.', 'error'); return; }
    if (custoUnit != null && custoUnit < 0) { showNotification('O custo unitário não pode ser negativo.', 'error'); return; }
    if (quantidade <= 0) { showNotification('Informe a quantidade inicial do lote (maior que zero).', 'error'); return; }
    if (!currentLoteModalVaccineId) return;
    const newId = Date.now();
    const novoLote = { id: newId, vaccineId: currentLoteModalVaccineId, numero, fabricante, fabricanteNome, validade, status: 'aberto', fornecedor, nota };
    // Custo é gravado como unitário (valor de uma dose); o total é derivado
    if (custoUnit != null) novoLote.custoUnit = custoUnit;
    vaccineLots.push(novoLote);
    stockMovements.push({ id: newId + 1, loteId: newId, vaccineId: currentLoteModalVaccineId, tipo: 'entrada', qtd: quantidade, motivo: 'Cadastro inicial', descarte: false, data: new Date().toISOString(), usuario: currentUser ? currentUser.nome : '—' });
    const vacLote = vaccines.find(v => v.id == currentLoteModalVaccineId);
    logAudit('Criado', 'lote', String(currentLoteModalVaccineId), `Lote ${numero}`, `Vacina: ${vacLote ? vacLote.nome : '—'} | Validade: ${validade} | Qtd inicial: ${quantidade}${fabricanteNome ? ' | Fabricante: ' + fabricanteNome : ''}${fornecedor ? ' | Fornecedor: ' + fornecedor : ''}${nota ? ' | NF: ' + nota : ''}${custoUnit != null ? ' | Custo unitário: ' + fmtCusto(custoUnit) : ''}`);
    document.getElementById('novo-lote-fabricante').value = '';
    document.getElementById('novo-lote-fabnome').value = '';
    document.getElementById('novo-lote-numero').value = '';
    document.getElementById('novo-lote-validade').value = '';
    document.getElementById('novo-lote-qtd').value = '';
    document.getElementById('novo-lote-fornecedor').value = '';
    document.getElementById('novo-lote-nota').value = '';
    document.getElementById('novo-lote-custo').value = '';
    atualizarCustoUnitPreview('novo');
    saveAll(); renderLoteLists(); updateExpiryBadge();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    showNotification('Lote cadastrado com sucesso!', 'success');
}

function toggleLoteStatus(loteId, newStatus) {
    if (!checkPerm('edicao_lotes')) return;
    if (newStatus === 'fechado') {
        const lote = vaccineLots.find(l => l.id == loteId);
        const vac  = lote ? vaccines.find(v => v.id == lote.vaccineId) : null;
        if (typeof getLoteEstoque === 'function') {
            const est = getLoteEstoque(loteId);
            if (est.disponivel > 0) {
                showNotification(`Não é possível fechar: o lote ${lote ? lote.numero : ''} ainda possui ${est.disponivel} unidade(s) disponíveis. Zere o estoque antes de fechar.`, 'error');
                return;
            }
        }
        document.getElementById('fechar-lote-numero').textContent   = lote ? lote.numero : '—';
        document.getElementById('fechar-lote-vacina').textContent   = vac  ? vac.nome   : '—';
        document.getElementById('fechar-lote-validade').textContent = lote ? lote.validade.split('-').reverse().join('/') : '—';
        document.getElementById('btn-confirmar-fechar-lote').onclick = () => {
            document.getElementById('modal-fechar-lote-aviso').classList.remove('active');
            const idx = vaccineLots.findIndex(l => l.id == loteId);
            if (idx > -1) {
                vaccineLots[idx].status = 'fechado';
                logAudit('Editado', 'lote', String(vaccineLots[idx].vaccineId), `Lote ${vaccineLots[idx].numero}`, 'Lote fechado');
                saveAll(); renderLoteLists(); updateExpiryBadge(); showNotification('Lote fechado com sucesso!', 'success');
            }
        };
        document.getElementById('modal-fechar-lote-aviso').classList.add('active');
        return;
    }
    const idx = vaccineLots.findIndex(l => l.id == loteId);
    if (idx > -1) {
        vaccineLots[idx].status = 'aberto';
        logAudit('Editado', 'lote', String(vaccineLots[idx].vaccineId), `Lote ${vaccineLots[idx].numero}`, 'Lote aberto');
        saveAll(); renderLoteLists(); updateExpiryBadge(); showNotification('Lote aberto com sucesso!', 'success');
    }
}

function deleteLote(loteId) {
    if (!checkPerm('edicao_lotes')) return;
    showConfirmDanger('Excluir este lote definitivamente?', () => {
        const lote = vaccineLots.find(l => l.id == loteId);
        const vacLote = lote ? vaccines.find(v => v.id == lote.vaccineId) : null;
        logAudit('Excluído', 'lote', String(lote ? lote.vaccineId : loteId), lote ? `Lote ${lote.numero}` : '—', vacLote ? `Vacina: ${vacLote.nome}` : null);
        vaccineLots = vaccineLots.filter(l => l.id != loteId);
        saveAll(); renderLoteLists(); updateExpiryBadge(); showNotification('Lote excluído.', 'success');
    });
}

let _viewLoteId = null;
let _viewLoteFilter = 'ambos';
let _viewLotePage = 0;
const _VIEW_LOTE_PAGE_SIZE = 10;

function _refreshViewLoteHeader() {
    const l = vaccineLots.find(x => x.id == _viewLoteId);
    if (!l) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const twoMonths = new Date(today); twoMonths.setMonth(twoMonths.getMonth() + 2);
    const exp = l.validade ? new Date(l.validade + 'T00:00:00') : null;
    const vencido  = exp && exp < today;
    const vencendo = exp && !vencido && exp <= twoMonths;
    const header = document.getElementById('view-lote-header');
    header.className = `p-5 text-white shrink-0 ${vencido ? 'bg-gradient-to-br from-red-700 to-red-900' : vencendo ? 'bg-gradient-to-br from-amber-500 to-amber-700' : l.status === 'aberto' ? 'bg-gradient-to-br from-indigo-600 to-indigo-900' : 'bg-gradient-to-br from-slate-600 to-slate-800'}`;
    // botão toggle
    const btn = document.getElementById('view-lote-btn-toggle');
    const canToggle = isCurrentUserAdmin() || hasPerm('edicao_lotes');
    if (btn) {
        btn.classList.toggle('hidden', !canToggle);
        if (l.status === 'aberto') {
            btn.className = 'px-4 py-2.5 font-black rounded-xl transition text-xs uppercase flex items-center gap-2 border bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-600 hover:text-white';
            btn.innerHTML = '<i class="fas fa-lock"></i>Fechar lote';
        } else {
            btn.className = 'px-4 py-2.5 font-black rounded-xl transition text-xs uppercase flex items-center gap-2 border bg-green-50 text-green-700 border-green-200 hover:bg-green-600 hover:text-white';
            btn.innerHTML = '<i class="fas fa-lock-open"></i>Abrir';
        }
    }
}

function editLote(loteId) {
    const l = vaccineLots.find(x => x.id == loteId);
    if (!l) return;
    _viewLoteId = loteId;
    _viewLoteFilter = 'ambos';
    _viewLotePage = 0;
    const v = vaccines.find(x => x.id == l.vaccineId);
    const est = (typeof getLoteEstoque === 'function') ? getLoteEstoque(loteId) : { disponivel: 0, reservado: 0, total: 0 };
    const today = new Date(); today.setHours(0,0,0,0);
    const twoMonths = new Date(today); twoMonths.setMonth(twoMonths.getMonth() + 2);
    const exp = l.validade ? new Date(l.validade + 'T00:00:00') : null;
    const vencido  = exp && exp < today;
    const vencendo = exp && !vencido && exp <= twoMonths;
    const validadeStr = l.validade ? l.validade.split('-').reverse().join('/') : '—';
    const validadeBadge = vencido
        ? `${validadeStr}<span class="block text-[9px] text-red-300 font-black mt-0.5"><i class="fas fa-skull-crossbones mr-1"></i>VENCIDO</span>`
        : vencendo
            ? `${validadeStr}<span class="block text-[9px] text-amber-200 font-black mt-0.5"><i class="fas fa-hourglass-half mr-1"></i>VENCENDO</span>`
            : validadeStr;

    document.getElementById('view-lote-numero').textContent = l.numero || '—';
    document.getElementById('view-lote-vacina').innerHTML = v ? `${v.nome}${v.mnemonico ? ` <span class="inline-flex items-center bg-white/15 text-white/80 border border-white/20 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case">${v.mnemonico}</span>` : ''}` : '—';

    const fabRow  = document.getElementById('view-lote-fabricante-row');
    const fabNomeRow = document.getElementById('view-lote-fabnome-row');
    const fornRow = document.getElementById('view-lote-fornecedor-row');
    const notaRow = document.getElementById('view-lote-nota-row');
    const metaRow = document.getElementById('view-lote-meta-row');
    if (l.fabricante) { document.getElementById('view-lote-fabricante').textContent = l.fabricante; fabRow.classList.remove('hidden'); }
    else { fabRow.classList.add('hidden'); }
    if (l.fabricanteNome) { document.getElementById('view-lote-fabnome').textContent = l.fabricanteNome; fabNomeRow.classList.remove('hidden'); }
    else { fabNomeRow.classList.add('hidden'); }
    if (l.fornecedor) { document.getElementById('view-lote-fornecedor').textContent = l.fornecedor; fornRow.classList.remove('hidden'); }
    else { fornRow.classList.add('hidden'); }
    if (l.nota) { document.getElementById('view-lote-nota').textContent = l.nota; notaRow.classList.remove('hidden'); }
    else { notaRow.classList.add('hidden'); }
    if (l.fabricante || l.fabricanteNome || l.fornecedor || l.nota) { metaRow.classList.remove('hidden'); metaRow.classList.add('flex'); }
    else { metaRow.classList.add('hidden'); metaRow.classList.remove('flex'); }

    document.getElementById('view-lote-disp').textContent = est.disponivel;
    document.getElementById('view-lote-reserv').textContent = est.reservado;
    document.getElementById('view-lote-saida').textContent = est.aplicado + est.saidaManual;
    document.getElementById('view-lote-total').textContent = est.total;
    document.getElementById('view-lote-validade-badge').innerHTML = validadeBadge;

    // Bloco de custo — visível só para admin / permissão de lotes
    const custoRow  = document.getElementById('view-lote-custo-row');
    const podeCusto = (typeof canSeeCusto === 'function') && canSeeCusto();
    if (custoRow) {
        custoRow.classList.toggle('hidden', !podeCusto);
        if (podeCusto) {
            const c = getLoteCusto(loteId);
            document.getElementById('view-lote-custo-unit').textContent  = c.informado ? fmtCusto(c.unit) : '—';
            document.getElementById('view-lote-custo-total').textContent = c.informado ? fmtCusto(c.total) : '—';
            document.getElementById('view-lote-custo-estoque').textContent = c.informado ? fmtCusto(c.valorEstoque) : '—';
        }
    }

    _refreshViewLoteHeader();

    // botão excluir: só sem movimentações e agendamentos
    const hasMov = stockMovements.some(m => m.loteId == loteId) || appointments.some(a => a.loteId == loteId);
    const canDel = isCurrentUserAdmin() || hasPerm('edicao_lotes');
    document.getElementById('view-lote-btn-excluir').classList.toggle('hidden', !canDel || hasMov);

    // botão editar
    const canEdit = isCurrentUserAdmin() || hasPerm('edicao_lotes');
    document.getElementById('view-lote-btn-editar').classList.toggle('hidden', !canEdit);

    setViewLoteFilter('ambos');
    document.getElementById('modal-view-lote').classList.add('active');
}

function _buildLoteEventos(loteId) {
    // Movimentações manuais (exclui automáticas vinculadas a agendamentos)
    const manual = stockMovements.filter(m => m.loteId == loteId && !m.appointmentId).map(m => ({
        _tipo: m.tipo === 'entrada' ? 'entrada' : 'saida',
        _subtipo: m.descarte ? 'descarte' : m.tipo === 'entrada' ? 'entrada' : 'ajuste',
        _movId: m.id,
        qtd: m.qtd,
        data: m.data,
        motivo: m.motivo || '',
        usuario: m.usuario || '',
        extra: null
    }));

    // Agendamentos vinculados ao lote
    const appts = appointments.filter(a => a.loteId == loteId).map(a => {
        const pat = patients.find(p => p.id == a.patientId);
        const isAplic = a.status === 'Aplicado';
        const isRes   = a.status === 'Agendado';
        if (!isAplic && !isRes) return null;
        return {
            _tipo: 'saida',
            _subtipo: isAplic ? 'aplicado' : 'reserva',
            _appointmentId: a.id,
            qtd: 1,
            data: isAplic ? (a.dataAplicacao || a.data) : a.data,
            motivo: isAplic ? `Aplicação — ${a.doseAtual || ''}` : `Reserva — ${a.doseAtual || ''}`,
            usuario: isAplic ? (a.aplicador || a.vendedor || '') : (a.vendedor || ''),
            extra: pat ? pat.nome : null,
            _pat: pat,
            _apt: a
        };
    }).filter(Boolean);

    return [...manual, ...appts].sort((a, b) => new Date(b.data) - new Date(a.data));
}

function setViewLoteFilter(f) {
    _viewLoteFilter = f;
    _viewLotePage = 0;
    ['ambos','entrada','saida'].forEach(k => {
        const btn = document.getElementById('vlf-' + k);
        if (!btn) return;
        btn.className = `vlf-btn flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${k === f ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-white'}`;
    });
    renderViewLoteMov();
}

function renderViewLoteMov() {
    const list = document.getElementById('view-lote-mov-list');
    if (!list) return;

    let eventos = _buildLoteEventos(_viewLoteId);
    if (_viewLoteFilter === 'entrada') eventos = eventos.filter(e => e._tipo === 'entrada');
    if (_viewLoteFilter === 'saida')   eventos = eventos.filter(e => e._tipo === 'saida');

    const total = eventos.length;
    const totalPages = Math.max(1, Math.ceil(total / _VIEW_LOTE_PAGE_SIZE));
    _viewLotePage = Math.min(_viewLotePage, totalPages - 1);
    const paginated = eventos.slice(_viewLotePage * _VIEW_LOTE_PAGE_SIZE, (_viewLotePage + 1) * _VIEW_LOTE_PAGE_SIZE);

    if (!total) {
        list.innerHTML = `<p class="text-center text-slate-400 text-xs font-bold py-8"><i class="fas fa-inbox mr-2"></i>Nenhuma movimentação encontrada</p>`;
        return;
    }

    const subtipoCfg = {
        entrada:  { cls: 'bg-emerald-100 text-emerald-700', icon: 'fa-arrow-down',       label: 'Entrada',   sinal: '+', sinalCls: 'text-emerald-600' },
        ajuste:   { cls: 'bg-orange-100 text-orange-700',   icon: 'fa-arrow-up',          label: 'Saída',     sinal: '−', sinalCls: 'text-orange-600' },
        descarte: { cls: 'bg-red-100 text-red-700',         icon: 'fa-trash',             label: 'Descarte',  sinal: '−', sinalCls: 'text-red-600' },
        aplicado: { cls: 'bg-violet-100 text-violet-700',   icon: 'fa-syringe',           label: 'Aplicado',  sinal: '−', sinalCls: 'text-violet-600' },
        reserva:  { cls: 'bg-blue-100 text-blue-700',       icon: 'fa-calendar-check',    label: 'Reservado', sinal: '−', sinalCls: 'text-blue-600' },
    };

    const canEditApt = isCurrentUserAdmin() || hasPerm('agendar') || hasPerm('criar_agendamento');
    const canEditMov = isCurrentUserAdmin() || hasPerm('edicao_movimentacao');

    const cardsHtml = paginated.map(ev => {
        const cfg = subtipoCfg[ev._subtipo] || subtipoCfg.ajuste;
        const dataStr = ev.data ? new Date(ev.data).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        const isApt  = !!ev._appointmentId;
        const isMov  = !!ev._movId && !isApt;
        let acoesBtns = '';
        if (isApt && canEditApt) {
            acoesBtns = `<div class="flex gap-1.5 mt-2">
                <button onclick="viewRecord(${ev._appointmentId})" class="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-indigo-500 hover:text-white rounded-lg text-[10px] font-black uppercase transition"><i class="fas fa-eye text-[9px]"></i>Visualizar</button>
            </div>`;
        } else if (isMov && canEditMov) {
            acoesBtns = `<div class="flex gap-1.5 mt-2">
                <button onclick="openEditMovModal(${ev._movId})" class="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-indigo-500 hover:text-white rounded-lg text-[10px] font-black uppercase transition"><i class="fas fa-pen text-[9px]"></i>Editar</button>
                <button onclick="deleteMovimentacao(${ev._movId})" class="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-lg text-[10px] font-black uppercase transition"><i class="fas fa-trash text-[9px]"></i>Excluir</button>
            </div>`;
        }
        return `<div class="flex items-start gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition">
            <div class="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.cls}">
                <i class="fas ${cfg.icon} text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${cfg.cls}">${cfg.label}</span>
                    <span class="font-black text-base ${cfg.sinalCls}">${cfg.sinal}${ev.qtd}</span>
                </div>
                <p class="text-[10px] text-slate-400 font-bold mt-1">${dataStr}</p>
                ${ev.extra ? `<p class="text-xs font-bold text-slate-700 mt-0.5 truncate"><i class="fas fa-user-circle text-slate-300 mr-1"></i>${ev.extra}</p>` : ''}
                ${ev.motivo ? `<p class="text-xs text-slate-500 mt-0.5 truncate" title="${ev.motivo}"><i class="fas fa-comment-alt text-slate-300 mr-1"></i>${ev.motivo}</p>` : ''}
                ${ev.usuario ? `<p class="text-[10px] text-slate-400 font-bold mt-0.5"><i class="fas fa-user text-slate-300 mr-1"></i>${ev.usuario}</p>` : ''}
                ${acoesBtns}
            </div>
        </div>`;
    }).join('');

    // Paginação
    const paginacaoHtml = totalPages > 1 ? `
        <div class="flex items-center justify-between pt-1 mt-1 border-t border-slate-100">
            <button onclick="_viewLotePage=Math.max(0,_viewLotePage-1);renderViewLoteMov()" ${_viewLotePage === 0 ? 'disabled' : ''}
                class="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition">
                <i class="fas fa-chevron-left text-[10px]"></i>
            </button>
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Página ${_viewLotePage + 1} de ${totalPages} &nbsp;·&nbsp; ${total} registros
            </span>
            <button onclick="_viewLotePage=Math.min(${totalPages-1},_viewLotePage+1);renderViewLoteMov()" ${_viewLotePage >= totalPages - 1 ? 'disabled' : ''}
                class="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition">
                <i class="fas fa-chevron-right text-[10px]"></i>
            </button>
        </div>` : '';

    list.innerHTML = cardsHtml + paginacaoHtml;
}

function toggleLoteFromView() {
    if (!checkPerm('edicao_lotes')) return;
    const l = vaccineLots.find(x => x.id == _viewLoteId);
    if (!l) return;
    const novoStatus = l.status === 'aberto' ? 'fechado' : 'aberto';
    if (novoStatus === 'fechado') {
        if (typeof getLoteEstoque === 'function') {
            const est = getLoteEstoque(_viewLoteId);
            if (est.disponivel > 0) {
                showNotification(`Não é possível fechar: o lote ${l.numero} ainda possui ${est.disponivel} unidade(s) disponíveis. Zere o estoque antes de fechar.`, 'error');
                return;
            }
        }
        // usa o modal de confirmação existente
        const v = vaccines.find(x => x.id == l.vaccineId);
        document.getElementById('fechar-lote-numero').textContent   = l.numero;
        document.getElementById('fechar-lote-vacina').textContent   = v ? v.nome : '—';
        document.getElementById('fechar-lote-validade').textContent = l.validade ? l.validade.split('-').reverse().join('/') : '—';
        document.getElementById('btn-confirmar-fechar-lote').onclick = () => {
            document.getElementById('modal-fechar-lote-aviso').classList.remove('active');
            const idx = vaccineLots.findIndex(x => x.id == _viewLoteId);
            if (idx > -1) {
                vaccineLots[idx].status = 'fechado';
                vaccineLots[idx]._autoFechado = false;
                logAudit('Editado', 'lote', String(vaccineLots[idx].vaccineId), `Lote ${vaccineLots[idx].numero}`, 'Lote fechado');
                saveAll(); renderLoteLists(); renderAlmoxLotes && renderAlmoxLotes(); updateExpiryBadge();
                _refreshViewLoteHeader();
                showNotification('Lote fechado com sucesso!', 'success');
            }
        };
        document.getElementById('modal-fechar-lote-aviso').classList.add('active');
    } else {
        const idx = vaccineLots.findIndex(x => x.id == _viewLoteId);
        if (idx > -1) {
            vaccineLots[idx].status = 'aberto';
            vaccineLots[idx]._autoFechado = false;
            logAudit('Editado', 'lote', String(vaccineLots[idx].vaccineId), `Lote ${vaccineLots[idx].numero}`, 'Lote aberto');
            saveAll(); renderLoteLists(); renderAlmoxLotes && renderAlmoxLotes(); updateExpiryBadge();
            _refreshViewLoteHeader();
            showNotification('Lote aberto com sucesso!', 'success');
        }
    }
}

function editLoteFromView() {
    document.getElementById('modal-view-lote').classList.remove('active');
    const l = vaccineLots.find(x => x.id == _viewLoteId);
    if (!l) return;
    document.getElementById('edit-lote-id').value = l.id;
    document.getElementById('edit-lote-fabricante').value = l.fabricante || '';
    document.getElementById('edit-lote-fabnome').value = l.fabricanteNome || '';
    document.getElementById('edit-lote-numero').value = l.numero;
    document.getElementById('edit-lote-validade').value = l.validade;
    document.getElementById('edit-lote-fornecedor').value = l.fornecedor || '';
    document.getElementById('edit-lote-nota').value = l.nota || '';
    const _cUnit = (typeof getLoteCustoUnit === 'function') ? getLoteCustoUnit(l) : (l.custoUnit != null ? Number(l.custoUnit) : null);
    document.getElementById('edit-lote-custo').value = _cUnit != null ? String(_cUnit).replace('.', ',') : '';
    if (typeof aplicarVisibilidadeCusto === 'function') aplicarVisibilidadeCusto();
    atualizarCustoUnitPreview('edit');
    document.getElementById('modal-edit-lote').classList.add('active');
}

function deleteLoteFromView() {
    document.getElementById('modal-view-lote').classList.remove('active');
    deleteLote(_viewLoteId);
}

let _dlaAppointmentId = null;

function openDeleteLoteAppointment(aptId) {
    if (!checkPerm('excluir_agendamento')) return;
    const a = appointments.find(x => x.id == aptId);
    if (!a) return;
    _dlaAppointmentId = aptId;
    const pat = patients.find(p => p.id == a.patientId);
    const vac = vaccines.find(v => v.id == a.vaccineId);
    const lote = vaccineLots.find(l => l.id == a.loteId);
    const dataStr = a.data ? a.data.split('-').reverse().join('/') : '—';

    document.getElementById('dla-pat-nome').textContent  = pat ? pat.nome : '—';
    document.getElementById('dla-pat-info').textContent  = pat ? `CPF: ${pat.cpf || '—'} · Nasc.: ${pat.dtNasc ? pat.dtNasc.split('-').reverse().join('/') : '—'}` : '—';
    document.getElementById('dla-vac-nome').textContent  = vac ? vac.nome : '—';
    document.getElementById('dla-apt-info').textContent  = `${a.doseAtual || '—'} · ${dataStr}`;
    document.getElementById('dla-apt-status').textContent = a.status || '—';
    document.getElementById('dla-apt-lote').textContent  = lote ? lote.numero : '—';
    document.getElementById('dla-confirm-input').value   = '';
    checkDlaConfirm();
    document.getElementById('modal-delete-lote-apt').classList.add('active');
}

function checkDlaConfirm() {
    const ok = document.getElementById('dla-confirm-input').value.trim().toUpperCase() === 'SIM';
    const btn = document.getElementById('btn-dla-confirm');
    btn.disabled = !ok;
    btn.className = ok
        ? 'flex-1 bg-red-600 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-red-700 cursor-pointer shadow-md'
        : 'flex-1 bg-red-200 text-red-400 font-black py-3 rounded-xl uppercase text-xs transition cursor-not-allowed';
}

function confirmDeleteLoteAppointment() {
    if (!_dlaAppointmentId) return;
    const a = appointments.find(x => x.id == _dlaAppointmentId);
    const pat = a ? patients.find(p => p.id == a.patientId) : null;
    const vac = a ? vaccines.find(v => v.id == a.vaccineId) : null;
    logAudit('Excluído', 'agendamento', _dlaAppointmentId,
        `${pat ? pat.nome : '—'} | ${vac ? vac.nome : '—'} | ${a ? a.doseAtual : ''} | ${a ? a.data : ''}`,
        null, null, a ? a.patientId : null);
    const loteId = a ? a.loteId : null;
    appointments = appointments.filter(x => x.id != _dlaAppointmentId);
    _dlaAppointmentId = null;
    document.getElementById('modal-delete-lote-apt').classList.remove('active');
    if (typeof syncAllLoteStatus === 'function' && loteId) syncAllLoteStatus();
    saveAll();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderTable === 'function') renderTable();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    showNotification('Agendamento excluído com sucesso.', 'success');
}

function salvarEdicaoLote() {
    const id = document.getElementById('edit-lote-id').value;
    const fabricante = document.getElementById('edit-lote-fabricante').value.trim();
    const fabricanteNome = document.getElementById('edit-lote-fabnome').value.trim();
    const numero = document.getElementById('edit-lote-numero').value.trim().toUpperCase();
    const validade = document.getElementById('edit-lote-validade').value;
    const fornecedor = document.getElementById('edit-lote-fornecedor').value.trim();
    const nota = document.getElementById('edit-lote-nota').value.trim();
    const podeCusto = (typeof canSeeCusto === 'function') && canSeeCusto();
    const custoUnit = podeCusto ? parseCusto(document.getElementById('edit-lote-custo').value) : null;
    if (!numero || !validade) { showNotification('Preencha o número e a validade.', 'error'); return; }
    if (custoUnit != null && custoUnit < 0) { showNotification('O custo unitário não pode ser negativo.', 'error'); return; }
    const idx = vaccineLots.findIndex(l => l.id == id);
    if (idx === -1) return;
    const old = {...vaccineLots[idx]};
    const _oldUnit = (typeof getLoteCustoUnit === 'function') ? getLoteCustoUnit(old) : null;
    vaccineLots[idx].fabricante = fabricante;
    vaccineLots[idx].fabricanteNome = fabricanteNome;
    vaccineLots[idx].numero = numero;
    vaccineLots[idx].validade = validade;
    vaccineLots[idx].fornecedor = fornecedor;
    vaccineLots[idx].nota = nota;
    // Só mexe no custo se o usuário tem permissão de vê-lo — do contrário o
    // campo veio vazio por estar oculto e apagaria um valor já cadastrado.
    if (podeCusto) {
        // Formato legado (total + qtd) é descartado ao salvar — passa a valer o unitário
        delete vaccineLots[idx].custoTotal;
        delete vaccineLots[idx].custoQtd;
        if (custoUnit == null) delete vaccineLots[idx].custoUnit;
        else vaccineLots[idx].custoUnit = custoUnit;
    }
    logAudit('Editado', 'lote', String(vaccineLots[idx].vaccineId), `Lote ${numero}`, `Número: ${old.numero}→${numero} | Validade: ${old.validade}→${validade}${fabricanteNome !== (old.fabricanteNome||'') ? ' | Fabricante: →' + fabricanteNome : ''}${fornecedor !== (old.fornecedor||'') ? ' | Fornecedor: →' + fornecedor : ''}${nota !== (old.nota||'') ? ' | NF: →' + nota : ''}${podeCusto && custoUnit !== _oldUnit ? ` | Custo unitário: ${fmtCusto(_oldUnit)}→${fmtCusto(custoUnit)}` : ''}`);
    saveAll(); renderLoteLists(); updateExpiryBadge();
    document.getElementById('modal-edit-lote').classList.remove('active');
    showNotification('Lote atualizado com sucesso!', 'success');
}

// ─── ALERTAS DE VENCIMENTO ───────────────────────────────────────────────────
function getExpiryAlerts() {
    const today = new Date(); today.setHours(0,0,0,0);
    const twoMonths = new Date(); twoMonths.setMonth(twoMonths.getMonth() + 2); twoMonths.setHours(0,0,0,0);
    const alerts = [];
    vaccineLots.filter(l => l.status === 'aberto').forEach(l => {
        const exp = new Date(l.validade + 'T00:00:00');
        const vaccine = vaccines.find(v => v.id == l.vaccineId);
        if (!vaccine) return;
        const daysLeft = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        if (exp < today || exp <= twoMonths) {
            alerts.push({ lot: l, vaccine, expired: exp < today, daysLeft });
        }
    });
    return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
}

function openViewLoteEntrada() {
    document.getElementById('modal-view-lote').classList.remove('active');
    if (typeof openMovimentacaoEntrada === 'function') openMovimentacaoEntrada(_viewLoteId);
}

function openViewLoteSaida() {
    document.getElementById('modal-view-lote').classList.remove('active');
    if (typeof openMovimentacaoSaida === 'function') openMovimentacaoSaida(_viewLoteId);
}

function renderExpiryPanel() {
    const alerts = getExpiryAlerts();
    updateExpiryBadge();
    const list = document.getElementById('expiry-panel-list');
    if (alerts.length === 0) {
        list.innerHTML = '<p class="text-center text-slate-400 text-sm py-6 font-bold"><i class="fas fa-check-circle text-green-400 mr-2"></i>Nenhum lote próximo do vencimento!</p>';
        return;
    }
    list.innerHTML = alerts.map(({ lot, vaccine, expired, daysLeft }) => {
        const badge = expired
            ? `<span class="shrink-0 px-2 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-600 whitespace-nowrap">VENCIDO há ${Math.abs(daysLeft)} dia(s)</span>`
            : `<span class="shrink-0 px-2 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-700 whitespace-nowrap">Vence em ${daysLeft} dia(s)</span>`;
        const borderCls = expired ? 'border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100' : 'border-amber-200 hover:border-amber-400 bg-amber-50 hover:bg-amber-100';
        return `<button onclick="const _p=document.getElementById('expiry-panel');_p.classList.add('hidden');_p.classList.remove('flex'); editLote(${lot.id});" class="w-full text-left p-3 rounded-xl border ${borderCls} transition group">
            <div class="flex justify-between items-center gap-2">
                <div class="min-w-0 flex-1">
                    <p class="font-black text-navy-900 text-xs truncate group-hover:text-clinic-700">${vaccine.nome}</p>
                    <p class="text-[10px] text-slate-500 font-bold mt-0.5"><i class="fas fa-list-check mr-1 text-slate-400"></i>Lote ${lot.numero} &nbsp;·&nbsp; Val: ${lot.validade.split('-').reverse().join('/')}</p>
                </div>
                <div class="flex items-center gap-1.5">${badge}<i class="fas fa-chevron-right text-[9px] text-slate-300 group-hover:text-clinic-500 transition"></i></div>
            </div>
        </button>`;
    }).join('');
}
