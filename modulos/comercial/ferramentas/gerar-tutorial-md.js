// Atualiza o Tutorial.md a partir de script/tutoriais.js (fonte de verdade).
// Uso, na raiz do projeto:  node ferramentas/gerar-tutorial-md.js
// Mantém o texto antes de "## Índice" (regra de manutenção e explicação) e refaz o resto.
// Lembre de trocar a data de revisão no topo do Tutorial.md.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'script', 'tutoriais.js'), 'utf8');
const TUT_MODULOS = { geral: 'Primeiros passos', inicio: 'Início', exames: 'Exames', custos: 'Custos', tabelas: 'Tabelas de Preço', simulador: 'Simulador', pendencias: 'Pendências', instrucoes: 'Instruções', importar: 'Importar / Exportar', config: 'Configurações' };
const passoMenuTut = (tela, titulo, texto, extra = {}) => ({ alvo: `#nav a[data-s="${tela}"]`, titulo, texto, acao: 'clique', ...extra });
const irTelaTut = () => () => {}; const celularTut = () => false;
const TUTORIAIS = new Function('passoMenuTut', 'irTelaTut', 'celularTut', src + '\nreturn TUTORIAIS;')(passoMenuTut, irTelaTut, celularTut);
const limpa = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const alvo = p => !p.alvo ? '— (cartão central)' : typeof p.alvo === 'function'
  ? '`' + ((p.alvo.toString().match(/qsTut\('([^']+)'\)/) || [])[1] || 'função') + '`' + (/closest\('([^']+)'\)/.test(p.alvo.toString()) ? ` → \`closest('${p.alvo.toString().match(/closest\('([^']+)'\)/)[1]}')\`` : '')
  : '`' + (Array.isArray(p.alvo) ? p.alvo.join('` ou `') : p.alvo) + '`';
const acao = p => !p.alvo ? 'ver' : p.acao + (p.acao === 'digitar' && p.valor != null ? ` (sugestão: ${typeof p.valor === 'function' ? 'calculada' : '"' + p.valor + '"'})` : '');
// permitido: lista os módulos de pode('x') da regra extra (ex.: "tabelas ou exames")
const regra = t => t.permitido ? (t.permitido.toString().match(/pode\('(\w+)'/g) || []).map(x => x.slice(6, -1) + ':ver').join(' ou ') || 'regra própria' : '';
const req = t => [t.requer.map(([m, a]) => `${m}:${a}`).join(', '), regra(t)].filter(Boolean).join(' + ') || 'todos';
let md = '';
md += '## Índice\n\n| # | id | Módulo | Tutorial | Permissão | Passos |\n|---|---|---|---|---|---|\n';
TUTORIAIS.forEach((t, i) => { md += `| ${i + 1} | \`${t.id}\` | ${TUT_MODULOS[t.modulo]} | ${t.titulo} | ${req(t)} | ${t.passos.length} |\n`; });
let mod = '';
TUTORIAIS.forEach(t => {
  if (t.modulo !== mod) { mod = t.modulo; md += `\n## ${TUT_MODULOS[mod]}\n`; }
  md += `\n### ${t.titulo}\n\n- **id:** \`${t.id}\` · **ícone:** \`${t.icone}\` · **permissão:** ${req(t)}\n- **Objetivo:** ${t.desc}\n\n| # | Alvo | Ação | Legenda |\n|---|---|---|---|\n`;
  t.passos.forEach((p, i) => {
    const extra = [p.esperar ? `espera \`${p.esperar}\`` : '', p.pular ? 'condicional' : '', p.avancaSe ? 'avança se deu certo' : ''].filter(Boolean).join(' · ');
    md += `| ${i + 1} | ${alvo(p).replace(/\|/g, '\|')} | ${acao(p)}${extra ? ` · ${extra}` : ''} | **${limpa(p.titulo)}** — ${limpa(p.texto).replace(/\|/g, '\|')} |\n`;
  });
});
const arq = path.join(raiz, 'Tutorial.md');
const atual = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8') : '';
const i = atual.indexOf('## Índice');
fs.writeFileSync(arq, (i >= 0 ? atual.slice(0, i) : '# COMERCIAL LAMIC — Tutoriais\n\n') + md);
console.log(`Tutorial.md atualizado: ${TUTORIAIS.length} tutoriais.`);
