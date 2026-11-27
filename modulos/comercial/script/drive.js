// ═══════════════════════════════════════════════════════════════
// drive.js — Envio de anexos ao Google Drive — COMERCIAL LAMIC
// Mesmo Apps Script e credencial do portal (js/config.js → driveEndpoint):
// o token do Firebase Auth (projeto applamic) vai junto e o script confere.
// ═══════════════════════════════════════════════════════════════

const DRIVE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXwMuVBeWw_sByJjjHvzkc_OyEPSO7gxXYYDJYqDi5YPo9MXks1dXsQkXBPzxSQ1c/exec';
const DRIVE_MAX = 30 * 1024 * 1024;
const DRIVE_EXT = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
const DRIVE_ACCEPT = DRIVE_EXT.map(e => '.' + e).join(',');

// Apps Script responde via redirect e às vezes embrulha o JSON em HTML
function respostaDrive(txt) {
  const b = String(txt || '').trim();
  try { return JSON.parse(b); } catch (e) {}
  const i = b.indexOf('{'), f = b.lastIndexOf('}');
  if (i !== -1 && f > i) { try { return JSON.parse(b.slice(i, f + 1)); } catch (e) {} }
  return b;
}
const lerDataUrlDrive = arq => new Promise((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => erro(new Error(`Não foi possível ler ${arq.name}`));
  r.readAsDataURL(arq);
});

// → { nome, url, fileId }
async function enviarArquivoDrive(arq) {
  const ext = (String(arq.name).split('.').pop() || '').toLowerCase();
  if (!DRIVE_EXT.includes(ext)) throw new Error(`${arq.name}: formato não aceito (${DRIVE_EXT.join(', ')})`);
  if (arq.size > DRIVE_MAX) throw new Error(`${arq.name}: maior que 30 MB`);
  // treinamento: nada sai para o Drive, o anexo entra com um link fictício
  if (typeof SIM !== 'undefined' && SIM.ativo) return { nome: arq.name.replace(/\.[^.]+$/, ''), url: 'https://drive.google.com/file/d/simulacao/view', fileId: null };
  const idToken = await firebase.auth().currentUser?.getIdToken();
  if (!idToken) throw new Error('Sessão expirada: entre de novo para enviar arquivos');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 120000);
  let resp;
  try {
    // POST sem Content-Type: o Apps Script não responde ao preflight CORS
    const r = await fetch(DRIVE_ENDPOINT, { method: 'POST', body: JSON.stringify({ action: 'upload', filename: arq.name, data: await lerDataUrlDrive(arq), idToken }), signal: ctl.signal });
    resp = respostaDrive(await r.text());
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('O envio demorou demais e foi cancelado') : e;
  } finally { clearTimeout(t); }
  if (!resp || typeof resp !== 'object') throw new Error('Resposta inesperada do servidor de arquivos');
  if (resp.success === false || resp.error) throw new Error(resp.error || resp.message || 'O servidor recusou o arquivo');
  const fileId = resp.fileId || resp.id || null, url = resp.url || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : null);
  if (!url) throw new Error('O servidor não devolveu o link do arquivo');
  return { nome: arq.name.replace(/\.[^.]+$/, ''), url, fileId };
}

// Botão "Enviar arquivo": escolhe um ou mais arquivos, envia e entrega cada anexo a aoEnviar({ nome, url })
function htmlBotaoDrive(aoEnviar) {
  return `<label class="btn sm" title="Envia ao Google Drive (PDF, Word, Excel, PowerPoint, imagens · até 30 MB)"><i class="fa-solid fa-cloud-arrow-up"></i>Enviar arquivo
    <input type="file" multiple accept="${DRIVE_ACCEPT}" style="display:none" onchange="enviarAnexosDrive(this, ${aoEnviar})"></label>`;
}
async function enviarAnexosDrive(inp, aoEnviar) {
  const arqs = [...inp.files], lb = inp.closest('label');
  inp.value = '';
  if (!arqs.length) return;
  const ic = lb?.querySelector('i'), ic0 = ic?.className;
  if (lb) lb.style.pointerEvents = 'none';
  if (ic) ic.className = 'fa-solid fa-spinner fa-spin';
  let ok = 0;
  for (const a of arqs) {
    try { aoEnviar(await enviarArquivoDrive(a)); ok++; }
    catch (e) { toast(e.message || String(e), 'erro'); }
  }
  if (lb) lb.style.pointerEvents = '';
  if (ic) ic.className = ic0;
  if (ok) toast(`${ok} arquivo(s) enviado(s) ao Drive`);
}
