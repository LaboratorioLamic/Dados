// Copia cada módulo de seeds/ para modulos/, que vai junto no GitHub Pages do Dados.
// Assim o Dados publicado não depende do repositório de cada módulo.
// Uso: node ferramentas/sincronizar-modulos.js   (rode antes de cada commit/push do Dados)
//
// Copia só os arquivos que o próprio repositório do módulo publicaria (git ls-files,
// respeitando o .gitignore dele) e pula pastas de ferramentas, backups e chaves.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'seeds');
const DESTINO = path.join(RAIZ, 'modulos');

const PULAR = [
  /(^|\/)\.git(\/|$)/, /(^|\/)\.claude\//, /(^|\/)graphify-out\//, /(^|\/)node_modules\//, /(^|\/)\.vscode\//,
  /backup[^/]*\.json$/i, /\.(pem|key|env)$/i, /(^|\/)\.env/, /settings\.local\.json$/i,
];

function listar(dir) {
  try {
    // módulo sem repositório próprio (criado direto em seeds/): o git do Dados ignora seeds/, então lista a pasta
    if (!fs.existsSync(path.join(dir, '.git'))) throw new Error('sem .git');
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
    return out.split('\0').filter(Boolean);
  } catch {
    const res = [];
    (function andar(rel) {
      for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) andar(r); else res.push(r);
      }
    })('');
    return res;
  }
}

fs.rmSync(DESTINO, { recursive: true, force: true });
let total = 0;
for (const mod of fs.readdirSync(ORIGEM, { withFileTypes: true })) {
  if (!mod.isDirectory()) continue;
  const dir = path.join(ORIGEM, mod.name);
  let n = 0;
  for (const rel of listar(dir)) {
    if (PULAR.some((re) => re.test(rel))) continue;
    const de = path.join(dir, rel);
    if (!fs.existsSync(de) || !fs.statSync(de).isFile()) continue;
    const para = path.join(DESTINO, mod.name, rel);
    fs.mkdirSync(path.dirname(para), { recursive: true });
    fs.copyFileSync(de, para);
    n++;
  }
  total += n;
  console.log(`${mod.name}: ${n} arquivos`);
}
console.log(`ok: ${total} arquivos em modulos/`);
