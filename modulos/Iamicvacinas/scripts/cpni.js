// ─── IMPORTAÇÃO CPNI (Lista de aplicações de vacinas) ────────────────────────
// Importa histórico de doses aplicadas de uma planilha .xlsx do CPNI.
// Regras: títulos na linha 3 (índice 2), dados a partir da linha 4 (índice 3).
// NÃO afeta estoque (loteId sempre null, nunca passa por syncAppointmentMovement).
// Registros ficam marcados com importedCPNI:true, sempre status 'Aplicado', somente-leitura.

// Colunas fixas da planilha (índice 0-based)
const CPNI_COLS = {
    cpf: 4,          // E
    nome: 6,         // G
    dtNasc: 7,        // H
    sexo: 9,          // J
    lote: 12,         // M
    imuno: 13,        // N
    dose: 14,         // O
    dataAplicacao: 16 // Q
};

const CPNI_DOSE_CANONICAS = ['1ª Dose','2ª Dose','3ª Dose','4ª Dose','Dose Única','Reforço','2º Reforço','3º Reforço','Dose Zero'];

// ─── PARSING ──────────────────────────────────────────────────────────────────

function _cpniOnlyDigits(str) {
    return String(str || '').replace(/\D/g, '');
}

// Converte valor de célula de data (string dd/mm/aaaa, serial do Excel, ou Date) para 'YYYY-MM-DD'
function _cpniParseDate(val) {
    if (!val && val !== 0) return null;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        return val.toISOString().split('T')[0];
    }
    if (typeof val === 'number') {
        // serial Excel (base 1900)
        const d = XLSX.SSF ? XLSX.SSF.parse_date_code(val) : null;
        if (d) return `${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        return null;
    }
    const s = String(val).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    return null;
}

// Normaliza texto de dose para uma dose canônica reconhecida, ou null se não reconhecida
function _cpniNormalizeDose(txt) {
    const raw = normalizeStr(txt); // remove acentos/case/pontuação
    if (!raw) return null;
    let m = raw.match(/^(\d+)dose$/);
    if (m) return `${m[1]}ª Dose`;
    if (raw === 'dose') return '1ª Dose';
    if (raw === 'unica' || raw === 'doseunica') return 'Dose Única';
    m = raw.match(/^(\d+)reforco$/);
    if (m) return reforcoLabel(parseInt(m[1], 10) || 1);
    if (raw === 'reforco') return 'Reforço';
    if (raw === 'dosezero' || raw === 'zero') return 'Dose Zero';
    return null;
}

function _cpniResetState() {
    _cpniParsedRows = [];
    _cpniInvalidDoseMap = {};
    _cpniStep = 1;
    _cpniImportRunning = false;
}

function openCpniImportModal() {
    if (!checkPerm('backup')) return;
    _cpniResetState();
    document.getElementById('cpni-file-input').value = '';
    document.getElementById('cpni-file-name').classList.add('hidden');
    _cpniGoToStep(1);
    document.getElementById('modal-cpni-import').classList.add('active');
}

function closeCpniImportModal() {
    if (_cpniImportRunning) return; // não fecha durante importação
    document.getElementById('modal-cpni-import').classList.remove('active');
    _cpniResetState();
}

function _cpniGoToStep(step) {
    _cpniStep = step;
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById('cpni-step-' + i);
        if (el) el.classList.toggle('hidden', i !== step);
        const foot = document.getElementById('cpni-footer-' + i);
        if (foot) foot.classList.toggle('hidden', i !== step);
    }
    document.querySelectorAll('.cpni-step-dot').forEach(dot => {
        const n = Number(dot.dataset.step);
        dot.classList.toggle('cpni-step-active', n === step);
        dot.classList.toggle('cpni-step-done', n < step);
    });
    if (step === 5) {
        document.getElementById('cpni-btn-finish').disabled = true;
    }
}

function prepareCpniUpload(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('cpni-file-name').classList.remove('hidden');
    document.getElementById('cpni-file-label').textContent = file.name;
    document.getElementById('cpni-parse-error').classList.add('hidden');

    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const data = new Uint8Array(ev.target.result);
            const wb = XLSX.read(data, { type: 'array', cellDates: true });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            // header:1 → array de arrays; range:2 pula linhas 1-2, começa lendo a partir da linha 3 (títulos)
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 2, defval: '' });
            // rows[0] = linha 3 (títulos) — descarta; dados a partir de rows[1] (linha 4)
            const dataRows = rows.slice(1);
            _cpniParseRows(dataRows);
        } catch (err) {
            console.error('[CPNI] erro ao ler planilha:', err);
            document.getElementById('cpni-parse-error').textContent = 'Não foi possível ler o arquivo. Verifique se é uma planilha .xlsx válida.';
            document.getElementById('cpni-parse-error').classList.remove('hidden');
            _cpniParsedRows = [];
        }
    };
    reader.readAsArrayBuffer(file);
}

function _cpniParseRows(dataRows) {
    const out = [];
    dataRows.forEach((row, idx) => {
        const cpf = _cpniOnlyDigits(row[CPNI_COLS.cpf]);
        const nome = String(row[CPNI_COLS.nome] || '').trim();
        if (!cpf && !nome) return; // linha vazia — ignora silenciosamente
        const dtNasc = _cpniParseDate(row[CPNI_COLS.dtNasc]);
        const sexoRaw = normalizeStr(row[CPNI_COLS.sexo]);
        const genero = sexoRaw.startsWith('f') ? 'Feminino' : sexoRaw.startsWith('m') ? 'Masculino' : '';
        const lote = String(row[CPNI_COLS.lote] || '').trim();
        const imuno = String(row[CPNI_COLS.imuno] || '').trim();
        const doseTexto = String(row[CPNI_COLS.dose] || '').trim();
        const dataAplicacao = _cpniParseDate(row[CPNI_COLS.dataAplicacao]);
        out.push({
            _row: idx + 4, // linha real na planilha (1-based), útil pra mensagens de erro
            cpf, nome, dtNasc, genero, lote, imuno, doseTexto, dataAplicacao,
            _erro: !cpf ? 'CPF ausente' : !nome ? 'Nome ausente' : !dataAplicacao ? 'Data de aplicação inválida' : !imuno ? 'Imunobiológico ausente' : null
        });
    });
    _cpniParsedRows = out;
    document.getElementById('cpni-rows-count').textContent = out.length;
    const comErro = out.filter(r => r._erro).length;
    document.getElementById('cpni-rows-erro').textContent = comErro;
    document.getElementById('cpni-rows-erro-wrap').classList.toggle('hidden', comErro === 0);
    document.getElementById('cpni-btn-next-1').disabled = out.length === 0;
    document.getElementById('cpni-btn-next-1').classList.toggle('opacity-50', out.length === 0);
    document.getElementById('cpni-btn-next-1').classList.toggle('cursor-not-allowed', out.length === 0);
}

// ─── PASSO 2 — MAPEAMENTO DE IMUNOBIOLÓGICOS ─────────────────────────────────

let _cpniImunoRows = []; // [{key, nome, count}] — linhas do passo 2, indexadas por posição p/ os campos de busca

function _cpniGoStep2() {
    const validRows = _cpniParsedRows.filter(r => !r._erro);
    const nomesUnicos = [...new Set(validRows.map(r => r.imuno).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));

    _cpniImunoRows = nomesUnicos.map(nome => ({
        key: normalizeStr(nome),
        nome,
        count: validRows.filter(r => r.imuno === nome).length
    }));

    const list = document.getElementById('cpni-imuno-list');
    list.innerHTML = _cpniImunoRows.map((row, i) => {
        const mappedId = cpniMapEntryVaccineId(cpniImunoMap[row.key]);
        const mappedVac = mappedId ? vaccines.find(v => v.id == mappedId) : null;
        return `<div class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
            <div class="flex-1 min-w-0">
                <p class="font-black text-navy-900 text-sm truncate">${row.nome}</p>
                <p class="text-[10px] text-slate-400 font-bold">${row.count} registro(s)</p>
            </div>
            <div class="relative w-[260px] shrink-0" id="cpni-imuno-wrap-${i}">
                <input type="text" id="cpni-imuno-search-${i}" data-idx="${i}" autocomplete="off"
                    oninput="_cpniFilterImunoDropdown(${i})" onfocus="_cpniFilterImunoDropdown(${i})" onblur="_cpniHideImunoDropdown(${i})"
                    placeholder="Pesquisar vacina..." value="${mappedVac ? mappedVac.nome.replace(/"/g,'&quot;') : ''}"
                    class="w-full border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold uppercase focus:ring-2 focus:ring-clinic-500 outline-none">
                <input type="hidden" id="cpni-imuno-value-${i}" value="${mappedId || ''}">
                <div id="cpni-imuno-dropdown-${i}" class="hidden absolute z-[10] left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-y-auto" style="max-height:200px;"></div>
            </div>
        </div>`;
    }).join('') || '<p class="text-center text-slate-400 text-sm py-6 font-bold">Nenhum imunobiológico encontrado.</p>';

    _cpniGoToStep(2);
}

function _cpniFilterImunoDropdown(i) {
    const input = document.getElementById(`cpni-imuno-search-${i}`);
    const dd = document.getElementById(`cpni-imuno-dropdown-${i}`);
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
              onmousedown="_cpniSelectImunoVaccine(${i},${v.id},'${v.nome.replace(/'/g,"\\'")}')">
            <span>${v.nome}</span>
            ${v.mnemonico ? `<br><span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case mt-0.5">${v.mnemonico}</span>` : ''}
        </div>`
    ).join('');
    dd.classList.remove('hidden');
}

function _cpniHideImunoDropdown(i) {
    setTimeout(() => { const dd = document.getElementById(`cpni-imuno-dropdown-${i}`); if (dd) dd.classList.add('hidden'); }, 150);
}

function _cpniSelectImunoVaccine(i, vaccineId, nome) {
    document.getElementById(`cpni-imuno-search-${i}`).value = nome;
    document.getElementById(`cpni-imuno-value-${i}`).value = vaccineId;
    document.getElementById(`cpni-imuno-dropdown-${i}`).classList.add('hidden');
    const row = _cpniImunoRows[i];
    if (row) cpniSetMapEntry(cpniImunoMap, row.key, row.nome, vaccineId);
}

function _cpniConfirmImunoStep() {
    // Se o usuário limpou o campo de busca sem selecionar nada da lista, remove o mapeamento dessa linha
    _cpniImunoRows.forEach((row, i) => {
        const valEl = document.getElementById(`cpni-imuno-value-${i}`);
        const searchEl = document.getElementById(`cpni-imuno-search-${i}`);
        if (!searchEl || !searchEl.value.trim() || !valEl || !valEl.value) delete cpniImunoMap[row.key];
    });
    saveAll(); // persiste o mapeamento pra próximas importações
    _cpniGoStep3();
}

// ─── PASSO 3 — REVISÃO DE DOSES INVÁLIDAS ────────────────────────────────────

function _cpniGoStep3() {
    const validRows = _cpniParsedRows.filter(r => !r._erro && cpniImunoMap[normalizeStr(r.imuno)]);
    const textosInvalidos = new Set();
    validRows.forEach(r => {
        if (!_cpniNormalizeDose(r.doseTexto)) textosInvalidos.add(r.doseTexto || '(vazio)');
    });

    const list = document.getElementById('cpni-dose-list');
    if (!textosInvalidos.size) {
        list.innerHTML = '<p class="text-center text-emerald-600 text-sm py-6 font-black"><i class="fas fa-check-circle mr-2"></i>Todas as doses foram reconhecidas automaticamente.</p>';
    } else {
        list.innerHTML = [...textosInvalidos].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(txt => {
            const count = validRows.filter(r => (r.doseTexto || '(vazio)') === txt).length;
            return `<div class="flex items-center gap-3 p-3 bg-white border border-amber-200 rounded-xl">
                <i class="fas fa-triangle-exclamation text-amber-500"></i>
                <div class="flex-1 min-w-0">
                    <p class="font-black text-navy-900 text-sm truncate">"${txt}"</p>
                    <p class="text-[10px] text-slate-400 font-bold">${count} registro(s)</p>
                </div>
                <select data-dose-txt="${txt.replace(/"/g,'&quot;')}" onchange="_cpniSetDoseMap(this)" class="border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold focus:ring-1 focus:ring-clinic-500 outline-none min-w-[180px]">
                    <option value="">— Não importar —</option>
                    ${CPNI_DOSE_CANONICAS.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
            </div>`;
        }).join('');
    }

    _cpniGoToStep(3);
}

function _cpniSetDoseMap(sel) {
    const txt = sel.dataset.doseTxt === '(vazio)' ? '' : sel.dataset.doseTxt;
    if (sel.value) _cpniInvalidDoseMap[txt] = sel.value;
    else delete _cpniInvalidDoseMap[txt];
}

// Resolve a dose canônica final de uma linha (ou null se não deve ser importada).
// vaccineId, quando informado, permite ajustar reforços: se a planilha indica um
// reforço de índice maior que o número de reforços configurados na vacina (ex.:
// "2º reforço" numa vacina com só 1 reforço cadastrado), usa o maior índice
// disponível — evita perder o registro por causa de uma numeração que não existe
// no cadastro atual da vacina.
function _cpniResolveDose(row, vaccineId) {
    let canon = _cpniNormalizeDose(row.doseTexto);
    if (!canon) return _cpniInvalidDoseMap[row.doseTexto || ''] || null;
    const idx = reforcoIndexFromLabel(canon);
    if (idx && vaccineId) {
        const vac = vaccines.find(v => v.id == vaccineId);
        const nReforcos = vac ? getVaccineReforcos(vac).length : 0;
        if (nReforcos > 0 && idx > nReforcos) canon = reforcoLabel(nReforcos);
    }
    return canon;
}

// Acha um agendamento já existente (mesmo paciente+vacina+data) cuja dose seja
// um reforço com rótulo DIFERENTE do resolvido agora pela planilha — caso
// clássico de um registro importado antes de o cadastro da vacina ter 2º/3º
// reforço, salvo genericamente como "Reforço". Retorna o agendamento ou null.
function _cpniFindReforcoMismatch(patientId, vaccineId, dose, dataAplicacao) {
    if (!reforcoIndexFromLabel(dose)) return null;
    return appointments.find(a =>
        a.patientId === patientId && a.vaccineId === vaccineId && a.data === dataAplicacao &&
        reforcoIndexFromLabel(a.doseAtual) != null && a.doseAtual !== dose
    ) || null;
}

// ─── PASSO 4 — RESUMO ─────────────────────────────────────────────────────────

function _cpniGoStep4() {
    let prontos = 0, semImuno = 0, semDose = 0, duplicadas = 0, comErro = 0, corrigidas = 0;
    const seen = new Set(); // dedup dentro da própria planilha

    _cpniParsedRows.forEach(r => {
        if (r._erro) { comErro++; return; }
        const vaccineId = cpniMapEntryVaccineId(cpniImunoMap[normalizeStr(r.imuno)]);
        if (!vaccineId) { semImuno++; return; }
        const dose = _cpniResolveDose(r, vaccineId);
        if (!dose) { semDose++; return; }
        const cpfDigits = r.cpf;
        const existing = patients.find(p => _cpniOnlyDigits(p.cpf) === cpfDigits);
        const dupKey = `${cpfDigits}|${vaccineId}|${dose}|${r.dataAplicacao}`;
        const jaExisteNoSistema = existing && appointments.some(a =>
            a.patientId === existing.id && a.vaccineId === vaccineId && a.doseAtual === dose && a.data === r.dataAplicacao);
        if (seen.has(dupKey) || jaExisteNoSistema) { duplicadas++; return; }
        // Não é duplicata exata, mas pode ser um registro já existente com rótulo
        // de reforço desatualizado (ex.: "Reforço" que hoje deveria ser "2º Reforço").
        if (existing && _cpniFindReforcoMismatch(existing.id, vaccineId, dose, r.dataAplicacao)) { corrigidas++; return; }
        seen.add(dupKey);
        prontos++;
    });

    document.getElementById('cpni-resumo-prontos').textContent = prontos;
    document.getElementById('cpni-resumo-duplicadas').textContent = duplicadas;
    document.getElementById('cpni-resumo-corrigidas').textContent = corrigidas;
    document.getElementById('cpni-resumo-sem-imuno').textContent = semImuno;
    document.getElementById('cpni-resumo-sem-dose').textContent = semDose;
    document.getElementById('cpni-resumo-erro').textContent = comErro;
    const btn = document.getElementById('cpni-btn-confirm-import');
    btn.disabled = prontos === 0 && corrigidas === 0;
    btn.classList.toggle('opacity-50', prontos === 0 && corrigidas === 0);
    btn.classList.toggle('cursor-not-allowed', prontos === 0 && corrigidas === 0);

    _cpniGoToStep(4);
}

// ─── PASSO 5 — EXECUÇÃO COM PROGRESSO ────────────────────────────────────────

function _cpniStartImport() {
    _cpniGoToStep(5);
    _cpniImportRunning = true;
    document.getElementById('cpni-progress-bar').style.width = '0%';
    document.getElementById('cpni-progress-label').textContent = `Processando 0/${_cpniParsedRows.length}...`;
    document.getElementById('cpni-progress-done').classList.add('hidden');

    const seen = new Set();
    let idx = 0, seq = 0;
    const stats = { criados: 0, pacientesNovos: 0, duplicadas: 0, corrigidas: 0, semImuno: 0, semDose: 0, erro: 0 };
    const BATCH = 50;
    const total = _cpniParsedRows.length;

    function processBatch() {
        const limite = Math.min(idx + BATCH, total);
        for (; idx < limite; idx++) {
            const r = _cpniParsedRows[idx];
            if (r._erro) { stats.erro++; continue; }
            const vaccineId = cpniMapEntryVaccineId(cpniImunoMap[normalizeStr(r.imuno)]);
            if (!vaccineId) { stats.semImuno++; continue; }
            const dose = _cpniResolveDose(r, vaccineId);
            if (!dose) { stats.semDose++; continue; }

            let p = patients.find(x => _cpniOnlyDigits(x.cpf) === r.cpf);
            if (!p) {
                const isMinor = r.dtNasc ? getAge(r.dtNasc) < 18 : false;
                p = {
                    id: Date.now() + seq++,
                    nome: r.nome.toUpperCase(),
                    cpf: r.cpf,
                    dtNasc: r.dtNasc || '',
                    genero: r.genero || '',
                    contato: '',
                    responsavel: '',
                    responsavelCPF: '',
                    responsavelParentesco: '',
                    dadosIncompletos: isMinor
                };
                patients.push(p);
                stats.pacientesNovos++;
            }

            const dupKey = `${r.cpf}|${vaccineId}|${dose}|${r.dataAplicacao}`;
            const jaExisteNoSistema = appointments.some(a =>
                a.patientId === p.id && a.vaccineId === vaccineId && a.doseAtual === dose && a.data === r.dataAplicacao);
            if (seen.has(dupKey) || jaExisteNoSistema) { stats.duplicadas++; continue; }

            // Registro já existente com rótulo de reforço desatualizado (ex.: salvo
            // como "Reforço" antes de a vacina ter 2º/3º reforço cadastrado) — corrige
            // o doseAtual em vez de criar um agendamento duplicado.
            const mismatch = _cpniFindReforcoMismatch(p.id, vaccineId, dose, r.dataAplicacao);
            if (mismatch) {
                mismatch.doseAtual = dose;
                stats.corrigidas++;
                seen.add(dupKey);
                continue;
            }
            seen.add(dupKey);

            appointments.push({
                id: Date.now() + seq++,
                patientId: p.id,
                vaccineId: vaccineId,
                data: r.dataAplicacao,
                hora: '',
                doseAtual: dose,
                valorAplicado: '0,00',
                valorCheio: null,
                descontoPct: null,
                cortesia: false,
                status: 'Aplicado',
                loteId: null,
                lote: r.lote || '',
                motivoCancelamento: '',
                aplicadaOutroLocal: false,
                pedido: '',
                vendedor: '',
                aplicador: '',
                importedCPNI: true,
                importedAt: new Date().toISOString()
            });
            stats.criados++;
        }

        const pct = Math.round((idx / total) * 100);
        document.getElementById('cpni-progress-bar').style.width = pct + '%';
        document.getElementById('cpni-progress-label').textContent = `Processando ${idx}/${total}...`;

        if (idx < total) {
            requestAnimationFrame(() => setTimeout(processBatch, 0));
        } else {
            _cpniFinishImport(stats);
        }
    }

    requestAnimationFrame(() => setTimeout(processBatch, 0));
}

function _cpniFinishImport(stats) {
    _cpniImportRunning = false;
    try {
        saveAll();
        renderPatients(); renderCalendar(); renderTable(); renderDashboard();
        if (typeof populateVaccineSelects === 'function') populateVaccineSelects();
        logAudit('Criado', 'importacao_cpni', String(Date.now()), 'Importação CPNI',
            `${stats.criados} registro(s) importado(s) | ${stats.pacientesNovos} paciente(s) novo(s) | ${stats.corrigidas} rótulo(s) de reforço corrigido(s) | ${stats.duplicadas} duplicada(s) puladas | ${stats.semImuno} sem imunobiológico | ${stats.semDose} sem dose | ${stats.erro} com erro`);
        showNotification(`Importação CPNI concluída: ${stats.criados} registro(s) importado(s)${stats.corrigidas ? `, ${stats.corrigidas} rótulo(s) de reforço corrigido(s)` : ''}.`, 'success');
    } catch (err) {
        // Os registros já foram inseridos nos arrays em memória e o saveAll() já foi disparado
        // (ou tentado) acima; um erro nos renders/log não pode deixar o wizard travado.
        console.error('[CPNI] erro ao finalizar (renders/log):', err);
        showNotification('Importação concluída, mas houve um erro ao atualizar a tela. Recarregue a página.', 'error');
    } finally {
        // Sempre reabilita o resumo e o botão de concluir, mesmo se algo acima falhar.
        document.getElementById('cpni-progress-bar').style.width = '100%';
        document.getElementById('cpni-progress-label').textContent = 'Concluído!';
        document.getElementById('cpni-progress-done').classList.remove('hidden');
        document.getElementById('cpni-done-criados').textContent = stats.criados;
        document.getElementById('cpni-done-pacientes').textContent = stats.pacientesNovos;
        document.getElementById('cpni-done-corrigidas').textContent = stats.corrigidas;
        document.getElementById('cpni-done-duplicadas').textContent = stats.duplicadas;
        document.getElementById('cpni-done-pulados').textContent = stats.semImuno + stats.semDose + stats.erro;
        document.getElementById('cpni-btn-finish').disabled = false;
    }
}

function finishCpniImportModal() {
    document.getElementById('modal-cpni-import').classList.remove('active');
    _cpniResetState();
}

// ─── VISUALIZAÇÃO / EDIÇÃO (vacina associada + lote) DE REGISTRO IMPORTADO ──
// Somente-leitura por padrão. Quem tem permissão de aplicar vacinas pode reassociar
// a vacina do catálogo e corrigir o texto do lote — nunca o status, data, paciente
// ou dose, e nunca toca em loteId/estoque (continua null, fora do almoxarifado).

function viewCpniRecord(id) {
    const a = appointments.find(x => x.id == id);
    if (!a) return;
    const pat = patients.find(x => x.id == a.patientId);
    const vac = vaccines.find(x => x.id == a.vaccineId);
    window._cvrCurrentId = id;

    document.getElementById('cvr-avatar').textContent = pat ? (pat.nome || '?')[0].toUpperCase() : '?';
    document.getElementById('cvr-patient-name').textContent = pat ? pat.nome : '—';
    const cvrAlertEl = document.getElementById('cvr-patient-alert');
    if (cvrAlertEl) cvrAlertEl.innerHTML = (typeof patientAlertBadge === 'function') ? patientAlertBadge(pat, 'text-[9px]', true) : '';
    const age = pat && pat.dtNasc ? getAgeDisplay(pat.dtNasc) : '';
    document.getElementById('cvr-patient-meta').textContent = [pat?.cpf, age].filter(Boolean).join(' · ');
    document.getElementById('cvr-vaccine-name').textContent = vac ? vac.nome : '—';
    document.getElementById('cvr-dose').textContent = a.doseAtual || '—';
    document.getElementById('cvr-dose-edit').textContent = a.doseAtual || '—';
    document.getElementById('cvr-data').textContent = a.data ? a.data.split('-').reverse().join('/') : '—';
    document.getElementById('cvr-lote').textContent = a.lote || '—';
    document.getElementById('cvr-importado-em').textContent = a.importedAt
        ? new Date(a.importedAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';

    // Campos de edição (ficam prontos por baixo, mas ocultos até entrar no modo edição)
    document.getElementById('cvr-vaccine-search').value = vac ? vac.nome : '';
    document.getElementById('cvr-vaccine-value').value = vac ? vac.id : '';
    document.getElementById('cvr-lote-input').value = a.lote || '';
    document.getElementById('cvr-data-input').value = a.data || '';

    const prontuarioBtn = document.getElementById('cvr-btn-prontuario');
    prontuarioBtn.onclick = (e) => { e.stopPropagation(); closeCpniViewRecord(); if (typeof viewPatientHistory === 'function') viewPatientHistory(a.patientId); };

    const canEdit = (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin()) || (typeof hasPerm === 'function' && hasPerm('aplicar'));
    document.getElementById('cvr-btn-editar').classList.toggle('hidden', !canEdit);

    // Botão de excluir só aparece no modo edição (_cvrSetEditMode cuida da visibilidade).
    _cvrSetEditMode(false);

    document.getElementById('modal-view-cpni-record').classList.add('active');
}

function _cvrSetEditMode(editing) {
    document.getElementById('cvr-vaccine-card-view').classList.toggle('hidden', editing);
    document.getElementById('cvr-vaccine-card-edit').classList.toggle('hidden', !editing);
    document.getElementById('cvr-data-cell-view').classList.toggle('hidden', editing);
    document.getElementById('cvr-data-cell-edit').classList.toggle('hidden', !editing);
    document.getElementById('cvr-lote-cell-view').classList.toggle('hidden', editing);
    document.getElementById('cvr-lote-cell-edit').classList.toggle('hidden', !editing);
    document.getElementById('cvr-info-box').classList.toggle('hidden', editing);
    document.getElementById('cvr-btn-save-edit').classList.toggle('hidden', !editing);
    const canDelete = (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin()) || (typeof hasPerm === 'function' && hasPerm('excluir_agendamento'));
    document.getElementById('cvr-btn-delete').classList.toggle('hidden', !editing || !canDelete);
    document.getElementById('cvr-btn-cancel-edit').textContent = editing ? 'Cancelar' : 'Fechar';
}

function toggleCpniEditMode() {
    const editing = !document.getElementById('cvr-vaccine-card-edit').classList.contains('hidden');
    if (editing) {
        // Cancelar: restaura os campos de edição ao valor atual do registro e sai do modo edição
        const a = appointments.find(x => x.id == window._cvrCurrentId);
        const vac = a ? vaccines.find(v => v.id == a.vaccineId) : null;
        document.getElementById('cvr-vaccine-search').value = vac ? vac.nome : '';
        document.getElementById('cvr-vaccine-value').value = vac ? vac.id : '';
        document.getElementById('cvr-lote-input').value = a ? (a.lote || '') : '';
        document.getElementById('cvr-data-input').value = a ? (a.data || '') : '';
        _cvrSetEditMode(false);
    } else {
        _cvrSetEditMode(true);
    }
}

function _cvrFilterVaccineDropdown() {
    const input = document.getElementById('cvr-vaccine-search');
    const dd = document.getElementById('cvr-vaccine-dropdown');
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
              onmousedown="_cvrSelectVaccine(${v.id},'${v.nome.replace(/'/g,"\\'")}')">
            <span>${v.nome}</span>
            ${v.mnemonico ? `<br><span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case mt-0.5">${v.mnemonico}</span>` : ''}
        </div>`
    ).join('');
    dd.classList.remove('hidden');
}

function _cvrHideVaccineDropdown() {
    setTimeout(() => { const dd = document.getElementById('cvr-vaccine-dropdown'); if (dd) dd.classList.add('hidden'); }, 150);
}

function _cvrSelectVaccine(vaccineId, nome) {
    document.getElementById('cvr-vaccine-search').value = nome;
    document.getElementById('cvr-vaccine-value').value = vaccineId;
    document.getElementById('cvr-vaccine-dropdown').classList.add('hidden');
}

function saveCpniRecordEdit() {
    const canEdit = (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin()) || (typeof hasPerm === 'function' && hasPerm('aplicar'));
    if (!canEdit) { showNotification('Apenas usuários com permissão de aplicador podem editar registros do CPNI.', 'error'); return; }

    const id = window._cvrCurrentId;
    const idx = appointments.findIndex(x => x.id == id);
    if (idx < 0) return;

    const newVaccineId = Number(document.getElementById('cvr-vaccine-value').value) || null;
    if (!newVaccineId || !vaccines.find(v => v.id == newVaccineId)) {
        showNotification('Selecione uma vacina válida da lista.', 'error');
        return;
    }
    const newLote = document.getElementById('cvr-lote-input').value.trim().toUpperCase();
    const newData = document.getElementById('cvr-data-input').value;
    if (!newData) {
        showNotification('Informe a data de aplicação.', 'error');
        return;
    }

    const old = appointments[idx];
    const oldVac = vaccines.find(v => v.id == old.vaccineId);
    const newVac = vaccines.find(v => v.id == newVaccineId);

    // Troca vaccineId/lote/data — status, dose, paciente e loteId (estoque) permanecem intocados.
    appointments[idx] = { ...old, vaccineId: newVaccineId, lote: newLote, data: newData };

    logAudit('Editado', 'importacao_cpni', old.id,
        `${(patients.find(p=>p.id==old.patientId)||{}).nome || '—'} | Registro CPNI`,
        null,
        [
            { field: 'Vacina', de: oldVac ? oldVac.nome : '—', para: newVac ? newVac.nome : '—' },
            { field: 'Lote', de: old.lote || '—', para: newLote || '—' },
            { field: 'Data de Aplicação', de: old.data ? old.data.split('-').reverse().join('/') : '—', para: newData ? newData.split('-').reverse().join('/') : '—' }
        ]
    );

    saveAll();
    renderPatients(); renderCalendar(); renderTable(); renderDashboard();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    showNotification('Registro CPNI atualizado com sucesso!', 'success');
    viewCpniRecord(id); // recarrega o modal em modo leitura com os novos dados
}

function closeCpniViewRecord() {
    document.getElementById('modal-view-cpni-record').classList.remove('active');
    window._cvrCurrentId = null;
}

// ─── INCLUSÃO MANUAL DE REGISTRO CPNI (aba Rotina do prontuário) ─────────────
// Cria o mesmo registro que a importação da planilha geraria (importedCPNI:true,
// status 'Aplicado', loteId null — fora do estoque), digitado pelo usuário.

let _cpniManualPatId = null;

function _cpniManualCanEdit() {
    return (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin()) || (typeof hasPerm === 'function' && hasPerm('aplicar'));
}

function openCpniManualModal(patId, vacId, dose) {
    if (!_cpniManualCanEdit()) { showNotification('Apenas usuários com permissão de aplicador podem incluir registros do CPNI.', 'error'); return; }
    const pat = patients.find(p => p.id == patId);
    if (!pat) return;
    _cpniManualPatId = pat.id;
    const vac = vacId ? vaccines.find(v => v.id == vacId) : null;

    document.getElementById('cpni-manual-paciente').textContent = [pat.nome, pat.cpf].filter(Boolean).join(' · ');
    document.getElementById('cpni-manual-vaccine-search').value = vac ? vac.nome : '';
    document.getElementById('cpni-manual-vaccine-value').value = vac ? vac.id : '';

    const doses = [...CPNI_DOSE_CANONICAS];
    if (dose && !doses.includes(dose)) doses.unshift(dose);
    const sel = document.getElementById('cpni-manual-dose');
    sel.innerHTML = '<option value="">Selecione...</option>' + doses.map(d => `<option value="${d}">${d}</option>`).join('');
    sel.value = dose || '';

    const dataEl = document.getElementById('cpni-manual-data');
    dataEl.value = '';
    dataEl.max = toLocalISO(new Date());
    document.getElementById('cpni-manual-lote').value = '';
    document.getElementById('cpni-manual-err').classList.add('hidden');

    document.getElementById('modal-cpni-manual').classList.add('active');
}

function closeCpniManualModal() {
    document.getElementById('modal-cpni-manual').classList.remove('active');
    _cpniManualPatId = null;
}

function _cpniManualFilterVaccineDropdown(typed) {
    const input = document.getElementById('cpni-manual-vaccine-search');
    const dd = document.getElementById('cpni-manual-vaccine-dropdown');
    if (!input || !dd) return;
    // Digitou algo diferente da vacina selecionada: invalida a seleção até escolher da lista.
    if (typed) document.getElementById('cpni-manual-vaccine-value').value = '';
    const val = normalizeStr(input.value);
    const ativos = vaccines.filter(v => v.ativo !== false);
    const matches = (val ? ativos.filter(v => {
        if (normalizeStr(v.nome).includes(val)) return true;
        if (v.mnemonico && normalizeStr(v.mnemonico).includes(val)) return true;
        return vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && normalizeStr(l.fabricante).includes(val));
    }) : ativos).sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR'));

    if (!matches.length) { dd.innerHTML = '<div class="px-3 py-2 text-xs text-slate-400 font-bold">Nenhuma vacina encontrada</div>'; dd.classList.remove('hidden'); return; }
    dd.innerHTML = matches.map(v =>
        `<div class="px-3 py-2 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer text-sm font-bold text-navy-900 border-b border-slate-100 last:border-0 transition uppercase"
              onmousedown="_cpniManualSelectVaccine(${v.id},'${v.nome.replace(/'/g,"\\'")}')">
            <span>${v.nome}</span>
            ${v.mnemonico ? `<br><span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case mt-0.5">${v.mnemonico}</span>` : ''}
        </div>`
    ).join('');
    dd.classList.remove('hidden');
}

function _cpniManualHideVaccineDropdown() {
    setTimeout(() => { const dd = document.getElementById('cpni-manual-vaccine-dropdown'); if (dd) dd.classList.add('hidden'); }, 150);
}

function _cpniManualSelectVaccine(vaccineId, nome) {
    document.getElementById('cpni-manual-vaccine-search').value = nome;
    document.getElementById('cpni-manual-vaccine-value').value = vaccineId;
    document.getElementById('cpni-manual-vaccine-dropdown').classList.add('hidden');
}

function _cpniManualError(msg) {
    const el = document.getElementById('cpni-manual-err');
    el.innerHTML = `<i class="fas fa-exclamation-circle mr-1"></i>${msg}`;
    el.classList.remove('hidden');
}

function saveCpniManualRecord() {
    if (!_cpniManualCanEdit()) { showNotification('Apenas usuários com permissão de aplicador podem incluir registros do CPNI.', 'error'); return; }
    const pat = patients.find(p => p.id == _cpniManualPatId);
    if (!pat) return;

    const vaccineId = Number(document.getElementById('cpni-manual-vaccine-value').value) || null;
    const vac = vaccineId ? vaccines.find(v => v.id == vaccineId) : null;
    const dose = document.getElementById('cpni-manual-dose').value;
    const data = document.getElementById('cpni-manual-data').value;
    const lote = document.getElementById('cpni-manual-lote').value.trim().toUpperCase();

    if (!vac) return _cpniManualError('Selecione uma vacina válida da lista.');
    if (!dose) return _cpniManualError('Selecione a dose.');
    if (!data) return _cpniManualError('Informe a data de aplicação.');
    if (data > toLocalISO(new Date())) return _cpniManualError('A data de aplicação não pode ser futura.');
    if (!lote) return _cpniManualError('Informe o lote.');
    // Mesma regra de duplicidade da importação da planilha.
    if (appointments.some(a => a.patientId == pat.id && a.vaccineId == vac.id && a.doseAtual === dose && a.data === data)) {
        return _cpniManualError('Já existe um registro desta vacina/dose nesta data para o paciente.');
    }

    const newApp = {
        id: Date.now(),
        patientId: pat.id,
        vaccineId: vac.id,
        data,
        hora: '',
        doseAtual: dose,
        valorAplicado: '0,00',
        valorCheio: null,
        descontoPct: null,
        cortesia: false,
        status: 'Aplicado',
        loteId: null,
        lote,
        motivoCancelamento: '',
        aplicadaOutroLocal: false,
        pedido: '',
        vendedor: '',
        aplicador: '',
        importedCPNI: true,
        cpniManual: true,
        importedAt: new Date().toISOString()
    };
    appointments.push(newApp);

    logAudit('Criado', 'importacao_cpni', newApp.id,
        `${pat.nome} | Registro CPNI (manual)`,
        `${vac.nome} | ${dose} | ${data.split('-').reverse().join('/')} | Lote ${lote}`,
        null, pat.id);

    saveAll();
    closeCpniManualModal();
    renderPatients(); renderCalendar(); renderTable(); renderDashboard();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    const prontuario = document.getElementById('modal-patient-history');
    if (prontuario && prontuario.classList.contains('active') && prontuario.dataset.patientId == pat.id
        && typeof renderRotinaTab === 'function') {
        renderRotinaTab(pat.id);
    }
    showNotification('Vacina do CPNI incluída com sucesso!', 'success');
}

// ─── EXCLUSÃO DE REGISTRO CPNI (confirmação digitada) ─────────────────────────
let pendingDeleteCpniId = null;

function openDeleteCpniModal() {
    const id = window._cvrCurrentId;
    if (!id) return;
    if (typeof checkPerm === 'function' && !checkPerm('excluir_agendamento')) return;
    const a = appointments.find(x => x.id == id);
    if (!a) return;
    const pat = patients.find(x => x.id == a.patientId);
    const vac = vaccines.find(x => x.id == a.vaccineId);
    pendingDeleteCpniId = id;
    document.getElementById('delete-cpni-info').innerText = pat && vac
        ? `${pat.nome} — ${vac.nome} (${a.doseAtual}) em ${a.data ? a.data.split('-').reverse().join('/') : '—'}`
        : '';
    document.getElementById('delete-cpni-input').value = '';
    checkDeleteCpniConfirm();
    document.getElementById('modal-delete-cpni').classList.add('active');
}

function closeDeleteCpniModal() {
    document.getElementById('modal-delete-cpni').classList.remove('active');
    document.getElementById('delete-cpni-input').value = '';
    pendingDeleteCpniId = null;
}

function checkDeleteCpniConfirm() {
    const val = document.getElementById('delete-cpni-input').value.trim().toUpperCase();
    const btn = document.getElementById('btn-confirm-delete-cpni');
    const ok = val === 'EXCLUIR';
    btn.disabled = !ok;
    btn.className = ok
        ? 'flex-1 bg-red-600 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-red-700 cursor-pointer'
        : 'flex-1 bg-red-200 text-red-400 font-black py-3 rounded-xl uppercase text-xs transition cursor-not-allowed';
}

function confirmDeleteCpniRecord() {
    if (!pendingDeleteCpniId) return;
    const id = pendingDeleteCpniId;
    const a = appointments.find(x => x.id == id);
    const pat = a ? patients.find(p => p.id == a.patientId) : null;
    const vac = a ? vaccines.find(v => v.id == a.vaccineId) : null;
    logAudit('Excluído', 'importacao_cpni', id,
        `${pat ? pat.nome : '—'} | ${vac ? vac.nome : '—'} | ${a ? a.doseAtual : ''} | ${a ? a.data : ''}`);
    appointments = appointments.filter(x => x.id != id);
    pendingDeleteCpniId = null;
    saveAll();
    closeDeleteCpniModal();
    closeCpniViewRecord();
    renderPatients(); renderCalendar(); renderTable(); renderDashboard();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    showNotification('Registro CPNI excluído com sucesso.', 'success');
}
