// ─── UTILITY / HELPER FUNCTIONS (from index.html lines ~2379-2475) ───────────

function normalizeStr(str) {
    if(!str) return '';
    return str.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

// ─── LOOKUP INDEXES ───────────────────────────────────────────────────────────
// Substituem patients.find()/vaccines.find() dentro de laços (O(N×M) → O(N)).
// O cache é auto-invalidante: guarda a referência do array e seu tamanho, então
// reatribuições (`patients = ...`) e push/filter/map disparam rebuild sozinhos.
// Mutação in-place de um item (ex.: patients[i].nome = x) não altera identidade
// nem tamanho — e não precisa invalidar, pois o Map guarda o mesmo objeto.
const _idxCache = { pat: null, patSrc: null, patLen: -1, vac: null, vacSrc: null, vacLen: -1 };

function _buildIdIndex(arr) {
    const m = new Map();
    for (const item of arr) m.set(String(item.id), item);
    return m;
}

function getPatientsIndex() {
    if (_idxCache.patSrc !== patients || _idxCache.patLen !== patients.length) {
        _idxCache.pat = _buildIdIndex(patients);
        _idxCache.patSrc = patients;
        _idxCache.patLen = patients.length;
    }
    return _idxCache.pat;
}

function getVaccinesIndex() {
    if (_idxCache.vacSrc !== vaccines || _idxCache.vacLen !== vaccines.length) {
        _idxCache.vac = _buildIdIndex(vaccines);
        _idxCache.vacSrc = vaccines;
        _idxCache.vacLen = vaccines.length;
    }
    return _idxCache.vac;
}

// Força rebuild no próximo acesso. Chamar após edições in-place que troquem `id`.
function invalidateLookupIndexes() {
    _idxCache.patSrc = null; _idxCache.patLen = -1;
    _idxCache.vacSrc = null; _idxCache.vacLen = -1;
}

function getPatientById(id) { return getPatientsIndex().get(String(id)); }
function getVaccineById(id) { return getVaccinesIndex().get(String(id)); }

// ─── RENDER SCHEDULER ─────────────────────────────────────────────────────────
// Um snapshot do Firebase costuma disparar renderCalendar + renderTable +
// renderPatients + renderDashboard de uma vez, e vários snapshots podem chegar
// em sequência. scheduleRender() agrupa as chamadas do mesmo frame: cada render
// roda no máximo uma vez por frame, na ordem em que foi pedido.
const _pendingRenders = new Map();
let _renderFrame = null;

function _flushRenders() {
    _renderFrame = null;
    const jobs = [..._pendingRenders.values()];
    _pendingRenders.clear();
    for (const fn of jobs) {
        try { fn(); } catch (err) { console.error('[render]', err); }
    }
}

function scheduleRender(name, fn) {
    const job = fn || (typeof window[name] === 'function' ? window[name] : null);
    if (!job) return;
    _pendingRenders.set(name, job);
    if (_renderFrame === null) _renderFrame = requestAnimationFrame(_flushRenders);
}

// ─── PAGINAÇÃO ────────────────────────────────────────────────────────────────
// Fatia uma lista já filtrada/ordenada e devolve a página + os metadados que a
// barra de controles precisa. `page` é corrigido para caber no total, então
// remover itens nunca deixa o usuário preso numa página vazia.
function paginate(items, page, pageSize) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(0, page || 0), totalPages - 1);
    const start = safePage * pageSize;
    const end = Math.min(start + pageSize, total);
    return {
        items: items.slice(start, end),
        page: safePage, totalPages, total,
        from: total ? start + 1 : 0,
        to: end,
        hasPrev: safePage > 0,
        hasNext: safePage < totalPages - 1
    };
}

// Janela de números de página com elipse: 1 … 4 5 [6] 7 8 … 20
function _pageWindow(page, totalPages) {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const out = [0];
    let lo = Math.max(1, page - 1), hi = Math.min(totalPages - 2, page + 1);
    if (page <= 2) hi = 3;
    if (page >= totalPages - 3) lo = totalPages - 4;
    if (lo > 1) out.push('…');
    for (let i = lo; i <= hi; i++) out.push(i);
    if (hi < totalPages - 2) out.push('…');
    out.push(totalPages - 1);
    return out;
}

// Barra de paginação. `onGo` é o nome de uma função global que recebe o índice
// da página (0-based), ex.: 'goTablePage'. Devolve '' quando só há uma página.
function renderPagination(p, onGo, itemLabel = 'itens') {
    if (p.totalPages <= 1) return '';
    const _d = document.body.classList.contains('dark-mode');
    const bg     = _d ? '#1e293b' : '#ffffff';
    const border = _d ? '#334155' : '#e2e8f0';
    const txt    = _d ? '#94a3b8' : '#64748b';
    const strong = _d ? '#f1f5f9' : '#172554';
    const accent = '#4f46e5';

    const btn = (target, disabled, icon, title) => `
        <button type="button" onclick="${onGo}(${target})" ${disabled ? 'disabled' : ''} title="${title}"
            class="h-8 w-8 rounded-lg flex items-center justify-center border transition disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-sm active:scale-90"
            style="background:${bg};border-color:${border};color:${disabled ? txt : accent}">
            <i class="fas ${icon} text-[11px]"></i>
        </button>`;

    const nums = _pageWindow(p.page, p.totalPages).map(i => {
        if (i === '…') return `<span class="px-1 text-[11px] font-black" style="color:${txt}">…</span>`;
        const active = i === p.page;
        return `<button type="button" onclick="${onGo}(${i})"
            class="h-8 min-w-[32px] px-2 rounded-lg text-[11px] font-black border transition hover:shadow-sm active:scale-90"
            style="background:${active ? accent : bg};border-color:${active ? accent : border};color:${active ? '#fff' : txt}">${i + 1}</button>`;
    }).join('');

    return `
        <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style="background:${bg};border-top:1px solid ${border}">
            <span class="text-[11px] font-bold" style="color:${txt}">
                <span style="color:${strong}">${p.from}–${p.to}</span> de <span style="color:${strong}">${p.total}</span> ${itemLabel}
            </span>
            <div class="flex items-center gap-1.5">
                ${btn(0, !p.hasPrev, 'fa-angles-left', 'Primeira página')}
                ${btn(p.page - 1, !p.hasPrev, 'fa-chevron-left', 'Página anterior')}
                ${nums}
                ${btn(p.page + 1, !p.hasNext, 'fa-chevron-right', 'Próxima página')}
                ${btn(p.totalPages - 1, !p.hasNext, 'fa-angles-right', 'Última página')}
            </div>
        </div>`;
}

function getDisplayName(fullName) {
    if (!fullName) return { display: '—', initials: '?' };
    const parts = fullName.trim().split(/\s+/).filter(w => w.length > 0);
    const meaningful = parts.filter(w => !_nameArticles.has(w.toLowerCase()));
    if (!meaningful.length) meaningful.push(...parts);
    const display = meaningful.length >= 2
        ? meaningful[0] + ' ' + meaningful[1]
        : meaningful[0];
    const initials = [meaningful[0], meaningful.length >= 2 ? meaningful[1] : null]
        .filter(Boolean).map(w => w[0]).join('').toUpperCase();
    return { display, initials };
}

function getAge(dateStr) {
    if(!dateStr) return 0;
    const today = new Date();
    const birthDate = new Date(dateStr);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
}

function getAgeInMonths(dateStr, refDateStr) {
    if(!dateStr) return {years: 0, months: 0};
    const today = refDateStr ? new Date(refDateStr + 'T00:00:00') : new Date();
    const birthDate = new Date(dateStr);
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();

    if(months < 0) {
        years--;
        months += 12;
    }
    if(today.getDate() < birthDate.getDate()) {
        months--;
        if(months < 0) {
            years--;
            months += 12;
        }
    }
    return {years: years, months: months};
}

function getAgeDisplay(dateStr, refDateStr) {
    const {years, months} = getAgeInMonths(dateStr, refDateStr);
    const today = refDateStr ? new Date(refDateStr + 'T00:00:00') : new Date();
    const birth = new Date(dateStr);
    if (years === 0 && months === 0) {
        const days = Math.max(0, Math.floor((today - birth) / 86400000));
        return days + (days === 1 ? ' dia' : ' dias');
    }
    if (years === 0) {
        // dias restantes após os meses completos
        const afterMonths = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate());
        const days = Math.max(0, Math.floor((today - afterMonths) / 86400000));
        const mStr = months + (months === 1 ? ' mês' : ' meses');
        return days > 0 ? mStr + ' e ' + days + (days === 1 ? ' dia' : ' dias') : mStr;
    }
    if (months === 0) return years + (years === 1 ? ' ano' : ' anos');
    return years + (years === 1 ? ' ano' : ' anos') + ' e ' + months + (months === 1 ? ' mês' : ' meses');
}

function formatWa(num) { return num.replace(/\D/g,''); }

function maskPhone(input) {
    let d = input.value.replace(/\D/g,'').slice(0,11);
    if(d.length > 10) d = d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3');
    else if(d.length > 6) d = d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
    else if(d.length > 2) d = d.replace(/(\d{2})(\d{0,5})/,'($1) $2');
    else if(d.length > 0) d = d.replace(/(\d{0,2})/,'($1');
    input.value = d;
    const digits = input.value.replace(/\D/g,'').length;
    input.setCustomValidity(digits < 10 ? 'Informe um número válido com DDD (10 ou 11 dígitos).' : '');
}

function formatPhone(num) {
    const d = num.replace(/\D/g,'').slice(0,11);
    if(d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if(d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return num;
}

function maskCurrency(input) {
    let v = input.value.replace(/\D/g, '');
    if (!v) { input.value = ''; return; }
    v = (parseInt(v) / 100).toFixed(2);
    const [int, dec] = v.split('.');
    input.value = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

function formatCurrency(val) {
    if (!val) return 'R$ 0,00';
    const clean = String(val).replace('R$', '').trim();
    return 'R$ ' + clean;
}

function sanitizeLogin(val) {
    return val.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function maskCPF(input) {
    let v = input.value.replace(/\D/g,'').slice(0,11);
    if(v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/,'$1.$2.$3-$4');
    else if(v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/,'$1.$2.$3');
    else if(v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/,'$1.$2');
    input.value = v;
}

function showNotification(msg, type='info') {
    const container = document.getElementById('notification-container');
    const el = document.createElement('div');
    el.className = `notification bg-white border-l-4 ${type==='success'?'border-green-500':type==='error'?'border-red-500':'border-blue-500'} p-4 rounded shadow-lg text-sm font-bold flex items-center gap-3`;
    el.innerHTML = `<i class="fas ${type==='success'?'fa-check text-green-500':type==='error'?'fa-times text-red-500':'fa-info text-blue-500'}"></i> ${msg}`;
    container.appendChild(el); setTimeout(()=>el.remove(), 5000);
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    const _mr = document.getElementById('modal-record');
    if (_mr) _mr.style.removeProperty('z-index');
    const _mp = document.getElementById('modal-paciente');
    if (_mp) _mp.style.removeProperty('z-index');
    window._agendaOpenedFromProntuario = false;
    _patientModalOpenedFromHistory = false;
}

// ─── BRL parsing helpers (used in discount module) ───────────────────────────
function parseBRL(str) {
    return parseFloat(String(str || '0').replace(/\./g, '').replace(',', '.')) || 0;
}

function formatBRL(num) {
    return num.toFixed(2).replace('.', ',');
}

// ─── REFORÇOS (múltiplos, até 3) ──────────────────────────────────────────────
// Vacina armazena v.reforcos = [{meses:12, doseAtual:false}, ...] (até 3 itens).
// meses 0 = reforço sem aprazamento em meses (nunca null: o Firebase apagaria a
// chave e, se fosse a única do objeto, o próprio item do array).
// doseAtual = o reforço é a dose atual do esquema "somente reforço" (0 doses).
// v.reforco/v.reforcoMeses são mantidos como legado (derivados do 1º reforço)
// para compatibilidade com dados antigos e código ainda não migrado.
const REFORCO_MAX = 3;

function reforcoLabel(n) {
    return n <= 1 ? 'Reforço' : `${n}º Reforço`;
}

// Extrai o índice (1..N) de um label de reforço, ou null se não for reforço.
function reforcoIndexFromLabel(doseStr) {
    if (!doseStr) return null;
    if (doseStr === 'Reforço') return 1;
    const m = /^(\d+)º Reforço$/.exec(doseStr);
    return m ? parseInt(m[1], 10) : null;
}

// Lista normalizada de reforços de uma vacina (sempre a partir de v.reforcos,
// com fallback para o formato legado v.reforco/v.reforcoMeses).
function getVaccineReforcos(v) {
    if (!v) return [];
    const raw = v.reforcos;
    // O Firebase Realtime Database descarta chaves com valor null: um reforço
    // salvo como {meses: null} (o 1º reforço de um esquema "somente reforço",
    // que não tem aprazamento em meses) virava um nó vazio e desaparecia do
    // array, deslocando os rótulos ("Reforço" sumia e sobrava "2º Reforço").
    // Por isso normalizamos aqui: objetos/arrays esparsos são reconstituídos e
    // buracos voltam como reforço sem meses.
    if (raw && typeof raw === 'object') {
        const idxs = Object.keys(raw)
            .map(k => parseInt(k, 10))
            .filter(k => !isNaN(k));
        if (idxs.length) {
            const out = [];
            for (let i = 0; i <= Math.max(...idxs) && out.length < REFORCO_MAX; i++) {
                const r = raw[i];
                // meses 0/ausente = reforço sem aprazamento em meses (null internamente).
                out.push({
                    meses: (r && r.meses) ? r.meses : null,
                    doseAtual: !!(r && r.doseAtual)
                });
            }
            return out;
        }
    }
    if (v.reforco) return [{ meses: v.reforcoMeses || null }];
    return [];
}

// ─── ESQUEMA SOMENTE REFORÇO (numDoses = 0) ──────────────────────────────────
// Um esquema com numDoses === 0 não possui doses primárias: a faixa etária serve
// apenas para delimitar quem pode receber os reforços. Só é permitido quando a
// vacina tem exatamente 1 esquema e ao menos 1 reforço; nesse caso o 1º reforço é
// a própria dose atual (sem intervalo em meses a partir de uma dose anterior).
function esquemaSemDoses(esq) {
    return !!esq && Number(esq.numDoses) === 0;
}

function isVaccineSomenteReforco(v) {
    if (!v) return false;
    const esqs = v.esquemas || [];
    return esqs.length === 1 && esquemaSemDoses(esqs[0]) && getVaccineReforcos(v).length > 0;
}

// ─── cpniImunoMap: { [nomeImunoNormalizado]: {nome, vaccineId} } ─────────────
// Formato legado (antes de guardar o nome legível do imuno): valor era só o
// vaccineId (number). Os helpers abaixo leem/escrevem de forma compatível com
// ambos os formatos, sem exigir migração de dados existentes no Firebase.
function cpniMapEntryVaccineId(entry) {
    if (entry == null) return null;
    return (typeof entry === 'object') ? entry.vaccineId : entry;
}

function cpniMapEntryNome(entry) {
    if (entry == null) return '';
    return (typeof entry === 'object') ? (entry.nome || '') : '';
}

function cpniSetMapEntry(map, key, nome, vaccineId) {
    map[key] = { nome, vaccineId };
}

// ─── DATA LOCAL EM ISO (YYYY-MM-DD) ──────────────────────────────────────────
// date.toISOString() converte para UTC antes de formatar. Num fuso negativo
// (Brasil, UTC-3) uma data criada à meia-noite local vira o DIA ANTERIOR em UTC,
// deslocando aprazamentos em 1 dia e classificando doses como atrasadas cedo
// demais. Esta função formata os componentes locais, sem passar por UTC.
function toLocalISO(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ─── VALIDADE EXCEPCIONAL DO APRAZAMENTO ─────────────────────────────────────
// A aplicação pode ser antecipada em até VALIDADE_EXCEPCIONAL_DIAS antes da data
// de aprazamento recomendada, desde que o usuário confirme a antecipação.
const VALIDADE_EXCEPCIONAL_DIAS = 4;

function addDiasIso(iso, dias) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return toLocalISO(d);
}

// Dias de antecedência de dataIso em relação a minIso (0 se não for anterior).
function diasAntecipacao(dataIso, minIso) {
    const diff = new Date(minIso + 'T00:00:00') - new Date(dataIso + 'T00:00:00');
    return diff > 0 ? Math.round(diff / 86400000) : 0;
}

// ─── CUSTO DE LOTE ─────────────────────────────────────────────────
// Nomes próprios porque fmtBRL (state.js) e parseBRL (acima) já existem e
// tratam ausência de valor como zero — aqui é preciso distinguir "sem custo
// cadastrado" de "custo zero", senão lotes antigos apareceriam como R$ 0,00.
function fmtCusto(n) {
    const v = Number(n);
    if (n == null || n === '' || !isFinite(v)) return '—';
    return fmtBRL(v);
}

// Converte texto digitado ("1.234,56", "1234.56", "R$ 90") em number.
// Retorna null se vazio/inválido — nunca 0.
function parseCusto(str) {
    if (str == null) return null;
    let s = String(str).replace(/[R$\s]/g, '').trim();
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
}

// Custo do lote é dado sensível: só admin ou quem edita lotes enxerga.
function canSeeCusto() {
    if (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin()) return true;
    return (typeof hasPerm === 'function') && hasPerm('edicao_lotes');
}
