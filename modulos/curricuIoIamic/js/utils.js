// ===== Utilidades =====

// Ícones SVG (traço estilo Feather)
const ICONS = {
    logo: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    launch: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    money: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
    userMinus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/>',
    percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    trendDown: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-2"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    dots: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9.01" y2="6"/><line x1="15" y1="6" x2="15.01" y2="6"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/><line x1="9" y1="14" x2="9.01" y2="14"/><line x1="15" y1="14" x2="15.01" y2="14"/><path d="M9 22v-4h6v4"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    trendUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    // ASO / saúde ocupacional — maleta médica com cruz
    medical: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    // Chave (Pix) — palhetão em diagonal com o anel embaixo à esquerda
    key: '<path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    // Visualizador de imagens — zoom e rotação
    zoomIn: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
    zoomOut: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
    rotateLeft: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    rotateRight: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    // Relatório — folha com linhas de texto (PDF) e folha com grade (planilha)
    filePdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    fileSheet: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="7.5" y="11.5" width="9" height="6.5" rx=".5"/><line x1="7.5" y1="14.75" x2="16.5" y2="14.75"/><line x1="12" y1="11.5" x2="12" y2="18"/>',
    report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="11"/><polyline points="9 15 12 18 15 15"/>'
};

function icon(name, cls) {
    return `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24">${ICONS[name] || ICONS.info}</svg>`;
}

// Hash SHA-256 → hex
async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Formatação
const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = v => (Number(v) || 0).toLocaleString('pt-BR');
const fmtPct = (v, d = 1) => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d })}%`;

function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

// ---- Duração em HH:MM (banco de horas) ----
// O usuário digita e lê HH:MM; o banco guarda MINUTOS INTEIROS COM SINAL. Guardar "08:30"
// obrigaria a fazer parsing em toda soma, e o sinal de "-00:30" pertence ao par, não à hora
// (quem soma -0 + -30 acerta por acidente). Decimal traria float onde a fiscalização exige
// exatidão. Minutos somam, comparam e ordenam sem cerimônia — HH:MM é apresentação.
//
// Horas NÃO são módulo 24: um saldo de 40h é "40:00", não "16:00". Nada de Date aqui.
const fmtHHMM = min => {
    const n = Math.round(Number(min) || 0);
    const a = Math.abs(n);
    return `${n < 0 ? '-' : ''}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};

// Aceita o que o RH realmente digita: "8:30", "-08:30", "8h30", "8,5h", "510" (minutos puros
// só quando não há separador). Devolve minutos com sinal, ou null se não der para entender —
// null é diferente de 0: "não consegui ler" não pode virar "zero horas" em silêncio.
function parseHHMM(str) {
    if (typeof str === 'number') return Math.round(str);
    const s = String(str ?? '').trim();
    if (!s) return null;
    const neg = /^-/.test(s);
    const corpo = s.replace(/^[-+]/, '').replace(/\s/g, '');

    let min = null;
    let m = corpo.match(/^(\d+)[:h](\d{1,2})m?$/i);              // 8:30 | 8h30 | 8h30m
    if (m) {
        const mm = Number(m[2].padEnd(2, '0'));                   // "8h3" → 30min, não 3
        if (mm > 59) return null;
        min = Number(m[1]) * 60 + mm;
    } else if ((m = corpo.match(/^(\d+)[.,](\d+)\s*h?$/i))) {     // 8,5h → decimal de HORAS
        min = Math.round(Number(`${m[1]}.${m[2]}`) * 60);
    } else if ((m = corpo.match(/^(\d+)h?$/i))) {                 // "8h" = 8 horas; "510" = 510 minutos
        min = /h$/i.test(corpo) ? Number(m[1]) * 60 : Number(m[1]);
    } else return null;

    return neg ? -min : min;
}

// Para eixos de gráfico: "8,5 h". Um eixo Y em HH:MM é ilegível — os ticks não caem em
// múltiplos redondos e o Chart.js não tem escala sexagesimal.
const fmtHorasDec = min => `${((Number(min) || 0) / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

function hoje() { return new Date().toISOString().slice(0, 10); }

// ---- Ausência em curso ----
// `retorno` é a data em que o funcionário VOLTA ao trabalho, então o intervalo é
// fechado no início e aberto no fim: no dia do retorno ele já está presente.
const ausenciaVigente = (a, ref) => !!a.inicio && !!a.retorno && a.inicio <= (ref || hoje()) && (ref || hoje()) < a.retorno;

// Férias em curso de um funcionário (null quando não está de férias).
// Quem está de férias continua ATIVO (recebe salário, conta no headcount) — a ausência
// é operacional, não contratual. Ver diagnosticoUnidade() para o efeito no alerta.
const feriasVigente = (fid, ausencias, ref) =>
    (ausencias || []).find(a => a.funcionarioId === fid && a.tipo === 'Férias' && ausenciaVigente(a, ref)) || null;

// Cadastro com admissão no futuro. Não é um estado válido de funcionário: ou é erro de
// digitação, ou é contratação agendada. Em ambos os casos os indicadores derivados
// (tempo de casa, férias, experiência) não têm base — a tela precisa avisar, não calcular.
const admissaoFutura = (f, ref) => !!f?.admissao && !f.demissao && f.admissao > (ref || hoje());

// Dias até o retorno (1 = volta amanhã)
const diasAteRetorno = (a, ref) => diasEntre(ref || hoje(), a.retorno);

// ============ PROGRAMAÇÃO DE FÉRIAS (CLT) ============
//
// Dois relógios, não um:
//   • Período AQUISITIVO  — 12 meses trabalhados que GERAM o direito (admissão + 12m, e daí
//                           a cada 12m). Quem está no 1º ciclo ainda não tem direito.
//   • Período CONCESSIVO  — os 12 meses SEGUINTES, em que a empresa DEVE conceder.
//                           Estourou? Férias em dobro (art. 137 CLT).
//
// O prazo que importa para gestão é o CONCESSIVO: é ele que vira custo. A previsão NÃO deriva
// das últimas férias gozadas — deriva do ciclo aquisitivo, que corre desde a admissão
// independente de quando a pessoa gozou. Derivar do gozo faria quem tirou férias atrasadas
// parecer folgado justamente quando está vencendo.

const addMeses = (iso, n) => {
    const d = new Date(iso + 'T00:00:00');
    const dia = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() < dia) d.setDate(0);          // 31/jan +1m → 28/fev, não 03/mar
    return d.toISOString().slice(0, 10);
};

// Meses cheios entre duas datas (para "faltam 3 meses")
function mesesEntre(iniIso, fimIso) {
    const a = new Date(iniIso + 'T00:00:00'), b = new Date(fimIso + 'T00:00:00');
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m--;
    return m;
}

// Texto curto de prazo: "12 dias", "3 meses", "1 ano e 2 meses"
function prazoTexto(dias) {
    const abs = Math.abs(dias);
    if (abs < 45) return `${abs} dia${abs !== 1 ? 's' : ''}`;
    const meses = Math.round(abs / 30.44);
    if (meses < 12) return `${meses} mes${meses !== 1 ? 'es' : ''}`;
    const anos = Math.floor(meses / 12), rm = meses % 12;
    return `${anos} ano${anos !== 1 ? 's' : ''}${rm ? ` e ${rm} mes${rm !== 1 ? 'es' : ''}` : ''}`;
}

// Parâmetros de férias (Configurações → Parâmetros). Carregado uma vez por sessão.
//
// `diasPorCiclo` (30) é o total de uma competência: fracionar não muda o total, só o divide.
// `tercoPct` (33.3333) é o adicional do art. 7º XVII CF — parametrizável porque convenção
// coletiva pode ser mais generosa, nunca menos. `abonoMaxDias` (10) = art. 143: até 1/3 do
// período pode ser vendido. `mediaHeMeses` (12) = período aquisitivo (Súmula 45 TST).
// `mesesVencimento` (24) = tempo total, do início do aquisitivo até a féria VENCER (dobra
// art. 137). O aquisitivo continua fixo em 12m (o direito nasce por lei em 12m e não se
// negocia); o parâmetro move só o fim do concessivo: concessivoFim = aquisitivoIni + 24m.
const FERIAS_PARAMS_PADRAO = {
    alertaLegalDias: 60,
    diasPorCiclo: 30,
    mesesVencimento: 24,
    tercoPct: 100 / 3,
    abonoMaxDias: 10,
    mediaHe: true,
    mediaHeMeses: 12
};
let feriasParams = { ...FERIAS_PARAMS_PADRAO };
const setFeriasParams = p => {
    const num = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
    feriasParams = {
        alertaLegalDias: Number(p?.feriasAlertaLegalDias) || FERIAS_PARAMS_PADRAO.alertaLegalDias,
        diasPorCiclo: num(p?.feriasDiasPorCiclo, FERIAS_PARAMS_PADRAO.diasPorCiclo),
        // Nunca menos que 12: o direito já nasce em 12m; vencer antes disso é impossível.
        mesesVencimento: Math.max(12, num(p?.feriasMesesVencimento, FERIAS_PARAMS_PADRAO.mesesVencimento)),
        tercoPct: num(p?.feriasTercoPct, FERIAS_PARAMS_PADRAO.tercoPct),
        abonoMaxDias: num(p?.feriasAbonoMaxDias, FERIAS_PARAMS_PADRAO.abonoMaxDias),
        // Checkbox: `??` e não `||` — false é escolha, não ausência.
        mediaHe: p?.feriasMediaHe ?? FERIAS_PARAMS_PADRAO.mediaHe,
        mediaHeMeses: num(p?.feriasMediaHeMeses, FERIAS_PARAMS_PADRAO.mediaHeMeses)
    };
};

// Âncora do ciclo de férias. Normalmente é a própria admissão. Mas ao cadastrar um
// funcionário ANTIGO, publicar a folha retroativa de anos inteiros só para "quitar" ciclos
// vencidos que ninguém vai lançar é inviável. `feriasBase` reancora o cálculo: mesmo dia/mês
// da contratação (o aniversário do ciclo é preservado), mas o ANO puxado para onde a folha
// começa a ser publicada — assim os ciclos anteriores a esse ponto não existem. Vazio =
// comportamento legal puro pela admissão (funcionário normal, nada muda).
const feriasAnchor = f => f?.feriasBase || f?.admissao;

// Sugestão de `feriasBase` para funcionário antigo: o aniversário (dia/mês da admissão) mais
// recente que NÃO passe da data de referência (o mês em que se começa a controlar). String
// pura — lexicográfica, sem fuso. Retorna null quando a admissão é recente o bastante para o
// ciclo real já servir (aí não há o que reancorar).
function feriasBaseSugerida(admissao, ref) {
    if (!admissao) return null;
    const h = ref || hoje();
    let mmdd = admissao.slice(5);                 // "MM-DD"
    if (mmdd === '02-29') mmdd = '02-28';         // ano não-bissexto: clamp seguro
    const anoRef = Number(h.slice(0, 4));
    let iso = `${anoRef}-${mmdd}`;
    if (iso > h) iso = `${anoRef - 1}-${mmdd}`;
    return iso > admissao ? iso : null;
}

// ============ CONTROLE DE ASO (NR-7) ============
//
// Periodicidade do exame vem do CARGO (asoPeriodicidadeMeses), não da insalubridade:
// insalubridade é critério trabalhista/salarial, periodicidade de ASO é critério
// médico-ocupacional (PCMSO). São definidos por gente diferente e podem divergir.
// 0 = "Não se aplica": cargo fora do controle de ASO (ex.: estágio, vínculo sem CLT ou
// função sem PCMSO). Não é "periodicidade zero" — é ausência de obrigação: o cargo some
// da fila, da agenda e dos alertas, em vez de aparecer sempre vencido.
const ASO_NAO_SE_APLICA = 0;
const ASO_PERIODICIDADES = [6, 12, 24, ASO_NAO_SE_APLICA];
const ASO_PERIODICIDADE_PADRAO = 12;
// Cargo sem o campo (cadastro anterior a este recurso) assume o padrão legal geral.
// Só o 0 explícito isenta — null/''/ausente continuam caindo no padrão, senão um campo
// vazio no banco desligaria o controle de ASO da empresa inteira sem ninguém pedir.
const asoPeriodicidadeDe = cargo => {
    const bruto = cargo?.asoPeriodicidadeMeses;
    if (bruto === ASO_NAO_SE_APLICA || bruto === '0') return ASO_NAO_SE_APLICA;
    return Number(bruto) || ASO_PERIODICIDADE_PADRAO;
};
const asoIsento = cargo => asoPeriodicidadeDe(cargo) === ASO_NAO_SE_APLICA;
// Rótulo único para tabela, select e textos de ajuda.
const asoPeriodicidadeLabel = meses =>
    Number(meses) === ASO_NAO_SE_APLICA ? 'Não se aplica' : `A cada ${meses} meses`;

// 90 dias: exame ocupacional depende de agenda de clínica e do PCMSO — avisar com 30 dias
// deixa pouca margem para marcar, remarcar e o colaborador comparecer. Configurável em
// Configurações → Parâmetros.
const ASO_PARAMS_PADRAO = { alertaDias: 90 };
let asoParams = { ...ASO_PARAMS_PADRAO };
const setAsoParams = p => {
    asoParams = { alertaDias: Number(p?.asoAlertaDias) || ASO_PARAMS_PADRAO.alertaDias };
};

// Os cinco tipos da NR-7. Só o Periódico é recorrente — os outros são disparados por
// eventos (admissão, demissão, afastamento longo, mudança de função) que o módulo de
// Lançamentos já registra. Ver asosPendentesPorEvento().
const ASO_TIPOS = ['Admissional', 'Periódico', 'Demissional', 'Retorno ao trabalho', 'Mudança de risco'];
const ASO_TIPO_PERIODICO = 'Periódico';
const ASO_RESULTADOS = ['Apto', 'Apto com restrições', 'Inapto'];

// Ordem de urgência e cores — espelham FERIAS_ORDEM/FERIAS_STATUS de propósito: a leitura
// de "quem precisa de ação agora" tem que ser idêntica nas duas telas.
const ASO_ORDEM = { vencido: 0, sem_historico: 1, critico: 2, em_dia: 3 };
const ASO_STATUS = {
    vencido:       { cls: 'badge-danger',  dot: 'st-vencida', txt: 'Vencido' },
    sem_historico: { cls: 'badge-danger',  dot: 'st-vencida', txt: 'Sem ASO' },
    critico:       { cls: 'badge-warning', dot: 'st-critica', txt: 'Vence em breve' },
    em_dia:        { cls: 'badge-neutral', dot: 'st-ok',      txt: 'Em dia' }
};

// ASOs de um funcionário já realizados (data <= ref), do mais recente para o mais antigo.
const asosDoFunc = (fid, asos, ref) => (asos || [])
    .filter(a => a.funcionarioId === fid && a.data && a.data <= (ref || hoje()))
    .sort((a, b) => b.data.localeCompare(a.data));

// Situação do exame PERIÓDICO. Mesmo contrato de retorno de situacaoFeriasFunc:
// { status, dias, label, desc, ... } — para a fila, os badges e os dots serem reaproveitados.
//
// Vencimento = último exame + periodicidade do cargo. Nada é gravado: se o exame antecipa,
// se o cargo muda de periodicidade ou se a pessoa é transferida, a projeção se corrige
// sozinha no próximo render. Lembrete gravado apodrece; fórmula não.
//
// `dias` > 0 = ainda tem prazo; < 0 = vencido há N dias. Mesma convenção das férias.
function situacaoAsoFunc(f, asos, cargo, ref) {
    if (!f?.admissao || f.demissao) return null;
    const h = ref || hoje();
    if (f.admissao > h) return null;                  // admissão futura: nada a calcular
    // Cargo marcado como "Não se aplica" no cadastro: sem obrigação de exame, não há
    // situação a calcular. Mesmo `null` do desligado — todas as telas já o filtram.
    if (asoIsento(cargo)) return null;

    const meses = asoPeriodicidadeDe(cargo);
    const feitos = asosDoFunc(f.id, asos, h);
    // Admissional e Periódico reiniciam a contagem; os demais (demissional, retorno,
    // mudança de risco) são exames pontuais e NÃO renovam o ciclo periódico.
    const base = feitos.find(a => a.tipo === ASO_TIPO_PERIODICO || a.tipo === 'Admissional');

    // Nunca fez exame. Silêncio aqui seria o pior estado possível num controle de NR-7:
    // quem nunca fez é justamente o caso mais grave, não "sem dados".
    if (!base) {
        const dias = diasEntre(h, addMeses(f.admissao, meses));
        return {
            status: 'sem_historico', dias, meses,
            ultimo: null, ultimoTipo: null, vencimento: null, total: feitos.length,
            label: 'Sem ASO registrado',
            desc: `Nenhum exame lançado desde a admissão (${fmtDate(f.admissao)}). O admissional é obrigatório antes do início das atividades.`
        };
    }

    const vencimento = addMeses(base.data, meses);
    const dias = diasEntre(h, vencimento);
    const comum = {
        meses, ultimo: base.data, ultimoTipo: base.tipo, vencimento, total: feitos.length
    };

    if (dias < 0) return {
        ...comum, status: 'vencido', dias,
        label: `Vencido há ${prazoTexto(dias)}`,
        desc: `Periódico venceu em ${fmtDate(vencimento)} (último exame: ${fmtDate(base.data)}, a cada ${meses} meses). Colaborador sem ASO válido.`
    };
    // dias === 0: vence HOJE — ainda válido, mas "Vence em 0 dias" não é português.
    if (dias <= asoParams.alertaDias) return {
        ...comum, status: 'critico', dias,
        label: dias === 0 ? 'Vence hoje' : `Vence em ${prazoTexto(dias)}`,
        desc: `Agendar antes de ${fmtDate(vencimento)} — periodicidade de ${meses} meses definida no cargo.`
    };
    return {
        ...comum, status: 'em_dia', dias,
        label: `Vence em ${prazoTexto(dias)}`,
        desc: `Último exame em ${fmtDate(base.data)}. Próximo periódico até ${fmtDate(vencimento)}.`
    };
}

// ---- Gatilhos dos tipos NÃO periódicos ----
// Não inventam entidade nova: leem eventos que o módulo já registra e cobram o exame
// correspondente. Retorna [{ tipo, motivo, prazo, ref }] pendentes (sem ASO correspondente).
const ASO_RETORNO_DIAS_MIN = 30;   // NR-7: afastamento ≥ 30 dias exige exame de retorno
const ASO_TIPOS_AFASTAMENTO = ['Licença médica', 'Licença maternidade/paternidade'];

// `cargo` opcional: cargo isento ("Não se aplica") não gera pendência de nenhum tipo —
// admissional e demissional também são exigências do PCMSO, não só o periódico.
function asosPendentesPorEvento(f, asos, dados, ref, cargo) {
    const h = ref || hoje();
    if (asoIsento(cargo)) return [];
    const { demissoes = [], ausencias = [], promocoes = [], transferencias = [] } = dados || {};
    const feitos = (asos || []).filter(a => a.funcionarioId === f.id);
    const temApos = (tipo, dataEvento) => feitos.some(a => a.tipo === tipo && a.data >= dataEvento);
    const pend = [];

    // Admissional — obrigatório antes do início das atividades
    if (f.admissao && !feitos.some(a => a.tipo === 'Admissional'))
        pend.push({ tipo: 'Admissional', motivo: `Admissão em ${fmtDate(f.admissao)}`, prazo: f.admissao, ref: f.admissao });

    // Demissional — até 10 dias do desligamento
    demissoes.filter(d => d.funcionarioId === f.id && !temApos('Demissional', d.data))
        .forEach(d => pend.push({
            tipo: 'Demissional', motivo: `Desligamento em ${fmtDate(d.data)}`,
            prazo: addDias(d.data, 10), ref: d.data
        }));

    // Retorno ao trabalho — afastamento ≥ 30 dias por motivo médico
    ausencias.filter(a => a.funcionarioId === f.id
            && ASO_TIPOS_AFASTAMENTO.includes(a.tipo)
            && Number(a.dias) >= ASO_RETORNO_DIAS_MIN
            && !temApos('Retorno ao trabalho', a.retorno))
        .forEach(a => pend.push({
            tipo: 'Retorno ao trabalho', motivo: `${a.tipo} de ${prazoTexto(Number(a.dias))}`,
            prazo: a.retorno, ref: a.retorno
        }));

    // Mudança de risco — promoção ou transferência alteram função/ambiente
    promocoes.filter(p => p.funcionarioId === f.id && !temApos('Mudança de risco', p.data))
        .forEach(p => pend.push({ tipo: 'Mudança de risco', motivo: `Promoção em ${fmtDate(p.data)}`, prazo: p.data, ref: p.data }));
    transferencias.filter(t => t.funcionarioId === f.id && !temApos('Mudança de risco', t.data))
        .forEach(t => pend.push({ tipo: 'Mudança de risco', motivo: `Transferência em ${fmtDate(t.data)}`, prazo: t.data, ref: t.data }));

    // Só o que já é exigível (evento passado) — evento futuro ainda não gera pendência
    return pend.filter(p => p.ref <= h).sort((a, b) => a.prazo.localeCompare(b.prazo));
}

// Diagnóstico de ASO por UNIDADE, para o sino de notificações.
// O ASO é um controle por pessoa, mas o sino fala por unidade (igual aos outros alertas) —
// agrega aqui para a leitura do sino continuar uniforme. Retorna null quando não há nada
// a cobrar, para o chamador poder filtrar direto.
function diagnosticoAso(un, funcionarios, asos, cargos, ref) {
    const ativos = funcionarios.filter(f => f.unidadeId === un.id && !f.demissao);
    const cargoDe = f => (cargos || []).find(c => c.id === f.cargoId);
    const itens = ativos
        .map(f => ({ f, sit: situacaoAsoFunc(f, asos, cargoDe(f), ref) }))
        .filter(x => x.sit && (x.sit.status === 'vencido' || x.sit.status === 'sem_historico' || x.sit.status === 'critico'));
    if (!itens.length) return null;

    const conta = st => itens.filter(x => x.sit.status === st).length;
    return {
        nome: un.nome,
        vencidos: conta('vencido'),
        semHistorico: conta('sem_historico'),
        criticos: conta('critico'),
        // Ordena por urgência para a janela de detalhe mostrar o pior primeiro
        pessoas: itens
            .sort((a, b) => (ASO_ORDEM[a.sit.status] - ASO_ORDEM[b.sit.status]) || (a.sit.dias - b.sit.dias))
            .map(x => ({ funcionarioId: x.f.id, nome: x.f.nome, status: x.sit.status, label: x.sit.label, vencimento: x.sit.vencimento }))
    };
}

// Diagnóstico de FÉRIAS por UNIDADE, para o sino de notificações.
// Mesmo contrato de diagnosticoAso: agrega por unidade, retorna null quando não há nada a
// cobrar. Só vencida/crítica entram — aquisitivo em formação e "atenção" não são urgência.
function diagnosticoFerias(un, funcionarios, ausencias, ref) {
    const ativos = funcionarios.filter(f => f.unidadeId === un.id && !f.demissao);
    const itens = ativos
        .map(f => ({ f, sit: situacaoFeriasFunc(f, ausencias, ref) }))
        .filter(x => x.sit && (x.sit.status === 'vencida' || x.sit.status === 'critica'));
    if (!itens.length) return null;

    const conta = st => itens.filter(x => x.sit.status === st).length;
    return {
        nome: un.nome,
        vencidas: conta('vencida'),
        criticas: conta('critica'),
        pessoas: itens
            .sort((a, b) => (FERIAS_ORDEM[a.sit.status] - FERIAS_ORDEM[b.sit.status]) || (a.sit.dias - b.sit.dias))
            .map(x => ({
                funcionarioId: x.f.id, nome: x.f.nome, status: x.sit.status, label: x.sit.label,
                desc: x.sit.desc, concessivoFim: x.sit.concessivoFim,
                sugestao: sugestaoFerias(x.sit)
            }))
    };
}

// Distribuição dos exames projetados ao longo do tempo.
// Marcar 20 exames no mesmo dia na mesma unidade é lista de desejos, não agenda: a clínica
// não atende e o RH não organiza. Aqui o exame é um MARCO pontual (não um período como as
// férias), então o escalonamento empurra por DIA, respeitando um teto por dia/unidade.
// Retorna Map(funcionarioId → { data, adiado, base }).
function programacaoAso(itens, porDiaPorUnidade = 3) {
    const ocupacao = {};   // 'unidade|data' → quantidade já marcada
    const out = new Map();
    const h = hoje();

    // Quem vence primeiro marca primeiro
    [...itens].sort((a, b) => (ASO_ORDEM[a.sit.status] - ASO_ORDEM[b.sit.status]) || (a.sit.dias - b.sit.dias))
        .forEach(({ f, sit }) => {
            // Vencido/sem histórico → hoje (já está atrasado). Senão, na data de vencimento.
            const base = (sit.status === 'vencido' || sit.status === 'sem_historico')
                ? h : sit.vencimento;
            const uni = f.unidadeId || '-';
            let data = base, adiado = false;
            // Empurra para o próximo dia com vaga (limite de segurança: 60 dias)
            for (let i = 0; i < 60; i++) {
                const k = `${uni}|${data}`;
                if ((ocupacao[k] || 0) < porDiaPorUnidade) break;
                data = addDias(data, 1);
                adiado = true;
            }
            ocupacao[`${uni}|${data}`] = (ocupacao[`${uni}|${data}`] || 0) + 1;
            out.set(f.id, { data, adiado, base });
        });
    return out;
}

// ============ BANCO DE HORAS (CLT art. 59, §2º) ============
//
// Diferença essencial para a folha: a folha FECHA no mês (dezembro não deve nada a janeiro).
// O banco de horas ACUMULA até um prazo legal e, se estourar, vira dinheiro — o saldo positivo
// não compensado é pago como hora extra com adicional. Por isso o número que importa não é o
// saldo do mês, é o ACUMULADO DO CICLO e quantos dias faltam para ele fechar.
//
// O ciclo é DERIVADO, nunca gravado (mesma decisão do ASO): âncora = mês do primeiro
// lançamento do funcionário. Gravar um cicloId em cada linha apodrece no dia em que alguém
// lança um mês retroativo anterior ao "primeiro" — o id passa a apontar para um ciclo que não
// existe mais e ninguém percebe até o fechamento. A fórmula se recalcula e nunca mente.
//
// A âncora é o primeiro LANÇAMENTO, não a admissão: banco de horas nasce de um acordo de
// compensação, não do contrato. Quem nunca gerou saldo não tem ciclo — e isso é a melhor
// notícia possível, não uma pendência (o oposto do ASO, onde "sem histórico" é o pior caso).

const BH_PARAMS_PADRAO = { cicloMeses: 6, alertaDias: 45, tetoMensalMin: 600, adicionalPct: 50 };
let bhParams = { ...BH_PARAMS_PADRAO };
const setBhParams = p => {
    bhParams = {
        cicloMeses: Number(p?.bhCicloMeses) || BH_PARAMS_PADRAO.cicloMeses,
        alertaDias: Number(p?.bhAlertaDias) || BH_PARAMS_PADRAO.alertaDias,
        // Teto 0 = "sem teto", intencional — por isso ?? e não ||.
        tetoMensalMin: p?.bhTetoMensalMin == null ? BH_PARAMS_PADRAO.tetoMensalMin : Number(p.bhTetoMensalMin),
        adicionalPct: p?.bhAdicionalPct == null ? BH_PARAMS_PADRAO.adicionalPct : Number(p.bhAdicionalPct)
    };
};

const BH_DESTINOS = ['Pago como hora extra', 'Compensado', 'Perdoado', 'Descontado'];

// Destinos elegíveis para QUITAÇÃO — sempre um subconjunto de BH_DESTINOS, escolhido pelo
// SINAL do saldo do ciclo (formQuitacaoBh filtra por sign):
//   saldo positivo (empresa deve horas)   → só "Pago como hora extra": é a única forma de
//     pagamento na quitação; "Compensado" resolve em folga (não é um pagamento) e não faz
//     sentido aqui.
//   saldo negativo (funcionário deve horas) → "Descontado" (abate da folha do mês vigente,
//     ver descAtrasoDoMes) ou "Perdoado" (zera o saldo negativo sem mexer na folha).
const BH_DESTINOS_QUITACAO = ['Pago como hora extra', 'Descontado', 'Perdoado'];

// Único destino que vira hora extra na folha. "Descontado" também move dinheiro, mas no
// sentido oposto: é rubrica de desconto, e somá-lo como HE produziria hora extra negativa.
const BH_DESTINO_PAGO = 'Pago como hora extra';

// Destino da quitação. Quitações gravadas antes deste campo existir são pagamento de HE —
// era o único comportamento possível na época, e o valor já somava na folha como tal.
const destinoQuitacao = q => q?.destino || BH_DESTINO_PAGO;

// Ordem de urgência. `sem_ciclo` fica por ÚLTIMO — inversão deliberada em relação ao
// ASO_ORDEM, onde sem_historico é o primeiro: lá a ausência de dado é a pior notícia; aqui
// é a melhor. Mesmo motor, semântica oposta.
// `vedado` acompanha `sem_ciclo` no fim: também não é pendência — é a ausência de banco por
// imposição legal, e ninguém precisa agir.
const BH_ORDEM = { vencido: 0, critico: 1, atencao: 2, em_dia: 3, sem_ciclo: 4, vedado: 5 };
const BH_STATUS = {
    vencido:   { cls: 'badge-danger',  dot: 'st-vencida', txt: 'Ciclo vencido' },
    critico:   { cls: 'badge-warning', dot: 'st-critica', txt: 'Fecha em breve' },
    atencao:   { cls: 'badge-warning', dot: 'st-critica', txt: 'Saldo alto' },
    em_dia:    { cls: 'badge-neutral', dot: 'st-ok',      txt: 'Em dia' },
    sem_ciclo: { cls: 'badge-neutral', dot: 'st-ok',      txt: 'Sem banco' },
    vedado:    { cls: 'badge-neutral', dot: 'st-ok',      txt: 'Vedado (aprendiz)' }
};

// "Não tem banco de horas" — por não ter lançamento ou por vedação legal. Existe para que as
// listagens não precisem repetir a disjunção: todas elas querem a mesma coisa (quem NÃO entra
// na fila), e um filtro que testasse só `sem_ciclo` deixaria o aprendiz aparecer com um ciclo
// zerado depois que a vedação passou a existir.
const bhSemCiclo = sit => !sit || sit.status === 'sem_ciclo' || sit.status === 'vedado';

// ---- Aritmética de mês ('AAAA-MM') ----
// O banco é indexado por mês, não por dia (rh_banco_horas/{ano-mes}/{funcionarioId}), então
// a aritmética de ciclo é toda em meses. Não dá para reusar addMeses/mesesEntre: elas exigem
// data completa e devolveriam o dia junto, que aqui não existe e viraria fonte de erro.
const mesAdd = (mk, n) => {
    const [y, m] = mk.split('-').map(Number);
    const t = (y * 12 + (m - 1)) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const mesDiff = (a, b) => {
    const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
    return (yb * 12 + mb) - (ya * 12 + ma);
};
const mesDe = iso => (iso || '').slice(0, 7);
const mesHoje = () => hoje().slice(0, 7);
// Último dia do mês: dia 0 do mês seguinte. Usado para o fim do ciclo — o ciclo fecha no
// último dia do 6º mês, não no dia 1.
const fimDoMes = mk => {
    const [y, m] = mk.split('-').map(Number);
    return new Date(y, m, 0).toISOString().slice(0, 10);
};

// Hora não trabalhada tem TRÊS fontes que descrevem o mesmo efeito no saldo, e elas moram em
// campos separados porque só a primeira é editável na grade e só as duas primeiras são dívida
// DO FUNCIONÁRIO:
//   `atrasoMin`    — total do mês apurado à mão pelo RH na grade mensal.
//   `parcialMin`   — derivado dos lançamentos de Ausências parciais marcados para desconto.
//   `liberacaoMin` — derivado das Liberações coletivas: a empresa dispensou o pessoal mais
//                    cedo (ou o dia todo) por acordo, pagando o salário integral. É hora à
//                    disposição do empregador, a compensar em trabalho futuro — NUNCA em
//                    dinheiro. Por isso não pode ser somada em `atrasoMin`: quem decide o
//                    destino do saldo negativo precisa distinguir a dívida que a empresa pode
//                    cobrar da que ela própria concedeu (ver bhDescontavelMin).
const bhAtrasoLinha = l => (Number(l?.atrasoMin) || 0) + (Number(l?.parcialMin) || 0) + (Number(l?.liberacaoMin) || 0);
const bhSaldoLinha = l => (Number(l?.extraMin) || 0) - bhAtrasoLinha(l);

// Lançamentos de um funcionário, achatados de rh_banco_horas/{ano-mes}/{fid} para
// [{ mes, extraMin, atrasoMin, liberacaoMin, saldoMin }], ordenados por mês. Só até `ateMes`
// (default: mês corrente) — mês futuro não conta para o ciclo em curso.
function bhLancamentosFunc(fid, banco, ateMes) {
    const lim = ateMes || mesHoje();
    return Object.entries(banco || {})
        .filter(([mk, meses]) => mk <= lim && meses && meses[fid])
        .map(([mk, meses]) => ({
            mes: mk,
            extraMin: Number(meses[fid].extraMin) || 0,
            atrasoMin: bhAtrasoLinha(meses[fid]),
            // Separado do atraso porque tem regra própria no fechamento — o total continua
            // dentro de `atrasoMin` para que saldo, ciclo e gráficos não precisem saber disso.
            liberacaoMin: Number(meses[fid].liberacaoMin) || 0,
            saldoMin: bhSaldoLinha(meses[fid]),
            obs: meses[fid].obs || ''
        }))
        .sort((a, b) => a.mes.localeCompare(b.mes));
}

// ---- QUITAÇÃO: pagamento parcial DURANTE o ciclo ----
//
// Quitar ≠ fechar. Quitação paga meses específicos enquanto o ciclo corre: aqueles meses
// saem do saldo em aberto e ficam travados para edição (já viraram dinheiro), o ciclo
// continua e o cálculo segue com o restante. Fechamento encerra o ciclo — e só pode
// acontecer no fim dele ou por desligamento (ver podeFecharCiclo).
//
// Quita MESES INTEIROS, não um valor livre de horas: é o que torna o bloqueio preciso. Com
// um valor solto ("quitei 10h de 23h"), o sistema teria que adivinhar quais meses travar.

// Meses já quitados de um funcionário → Map(mes → quitação). Usado para travar a edição e
// para excluir do saldo em aberto.
function mesesQuitadosBh(fid, quitacoes) {
    const map = new Map();
    (quitacoes || [])
        .filter(q => q.funcionarioId === fid)
        .forEach(q => (q.meses || []).forEach(mk => map.set(mk, q)));
    return map;
}

// Um mês publicado que já foi quitado não pode ser editado: o valor virou pagamento, e
// mudar as horas depois faria a folha divergir do que foi pago sem ninguém perceber. Para
// corrigir, exclui-se a quitação primeiro — ato explícito e reversível.
const mesBhQuitado = (fid, mesKey, quitacoes) => mesesQuitadosBh(fid, quitacoes).get(mesKey) || null;

// Ciclo CORRENTE do funcionário. Mesmo contrato de retorno de situacaoAsoFunc
// ({ status, dias, label, desc, ... }) para reusar fila, badges e dots sem adaptador.
//
// `dias` > 0 = ainda tem prazo; < 0 = fechou há N dias. Mesma convenção de férias/ASO.
// `cargo` é opcional: sem ele o comportamento é o de sempre. Só existe para vedar o banco ao
// aprendiz — quem não tem o cargo à mão (código legado) continua funcionando igual.
function cicloBhFunc(f, banco, fechamentos, ref, quitacoes, cargo) {
    if (!f?.admissao) return null;
    const h = ref || hoje();
    const mesRef = mesDe(h);

    // Aprendiz não tem banco de horas: o art. 432 da CLT veda prorrogação E compensação da
    // jornada do contrato de aprendizagem. Sai ANTES de ler lançamentos porque o veto não
    // depende de haver saldo — se houver saldo lançado (importação, cargo trocado depois),
    // ele é irregular e o ciclo não pode ser fechado como compensação de qualquer forma.
    // Contrato de retorno idêntico ao de `sem_ciclo`: a UI lê essas chaves sem saber a origem.
    if (ehAprendiz(cargo)) return {
        status: 'vedado', dias: null, inicio: null, fim: null, indice: 0,
        acumuladoMin: 0, extraMin: 0, atrasoMin: 0, liberacaoMin: 0, meses: [], lancados: 0, fechados: 0,
        abertos: [], quitados: [], quitacoes: [], quitadoMin: 0, quitadoValor: 0, quitadoDescontado: 0,
        fechado: null, desligado: !!f.demissao && f.demissao <= h,
        podeFechar: false,
        motivoNaoFechar: 'Banco de horas vedado ao contrato de aprendizagem (art. 432 CLT).',
        label: 'Vedado (aprendiz)',
        desc: 'O art. 432 da CLT veda prorrogação e compensação de jornada do aprendiz. Hora excedente, se houver, é hora extra paga — não vai para banco.'
    };

    const lancs = bhLancamentosFunc(f.id, banco, mesRef);

    // Sem nenhum lançamento = sem acordo de compensação em vigor. Não é pendência.
    // Devolve o contrato COMPLETO (com abertos/quitados/podeFechar) mesmo vazio: a UI lê
    // essas propriedades sem saber qual ramo produziu o objeto, e um `undefined` aqui
    // apareceria como botão habilitado num ciclo que não existe.
    if (!lancs.length) return {
        status: 'sem_ciclo', dias: null, inicio: null, fim: null, indice: 0,
        acumuladoMin: 0, extraMin: 0, atrasoMin: 0, liberacaoMin: 0, meses: [], lancados: 0, fechados: 0,
        abertos: [], quitados: [], quitacoes: [], quitadoMin: 0, quitadoValor: 0, quitadoDescontado: 0,
        fechado: null, desligado: !!f.demissao && f.demissao <= h,
        podeFechar: false, motivoNaoFechar: 'Não há ciclo de banco de horas para este funcionário.',
        label: 'Sem banco de horas',
        desc: 'Nenhum saldo lançado. O ciclo começa no primeiro mês publicado.'
    };

    const cicloMeses = bhParams.cicloMeses;
    const ancora = lancs[0].mes;                       // âncora derivada: 1º lançamento existente
    const fechs = (fechamentos || []).filter(x => x.funcionarioId === f.id);
    const quitMap = mesesQuitadosBh(f.id, quitacoes);

    // Índice do ciclo corrente = quantos blocos de `cicloMeses` já passaram desde a âncora.
    // O ciclo "corrente" é o mais antigo AINDA EM ABERTO — não o do calendário.
    // Saltar direto para o bloco de hoje esconderia um ciclo vencido e não liquidado, que é
    // justamente o que vira passivo: o RH abriria a tela e veria "em dia" com dinheiro devido
    // dois ciclos atrás. Um ciclo só sai de cena quando é fechado (ato explícito) ou quando
    // encerrou zerado — aí não há o que cobrar.
    // Mês quitado não conta para o saldo EM ABERTO: ele já foi pago. Um ciclo cujos meses
    // foram todos quitados não tem mais nada a cobrar — não pode continuar prendendo o
    // "ciclo corrente", senão o RH ficaria preso num ciclo antigo já resolvido.
    const ultimoIdx = Math.floor(mesDiff(ancora, mesRef) / cicloMeses);
    const abertoDoIdx = i => {
        const ini = mesAdd(ancora, i * cicloMeses);
        const fm = mesAdd(ini, cicloMeses - 1);
        return lancs.filter(l => l.mes >= ini && l.mes <= fm && !quitMap.has(l.mes))
            .reduce((s, l) => s + l.saldoMin, 0);
    };
    let indice = ultimoIdx;
    for (let i = 0; i <= ultimoIdx; i++) {
        const ini = mesAdd(ancora, i * cicloMeses);
        const pendente = !fechs.some(x => x.cicloInicio === ini) && abertoDoIdx(i) !== 0;
        if (pendente) { indice = i; break; }
    }

    const inicio = mesAdd(ancora, indice * cicloMeses);
    const fimMes = mesAdd(inicio, cicloMeses - 1);
    const fim = fimDoMes(fimMes);                      // fecha no último DIA do último mês

    const doCiclo = lancs.filter(l => l.mes >= inicio && l.mes <= fimMes);
    // Meses do ciclo já quitados vs. ainda em aberto. `acumuladoMin` é o saldo EM ABERTO —
    // é ele que vira passivo, que o RH precisa compensar e que o fechamento liquida.
    const abertos = doCiclo.filter(l => !quitMap.has(l.mes));
    const quitados = doCiclo.filter(l => quitMap.has(l.mes));
    const acumuladoMin = abertos.reduce((s, l) => s + l.saldoMin, 0);
    const extraMin = abertos.reduce((s, l) => s + l.extraMin, 0);
    const atrasoMin = abertos.reduce((s, l) => s + l.atrasoMin, 0);
    // Parcela do atraso que veio de liberação coletiva. Anda junto do saldo o tempo todo, mas
    // o fechamento precisa dela isolada para não descontar do salário hora que a empresa deu.
    const liberacaoMin = abertos.reduce((s, l) => s + (l.liberacaoMin || 0), 0);
    const fechado = fechs.find(x => x.cicloInicio === inicio) || null;

    // Quitações que tocam este ciclo, para a janela de detalhe mostrar o histórico.
    const quitsDoCiclo = [...new Set(quitados.map(l => quitMap.get(l.mes)))]
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

    const dias = diasEntre(h, fim);
    const desligado = !!f.demissao && f.demissao <= h;

    // ---- Quando o ciclo pode ser FECHADO ----
    // Só no fim do ciclo (prazo cumprido) ou por desligamento. Fechar um ciclo em curso
    // seria apurar um saldo que ainda vai mudar — os meses seguintes ainda serão lançados.
    // Para pagar horas antes disso existe a QUITAÇÃO, que não encerra nada: paga os meses
    // já publicados e deixa o ciclo correndo.
    //
    // Sem essa regra, "fechar" virava sinônimo de "pagar" e o ciclo de 6 meses perdia o
    // sentido: cada pagamento zerava o prazo e reancorava o próximo ciclo no mês seguinte.
    const podeFechar = !fechado && (desligado || dias < 0);
    const motivoNaoFechar = fechado ? 'Este ciclo já foi fechado.'
        : podeFechar ? null
        : `O ciclo só pode ser fechado a partir de ${fmtDate(fim)} (fim do prazo) ou no desligamento. Para pagar horas antes disso, use uma quitação — ela paga os meses publicados e o ciclo continua correndo.`;

    const comum = {
        inicio, fim, fimMes, indice, ancora, cicloMeses,
        acumuladoMin, extraMin, atrasoMin, liberacaoMin, meses: doCiclo,
        abertos, quitados,
        quitacoes: quitsDoCiclo,
        quitadoMin: quitados.reduce((s, l) => s + l.saldoMin, 0),
        // Só o que virou pagamento. "Descontado" é dinheiro andando no sentido oposto —
        // somá-lo aqui inflaria o "já quitado (R$)" com valor que nunca saiu do caixa.
        quitadoValor: quitsDoCiclo
            .filter(q => destinoQuitacao(q) === BH_DESTINO_PAGO)
            .reduce((s, q) => s + (Number(q.valor) || 0), 0),
        quitadoDescontado: quitsDoCiclo
            .filter(q => destinoQuitacao(q) !== BH_DESTINO_PAGO)
            .reduce((s, q) => s + (Number(q.valor) || 0), 0),
        lancados: doCiclo.length, fechados: fechs.length, fechado,
        desligado, podeFechar, motivoNaoFechar
    };

    // Desligado com saldo aberto: a rescisão obriga o pagamento do saldo (art. 59, §3º) —
    // o prazo do ciclo deixa de valer. Vencido na hora, independente de data.
    if (f.demissao && f.demissao <= h && !fechado && acumuladoMin !== 0) return {
        ...comum, status: 'vencido', dias: diasEntre(h, f.demissao),
        label: 'Desligado com saldo em aberto',
        desc: `Desligamento em ${fmtDate(f.demissao)} com saldo de ${fmtHHMM(acumuladoMin)}. A rescisão exige a liquidação do saldo (art. 59, §3º).`
    };
    // Desligado e sem saldo: nada a liquidar, então nada a fechar — `podeFechar` seria
    // verdadeiro pela regra do desligamento, mas abriria um fechamento de saldo zero.
    if (f.demissao && f.demissao <= h) return {
        ...comum, status: 'sem_ciclo', dias: null, podeFechar: false,
        motivoNaoFechar: 'Sem saldo em aberto — não há o que liquidar.',
        label: 'Desligado', desc: 'Sem saldo em aberto no desligamento.'
    };

    if (fechado) return {
        ...comum, status: 'em_dia', dias,
        label: 'Ciclo fechado',
        desc: `Fechado em ${fmtDate(fechado.data)} — ${fechado.destino}. Próximo ciclo inicia em ${mesLabel(mesAdd(fimMes, 1))}.`
    };

    // Ciclo estourou o prazo e ninguém liquidou. Saldo zero não é problema: não há o que pagar.
    if (dias < 0 && acumuladoMin !== 0) return {
        ...comum, status: 'vencido', dias,
        label: `Vencido há ${prazoTexto(dias)}`,
        desc: `O ciclo fechou em ${fmtDate(fim)} com ${fmtHHMM(acumuladoMin)} e não foi liquidado. Saldo positivo não compensado é devido como hora extra com adicional.`
    };
    if (dias < 0) return {
        ...comum, status: 'em_dia', dias,
        label: 'Ciclo encerrado sem saldo',
        desc: `Fechou em ${fmtDate(fim)} zerado — nada a compensar ou pagar.`
    };

    if (dias <= bhParams.alertaDias && acumuladoMin !== 0) return {
        ...comum, status: 'critico', dias,
        label: dias === 0 ? 'Fecha hoje' : `Fecha em ${prazoTexto(dias)}`,
        desc: `${fmtHHMM(acumuladoMin)} acumulados e ${prazoTexto(dias)} para compensar. Depois de ${fmtDate(fim)}, o saldo positivo vira pagamento.`
    };

    // "Atenção": ainda há prazo, mas já não cabe compensar o saldo dentro dele nem estourando
    // o teto todo mês. O pagamento já é inevitável — avisar agora ainda dá margem de negociação.
    const mesesRestantes = mesDiff(mesRef, fimMes) + 1;
    const capacidade = bhParams.tetoMensalMin * mesesRestantes;
    if (bhParams.tetoMensalMin > 0 && acumuladoMin > capacidade) return {
        ...comum, status: 'atencao', dias,
        label: `Saldo acima da capacidade de compensação`,
        desc: `${fmtHHMM(acumuladoMin)} acumulados, mas só há ${mesesRestantes} ${mesesRestantes > 1 ? 'meses' : 'mês'} até ${fmtDate(fim)} (capacidade de ${fmtHHMM(capacidade)} no teto de ${fmtHHMM(bhParams.tetoMensalMin)}/mês). O excedente tende a virar pagamento.`
    };

    return {
        ...comum, status: 'em_dia', dias,
        label: `Fecha em ${prazoTexto(dias)}`,
        desc: `${fmtHHMM(acumuladoMin)} acumulados no ciclo ${mesLabel(inicio)} → ${mesLabel(fimMes)}.`
    };
}

// 'AAAA-MM' → "Mar/2026". Rótulo curto para eixos e textos de ciclo.
const mesLabel = mk => {
    const [y, m] = (mk || '').split('-');
    return m ? `${MESES[Number(m) - 1]}/${y}` : '—';
};

// Todos os ciclos do funcionário — fechados e o corrente. Base da sub-aba Ciclos e do
// mapa de ciclos em Resultados.
// ---- Ciclos ABERTOS de um funcionário ----
// `cicloBhFunc` devolve UM ciclo: o mais antigo em aberto — a prioridade de cobrança. Mas
// vencido-não-fechado e vigente coexistem de verdade: enquanto o RH não liquida o de trás,
// o funcionário continua lançando horas no da frente. Retornar só o primeiro faz a tela
// esconder o outro, e o RH nunca vê onde as horas de hoje estão caindo.
//
// Não é um ciclo "novo": a régua derivada da âncora já contém todos. Isto só para de
// esconder os que já existem.
function ciclosAbertosBh(f, banco, fechamentos, ref, quitacoes) {
    const h = ref || hoje();
    const hist = historicoCiclosBh(f, banco, fechamentos, ref, quitacoes);
    const doCalendario = mesDe(h);

    return hist
        .filter(c => {
            if (c.fechamento) return false;                     // fechado sai de cena
            // Um ciclo só existe onde há lançamento: a régua é derivada e se estende até
            // hoje, mas um bloco sem nenhuma hora publicada não é um ciclo em curso — é um
            // intervalo vazio do calendário. Mostrá-lo anunciaria um acordo de compensação
            // que ninguém abriu.
            if (!c.meses.length) return false;
            // Com lançamento, o ciclo do calendário aparece mesmo zerado: é onde as horas de
            // hoje caem, e o RH precisa vê-lo para saber onde está lançando. Os anteriores só
            // aparecem se tiverem saldo — ciclo velho que encerrou zerado não é pendência.
            if (doCalendario >= c.inicio && doCalendario <= c.fimMes) return true;
            return c.acumuladoMin !== 0;
        })
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
        .map((c, i, arr) => ({
            ...c,
            // "Vigente" = o do calendário (onde as horas de hoje entram).
            // "Vencido" = prazo estourado e ninguém liquidou. Os dois coexistem: enquanto o
            // RH não fecha o de trás, o funcionário segue lançando no da frente.
            vigente: doCalendario >= c.inicio && doCalendario <= c.fimMes,
            vencido: diasEntre(h, fimDoMes(c.fimMes)) < 0,
            // Prioridade de cobrança: o mais antigo em aberto. É o que cicloBhFunc devolve.
            prioritario: i === 0,
            ordem: i, totalAbertos: arr.length
        }));
}

// ---- REABRIR um ciclo fechado (retificação de erro) ----
// Fechar é um ato definitivo por natureza — mas erro de digitação existe, e sem uma saída o
// RH "corrigiria" criando um fechamento novo por cima, deixando dois registros do mesmo
// ciclo e dobrando o valor na folha.
//
// A trava: só enquanto NÃO houver horas lançadas depois do ciclo. Essas horas pertencem ao
// ciclo seguinte, e reabrir com elas no lugar deixaria dois ciclos abertos sobrepostos — o
// saldo em aberto viraria pergunta sem resposta.
//
// A régua derivada SEMPRE contém o bloco seguinte: o que bloqueia não é ele existir, é ele
// já ter horas publicadas dentro.
function podeReabrirCicloBh(f, fech, banco, ref) {
    if (!fech) return { pode: false, motivo: 'Fechamento não encontrado.' };

    const proxIni = mesAdd(fech.cicloFim || mesAdd(fech.cicloInicio, bhParams.cicloMeses - 1), 1);
    // Lançamento zerado não ancora ciclo nenhum: não é obstáculo para reabrir.
    const lancs = bhLancamentosFunc(f.id, banco, mesDe(ref || hoje()))
        .filter(l => l.mes >= proxIni && l.saldoMin !== 0);

    if (lancs.length) return {
        pode: false,
        motivo: `Já há horas lançadas em ${lancs.map(l => mesLabel(l.mes)).join(', ')} — elas pertencem ao ciclo seguinte. Reabrir criaria dois ciclos abertos ao mesmo tempo. Para retificar, apague antes as horas lançadas após ${mesLabel(fech.cicloFim || proxIni)}.`
    };

    return { pode: true, motivo: null };
}

function historicoCiclosBh(f, banco, fechamentos, ref, quitacoes) {
    const h = ref || hoje();
    const lancs = bhLancamentosFunc(f.id, banco, mesDe(h));
    if (!lancs.length) return [];
    const cicloMeses = bhParams.cicloMeses;
    const ancora = lancs[0].mes;
    const fechs = (fechamentos || []).filter(x => x.funcionarioId === f.id);
    const quitMap = mesesQuitadosBh(f.id, quitacoes);
    const total = Math.floor(mesDiff(ancora, mesDe(h)) / cicloMeses);

    return Array.from({ length: total + 1 }, (_, i) => {
        const inicio = mesAdd(ancora, i * cicloMeses);
        const fimMes = mesAdd(inicio, cicloMeses - 1);
        const meses = lancs.filter(l => l.mes >= inicio && l.mes <= fimMes);
        const abertos = meses.filter(l => !quitMap.has(l.mes));
        const quitados = meses.filter(l => quitMap.has(l.mes));
        const quits = [...new Set(quitados.map(l => quitMap.get(l.mes)))]
            .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
        return {
            indice: i, inicio, fimMes, fim: fimDoMes(fimMes), meses,
            // Saldo em ABERTO (quitado já virou dinheiro) — mesma semântica de cicloBhFunc,
            // senão o histórico contaria como devido algo que já foi pago.
            acumuladoMin: abertos.reduce((s, l) => s + l.saldoMin, 0),
            extraMin: abertos.reduce((s, l) => s + l.extraMin, 0),
            atrasoMin: abertos.reduce((s, l) => s + l.atrasoMin, 0),
            liberacaoMin: abertos.reduce((s, l) => s + (l.liberacaoMin || 0), 0),
            abertos, quitados, quitacoes: quits,
            quitadoMin: quitados.reduce((s, l) => s + l.saldoMin, 0),
            // Mesma separação de cicloBhFunc: "quitado (R$)" é só o que saiu do caixa.
            quitadoValor: quits
                .filter(q => destinoQuitacao(q) === BH_DESTINO_PAGO)
                .reduce((s, q) => s + (Number(q.valor) || 0), 0),
            quitadoDescontado: quits
                .filter(q => destinoQuitacao(q) !== BH_DESTINO_PAGO)
                .reduce((s, q) => s + (Number(q.valor) || 0), 0),
            fechamento: fechs.find(x => x.cicloInicio === inicio) || null,
            corrente: i === total
        };
    });
}

// ============ PERFIL DE REMUNERAÇÃO DO CARGO ============
//
// Perfil ≠ tipo. `tipo` (Operacional/Administrativo/Gestão/…) é classificação organizacional e
// alimenta os gráficos do dashboard. `perfil` decide só QUAIS verbas o cargo tem:
//
//   Estagiário → bolsa (Lei 11.788: bolsa não é salário, não gera encargos)
//   Funcionário → salário base
//   Diretor    → salário base + pró-labore (pode ter os dois: é sócio e empregado)
//   Aprendiz   → salário base, mas resolvido por HORA (art. 428 §2º CLT)
//
// Antes existia UM campo `salario` que mudava de significado conforme o tipo — o mesmo número
// virava bolsa, pró-labore ou salário. Por isso um diretor não conseguia ter as duas verbas.
//
// Aprendiz usa o mesmo campo `salarioBase` do funcionário porque é EMPREGADO CLT: a verba é
// salário de verdade (com 13º, férias, INSS e FGTS). O que muda não é a verba, é como o valor
// é resolvido (salarioBaseCargo) e a alíquota de FGTS (fgtsPctDe).
const CARGO_PERFIS = [
    { id: 'funcionario', label: 'Funcionário', desc: 'Salário base', campos: ['salarioBase'] },
    { id: 'estagiario', label: 'Estagiário', desc: 'Bolsa estágio', campos: ['bolsa'] },
    { id: 'aprendiz', label: 'Jovem Aprendiz', desc: 'Salário-hora mínimo · FGTS 2%', campos: ['salarioBase'] },
    { id: 'diretor', label: 'Diretor', desc: 'Salário base + pró-labore', campos: ['salarioBase', 'prolabore'] }
];

// Perfil de um cargo, com migração dos dados antigos: `tipo` era o que decidia a verba, então
// cargos já cadastrados continuam caindo no perfil equivalente sem ninguém reeditá-los.
const perfilCargo = c => c?.perfil
    || (c?.tipo === 'Estágio' ? 'estagiario'
        : c?.tipo === 'Aprendizagem' ? 'aprendiz'
        : c?.tipo === 'Diretoria' ? 'diretor' : 'funcionario');

const ehAprendiz = c => perfilCargo(c) === 'aprendiz';

const cargoTemCampo = (c, campo) =>
    (CARGO_PERFIS.find(p => p.id === perfilCargo(c))?.campos || []).includes(campo);

// Salário base do cargo, JÁ resolvido.
//
// `salarioMinimoFlag` grava a intenção ("este cargo paga o mínimo"), não o número: quando o
// mínimo muda em Parâmetros, todo cargo marcado acompanha sozinho. Gravar o valor faria cada
// reajuste do mínimo exigir reabrir e salvar cargo por cargo — e nada avisaria os defasados.
//
// Aceita `salarioBase` (novo) e `salario` (legado) — metade do código lia um, metade o outro.
// `f` é opcional e só importa para o aprendiz, cuja jornada é individual (ver abaixo).
function salarioBaseCargo(c, params, f) {
    if (!c) return 0;
    if (c.usaSalarioMinimo) {
        // Aprendiz recebe o salário mínimo-HORA (art. 428 §2º CLT), não o mínimo mensal: o
        // contrato é de jornada reduzida, e pagar o mínimo cheio por 6h/dia não é "mais
        // favorável", é confundir a base de cálculo. O divisor 220 é a jornada mensal integral
        // de referência (44h/semana) — quem trabalha 180h recebe 180/220 do mínimo.
        if (ehAprendiz(c)) return salarioAprendiz(params, jornadaDe(f));
        return Number(params?.salarioMinimo) || 0;
    }
    return Number(c.salarioBase ?? c.salario) || 0;
}

// Salário mínimo por hora e o salário do aprendiz para uma jornada. Separados porque a folha,
// o form de cargo e a listagem precisam mostrar o valor-hora ao RH, não só o total.
const salarioHoraMinimo = params => (Number(params?.salarioMinimo) || 0) / JORNADA_MENSAL_PADRAO;
const salarioAprendiz = (params, jornadaMes) =>
    Number((salarioHoraMinimo(params) * (Number(jornadaMes) || JORNADA_MENSAL_PADRAO)).toFixed(2));

// FGTS do cargo. Aprendiz recolhe 2% (art. 15 §7º da Lei 8.036/90) contra os 8% de todo mundo —
// é alíquota de lei, não escolha do RH, por isso não vira parâmetro configurável. Ponto único:
// todo lugar que multiplica base por FGTS passa por aqui.
const FGTS_PCT_APRENDIZ = 2;
const fgtsPctDe = (cargo, params) =>
    ehAprendiz(cargo) ? FGTS_PCT_APRENDIZ : (Number(params?.fgtsPct) || 0);

// ---- Limites legais do contrato de aprendizagem ----
// Idade: art. 428 (14 a 24 anos). Aprendiz com deficiência não tem teto (§5º).
const APRENDIZ_IDADE_MIN = 14;
const APRENDIZ_IDADE_MAX = 24;
// Prazo determinado: art. 428 §3º — máximo 2 anos, salvo aprendiz com deficiência (§8º).
const APRENDIZ_CONTRATO_MESES_MAX = 24;
// Jornada: art. 432 — 6h/dia (36h/semana → 180h/mês). Sobe para 8h/dia (220h/mês) apenas para
// quem já concluiu o ensino fundamental, e desde que as horas incluam a aprendizagem teórica.
const APRENDIZ_JORNADA_MES_MAX = 180;
const APRENDIZ_JORNADA_MES_MAX_FUND = 220;
// Cota de aprendizes: art. 429 — 5% a 15% dos trabalhadores em funções que demandam formação.
const COTA_APRENDIZ_MIN_PCT = 5;
const COTA_APRENDIZ_MAX_PCT = 15;
// Antecedência do alerta de término. 60 dias porque a decisão que o RH precisa tomar (efetivar,
// encerrar ou contratar substituto) não cabe em duas semanas.
const APRENDIZ_ALERTA_DIAS = 60;

// Teto de jornada do aprendiz. Depende da escolaridade: 8h/dia só para quem já concluiu o
// ensino fundamental (art. 432 §1º).
//
// A regra é por EXCLUSÃO, não por match de "completo": todo nível acima do fundamental já
// pressupõe o fundamental concluído — quem está com o médio incompleto terminou o fundamental.
// Testar `includes('completo')` reprovaria "Médio incompleto" e "Superior incompleto", que são
// exatamente os casos mais comuns num aprendiz.
const APRENDIZ_ESCOLARIDADE_SEM_FUNDAMENTAL = ['Fundamental incompleto'];
const aprendizConcluiuFundamental = f =>
    !!f?.escolaridade && !APRENDIZ_ESCOLARIDADE_SEM_FUNDAMENTAL.includes(f.escolaridade);
const aprendizJornadaMax = f =>
    aprendizConcluiuFundamental(f) ? APRENDIZ_JORNADA_MES_MAX_FUND : APRENDIZ_JORNADA_MES_MAX;

// Aprendiz com deficiência: sem teto de idade (art. 428 §5º) e sem o limite de 2 anos (§8º).
const aprendizSemLimite = f => !!f?.pcd;

// Termo final do contrato. Gravado na ficha (`contratoFim`); sem ele, projeta admissão + 24
// meses — o teto legal. Projetar em vez de calar segue a mesma escolha do ASO: um contrato por
// prazo determinado sem termo registrado é justamente o caso que vira vínculo indeterminado por
// descuido, e silêncio aqui esconderia o pior estado possível.
const APRENDIZ_ORDEM = { vencido: 0, critico: 1, em_dia: 2 };
const APRENDIZ_STATUS = {
    vencido: { cls: 'badge-danger',  dot: 'st-vencida', txt: 'Contrato vencido' },
    critico: { cls: 'badge-warning', dot: 'st-critica', txt: 'Termina em breve' },
    em_dia:  { cls: 'badge-neutral', dot: 'st-ok',      txt: 'Em vigor' }
};
const contratoAprendizFim = f =>
    f?.contratoFim || (f?.admissao ? addMeses(f.admissao, APRENDIZ_CONTRATO_MESES_MAX) : null);

// Situação do contrato de aprendizagem. Mesmo contrato de retorno de situacaoAsoFunc
// ({ status, dias, label, desc }) para reusar fila, badges e dots sem adaptador.
// `dias` > 0 = ainda em vigor; < 0 = venceu há N dias.
function situacaoAprendizFunc(f, cargo, ref) {
    if (!ehAprendiz(cargo)) return null;
    if (!f?.admissao || f.demissao) return null;
    const h = ref || hoje();
    if (f.admissao > h) return null;                  // admissão futura: nada a calcular

    const fim = contratoAprendizFim(f);
    // Aprendiz com deficiência sem termo gravado: o contrato pode legitimamente passar de 2
    // anos, então projetar um vencimento seria inventar uma pendência que a lei não cria.
    if (!f.contratoFim && aprendizSemLimite(f)) return null;

    const dias = diasEntre(h, fim);
    const derivado = !f.contratoFim;
    const origem = derivado
        ? `Termo não informado na ficha — projetado em ${APRENDIZ_CONTRATO_MESES_MAX} meses a partir da admissão (${fmtDate(f.admissao)}), o teto do art. 428 §3º da CLT.`
        : `Termo registrado na ficha.`;
    const comum = { fim, vencimento: fim, derivado };

    if (dias < 0) return {
        ...comum, status: 'vencido', dias,
        label: `Vencido há ${prazoTexto(dias)}`,
        desc: `O contrato de aprendizagem terminou em ${fmtDate(fim)}. Sem registro do desligamento ou da efetivação, o vínculo corre o risco de ser tratado como prazo indeterminado. ${origem}`
    };
    if (dias <= APRENDIZ_ALERTA_DIAS) return {
        ...comum, status: 'critico', dias,
        label: dias === 0 ? 'Termina hoje' : `Termina em ${prazoTexto(dias)}`,
        desc: `O contrato termina em ${fmtDate(fim)}. Decidir entre efetivação e desligamento antes da data. ${origem}`
    };
    return {
        ...comum, status: 'em_dia', dias,
        label: `Termina em ${prazoTexto(dias)}`,
        desc: `Contrato em vigor até ${fmtDate(fim)}. ${origem}`
    };
}

// Diagnóstico de contratos de aprendizagem por UNIDADE, para o sino.
// Mesmo contrato de diagnosticoAso: retorna null quando não há nada a cobrar.
function diagnosticoAprendiz(un, funcionarios, cargos, ref) {
    const ativos = funcionarios.filter(f => f.unidadeId === un.id && !f.demissao);
    const cargoDoFunc = f => (cargos || []).find(c => c.id === f.cargoId);
    const itens = ativos
        .map(f => ({ f, sit: situacaoAprendizFunc(f, cargoDoFunc(f), ref) }))
        .filter(x => x.sit && (x.sit.status === 'vencido' || x.sit.status === 'critico'));
    if (!itens.length) return null;

    const conta = st => itens.filter(x => x.sit.status === st).length;
    return {
        nome: un.nome,
        vencidos: conta('vencido'),
        criticos: conta('critico'),
        pessoas: itens
            .sort((a, b) => (APRENDIZ_ORDEM[a.sit.status] - APRENDIZ_ORDEM[b.sit.status]) || (a.sit.dias - b.sit.dias))
            .map(x => ({ funcionarioId: x.f.id, nome: x.f.nome, status: x.sit.status, label: x.sit.label, vencimento: x.sit.fim, derivado: x.sit.derivado }))
    };
}

// Verbas do cargo resolvidas, respeitando o perfil: um cargo de estagiário não tem salário
// base mesmo que o campo tenha sobrado gravado de uma troca de perfil.
function remuneracaoCargo(c, params, f) {
    const p = perfilCargo(c);
    const campos = CARGO_PERFIS.find(x => x.id === p)?.campos || [];
    return {
        perfil: p,
        salarioBase: campos.includes('salarioBase') ? salarioBaseCargo(c, params, f) : 0,
        bolsa: campos.includes('bolsa') ? (Number(c?.bolsa ?? c?.salario) || 0) : 0,
        prolabore: campos.includes('prolabore') ? (Number(c?.prolabore) || 0) : 0,
        usaSalarioMinimo: !!c?.usaSalarioMinimo
    };
}

// Salário do FUNCIONÁRIO para cálculos (hora extra, férias, passivo): o dele quando existe,
// senão o do cargo. Ponto único — antes cada arquivo resolvia isso à sua maneira, e dois deles
// liam `salarioBase` num cargo que só gravava `salario`.
const salarioDe = (f, cargo, params) =>
    Number(f?.salario) || salarioBaseCargo(cargo, params, f) || 0;

// ============ CÁLCULO DE FÉRIAS (CF art. 7º XVII, CLT arts. 129-145) ============
//
// Média de horas extras do período aquisitivo (Súmula 45 TST): HE habitual integra a
// remuneração de férias. Lê a mesma fonte da folha — banco de horas + Extra Banco — para não
// existirem duas verdades sobre quanto de HE a pessoa recebeu.
//
// Média sobre os meses do aquisitivo, não só os meses COM extra: quem fez HE em 3 de 12 meses
// não tem a média dos 3 — dividir só pelos meses com valor inflaria a base.
function mediaHeFerias(fid, aquisitivoIni, aquisitivoFim, fechamentos, extras, quitacoes) {
    if (!feriasParams.mediaHe) return { media: 0, meses: 0, total: 0, comValor: 0 };
    const meses = Math.max(1, Math.min(feriasParams.mediaHeMeses, mesesEntre(aquisitivoIni, aquisitivoFim) || 12));
    let total = 0, comValor = 0;
    for (let i = 0; i < meses; i++) {
        const mk = mesAdd(mesDe(aquisitivoIni), i);
        const v = heBancoDoMes(fid, mk, fechamentos, extras, quitacoes).total;
        if (v > 0) comValor++;
        total += v;
    }
    return { media: Number((total / meses).toFixed(2)), meses, total: Number(total.toFixed(2)), comValor };
}

// Adicional de periculosidade (art. 193 CLT, §1º): percentual FIXO de 30%, sempre sobre o
// SALÁRIO TOTAL do funcionário — nunca sobre o salário mínimo e nunca cumulativo com
// insalubridade na mesma base (a lei exige optar por um dos dois, mas aqui cada verba tem
// origem própria no cargo, então quem cadastra o cargo é quem decide o que marcar).
const PERICULOSIDADE_PCT = 30;
const calculoPericulosidade = (cargo, salario) =>
    cargo?.periculosidade ? Number((salario * PERICULOSIDADE_PCT / 100).toFixed(2)) : 0;

// Grau de insalubridade (NR-15) × base configurada em Parâmetros (salário do funcionário ou
// salário mínimo — art. 192 CLT manda mínimo, mas súmulas/CCTs às vezes elevam para o salário
// efetivo, daí a base ser configurável).
const calculoInsalubridade = (cargo, params, salario) => {
    const grau = Number(cargo?.insalubridade) || 0;
    const baseInsal = (params?.insalubridadeBase || 'salario') === 'minimo'
        ? (Number(params?.salarioMinimo) || 0) : salario;
    return Number((grau / 100 * baseInsal).toFixed(2));
};

// Remuneração de férias de UM lançamento.
//
// `dias` = dias gozados; `abonoDias` = dias vendidos (art. 143, até 1/3 do período). Ambos
// remunerados: o abono não é gozo, mas é pago — e sai da competência do mesmo jeito.
//
// O terço (art. 7º XVII CF) incide sobre gozo E abono: é adicional sobre a remuneração de
// férias, não sobre o tempo parado.
function calculoFerias(f, cargo, params, dias, abonoDias, opts) {
    const o = opts || {};
    // Ponto único: resolve salário do funcionário → cargo → salário mínimo (quando marcado).
    const salario = salarioDe(f, cargo, params);
    const insalubridade = calculoInsalubridade(cargo, params, salario);
    const periculosidade = calculoPericulosidade(cargo, salario);
    const mediaHe = Number(o.mediaHe) || 0;

    // Base = salário + insalubridade + periculosidade + média de HE habitual (Súmula 45 TST).
    const base = salario + insalubridade + periculosidade + mediaHe;
    // Divisor 30 é fixo em lei (art. 142: remuneração / 30 × dias), não é a jornada mensal.
    const valorDia = base / 30;
    const d = Math.max(0, Number(dias) || 0);
    const ab = Math.max(0, Number(abonoDias) || 0);

    const gozo = valorDia * d;
    const abono = valorDia * ab;
    const pct = Number(feriasParams.tercoPct) || 0;
    const tercoGozo = gozo * pct / 100;
    const tercoAbono = abono * pct / 100;

    // Adiantamento do 13º (Lei 4.749 art. 2º §2º): metade do salário, pago junto das férias.
    // Sai na coluna 13º da folha, não na de férias — são rubricas distintas no holerite.
    const adiantamento13 = o.adiantar13 ? Number((salario / 2).toFixed(2)) : 0;

    const totalFerias = gozo + tercoGozo + abono + tercoAbono;
    return {
        salario, insalubridade, periculosidade, mediaHe, base,
        valorDia: Number(valorDia.toFixed(4)),
        dias: d, abonoDias: ab,
        gozo: Number(gozo.toFixed(2)),
        terco: Number((tercoGozo + tercoAbono).toFixed(2)),
        tercoPct: pct,
        abono: Number(abono.toFixed(2)),
        adiantamento13,
        total: Number(totalFerias.toFixed(2)),
        // O que cai em cada coluna da folha: férias e 13º são rubricas separadas.
        totalComAdiantamento: Number((totalFerias + adiantamento13).toFixed(2))
    };
}

// Teto do abono: art. 143 — até 1/3 do período. Com 30 dias, 10.
const abonoMaxFerias = (diasTotais) => Math.min(
    feriasParams.abonoMaxDias,
    Math.floor((Number(diasTotais) || feriasParams.diasPorCiclo) / 3)
);

// ---- PONTE FÉRIAS → FOLHA ----
// Mesma arquitetura da ponte do banco de horas: coluna DERIVADA, recalculada a cada render.
// Mês de referência = mês do INÍCIO das férias (art. 145: o pagamento é até 2 dias antes do
// início). Um lançamento que atravessa o mês cai inteiro no mês em que começou — dividir o
// valor entre duas folhas divergiria do recibo, que é único.
function feriasDoMes(fid, mesKey, ausencias, funcionarios, cargos, params, ctx) {
    const c = ctx || {};
    const itens = [];
    (ausencias || [])
        .filter(a => a.funcionarioId === fid && a.tipo === 'Férias' && mesDe(a.inicio) === mesKey)
        .forEach(a => {
            const f = (funcionarios || []).find(x => x.id === fid);
            if (!f) return;
            const cargo = (cargos || []).find(x => x.id === f.cargoId);
            // Valor congelado no lançamento vence o recálculo: o recibo foi emitido com ele, e
            // uma promoção posterior não reescreve o que já foi pago.
            const calc = a.calculo && a.calculo.total != null
                ? a.calculo
                : calculoFerias(f, cargo, params, a.dias, a.abonoDias, {
                    mediaHe: c.mediaHe ? c.mediaHe(f, a) : 0,
                    adiantar13: !!a.adiantar13
                });
            itens.push({
                tipo: 'ferias', id: a.id,
                valor: Number(calc.total) || 0,
                adiantamento13: Number(calc.adiantamento13) || 0,
                dias: Number(a.dias) || 0, abonoDias: Number(a.abonoDias) || 0,
                desc: `Férias ${fmtDate(a.inicio)} a ${fmtDate(a.retorno)} (${a.dias} dias${a.abonoDias ? ` + ${a.abonoDias} de abono` : ''})`,
                data: a.inicio
            });
        });
    return {
        itens,
        total: Number(itens.reduce((s, i) => s + i.valor, 0).toFixed(2)),
        total13: Number(itens.reduce((s, i) => s + i.adiantamento13, 0).toFixed(2))
    };
}

// ---- Quanto de um saldo negativo pode virar desconto em folha ----
//
// Saldo negativo tem duas origens com naturezas jurídicas opostas. Atraso e ausência parcial
// são hora que o funcionário deve: descontável, se assim se acordou. Liberação coletiva é
// hora à disposição do empregador — a empresa mandou todo mundo embora mais cedo e pagou o
// salário integral; cobrá-la de volta em dinheiro transformaria uma liberalidade em desconto,
// que é o contrário do que o acordo diz. Só se recupera trabalhando depois.
//
// A imputação segue a ordem mais fiel ao acordo: a hora extra do ciclo abate PRIMEIRO o
// atraso próprio do funcionário; o que sobrar de dívida é liberação, e é indescontável. Sem
// essa ordem, a extra "pagaria" a liberação e sobraria atraso para descontar — o resultado
// perverso de a empresa cobrar justamente a hora que ela concedeu.
function bhDescontavelMin(sit) {
    const saldo = Number(sit?.acumuladoMin) || 0;
    if (saldo >= 0) return 0;
    const devido = -saldo;
    const lib = Number(sit?.liberacaoMin) || 0;
    if (!lib) return devido;
    const atrasoProprio = (Number(sit.atrasoMin) || 0) - lib;
    return Math.max(0, Math.min(devido, atrasoProprio - (Number(sit.extraMin) || 0)));
}

// Complemento de bhDescontavelMin: a parte do saldo devido que só se resolve em horas.
const bhIndescontavelMin = sit => {
    const saldo = Number(sit?.acumuladoMin) || 0;
    return saldo >= 0 ? 0 : -saldo - bhDescontavelMin(sit);
};

// Custo estimado de um saldo positivo, em R$. Estimativa, não folha: ignora insalubridade
// (para isso existe calculoHoraExtra) e serve para dimensionar risco agregado. Saldo
// negativo devolve 0 — hora que o funcionário deve não é passivo da empresa.
//
// `jornadaMes` é obrigatório na prática: quem chama deve passar jornadaDe(f), senão um
// contrato de 200h seria estimado a 220 e o passivo sairia ~10% menor do que é.
function passivoBh(saldoMin, salario, jornadaMes = JORNADA_MENSAL_PADRAO) {
    const min = Number(saldoMin) || 0;
    const sal = Number(salario) || 0;
    const jor = Number(jornadaMes) || JORNADA_MENSAL_PADRAO;
    if (min <= 0 || sal <= 0) return 0;
    return (min / 60) * (sal / jor) * (1 + bhParams.adicionalPct / 100);
}

// ---- Valor da hora extra: cálculo detalhado, para SUGERIR na tela ----
//
// Diferente de passivoBh (que estima um passivo agregado), aqui cada parcela é devolvida
// separada para a tela poder MOSTRAR a conta. Um valor sugerido que aparece pronto, sem
// origem, é um número que o RH não confere e não defende numa reclamatória — a memória de
// cálculo é o que transforma sugestão em decisão informada.
//
// Base = salário + insalubridade. A insalubridade integra a remuneração para efeito de
// hora extra (é parcela salarial, não indenizatória) — passivoBh ignora isso porque estima
// risco agregado; aqui, onde o número vira pagamento, a base tem que estar certa.

// 220h = 44h semanais, o divisor mais comum — não uma verdade universal: 40h/semana usa 200,
// 30h usa 150. Por isso a jornada é campo da FICHA (jornadaMensal), e não parâmetro global:
// dois colaboradores da mesma empresa podem ter contratos de jornada diferente, e o
// valor-hora de cada um sai do contrato dele.
const JORNADA_MENSAL_PADRAO = 220;
// Ficha › padrão. Cargo não entra: jornada é cláusula do contrato individual, não do cargo.
const jornadaDe = f => Number(f?.jornadaMensal) || JORNADA_MENSAL_PADRAO;

function calculoHoraExtra(f, cargo, params, minutos, adicionalPct, jornadaMes) {
    jornadaMes = Number(jornadaMes) || jornadaDe(f);
    // Ponto único: resolve salário do funcionário → cargo → salário mínimo (quando marcado).
    const salario = salarioDe(f, cargo, params);
    const insalubridade = calculoInsalubridade(cargo, params, salario);
    const periculosidade = calculoPericulosidade(cargo, salario);

    const base = salario + insalubridade + periculosidade;
    const valorHora = jornadaMes > 0 ? base / jornadaMes : 0;
    const horas = (Number(minutos) || 0) / 60;
    const pct = Number(adicionalPct) || 0;
    const valorHoraExtra = valorHora * (1 + pct / 100);
    const total = horas * valorHoraExtra;

    return {
        salario, insalubridade, periculosidade, base, jornadaMes,
        valorHora: Number(valorHora.toFixed(4)),
        valorHoraExtra: Number(valorHoraExtra.toFixed(4)),
        horas, adicionalPct: pct,
        total: Number(total.toFixed(2))
    };
}

// ============ 13º SALÁRIO (Lei 4.090/62, Lei 4.749/65, CF art. 7º VIII) ============
//
// A competência do 13º é o ANO CIVIL, não o aniversário de admissão — diferente das férias.
// Por isso a régua aqui é `ano`, e não `admissão + 12 meses`: quem entrou em março tem 10
// avos em dezembro, e em 1º de janeiro a competência recomeça do zero para todo mundo.
//
// Mesma decisão de arquitetura do banco de horas e das férias: **competência DERIVADA, nunca
// gravada**. Os avos são recalculados a cada render a partir da admissão, dos afastamentos e
// da demissão. Gravar o número de avos apodrece: uma licença lançada com atraso, uma
// admissão corrigida ou uma demissão em dezembro mudariam o direito, e o valor gravado
// continuaria mentindo. O que se grava é o PAGAMENTO (a parcela), nunca o direito.

const DECIMO_PARAMS_PADRAO = {
    // Lei 4.749 art. 2º: 1ª parcela entre 1º/fev e 30/nov; 2ª até 20/dez.
    prazo1Mes: 11, prazo1Dia: 30,
    prazo2Mes: 12, prazo2Dia: 20,
    // Avos: mês com ≥15 dias trabalhados conta integral (Lei 4.090 art. 1º §2º).
    diasParaAvo: 15,
    // Faltas INJUSTIFICADAS acima de 15 no mês descontam o avo. Parametrizável porque
    // convenção coletiva pode ser mais generosa, nunca menos.
    descontarFaltas: true,
    alertaDias: 30
};
let decimoParams = { ...DECIMO_PARAMS_PADRAO };
// Recebe o conjunto INTEIRO de parâmetros, não só o card salvo — mesmo motivo de
// setFeriasParams: salvar um card zerava os demais campos até o próximo reload.
const setDecimoParams = p => {
    const num = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
    decimoParams = {
        prazo1Mes: num(p?.decimoPrazo1Mes, DECIMO_PARAMS_PADRAO.prazo1Mes),
        prazo1Dia: num(p?.decimoPrazo1Dia, DECIMO_PARAMS_PADRAO.prazo1Dia),
        prazo2Mes: num(p?.decimoPrazo2Mes, DECIMO_PARAMS_PADRAO.prazo2Mes),
        prazo2Dia: num(p?.decimoPrazo2Dia, DECIMO_PARAMS_PADRAO.prazo2Dia),
        diasParaAvo: num(p?.decimoDiasParaAvo, DECIMO_PARAMS_PADRAO.diasParaAvo),
        // Checkbox: `??` e não `||` — false é escolha, não ausência.
        descontarFaltas: p?.decimoDescontarFaltas ?? DECIMO_PARAMS_PADRAO.descontarFaltas,
        alertaDias: num(p?.decimoAlertaDias, DECIMO_PARAMS_PADRAO.alertaDias)
    };
};

// Justa causa não gera direito a 13º proporcional (Súmula 14 TST + Lei 4.090 art. 3º).
// Os demais motivos — inclusive pedido de demissão e término de experiência — geram.
const DECIMO_SEM_DIREITO = ['Dispensa com justa causa'];
const demissaoGera13 = motivo => !DECIMO_SEM_DIREITO.includes(motivo || '');

// Tipos de parcela. A distinção não é cosmética: ela decide se há encargo.
//
// A 1ª parcela é ADIANTAMENTO (Lei 4.749 art. 2º §2º): sai sem INSS e sem IRRF. Os encargos
// incidem integralmente na 2ª, sobre o valor TOTAL do 13º. Tratar as duas igual cobraria
// encargo duas vezes sobre a mesma base e inflaria o custo da empresa em ~20% do 13º inteiro.
const DECIMO_TIPOS = [
    { id: 'primeira', label: '1ª parcela', desc: 'Adiantamento — só FGTS (Lei 4.749 art. 2º §2º); os demais encargos ficam para a 2ª', encargos: false },
    { id: 'segunda', label: '2ª parcela', desc: 'FGTS + demais encargos sobre o total do 13º', encargos: true },
    { id: 'integral', label: 'Parcela única', desc: 'Pagamento integral — FGTS + demais encargos sobre o total', encargos: true },
    { id: 'rescisao', label: 'Rescisão', desc: 'Proporcional no desligamento', encargos: true },
    // Competência já quitada (ambas as parcelas, parcela única ou rescisão) e o salário devido
    // em dezembro/na rescisão mudou depois — reajuste retroativo, dissídio, promoção lançada
    // tarde. Os encargos da parte já paga já foram recolhidos: só a DIFERENÇA leva encargo de
    // novo (ver calculo13), senão o "outros encargos" cobraria o 13º inteiro uma segunda vez.
    { id: 'complemento', label: 'Complemento (diferença retroativa)', desc: 'Diferença por reajuste após a competência já quitada — FGTS + encargos só sobre a diferença', encargos: true }
];
const decimoTipo = id => DECIMO_TIPOS.find(t => t.id === id) || DECIMO_TIPOS[0];

// ---- AVOS: quantos doze-avos o funcionário tem no ano ----
//
// Regra (Lei 4.090 art. 1º §2º): conta o mês em que trabalhou ≥15 dias. Fração igual ou
// superior a 15 dias = avo integral; abaixo disso, o mês não conta.
//
// A janela é a interseção entre o ano civil e o vínculo (admissão → demissão). Um mês só é
// avaliado se existir de fato: quem foi admitido em 20/03 tem 12 dias em março (não conta) e
// avos cheios de abril em diante.
//
// `ref` limita a projeção ao presente: em julho, o direito ACUMULADO é 7/12, não 12/12. Quem
// chama para efeito de PAGAMENTO em dezembro passa ref = 31/12 e recebe a competência cheia.
function avos13(f, ano, ausencias, ref) {
    if (!f?.admissao) return { avos: 0, meses: [], inicio: null, fim: null };
    const iniAno = `${ano}-01-01`;
    const fimAno = `${ano}-12-31`;
    const h = ref || hoje();

    // Vínculo dentro do ano: começa na admissão (ou 1º/jan) e termina na demissão (ou 31/dez).
    const inicio = f.admissao > iniAno ? f.admissao : iniAno;
    const fimVinculo = f.demissao && f.demissao < fimAno ? f.demissao : fimAno;
    // Nunca projeta além de hoje: 12 avos em julho seria direito que ainda não existe.
    const fim = fimVinculo > h ? h : fimVinculo;
    if (inicio > fim) return { avos: 0, meses: [], inicio, fim };

    // Faltas injustificadas por mês — só elas descontam o avo. Falta justificada, licença
    // médica (até 15 dias) e férias NÃO interrompem o cômputo: o mês é tempo de serviço.
    const faltas = {};
    if (decimoParams.descontarFaltas) {
        (ausencias || [])
            .filter(a => a.funcionarioId === f.id && a.tipo === 'Falta injustificada')
            .forEach(a => {
                // Uma ausência pode atravessar meses: distribui dia a dia no mês certo.
                //
                // `retorno` é o dia de VOLTA ao trabalho, não o último dia ausente — é a
                // convenção do resto do sistema (formAusencia calcula dias = diasEntre(inicio,
                // retorno), e 01/07→31/07 dá 30 dias, não 31). Por isso o limite é exclusivo:
                // contar o retorno inflaria toda ausência em um dia, e uma falta de 14 dias
                // viraria 15 — exatamente o limiar que destrói o avo.
                let d = a.inicio;
                const ate = a.retorno || addDias(a.inicio, 1);
                let guard = 0;
                while (d < ate && guard++ < 400) {
                    if (d.slice(0, 4) === String(ano)) faltas[mesDe(d)] = (faltas[mesDe(d)] || 0) + 1;
                    d = addDias(d, 1);
                }
            });
    }

    const meses = [];
    for (let m = 0; m < 12; m++) {
        const mk = `${ano}-${String(m + 1).padStart(2, '0')}`;
        const primeiroDia = `${mk}-01`;
        const ultimoDia = `${mk}-${String(new Date(ano, m + 1, 0).getDate()).padStart(2, '0')}`;
        // Dias do mês dentro do vínculo E já decorridos.
        const de = primeiroDia > inicio ? primeiroDia : inicio;
        const ate = ultimoDia < fim ? ultimoDia : fim;
        if (de > ate) { meses.push({ mes: m, mesKey: mk, dias: 0, faltas: 0, conta: false }); continue; }
        const dias = diasEntre(de, ate) + 1;
        const flt = faltas[mk] || 0;
        // Dias efetivos = dias do vínculo no mês − faltas injustificadas.
        const efetivos = Math.max(0, dias - flt);
        const conta = efetivos >= decimoParams.diasParaAvo;
        meses.push({ mes: m, mesKey: mk, dias, faltas: flt, efetivos, conta });
    }
    return { avos: meses.filter(x => x.conta).length, meses, inicio, fim };
}

// ---- INSS (desconto do empregado, por faixa progressiva) ----
//
// Faixas padrão (2026) — usadas só quando params.inssFaixas está vazio/ausente.
const INSS_FAIXAS_PADRAO = [
    { ate: 1621.00, aliquota: 7.5 },
    { ate: 2902.84, aliquota: 9 },
    { ate: 4354.27, aliquota: 12 },
    { ate: 8475.55, aliquota: 14 }
];

// Cálculo progressivo por faixa: cada fatia da base paga a alíquota da SUA faixa, os
// resultados se somam (não é uma alíquota efetiva única sobre o total). Base acima do
// limite da última faixa não gera INSS adicional — é o teto do RGPS, o valor já é o
// máximo da tabela.
function calculoInss(base, faixas) {
    const f = (faixas && faixas.length ? faixas : INSS_FAIXAS_PADRAO)
        .slice().sort((a, b) => a.ate - b.ate);
    let restante = Math.max(0, Number(base) || 0);
    let anterior = 0;
    let total = 0;
    for (const faixa of f) {
        if (restante <= 0) break;
        const larguraFaixa = faixa.ate - anterior;
        const nesta = Math.min(restante, larguraFaixa);
        if (nesta > 0) total += nesta * (Number(faixa.aliquota) || 0) / 100;
        restante -= nesta;
        anterior = faixa.ate;
    }
    return Number(total.toFixed(2));
}

// ---- CÁLCULO DO 13º ----
//
// Base = salário + insalubridade + média de HE habitual (Súmula 45 TST — a mesma regra das
// férias, e lendo a MESMA fonte via ctx.mediaHe, para não existirem duas verdades sobre
// quanto de extra a pessoa recebeu).
//
// Bolsa de estágio não entra: estagiário não tem 13º (Lei 11.788 — bolsa não é salário).
// Pró-labore também não: é remuneração de sócio, não gera 13º.
function calculo13(f, cargo, params, avos, opts) {
    const o = opts || {};
    const salario = salarioDe(f, cargo, params);
    // Estagiário não tem direito a 13º. `remuneracaoCargo` respeita o perfil do cargo.
    const perfil = perfilCargo(cargo);
    if (perfil === 'estagiario') {
        return { semDireito: 'estagiario', salario: 0, base: 0, avos: 0, integral: 0, total: 0, bruto: 0, encargos: 0 };
    }
    const insalubridade = calculoInsalubridade(cargo, params, salario);
    const periculosidade = calculoPericulosidade(cargo, salario);
    const mediaHe = Number(o.mediaHe) || 0;

    const base = salario + insalubridade + periculosidade + mediaHe;
    const a = Math.max(0, Math.min(12, Number(avos) || 0));
    // Valor cheio do 13º pelos avos: base ÷ 12 × avos.
    const integral = Number((base / 12 * a).toFixed(2));

    // Quanto já foi pago/adiantado — inclusive o adiantamento junto das férias.
    const jaPago = Number(o.jaPago) || 0;
    const tipo = o.tipo || 'primeira';

    // ---- Valor SUGERIDO da parcela ----
    //
    // A 1ª parcela é dimensionada em AVOS (`avosParcela` = metade do art. 2º da Lei 4.749).
    // Avos e não um percentual porque é assim que a folha raciocina: "paguei 5 dos 10 avos
    // dele". A metade é sempre relativa ao DIREITO do funcionário na competência (`a`), não a
    // uma constante de 12 — quem tem 10 avos (admitido em março) recebe metade de 10 = 5, não
    // metade de um ano cheio que ele não tem. A régua é sempre visual e não é mais escolha do
    // RH, então não existe mais um padrão fixo configurável.
    //
    // O adiantamento das férias NÃO consome avos: ele abate em REAIS, depois. Os avos dizem o
    // tamanho da parcela; o abatimento evita o pagamento em dobro. Converter o adiantamento em
    // avos quebraria quando ele não fosse múltiplo exato de um avo, ou quando houvesse
    // promoção entre as férias e novembro (o avo de julho não vale o mesmo que o de novembro).
    //
    // 2ª parcela: os avos RESTANTES (integral − avos já pagos na 1ª), que é o complemento.
    // Parcela única e rescisão pagam tudo: escolher avos nelas seria escolher pagar menos que
    // o devido, sem base legal.
    const valorAvo = base / 12;
    // Avos DESTA parcela. Só a 1ª é dimensionável; as demais fecham o que falta.
    // Teto nos avos do direito: ninguém antecipa 8 avos de quem só tem 7.
    const avosParcela = tipo === 'primeira'
        ? Math.max(0, Math.min(a, Number(o.avosParcela ?? Math.floor(a / 2))))
        : a;
    const bruto = tipo === 'primeira'
        ? Math.max(0, Number((valorAvo * avosParcela - jaPago).toFixed(2)))
        : Math.max(0, Number((integral - jaPago).toFixed(2)));

    // ---- FGTS: incide em TODA parcela, inclusive a 1ª (Lei 8.036 art. 15 — o depósito é
    // devido sobre qualquer remuneração paga, e o adiantamento do 13º é remuneração). Base é
    // o valor PAGO nesta parcela (`bruto`), não o integral: cada depósito de FGTS acompanha o
    // dinheiro que realmente saiu naquele mês, e somar os dois depósitos (1ª + 2ª) fecha no
    // mesmo total de "FGTS sobre o integral" sem exigir recolhimento antecipado sobre o que
    // ainda não foi pago.
    // Alíquota vem do cargo, não do parâmetro global: o aprendiz recolhe 2% também no 13º.
    const pctFgts = fgtsPctDe(cargo, params);
    const fgts = Number((bruto * pctFgts / 100).toFixed(2));

    // INSS (desconto do EMPREGADO, por faixa progressiva): só nas parcelas que o têm — a 1ª
    // é adiantamento puro, sem incidência (Lei 4.749 art. 2º §2º). A base é o 13º INTEGRAL,
    // não a parcela: o fato gerador é o 13º inteiro, recolhido de uma vez na segunda parcela.
    // Calcular sobre a parcela recolheria a menor.
    //
    // Exceção: `complemento` já teve o integral ANTERIOR totalmente recolhido (é por definição
    // uma competência que já estava quitada). Cobrar de novo sobre o integral NOVO bitributaria
    // a parte que já pagou INSS — a base correta aqui é só a diferença (`bruto`).
    //
    // Diferente do FGTS, o INSS não é custo da empresa: é retenção sobre o que o funcionário
    // receberia, então NÃO entra em `encargos`/`total` (custo empresa) — só reduz `liquido`.
    const baseInss = tipo === 'complemento' ? bruto : integral;
    const inss = decimoTipo(tipo).encargos ? calculoInss(baseInss, params?.inssFaixas) : 0;
    const encargos = fgts;

    return {
        salario, insalubridade, periculosidade, mediaHe, base,
        avos: a,
        integral,
        // `avosParcela` = quantos avos ESTA parcela paga; `valorAvo` = quanto vale cada um.
        // A tela mostra os dois na memória de cálculo — "6 × R$ 250" se confere, "R$ 1.500" não.
        avosParcela, valorAvo: Number(valorAvo.toFixed(2)),
        jaPago,
        tipo,
        bruto,
        // `encargos` = FGTS (único custo empresa que resta aqui — INSS não é custo empresa).
        fgts, fgtsPct: pctFgts,
        encargos,
        // INSS: desconto do empregado sobre o 13º, calculado por faixa (ver calculoInss).
        inss,
        // Custo da empresa nesta parcela: o que sai de caixa + FGTS. INSS não soma aqui —
        // é retenção sobre o próprio `bruto`, não custo adicional.
        total: Number((bruto + encargos).toFixed(2)),
        // Valor que efetivamente chega ao funcionário nesta parcela.
        liquido: Number((bruto - inss).toFixed(2))
    };
}

// ---- Adiantamento de 13º já pago nas FÉRIAS, no ano ----
//
// A ponte que liga os dois módulos. Lê a MESMA fonte que a folha lê (`ausencias` com
// `adiantar13`) — nunca uma cópia gravada: se o RH corrigir o lançamento de férias, o
// abatimento da 1ª parcela acompanha sozinho.
//
// Mês de referência = INÍCIO das férias (art. 145), idêntico a feriasDoMes: o adiantamento
// sai no mesmo recibo das férias.
function adiantamentos13Ferias(fid, ano, ausencias, funcionarios, cargos, params, ctx) {
    const c = ctx || {};
    const itens = [];
    (ausencias || [])
        .filter(a => a.funcionarioId === fid && a.tipo === 'Férias' && a.adiantar13
            && (a.inicio || '').slice(0, 4) === String(ano))
        .forEach(a => {
            const f = (funcionarios || []).find(x => x.id === fid);
            if (!f) return;
            const cargo = (cargos || []).find(x => x.id === f.cargoId);
            // Valor congelado no lançamento vence o recálculo — mesma regra de feriasDoMes.
            const calc = a.calculo && a.calculo.total != null
                ? a.calculo
                : calculoFerias(f, cargo, params, a.dias, a.abonoDias, {
                    mediaHe: c.mediaHe ? c.mediaHe(f, a) : 0,
                    adiantar13: true
                });
            const v = Number(calc.adiantamento13) || 0;
            if (v > 0) itens.push({ id: a.id, valor: v, data: a.inicio, mesKey: mesDe(a.inicio) });
        });
    return { itens, total: Number(itens.reduce((s, i) => s + i.valor, 0).toFixed(2)) };
}

// Ano do primeiro mês de folha PUBLICADO para o funcionário — a âncora real de quando a
// empresa passou a gerir a remuneração dele por este sistema. Mesma lógica da âncora do banco
// de horas (ancora = primeiro lançamento, nunca a admissão, ver cicloBhFunc em bancohoras.js):
// uma empresa que adere ao sistema com um funcionário antigo (admitido anos atrás, mas com
// folha só a partir de agora) não pode ver pendência de 13º dos anos que nunca geriu por
// aqui — são números que ninguém consegue conferir nem pagar retroativamente, e o sistema
// acabaria criando dívida que não existe (ou que já foi paga fora dele).
function anoAncoraFolha(fid, folha) {
    const meses = Object.keys(folha || {}).filter(mk => folha[mk]?.[fid]);
    if (!meses.length) return null;
    return Number(meses.sort()[0].slice(0, 4));
}

// ---- SITUAÇÃO DO 13º de um funcionário no ano ----
//
// Consolida numa estrutura só: direito (avos), o que já foi adiantado nas férias, quais
// parcelas foram lançadas e o que falta pagar. É o que a aba renderiza e o que o lembrete lê.
function situacao13Func(f, ano, ctx) {
    const c = ctx || {};
    const h = c.ref || hoje();
    if (!f?.admissao) return null;
    if (f.admissao.slice(0, 4) > String(ano)) return null;          // admitido depois do ano
    if (f.demissao && f.demissao.slice(0, 4) < String(ano)) return null; // saiu antes do ano

    // Ano anterior à âncora da folha: fora do que o sistema gerencia — não é pendência, é
    // história que aconteceu antes da empresa aderir. `ctx.folha` é opcional (ver
    // anoAncoraFolha): sem ele, nenhum corte é aplicado — mesmo comportamento de antes.
    const ancoraFolha = anoAncoraFolha(f.id, c.folha);
    if (ancoraFolha != null && Number(ano) < ancoraFolha) return null;

    const cargo = (c.cargos || []).find(x => x.id === f.cargoId);
    // Estagiário não tem 13º — não entra na fila (Lei 11.788).
    if (perfilCargo(cargo) === 'estagiario') return null;

    // Demitido por justa causa perde o 13º proporcional (Súmula 14 TST).
    const dem = (c.demissoes || []).find(d => d.funcionarioId === f.id
        && (d.data || '').slice(0, 4) === String(ano));
    const semDireito = dem && !demissaoGera13(dem.motivo);

    const fimAno = `${ano}-12-31`;

    // ---- O DIREITO É O DO ANO INTEIRO, não o acumulado até hoje ----
    //
    // Fracionar em avos pelo tempo já decorrido só faz sentido na RESCISÃO. Quem está
    // empregado tem direito ao 13º da competência inteira: contratado em ano anterior recebe
    // os 12 meses cheios, independentemente de quantos já se cumpriram — pagar "7/12 porque
    // estamos em julho" seria antecipação parcial de um direito que já é integral, e a 1ª
    // parcela (metade do 13º) sairia menor do que a lei manda.
    //
    // A régua de avos continua sendo a mesma; o que muda é ATÉ ONDE ela conta:
    //   - demitido        → até a demissão (proporcional real, art. 3º da Lei 4.090)
    //   - admitido no ano → até 31/12, e `avos13` já começa na admissão (março → 10/12)
    //   - admitido antes  → até 31/12 = 12/12
    // Faltas injustificadas seguem derrubando o avo em qualquer caso (art. 1º §2º) — é a
    // única exceção aos 12 meses cheios de quem é da casa.
    const refAvos = f.demissao && f.demissao <= fimAno ? f.demissao : fimAno;
    const av = avos13(f, ano, c.ausencias, refAvos);

    // Provisão CONTÁBIL: o quanto do 13º já "venceu" até hoje, para dimensionar a reserva mês
    // a mês. Não é o que se paga — para isso existe `av` acima. Um funcionário antigo aparece
    // com 7/12 provisionados em julho e 12/12 devidos: os dois números são corretos e
    // respondem perguntas diferentes.
    const avAcum = avos13(f, ano, c.ausencias, refAvos < h ? refAvos : h);

    const adiant = adiantamentos13Ferias(f.id, ano, c.ausencias, c.funcionarios, c.cargos, c.params, c);
    // `ignorarParcela` = a parcela em edição. Sem isso, reabrir um lançamento faria a própria
    // parcela entrar em `jaPago`: o sugerido cairia a zero e o alerta de "valor acima do
    // saldo" dispararia num registro que não mudou de valor.
    const parcelas = (c.decimos || [])
        .filter(d => d.funcionarioId === f.id && Number(d.ano) === Number(ano)
            && (!c.ignorarParcela || d.id !== c.ignorarParcela))
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

    const pagoParcelas = parcelas.reduce((s, p) => s + (Number(p.bruto) || 0), 0);
    // O que já saiu de caixa a título de 13º: parcelas lançadas + adiantamento das férias.
    const pagoTotal = Number((pagoParcelas + adiant.total).toFixed(2));

    const mediaHe = c.mediaHe13 ? c.mediaHe13(f, ano) : 0;
    const calcDireito = calculo13(f, cargo, c.params, av.avos, { mediaHe });
    const calcAcum = calculo13(f, cargo, c.params, avAcum.avos, { mediaHe });

    const devido = semDireito ? 0 : calcDireito.integral;
    const saldo = Number((devido - pagoTotal).toFixed(2));

    // Estado da competência do ano.
    const temPrimeira = parcelas.some(p => p.tipo === 'primeira');
    const quitado = Math.abs(saldo) < 0.01 || saldo < 0;
    const estado = semDireito ? 'sem_direito'
        : quitado && (parcelas.length > 0 || adiant.total > 0) ? 'quitado'
        : f.demissao && f.demissao <= fimAno ? 'rescisao'
        : pagoTotal > 0 ? 'parcial'
        : 'aberto';

    return {
        funcionario: f, cargo, ano,
        // `avos` = os que geram o pagamento (ano inteiro, ou até a demissão).
        // `avosAcumulados` = os já vencidos até hoje, só para a provisão contábil.
        avos: av.avos, meses: av.meses, avosAcumulados: avAcum.avos,
        base: calcDireito.base, salario: calcDireito.salario,
        insalubridade: calcDireito.insalubridade, periculosidade: calcDireito.periculosidade, mediaHe,
        devido, provisao: semDireito ? 0 : calcAcum.integral,
        adiantamentoFerias: adiant.total, adiantamentoItens: adiant.itens,
        parcelas, pagoParcelas, pagoTotal, saldo,
        temPrimeira, semDireito, motivoSemDireito: semDireito ? dem?.motivo : null,
        demissao: dem || null,
        estado
    };
}

// ---- Prazos legais do ano (Lei 4.749 art. 2º) ----
// Derivados do ano + parâmetros, nunca gravados: mudar o parâmetro corrige todos os anos.
function prazos13(ano) {
    const p = decimoParams;
    const d = (mes, dia) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    return {
        primeira: d(p.prazo1Mes, p.prazo1Dia),
        segunda: d(p.prazo2Mes, p.prazo2Dia)
    };
}

// ============ PONTE 13º → FOLHA ============
//
// Mesma arquitetura do `heBanco` e do `feriasCalc`: coluna DERIVADA (`decimoCalc`),
// recalculada a cada render a partir das parcelas lançadas. A coluna `decimo` manual continua
// editável e intocada — convenção coletiva muda o cálculo, e o RH precisa de um lugar para o
// ajuste que o próximo render não apague.
//
// Somar o lançamento na célula manual faria a primeira correção do RH apagar o que o sistema
// postou; gravar o derivado o faria apodrecer na primeira promoção. Por isso: coluna própria,
// read-only, viva.
//
// Mês de referência = data do PAGAMENTO da parcela, não o fim da competência: é quando o
// dinheiro sai do caixa, e é o que o recibo mostra.
function decimoDoMes(fid, mesKey, decimos) {
    const itens = (decimos || [])
        .filter(d => d.funcionarioId === fid && mesDe(d.data) === mesKey)
        .map(d => ({
            id: d.id, tipo: d.tipo,
            valor: Number(d.bruto) || 0,
            encargos: Number(d.encargos) || 0,
            inss: Number(d.inss) || 0,
            desc: `${decimoTipo(d.tipo).label} do 13º/${d.ano}${d.avos ? ` — ${d.avos}/12 avos` : ''}`,
            data: d.data
        }));
    return {
        itens,
        total: Number(itens.reduce((s, i) => s + i.valor, 0).toFixed(2)),
        encargos: Number(itens.reduce((s, i) => s + i.encargos, 0).toFixed(2)),
        inss: Number(itens.reduce((s, i) => s + i.inss, 0).toFixed(2))
    };
}

// ============ PONTE BANCO DE HORAS → FOLHA ============
//
// Decisão: a folha NÃO recebe a soma gravada na célula "Hora extra". Ela ganha uma coluna
// DERIVADA (`heBanco`), calculada a cada render a partir dos fechamentos pagos e dos
// lançamentos de Extra Banco do mês.
//
// Por que não somar direto na célula manual: a folha é uma grade editável. Somado o
// fechamento no valor digitado, o número vira uma mistura sem origem — e na primeira vez
// que o RH corrigir a parte manual, apaga a parte automática junto. O fechamento continua
// registrado, a folha não. Coluna própria e read-only torna isso impossível por construção,
// e mantém a resposta para "de onde veio esse valor?" a um clique.
//
// É a mesma razão pela qual o ciclo não é gravado (ver cicloBhFunc): derivado se autocorrige,
// gravado apodrece.

// Mês de referência de um fechamento = mês da DATA do fechamento, não do fim do ciclo.
// O ciclo pode fechar em 31/ago e o pagamento acontecer na folha de setembro; quem manda é
// quando o dinheiro sai, que é o que o RH lança.
const mesRefFechamento = fech => mesDe(fech?.data);

// Hora extra vinda do banco de horas para {mês}/{funcionário}, com a origem preservada.
// Retorna { total, itens: [{ tipo, valor, ... }] } — a tela mostra o total e explica a
// composição sem precisar refazer a conta.
//
// Três origens, todas dinheiro que sai no mês de referência: fechamento de ciclo (paga o
// saldo final), QUITAÇÃO (paga meses durante o ciclo) e Extra Banco (HE fora do banco).
function heBancoDoMes(fid, mesKey, fechamentos, extras, quitacoes) {
    const itens = [];

    // Quitações: pagamento parcial durante o ciclo. Mês de referência = data do pagamento,
    // mesma regra do fechamento — quem manda é quando o dinheiro sai, não quais meses foram
    // quitados (uma quitação de jan+fev paga em maio cai na folha de maio).
    // Só "Pago como hora extra" entra: "Descontado" é saldo negativo abatido do salário —
    // rubrica de desconto, não HE. Mesma regra do fechamento, logo abaixo.
    (quitacoes || [])
        .filter(q => q.funcionarioId === fid
            && destinoQuitacao(q) === BH_DESTINO_PAGO
            && Number(q.valor) > 0
            && mesDe(q.data) === mesKey)
        .forEach(q => itens.push({
            tipo: 'quitacao', id: q.id, valor: Number(q.valor),
            saldoMin: Number(q.minutos) || 0,
            desc: `Quitação de ${(q.meses || []).length} ${(q.meses || []).length === 1 ? 'mês' : 'meses'} do banco (${(q.meses || []).map(mesLabel).join(', ')})`,
            data: q.data
        }));

    // Fechamentos: só o que efetivamente virou dinheiro. "Compensado" e "Perdoado" não vão
    // para a folha — o saldo foi resolvido em horas, não em reais. "Descontado" é valor
    // NEGATIVO (o funcionário devia horas), e é justamente por isso que não pode entrar
    // aqui: desconto de saldo negativo é rubrica de desconto, não hora extra. Somá-lo como
    // HE negativa produziria uma folha que "paga" menos hora extra do que zero.
    (fechamentos || [])
        .filter(x => x.funcionarioId === fid
            && x.destino === 'Pago como hora extra'
            && Number(x.valor) > 0
            && mesRefFechamento(x) === mesKey)
        .forEach(x => itens.push({
            tipo: 'fechamento', id: x.id, valor: Number(x.valor),
            saldoMin: Number(x.saldoMin) || 0,
            desc: `Fechamento do ciclo ${mesLabel(x.cicloInicio)} → ${mesLabel(x.cicloFim)}`,
            data: x.data
        }));

    // Extra Banco: hora extra paga direto, fora do ciclo (feriado a 100%, etc.)
    (extras || [])
        .filter(x => x.funcionarioId === fid && mesDe(x.mesRef || x.data) === mesKey)
        .forEach(x => itens.push({
            tipo: 'extra', id: x.id, valor: Number(x.valor) || 0,
            minutos: Number(x.minutos) || 0, adicionalPct: Number(x.adicionalPct) || 0,
            desc: `${x.motivo || 'Hora extra avulsa'} — ${fmtHHMM(x.minutos)} a ${x.adicionalPct}%`,
            data: x.data
        }));

    return { total: Number(itens.reduce((s, i) => s + i.valor, 0).toFixed(2)), itens };
}

// ============ PONTE DESCONTO DE ATRASO → FOLHA ============
//
// Saldo NEGATIVO do banco de horas (o funcionário deve horas) quitado ou fechado com destino
// "Descontado": o valor vira uma rubrica própria na folha — "Desc. Atraso" — sempre negativa,
// nunca somada em "HE (banco)" (que é só o que é PAGO ao funcionário; misturar os dois faria
// a folha "pagar" menos hora extra do que zero). Mesma arquitetura de heBancoDoMes: mês de
// referência é a data do pagamento/fechamento, não os meses do ciclo quitado.
function descAtrasoDoMes(fid, mesKey, fechamentos, quitacoes) {
    const itens = [];

    (quitacoes || [])
        .filter(q => q.funcionarioId === fid
            && destinoQuitacao(q) === 'Descontado'
            && Number(q.minutos) < 0
            && mesDe(q.data) === mesKey)
        .forEach(q => itens.push({
            tipo: 'quitacao', id: q.id, valor: Number(q.valor) || 0,
            saldoMin: Number(q.minutos) || 0,
            desc: `Desconto de atraso — ${(q.meses || []).length} ${(q.meses || []).length === 1 ? 'mês' : 'meses'} do banco (${(q.meses || []).map(mesLabel).join(', ')})`,
            data: q.data
        }));

    (fechamentos || [])
        .filter(x => x.funcionarioId === fid
            && x.destino === 'Descontado'
            && Number(x.saldoMin) < 0
            && mesRefFechamento(x) === mesKey)
        .forEach(x => itens.push({
            tipo: 'fechamento', id: x.id, valor: Number(x.valor) || 0,
            saldoMin: Number(x.saldoMin) || 0,
            desc: `Desconto de atraso — fechamento do ciclo ${mesLabel(x.cicloInicio)} → ${mesLabel(x.cicloFim)}`,
            data: x.data
        }));

    // Rubrica de desconto: o total entra NEGATIVO na folha (reduz o bruto), diferente de
    // heBancoDoMes onde o total é positivo (soma).
    return { total: -Number(itens.reduce((s, i) => s + i.valor, 0).toFixed(2)), itens };
}

// Motivos do Extra Banco. O adicional é editável no lançamento (o padrão sai daqui), porque
// a mesma empresa paga 50% no dia comum e 100% no feriado — e o que define é o dia, não uma
// configuração global.
const EXTRA_MOTIVOS = [
    { nome: 'Feriado', pct: 100 },
    { nome: 'Domingo', pct: 100 },
    { nome: 'Hora extra comum', pct: 50 },
    { nome: 'Convocação/plantão', pct: 50 },
    { nome: 'Outro', pct: 50 }
];

// Diagnóstico por UNIDADE para o sino de notificações — mesmo formato de diagnosticoAso.
// `cargos` é opcional e serve só para o veto do aprendiz (art. 432) — sem ele o diagnóstico é
// o de sempre.
function diagnosticoBh(un, funcionarios, banco, fechamentos, ref, quitacoes, cargos) {
    const doSetor = funcionarios.filter(f => f.unidadeId === un.id);
    const cargoDoFunc = f => (cargos || []).find(c => c.id === f.cargoId);
    const itens = doSetor
        .map(f => ({ f, sit: cicloBhFunc(f, banco, fechamentos, ref, quitacoes, cargoDoFunc(f)) }))
        .filter(x => x.sit && (x.sit.status === 'vencido' || x.sit.status === 'critico' || x.sit.status === 'atencao'));
    if (!itens.length) return null;

    const conta = st => itens.filter(x => x.sit.status === st).length;
    return {
        nome: un.nome,
        vencidos: conta('vencido'),
        criticos: conta('critico'),
        atencao: conta('atencao'),
        pessoas: itens
            .sort((a, b) => (BH_ORDEM[a.sit.status] - BH_ORDEM[b.sit.status]) || (a.sit.dias - b.sit.dias))
            .map(x => ({ nome: x.f.nome, status: x.sit.status, label: x.sit.label, saldoMin: x.sit.acumuladoMin, fim: x.sit.fim }))
    };
}

// Situação de férias de um funcionário. Retorna null para quem não tem admissão ou está
// desligado. Campos: ciclo, aquisitivoIni/Fim, concessivoFim, status, dias, gozadas, label.
//
// O ciclo avança pelo TEMPO decorrido desde a admissão, não pela contagem de férias gozadas:
// contar `ciclo = gozadas.length` jogaria quem tirou muitas férias para um aquisitivo futuro,
// produzindo prazos de 2+ anos — que não existem. O gozo apenas QUITA um ciclo já vencido.
// Dias de férias de um lançamento, incluindo abono vendido: quem vende 10 dias não os goza,
// mas eles saem da competência do mesmo jeito (art. 143) — ignorá-los deixaria a competência
// eternamente incompleta para quem vendeu.
const diasFeriasLanc = a => (Number(a?.dias) || 0) + (Number(a?.abonoDias) || 0);

// ---- Todas as COMPETÊNCIAS de um funcionário ----
//
// `situacaoFeriasFunc` devolve UMA: a corrente, que é a prioridade. Mas competências vencidas
// e não gozadas continuam existindo e devendo — o RH precisa vê-las lado a lado, com quanto
// falta em cada uma, para decidir o que conceder primeiro.
//
// Aqui a régua é a mesma do banco de horas: derivada da admissão (12 em 12 meses), nunca
// gravada. Cada lançamento de férias despeja seus dias na competência aberta mais antiga —
// mesma alocação de situacaoFeriasFunc, exposta por competência.
//
// Retorna array do mais antigo para o mais novo, com:
//   estado: 'gozada' | 'vencida' | 'vigente' | 'formacao'
function competenciasFerias(f, ausencias, ref) {
    if (!f?.admissao) return [];
    const h = ref || hoje();
    const adm = feriasAnchor(f);
    if (adm > h) return [];
    const total = feriasParams.diasPorCiclo;

    const gozadas = (ausencias || [])
        .filter(a => a.funcionarioId === f.id && a.tipo === 'Férias' && a.inicio <= h)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));

    // Quantas competências a régua já produziu: as completas + a que está em formação.
    const completos = Math.max(0, Math.floor(mesesEntre(adm, h) / 12));

    // Aloca dias e guarda QUAIS lançamentos tocaram cada competência — sem isso a janela não
    // conseguiria mostrar "estes 15 dias vieram daqui".
    const alocado = [];
    const lancs = [];
    for (const a of gozadas) {
        let restam = diasFeriasLanc(a) || total;
        let i = 0;
        while (restam > 0) {
            const cabe = Math.max(0, total - (alocado[i] || 0));
            if (!cabe) { i++; continue; }
            const usa = Math.min(cabe, restam);
            alocado[i] = (alocado[i] || 0) + usa;
            (lancs[i] ||= []).push({ ...a, diasNaCompetencia: usa });
            restam -= usa;
            if (restam > 0) i++;
        }
    }

    return Array.from({ length: completos + 1 }, (_, i) => {
        const aquisitivoIni = addMeses(adm, i * 12);
        const aquisitivoFim = addMeses(adm, (i + 1) * 12);
        const concessivoFim = addMeses(aquisitivoIni, feriasParams.mesesVencimento);
        const usados = Math.min(alocado[i] || 0, total);
        const restantes = Math.max(0, total - usados);
        const emFormacao = h < aquisitivoFim;
        const dias = diasEntre(h, concessivoFim);

        // Gozada só quando os dias fecham: 15 de 30 é competência aberta, não "gozada".
        const estado = restantes === 0 ? 'gozada'
            : emFormacao ? 'formacao'
            : dias < 0 ? 'vencida'
            : 'vigente';

        return {
            indice: i, aquisitivoIni, aquisitivoFim, concessivoFim,
            usados, restantes, total,
            fracionada: usados > 0 && restantes > 0,
            lancamentos: lancs[i] || [],
            estado, dias,
            // Dobra do art. 137 incide sobre o que sobrou por conceder, não sobre a competência
            // inteira: quem gozou 20 de 30 deve 10, não 30.
            emDobra: estado === 'vencida' ? restantes : 0
        };
    }).sort((a, b) => a.indice - b.indice);
}

// Teto de dias que UM lançamento pode ter.
//
// A regra normal é a competência (30 dias): ninguém goza mais férias do que tem direito, e um
// período de 45 dias quase sempre é erro de digitação na data de retorno.
//
// A exceção é real e não pode ser bloqueada: quem tem competências atrasadas acumuladas pode
// gozá-las juntas (art. 137 — o empregador que não concedeu no prazo deve, e pagará em
// dobro). Nesse caso o teto é o saldo em aberto somado: 30 da competência corrente + 30 de
// cada competência vencida e não gozada.
//
// Retorna { max, competencias, vencidas, saldoCorrente } — `max` é o limite do lançamento.
function tetoDiasFerias(f, ausencias, ref) {
    const total = feriasParams.diasPorCiclo;
    const sit = situacaoFeriasFunc(f, ausencias, ref);
    if (!sit) return { max: total, competencias: 1, vencidas: 0, saldoCorrente: total };

    // Competências que já venceram (direito adquirido) e ainda não foram gozadas. `ciclo` é o
    // índice da corrente; quantos aquisitivos completos existem além dela é o atraso.
    const h = ref || hoje();
    const completos = Math.max(0, Math.floor(mesesEntre(feriasAnchor(f), h) / 12));
    const vencidas = Math.max(0, completos - sit.ciclo - (sit.status === 'aquisitivo' ? 0 : 1));

    // Saldo da corrente (30, ou o que falta se fracionada) + 30 por competência atrasada.
    const saldoCorrente = sit.diasRestantes > 0 ? sit.diasRestantes : total;
    return {
        max: saldoCorrente + vencidas * total,
        competencias: 1 + vencidas,
        vencidas,
        saldoCorrente
    };
}

function situacaoFeriasFunc(f, ausencias, ref) {
    if (!f?.admissao || f.demissao) return null;
    const h = ref || hoje();
    const adm = feriasAnchor(f);
    if (adm > h) return null;                             // admissão futura: nada a calcular

    // Férias em curso quitam o ciclo na hora que COMEÇAM, não só quando terminam — senão o
    // prazo legal do ciclo seguinte segue contando durante o gozo e a pessoa aparece como
    // "vencida" enquanto está de férias.
    const gozadas = (ausencias || [])
        .filter(a => a.funcionarioId === f.id && a.tipo === 'Férias' && a.inicio <= h)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));

    // Ciclos aquisitivos JÁ COMPLETOS pelo tempo de casa (âncora + 12m, +24m, ...)
    const ciclosCompletos = Math.max(0, Math.floor(mesesEntre(adm, h) / 12));

    // ---- Competência se fecha por DIAS, não por número de lançamentos ----
    // O fracionamento (art. 134 §1º: até 3 períodos, um deles ≥ 14 dias) é UM direito
    // dividido, não vários. Contar `gozadas.length` fazia 15+15 avançar dois ciclos
    // aquisitivos — a pessoa "gozava" dois anos com 30 dias — e um único período de 15 dias
    // encerrar a competência com metade em aberto, apagando da tela o risco de dobra que
    // ainda existia.
    //
    // Aqui cada lançamento despeja seus dias na competência aberta mais antiga; ela só fecha
    // ao completar `diasPorCiclo`, e o excedente transborda para a seguinte.
    const total = feriasParams.diasPorCiclo;
    const alocado = [];                                  // dias por índice de competência
    for (const a of gozadas) {
        let restam = diasFeriasLanc(a);
        // Lançamento sem dias (dado velho/incompleto): assume a competência inteira, que era
        // o comportamento anterior. Melhor que somar zero e nunca fechar competência nenhuma.
        if (!restam) restam = total;
        let i = 0;
        while (restam > 0) {
            const cabe = Math.max(0, total - (alocado[i] || 0));
            if (!cabe) { i++; continue; }
            const usa = Math.min(cabe, restam);
            alocado[i] = (alocado[i] || 0) + usa;
            restam -= usa;
            if (restam > 0) i++;
        }
    }
    // Competências COMPLETAS (30/30). A parcial não conta: o direito ainda está em aberto.
    const completas = alocado.filter(d => d >= total).length;
    // Nunca além do que o tempo de casa já gerou: gozo antecipado não cria ciclo aquisitivo.
    let ciclo = Math.min(completas, ciclosCompletos);

    // Dias já gozados da competência corrente e o que falta para fechá-la.
    const diasNaCorrente = Math.min(alocado[ciclo] || 0, total);
    const diasRestantes = Math.max(0, total - diasNaCorrente);
    const fracionada = diasNaCorrente > 0 && diasRestantes > 0;

    let aquisitivoIni = addMeses(adm, ciclo * 12);
    let aquisitivoFim = addMeses(adm, (ciclo + 1) * 12);
    let concessivoFim = addMeses(aquisitivoIni, feriasParams.mesesVencimento);

    // Está de férias agora e esse gozo já COMPLETOU a competência? Avança — o prazo legal em
    // exibição deve ser o do direito ainda em aberto, não o que a féria em curso satisfez.
    // Com fracionamento a competência continua a mesma: 15 dias não encerram nada, e o prazo
    // legal segue correndo sobre os 15 que faltam. Era exatamente o que o modelo antigo
    // errava — qualquer período em curso reancorava o ciclo.
    const feriasEmCurso = gozadas.find(a => ausenciaVigente(a, h));
    if (feriasEmCurso && !fracionada && diasNaCorrente >= total && feriasEmCurso.inicio < concessivoFim) {
        ciclo++;
        aquisitivoIni = addMeses(adm, ciclo * 12);
        aquisitivoFim = addMeses(adm, (ciclo + 1) * 12);
        concessivoFim = addMeses(aquisitivoIni, feriasParams.mesesVencimento);
    }

    const critico = feriasParams.alertaLegalDias;
    // Competência aberta pela metade: o prazo legal continua correndo sobre o que falta, e a
    // tela tem que dizer isso — senão "15 de 30 dias" parece resolvido.
    const fr = fracionada ? ` Fracionada: ${diasNaCorrente} de ${total} dias gozados, faltam ${diasRestantes}.` : '';

    // Aquisitivo ainda em formação: o direito nem nasceu, não há prazo legal correndo.
    if (h < aquisitivoFim) {
        const dias = diasEntre(h, aquisitivoFim);
        return {
            ciclo, aquisitivoIni, aquisitivoFim, concessivoFim,
            diasNaCorrente, diasRestantes, fracionada, diasPorCiclo: total,
            status: 'aquisitivo', dias, gozadas: gozadas.length,
            label: `Aquisitivo — ${prazoTexto(dias)}`,
            desc: `Direito completo em ${fmtDate(aquisitivoFim)}.${fr}`
        };
    }

    // Aquisitivo fechado → prazo legal (concessivo) correndo. Máximo possível: 12 meses.
    const dias = diasEntre(h, concessivoFim);
    if (dias < 0) return {
        ciclo, aquisitivoIni, aquisitivoFim, concessivoFim,
        diasNaCorrente, diasRestantes, fracionada, diasPorCiclo: total,
        status: 'vencida', dias, gozadas: gozadas.length,
        label: `Vencida há ${prazoTexto(dias)}${fracionada ? ` · faltam ${diasRestantes}d` : ''}`,
        desc: `Prazo legal esgotou em ${fmtDate(concessivoFim)} — férias em dobro (art. 137 CLT).${fr}`
    };
    if (dias <= critico) return {
        ciclo, aquisitivoIni, aquisitivoFim, concessivoFim,
        diasNaCorrente, diasRestantes, fracionada, diasPorCiclo: total,
        status: 'critica', dias, gozadas: gozadas.length,
        label: `Vence em ${prazoTexto(dias)}${fracionada ? ` · faltam ${diasRestantes}d` : ''}`,
        desc: `Conceder até ${fmtDate(concessivoFim)} para evitar pagamento em dobro.${fr}`
    };
    return {
        ciclo, aquisitivoIni, aquisitivoFim, concessivoFim,
        diasNaCorrente, diasRestantes, fracionada, diasPorCiclo: total,
        status: 'atencao', dias, gozadas: gozadas.length,
        label: `Vence em ${prazoTexto(dias)}${fracionada ? ` · faltam ${diasRestantes}d` : ''}`,
        desc: `Direito adquirido em ${fmtDate(aquisitivoFim)}. Conceder até ${fmtDate(concessivoFim)}.${fr}`
    };
}

// Alerta da DATA PREVISTA — diferente do alerta legal.
// Legal  = fim do concessivo → multa/dobra (art. 137).
// Prevista = a data que o sistema sugeriu → só precisa reprogramar.
// A antecedência da prevista deriva do parâmetro legal (metade), evitando um segundo campo.
function alertaPrevisto(sit, plano, ref) {
    if (!sit || !plano) return null;
    const h = ref || hoje();
    const dias = diasEntre(h, plano.inicio);
    const janela = Math.max(7, Math.round(feriasParams.alertaLegalDias / 2));
    // A sugestão cai fora do prazo legal? É o caso mais grave: nem o plano salva da dobra.
    if (sit.status !== 'aquisitivo' && plano.retorno > sit.concessivoFim)
        return { nivel: 'estoura', txt: 'plano estoura o prazo legal', dias };
    if (dias < 0) return { nivel: 'atrasado', txt: `previsto há ${prazoTexto(dias)}`, dias };
    if (dias <= janela) return { nivel: 'proximo', txt: `previsto em ${prazoTexto(dias)}`, dias };
    return { nivel: 'ok', txt: `previsto em ${prazoTexto(dias)}`, dias };
}

// Ordem de urgência para a fila de programação
const FERIAS_ORDEM = { vencida: 0, critica: 1, atencao: 2, aquisitivo: 3 };
const FERIAS_STATUS = {
    vencida:    { cls: 'badge-danger',  dot: 'st-vencida',  txt: 'Vencida' },
    critica:    { cls: 'badge-warning', dot: 'st-critica',  txt: 'Crítica' },
    atencao:    { cls: 'badge-info',    dot: 'st-atencao',  txt: 'Atenção' },
    aquisitivo: { cls: 'badge-neutral', dot: 'st-ok',       txt: 'Em dia' }
};

// Data sugerida para UMA pessoa, isolada: início do concessivo (ou já, se atrasado).
// 30 dias corridos — o padrão; fracionamento é decisão caso a caso do RH.
function sugestaoFerias(sit) {
    if (!sit) return null;
    const h = hoje();
    const inicio = sit.status === 'aquisitivo' ? sit.aquisitivoFim : (h > sit.aquisitivoFim ? h : sit.aquisitivoFim);
    // Competência fracionada: sugerir 30 dias de novo somaria 45 e transbordaria para a
    // competência seguinte. A sugestão é o SALDO — o que falta para fechar esta.
    const saldo = sit.diasRestantes != null && sit.diasRestantes > 0
        ? sit.diasRestantes
        : (sit.diasPorCiclo || FERIAS_PARAMS_PADRAO.diasPorCiclo);
    const retorno = addDias(inicio, saldo);
    return { inicio, retorno, dias: diasEntre(inicio, retorno) };
}

// Programação ESCALONADA de uma equipe.
// Sugerir a mesma data para todo mundo que está atrasado seria inútil como planejamento —
// esvaziaria a operação de uma vez. Aqui quem vence primeiro entra primeiro, e os demais são
// empurrados para a próxima janela livre do seu grupo (unidade+cargo), respeitando férias já
// lançadas. O resultado é uma fila executável, não uma lista de desejos.
// `itens`: [{ f, sit }]. Retorna Map(funcionarioId → { inicio, retorno, dias, adiado }).
function programacaoEscalonada(itens, ausencias, folgaDias = 1) {
    const ocupacao = {};   // grupo → [{ini, fim}] já comprometidos
    const grupoDe = f => `${f.unidadeId || '-'}|${f.cargoId || '-'}`;

    // Férias já lançadas ocupam a agenda do grupo
    (ausencias || []).filter(a => a.tipo === 'Férias').forEach(a => {
        const f = itens.find(x => x.f.id === a.funcionarioId)?.f;
        if (!f) return;
        (ocupacao[grupoDe(f)] ||= []).push({ ini: a.inicio, fim: a.retorno });
    });

    const out = new Map();
    // Quem vence primeiro escolhe primeiro
    [...itens].sort((a, b) => (FERIAS_ORDEM[a.sit.status] - FERIAS_ORDEM[b.sit.status]) || (a.sit.dias - b.sit.dias))
        .forEach(({ f, sit }) => {
            const base = sugestaoFerias(sit);
            const g = grupoDe(f);
            const ocup = (ocupacao[g] ||= []);
            let ini = base.inicio;
            // Férias se contam em DIAS CORRIDOS (art. 130), não em mês de calendário:
            // `addMeses(ini, 1)` daria 28 dias em fevereiro e 31 em julho — o funcionário
            // perderia 2 dias num caso, e no outro a competência de 30 nunca fecharia.
            // `base.dias` já é o saldo da competência: 30, ou o que falta se fracionada.
            const dur = base.dias;
            let fim = addDias(ini, dur);
            let adiado = false;
            // Empurra até achar janela livre no grupo (limite de segurança: 24 tentativas)
            for (let i = 0; i < 24; i++) {
                const choque = ocup.find(o => o.ini < fim && ini < o.fim);
                if (!choque) break;
                ini = addDias(choque.fim, folgaDias);
                fim = addDias(ini, dur);
                adiado = true;
            }
            ocup.push({ ini, fim });
            out.set(f.id, { inicio: ini, retorno: fim, dias: diasEntre(ini, fim), adiado, base: base.inicio });
        });
    return out;
}

// 'YYYY-MM-DD' → Date na meia-noite LOCAL.
// new Date('2026-07-15') seria meia-noite UTC (−3h no Brasil), enquanto new Date() é local:
// misturar os dois desloca datas em um dia inteiro perto da virada. Todo parse passa aqui.
const dataLocal = iso => new Date(iso + 'T00:00:00');

function diasEntre(iniIso, fimIso) {
    if (!iniIso || !fimIso) return 0;
    return Math.round((dataLocal(fimIso) - dataLocal(iniIso)) / 86400000);
}

// Soma dias corridos a uma data ISO. Passa por dataLocal pelo mesmo motivo que diasEntre:
// aritmética em UTC desloca a data em um dia perto da virada.
const addDias = (iso, n) => {
    const d = dataLocal(iso);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
};

// Tempo de empresa legível ("2 anos e 3 meses").
// Admissão futura NÃO é zero: zerar faz um cadastro errado (ou uma contratação agendada)
// parecer um funcionário recém-admitido normal — foi assim que "09/12/2026 → 0 dias"
// passou despercebido. Devolve o texto explícito para a tela poder sinalizar.
function tempoEmpresa(admissao, demissao) {
    if (!admissao) return '—';
    const fimIso = demissao || hoje();
    if (admissao > fimIso) return `admissão futura (${fmtDate(admissao)})`;

    const ini = dataLocal(admissao);
    const fim = dataLocal(fimIso);
    let meses = (fim.getFullYear() - ini.getFullYear()) * 12 + (fim.getMonth() - ini.getMonth());
    if (fim.getDate() < ini.getDate()) meses--;
    if (meses < 0) meses = 0;
    const anos = Math.floor(meses / 12), m = meses % 12;
    if (anos === 0 && m === 0) {
        const d = diasEntre(admissao, fimIso);
        return `${d} dia${d !== 1 ? 's' : ''}`;
    }
    const p = [];
    if (anos) p.push(`${anos} ano${anos > 1 ? 's' : ''}`);
    if (m) p.push(`${m} ${m > 1 ? 'meses' : 'mês'}`);
    return p.join(' e ');
}

function idade(nascimento) {
    return idadeEm(nascimento, null);
}

// Idade numa data QUALQUER, não só hoje. Existe porque a faixa etária do aprendiz (art. 428:
// 14 a 24 anos) é requisito da CONTRATAÇÃO: quem entrou aos 23 e hoje tem 25 continua num
// contrato válido, e validar pela idade de hoje recusaria a edição de uma ficha correta.
function idadeEm(nascimento, ref) {
    if (!nascimento) return null;
    const n = dataLocal(nascimento), h = ref ? dataLocal(ref) : new Date();
    let a = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
    return a;
}

// Validação de CPF (dígitos verificadores)
function validaCPF(cpf) {
    cpf = (cpf || '').replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (const t of [9, 10]) {
        let soma = 0;
        for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
        const dig = ((soma * 10) % 11) % 10;
        if (dig !== Number(cpf[t])) return false;
    }
    return true;
}

function maskCPF(v) {
    v = (v || '').replace(/\D/g, '').slice(0, 11);
    return v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskFone(v) {
    v = (v || '').replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (v.length > 6) return v.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');
    if (v.length > 2) return v.replace(/(\d{2})(\d+)/, '($1) $2');
    return v;
}

function maskCNPJ(v) {
    v = (v || '').replace(/\D/g, '').slice(0, 14);
    return v.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

// Iniciais para avatar
function iniciais(nome) {
    const p = (nome || '?').trim().split(/\s+/);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Chave ano-mês "2026-07"
const mesKey = (ano, mes) => `${ano}-${String(mes + 1).padStart(2, '0')}`;
