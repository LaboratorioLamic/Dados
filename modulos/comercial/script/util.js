// ═══════════════════════════════════════════════════════════════
// util.js — Funções auxiliares — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

const fmt = v => v == null || isNaN(v) ? '—'
  : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (v, casas = 1) => v == null || isNaN(v) ? '—'
  : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';

// Campo de preço com vírgula automática: os dígitos enchem da direita (centavos). "1234" → "12,34"
const moedaCampo = v => v == null || v === '' || isNaN(v) ? '' : Number(v).toFixed(2).replace('.', ',');
const lerMoeda = txt => {
  const s = String(txt ?? '').trim();
  if (!s) return null;
  const v = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return isNaN(v) ? null : v;
};
function mascaraMoeda(inp) {
  const d = inp.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  inp.value = d ? moedaCampo(+d / 100) : '';
}

const num = (v, casas = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });

// Escapa texto vindo do banco antes de inserir em HTML
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Remove acentos e padroniza para buscas
const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const contem = (texto, busca) => !busca || normalizar(texto).includes(normalizar(busca));

const iniciais = nome => String(nome || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();

const CORES_AVATAR = ['#2a9d8f', '#e8913a', '#6366f1', '#00a8cc', '#ec4899', '#0e7490', '#8b5cf6', '#16a34a'];
const corAvatar = id => {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[h % CORES_AVATAR.length];
};

// Prazo de liberação em dias → texto (0 = 24 Horas)
const prazoTexto = dias => dias == null || dias === '' || isNaN(dias) ? '' : +dias <= 0 ? '24 Horas' : +dias === 1 ? '1 dia' : `${+dias} dias`;
// Registro do catálogo ou do exame: usa os dias; texto antigo (importado) só quando não há dias
const prazoDe = r => !r ? '' : prazoTexto(r.prazoDias) || r.prazo || '';

const dataHora = ts => ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// Objeto {id: item} → lista ordenada
// Dois preços diferem? (null/undefined = ausente; tolerância de meio centavo)
const precoDifere = (a, b) => a == null || b == null ? (a ?? null) !== (b ?? null) : Math.abs(a - b) > 0.004;
const lista = (obj, ordem = (a, b) => 0) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v })).sort(ordem);
const porNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR');
