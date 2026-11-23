// ═══════════════════════════════════════════════════════════════
// propostapdf.js — PDF da proposta para laboratório (simulador)
// ═══════════════════════════════════════════════════════════════
//
// Página A4 com cabeçalho (logo LAMIC, nº e data), destinatário, texto de
// apresentação editável, resumo, relação de exames (agrupada por setor),
// encerramento, assinatura e rodapé com paginação. Textos padrão ficam em
// config/modeloProposta; os da proposta, junto da simulação (pl.pdf).
// O mesmo PDF serve à proposta para cliente (orçamento: pc.pdf), com textos padrão
// próprios em config/modeloPropostaCli, e à proposta ao médico (desconto aos pacientes: pm.pdf), em
// config/modeloPropostaMed. _pdfModo diz qual das três está em uso.
// Bibliotecas (jsPDF + autoTable) carregadas só na primeira geração.

const PDF_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];
const COR_PDF = { navy: [20, 40, 75], azul: [91, 180, 216], cinza: [143, 168, 172], texto: [51, 58, 74], muted: [120, 130, 145], fundo: [244, 247, 251], linha: [221, 228, 236] };

const MODELO_PROPOSTA_PADRAO = {
  apresentacao: `Prezado(a) Senhor(a),

É com grande satisfação que encaminhamos para apreciação de V.Sa. a nossa proposta orçamentária para realização de exames laboratoriais de nossa especialidade.
Salientamos que todos os {itens} aqui apresentados estão disponíveis para imediata realização.
Ademais, ressaltamos que a estrutura do Núcleo Técnico Operacional – NTO do Laboratório LAMIC está apta a realizar uma gama de aproximadamente 2.000 (dois mil) diferentes exames e, desta forma, caso V.Sa. demande a realização de algum(ns) exame(s) que não esteja(m) detalhado(s) na presente proposta, encontramo-nos à disposição para apresentar proposta específica para o(s) mesmo(s).

Recepção dos materiais para análise:
Juazeiro do Norte (NTO – Centro) – Área técnica
• Segunda-feira a sexta-feira: 06h00 às 17h00
• Sábado: 06h00 às 12h00

Entrega dos resultados:
Os prazos de entrega dos resultados estão evidenciados ao lado da descrição de cada exame na relação anexa e levam em consideração o horário de entrada do material coletado na área técnica do Laboratório LAMIC.`,
  encerramento: 'Encontramo-nos à disposição para esclarecer eventuais dúvidas julgadas necessárias acerca do presente orçamento.',
  assinatura: 'Dr. Leonardo Bezerra',
  cargo: 'Laboratório LAMIC',
  rodape: 'Laboratório LAMIC · Núcleo Técnico Operacional – NTO · Juazeiro do Norte – CE',
  validade: 30,
  itExame: true, itVacina: false
};
const modeloProposta = () => ({ ...MODELO_PROPOSTA_PADRAO, ...(ESTADO.modeloProposta || {}) });

const MODELO_CLIENTE_PADRAO = {
  apresentacao: `Prezado(a) {destinatario},

Agradecemos o seu contato e a confiança no Laboratório LAMIC. Segue o orçamento dos {itens} solicitados, com os valores e os prazos de entrega dos resultados.

Atendimento e coleta:
• Segunda-feira a sexta-feira: 06h00 às 17h00
• Sábado: 06h00 às 12h00

Preparo:
Alguns {itens} exigem preparo (jejum, horário ou cuidados específicos). Consulte nossa equipe ao agendar a coleta.

Entrega dos resultados:
Os prazos de entrega estão ao lado de cada {item} e contam a partir da coleta.`,
  encerramento: 'Ficamos à disposição para esclarecer dúvidas e agendar o seu atendimento.',
  assinatura: 'Laboratório LAMIC',
  cargo: 'Atendimento ao cliente',
  rodape: MODELO_PROPOSTA_PADRAO.rodape,
  validade: 15,
  itExame: true, itVacina: false
};
const modeloPropostaCli = () => ({ ...MODELO_CLIENTE_PADRAO, ...(ESTADO.modeloPropostaCli || {}) });

const MODELO_MEDICO_PADRAO = {
  apresentacao: `Prezado(a) {destinatario},

O Laboratório LAMIC tem a satisfação de apresentar uma condição especial para os seus pacientes: os {itens} relacionados a seguir serão realizados com desconto sobre a nossa tabela, mediante a apresentação da solicitação médica emitida por V.Sa.

Como funciona:
• O paciente apresenta a solicitação médica no atendimento do Laboratório LAMIC.
• O desconto vale para os {itens} desta proposta, durante a validade indicada.

Atendimento e coleta:
• Segunda-feira a sexta-feira: 06h00 às 17h00
• Sábado: 06h00 às 12h00

Entrega dos resultados:
Os prazos de entrega estão ao lado de cada {item} e contam a partir da coleta.`,
  encerramento: 'Agradecemos a parceria e ficamos à disposição para esclarecer dúvidas ou incluir outros {itens} nesta proposta.',
  assinatura: 'Laboratório LAMIC',
  cargo: 'Comercial',
  rodape: MODELO_PROPOSTA_PADRAO.rodape,
  validade: 90,
  itExame: true, itVacina: false
};
const modeloPropostaMed = () => ({ ...MODELO_MEDICO_PADRAO, ...(ESTADO.modeloPropostaMed || {}) });

const MODELO_EMPRESA_PADRAO = {
  apresentacao: `Prezados(as) {destinatario},

O Laboratório LAMIC tem a satisfação de apresentar a sua proposta de prestação de serviços laboratoriais: os {itens} relacionados a seguir, com os valores especiais desta proposta.

Atendimento e coleta:
• Segunda-feira a sexta-feira: 06h00 às 17h00
• Sábado: 06h00 às 12h00

Entrega dos resultados:
Os prazos de entrega estão ao lado de cada {item} e contam a partir da coleta.`,
  encerramento: 'Agradecemos a oportunidade e ficamos à disposição para esclarecer dúvidas ou incluir outros {itens} nesta proposta.',
  assinatura: 'Laboratório LAMIC',
  cargo: 'Comercial',
  rodape: MODELO_PROPOSTA_PADRAO.rodape,
  validade: 30,
  itExame: true, itVacina: false
};
const modeloPropostaEmp = () => ({ ...MODELO_EMPRESA_PADRAO, ...(ESTADO.modeloPropostaEmp || {}) });

// 'lab' = proposta comercial (pl) · 'cli' = proposta para cliente (pc) · 'med' = proposta ao médico (pm)
// todos: a quem vale o texto padrão · doc: nome no registro de alterações
let _pdfModo = 'lab';
const PDF_MODOS = {
  lab: { st: () => pl, modelo: modeloProposta, original: MODELO_PROPOSTA_PADRAO, caminho: 'modeloProposta', itens: () => itensPdfLab(), prefixo: 'PC', nome: 'Proposta', abrir: () => abrirPdfLab(),
    todos: 'todas as propostas', aba: 'Proposta', tituloPadrao: 'Texto padrão do PDF', doc: 'da proposta' },
  cli: { st: () => pc, modelo: modeloPropostaCli, original: MODELO_CLIENTE_PADRAO, caminho: 'modeloPropostaCli', itens: () => itensPdfCli(), prefixo: 'OR', nome: 'Orçamento', abrir: () => abrirPdfCli(),
    todos: 'todos os orçamentos', aba: 'Proposta cliente', tituloPadrao: 'Texto padrão do orçamento', doc: 'do orçamento' },
  med: { st: () => PMS.med, modelo: modeloPropostaMed, original: MODELO_MEDICO_PADRAO, caminho: 'modeloPropostaMed', itens: () => itensPdfMed(), prefixo: 'PM', nome: 'Proposta', abrir: () => abrirPdfMed(),
    todos: 'todas as propostas ao médico', aba: 'Proposta médico', tituloPadrao: 'Texto padrão da proposta ao médico', doc: 'da proposta ao médico' },
  emp: { st: () => PMS.emp, modelo: modeloPropostaEmp, original: MODELO_EMPRESA_PADRAO, caminho: 'modeloPropostaEmp', itens: () => itensPdfMed(), prefixo: 'PE', nome: 'Proposta', abrir: () => abrirPdfMed(),
    todos: 'todas as propostas a empresas', aba: 'Propostas Empresas', tituloPadrao: 'Texto padrão da proposta à empresa', doc: 'da proposta à empresa' }
};
const PM = () => PDF_MODOS[_pdfModo];
// estado do PDF em edição (pl.pdf ou pc.pdf), usado nos campos da gaveta
const pdfAtual = () => PM().st().pdf;

let _libsPdf = null;
function carregarLibsPdf() {
  if (window.jspdf?.jsPDF?.API?.autoTable) return Promise.resolve();
  return _libsPdf ??= PDF_LIBS.reduce((p, src) => p.then(() => new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => { _libsPdf = null; erro(new Error('Não foi possível carregar o gerador de PDF (sem internet?)')); };
    document.head.appendChild(s);
  })), Promise.resolve());
}

let _logoPdf = null;
async function logoPdf() {
  if (_logoPdf) return _logoPdf;
  try {
    const b = await (await fetch('img/logo-lamic.png')).blob();
    _logoPdf = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
  } catch (e) { _logoPdf = null; }
  // sem a imagem (arquivo aberto direto, sem servidor): usa a cópia embutida em logo.js
  if (!/^data:image\//.test(_logoPdf || '')) _logoPdf = typeof LOGO_LAMIC_PDF === 'string' ? LOGO_LAMIC_PDF : null;
  return _logoPdf;
}

// Itens da proposta: exames selecionados (ou, sem seleção, com preço digitado)
function itensPdfLab() {
  const cl = ctxLabSim();
  let ks = Object.keys(pl.itens).filter(k => ESTADO.exames[k] && selLab(pl.itens[k]));
  if (!ks.length) ks = Object.keys(pl.itens).filter(k => ESTADO.exames[k] && pl.itens[k].p != null);
  // sem volume nem preço digitado: relatório de valores da lista filtrada na tela
  if (!ks.length) return (_plLinhas || []).filter(x => x.preco != null);
  return ks.map(k => linhaLab(cl, { ...ESTADO.exames[k], id: k })).filter(x => x.preco != null);
}
// Orçamento: todos os exames incluídos, com volume de exame e total (que pode ter sido digitado)
const itensPdfCli = () => linhasCli(ctxCli()).filter(x => x.preco != null).map(x => ({ ...x, vol: x.q, tot: x.total }));
// Proposta ao médico: todos os exames com preço; o volume (expectativa de envio) só sai se pedido
const itensPdfMed = () => linhasMed(ctxMed()).filter(x => x.preco != null).map(x => ({ ...x, tot: x.receita }));
// Grupo do exame no PDF: setores de apoio e exames sem setor viram um só grupo "Diversos" (sem o nome do parceiro)
const grupoPdf = e => { const s = ESTADO.setores[e.setorId]; return !s || s.categoria === 'apoio' ? 'Diversos' : s.nome; };
// Setores em ordem alfabética, com "Diversos" (apoio e exames sem setor) por último
const ordemGrupoPdf = (a, b) => (a === 'Diversos') - (b === 'Diversos') || a.localeCompare(b, 'pt-BR');
const numeroProposta = () => `${PM().prefixo}-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${(PM().st().id || 'rasc').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase()}`;

// ── Textos: padrão (todos) × personalizado (proposta atual) ──
const TEXTOS_PDF = ['apresentacao', 'encerramento', 'assinatura', 'cargo', 'rodape', 'validade', 'itExame', 'itVacina'];
// Base do texto: {itens} e {item} viram exames, vacinas ou os dois, conforme as chaves marcadas
function trocarItensPdf(texto, f) {
  const ex = f.itExame !== false, va = !!f.itVacina;
  const [itens, item] = ex && va ? ['exames e vacinas', 'exame ou vacina'] : va ? ['vacinas', 'vacina'] : ['exames', 'exame'];
  return String(texto || '').replace(/\{itens\}/gi, itens).replace(/\{item\}/gi, item);
}
const textoPersonalizado = (f, k, m = PM().modelo()) => String(f?.[k] ?? '') !== String(m[k] ?? '');
// Ao salvar a simulação, guarda só o que difere do padrão: o resto segue o padrão atual
function pdfParaSalvar(f, m = modeloProposta()) {
  if (!f) return null;
  const o = { ...f };
  TEXTOS_PDF.forEach(k => { if (!textoPersonalizado(f, k, m)) delete o[k]; });
  return o;
}

// Campos de texto (usados na proposta atual e no editor do padrão)
function htmlTextosPdf(f, alvo, aoMudar = '') {
  const on = k => `${alvo}.${k}=this.value;${aoMudar}`;
  return `<div class="just" style="margin:0"><label for="pdf-apr">Apresentação</label>
      <textarea id="pdf-apr" class="pdf-txt" rows="14" oninput="${on('apresentacao')}">${esc(f.apresentacao)}</textarea>
      <span class="hint">Linhas terminadas em ":" viram subtítulo · linhas com "•" ou "-" viram itens · {destinatario} é trocado pelo nome</span></div>
    <div class="field" style="margin:0"><label>Base do texto</label><div class="dx-checks" style="grid-template-columns:1fr 1fr;margin-top:0">
      <div class="dx-ck"><span><i class="fa-solid fa-flask"></i>Exame</span>${chave(f.itExame !== false, `${alvo}.itExame=!(${alvo}.itExame!==false);this.classList.toggle('on');${aoMudar}`)}</div>
      <div class="dx-ck"><span><i class="fa-solid fa-syringe"></i>Vacina</span>${chave(!!f.itVacina, `${alvo}.itVacina=!${alvo}.itVacina;this.classList.toggle('on');${aoMudar}`)}</div>
    </div><span class="hint">{itens} vira exames, vacinas ou exames e vacinas · {item} vira exame, vacina ou exame ou vacina</span></div>
    <div class="just" style="margin:0"><label for="pdf-enc">Encerramento</label>
      <textarea id="pdf-enc" rows="3" oninput="${on('encerramento')}">${esc(f.encerramento)}</textarea></div>
    <div class="fgrid sem-pad">
      ${campo('pdf-ass', 'Assinatura', f.assinatura, { tipo: 'text', aoMudar: on('assinatura') })}
      ${campo('pdf-cargo', 'Cargo / setor', f.cargo, { tipo: 'text', aoMudar: on('cargo') })}
    </div>
    ${campo('pdf-rod', 'Rodapé', f.rodape, { tipo: 'text', aoMudar: on('rodape') })}
    <div class="fgrid sem-pad">${campo('pdf-val', 'Validade', f.validade, { suf: 'dias', passo: '1', aoMudar: `${alvo}.validade=parseInt(this.value)||0;${aoMudar}` })}<div></div></div>`;
}

// ── Gaveta: proposta atual ────────────────────────────────────
function abrirPdfLab() {
  _pdfModo = 'lab';
  const itens = itensPdfLab();
  if (!itens.length) return toast('Nenhum exame com preço na lista: ajuste os filtros ou informe volume/preço', 'erro');
  garantirCatalogo();
  const l = ESTADO.laboratorios[pl.labId], m = modeloProposta();
  pl.pdf = { destinatario: l?.razaoSocial || l?.nome || pl.nome || '', cnpj: l?.cnpj || '', aosCuidados: '', totais: true, setor: true, material: true,
    ...Object.fromEntries(TEXTOS_PDF.map(k => [k, m[k]])), ...(pl.pdf || {}) };
  const semVol = !itens.some(x => x.vol > 0);
  const f = pl.pdf, sw = (k, t, d, ic) => `<div class="casc-r"><div class="lft"><i class="fa-solid ${ic}"></i><div>${t}<div class="s">${d}</div></div></div>${chave(f[k], `pl.pdf.${k}=!pl.pdf.${k};this.classList.toggle('on')`)}</div>`;
  abrirGaveta({
    sobre: 'Gerar PDF', titulo: pl.nome || 'Proposta',
    meta: `<span class="tag"><i class="fa-solid fa-flask-vial"></i>${itens.length} exame(s)</span><span class="tag"><i class="fa-solid fa-hashtag"></i>${numeroProposta()}</span>`,
    corpo: `<div class="form-col">
      <div class="sec-t"><i class="fa-solid fa-building"></i>Destinatário</div>
      ${campo('pdf-dest', 'Laboratório / razão social', f.destinatario, { tipo: 'text', ph: 'Nome fantasia ou razão social', aoMudar: 'pl.pdf.destinatario=this.value' })}
      <div class="fgrid sem-pad">
        ${campo('pdf-cnpj', 'CNPJ', f.cnpj, { tipo: 'text', ph: '00.000.000/0000-00', aoMudar: 'this.value=mascaraCnpj(this.value);pl.pdf.cnpj=this.value' })}
        ${campo('pdf-ac', 'Aos cuidados de', f.aosCuidados, { tipo: 'text', ph: 'opcional', aoMudar: 'pl.pdf.aosCuidados=this.value' })}
      </div>
      <div class="sec-t"><i class="fa-solid fa-align-left"></i>Textos desta proposta</div>
      <div id="pdf-selo"></div>
      ${htmlTextosPdf(f, 'pl.pdf', 'pl.sujo=true;seloTextoPdf()')}
      <div class="sec-t"><i class="fa-solid fa-sliders"></i>Conteúdo</div>
      <div class="casc">
        ${semVol ? `<div class="casc-r muted"><div class="lft"><i class="fa-solid fa-calculator"></i><div>Volume mensal e totais<div class="s">sem volume informado: o PDF sai só com os valores por exame</div></div></div><span class="badge-s off">sem volume</span></div>`
          : sw('totais', 'Volume mensal e totais', 'colunas Qtd/mês e Total e o investimento mensal estimado', 'fa-calculator')}
        ${sw('setor', 'Agrupar por setor', 'exames separados por setor, em ordem alfabética', 'fa-layer-group')}
        ${sw('material', 'Coluna de material', 'material biológico do catálogo', 'fa-vial')}
      </div>
      <div class="hint"><i class="fa-solid fa-lock"></i> Custo, margem e lucro nunca saem no PDF.</div>
    </div>`,
    rodape: `${pode('simulador', 'criar') ? `<button class="btn" style="margin-right:auto" onclick="salvarModeloPdf(pdfAtual())" title="Os textos desta proposta passam a ser o padrão de todas"><i class="fa-solid fa-bookmark"></i>Salvar como padrão</button>` : '<span style="margin-right:auto"></span>'}
      <button class="btn" onclick="fecharGaveta()">Fechar</button>
      <button class="btn pri" id="pdf-gerar" onclick="gerarPdfLab()"><i class="fa-solid fa-file-pdf"></i>Gerar PDF</button>`
  });
  seloTextoPdf();
}

// ── Gaveta: orçamento da proposta para cliente ───────────────
function abrirPdfCli() {
  _pdfModo = 'cli';
  const itens = itensPdfCli();
  if (!itens.length) return toast('Adicione exames com preço ao orçamento', 'erro');
  garantirCatalogo();
  const m = modeloPropostaCli();
  pc.pdf = { destinatario: pc.cliente || '', cnpj: '', aosCuidados: '', setor: true, material: true,
    ...Object.fromEntries(TEXTOS_PDF.map(k => [k, m[k]])), ...(pc.pdf || {}) };
  if (!pc.pdf.destinatario && pc.cliente) pc.pdf.destinatario = pc.cliente;
  const f = pc.pdf, sw = (k, t, d, ic) => `<div class="casc-r"><div class="lft"><i class="fa-solid ${ic}"></i><div>${t}<div class="s">${d}</div></div></div>${chave(f[k], `pc.pdf.${k}=!pc.pdf.${k};this.classList.toggle('on')`)}</div>`;
  abrirGaveta({
    sobre: 'Gerar PDF do orçamento', titulo: pc.nome || 'Orçamento',
    meta: `<span class="tag"><i class="fa-solid fa-flask-vial"></i>${itens.length} exame(s)</span><span class="tag"><i class="fa-solid fa-hashtag"></i>${numeroProposta()}</span>`,
    corpo: `<div class="form-col">
      <div class="sec-t"><i class="fa-solid fa-user"></i>Cliente</div>
      ${campo('pdf-dest', 'Nome do cliente', f.destinatario, { tipo: 'text', ph: 'Paciente ou empresa', aoMudar: 'pc.pdf.destinatario=this.value' })}
      <div class="fgrid sem-pad">
        ${campo('pdf-cnpj', 'CPF / CNPJ', f.cnpj, { tipo: 'text', ph: 'opcional', aoMudar: 'pc.pdf.cnpj=this.value' })}
        ${campo('pdf-ac', 'Aos cuidados de', f.aosCuidados, { tipo: 'text', ph: 'opcional', aoMudar: 'pc.pdf.aosCuidados=this.value' })}
      </div>
      <div class="sec-t"><i class="fa-solid fa-align-left"></i>Textos deste orçamento</div>
      <div id="pdf-selo"></div>
      ${htmlTextosPdf(f, 'pc.pdf', 'pc.sujo=true;seloTextoPdf()')}
      <div class="sec-t"><i class="fa-solid fa-sliders"></i>Conteúdo</div>
      <div class="casc">
        ${sw('setor', 'Agrupar por setor', 'exames separados por setor, em ordem alfabética', 'fa-layer-group')}
        ${sw('material', 'Coluna de material', 'material biológico do catálogo', 'fa-vial')}
      </div>
      <div class="hint"><i class="fa-solid fa-lock"></i> Custo, margem e lucro nunca saem no PDF.</div>
    </div>`,
    rodape: `${pode('simulador', 'criar') ? `<button class="btn" style="margin-right:auto" onclick="salvarModeloPdf(pdfAtual())" title="Os textos deste orçamento passam a ser o padrão de todos os orçamentos"><i class="fa-solid fa-bookmark"></i>Salvar como padrão</button>` : '<span style="margin-right:auto"></span>'}
      <button class="btn" onclick="fecharGaveta()">Fechar</button>
      <button class="btn pri" id="pdf-gerar" onclick="gerarPdfLab()"><i class="fa-solid fa-file-pdf"></i>Gerar PDF</button>`
  });
  seloTextoPdf();
}

// ── Gaveta: proposta de desconto ao médico ───────────────────
function abrirPdfMed() {
  _pdfModo = pm.modo;
  const emp = pm.modo === 'emp', itens = itensPdfMed();
  if (!itens.length) return toast('Adicione exames com preço à proposta', 'erro');
  garantirCatalogo();
  const m = PM().modelo(), dr = n => emp || !n || /^dr/i.test(n) ? n || '' : `Dr(a). ${n}`;
  pm.pdf = { destinatario: dr(pm.medico.trim()), cnpj: pm.crm || '', aosCuidados: '', totais: false, ref: true, setor: true, material: true,
    ...Object.fromEntries(TEXTOS_PDF.map(k => [k, m[k]])), ...(pm.pdf || {}) };
  if (!pm.pdf.destinatario && pm.medico) pm.pdf.destinatario = dr(pm.medico.trim());
  const semVol = !itens.some(x => x.vol > 0);
  const f = pm.pdf, sw = (k, t, d, ic) => `<div class="casc-r"><div class="lft"><i class="fa-solid ${ic}"></i><div>${t}<div class="s">${d}</div></div></div>${chave(f[k], `pm.pdf.${k}=!pm.pdf.${k};this.classList.toggle('on')`)}</div>`;
  abrirGaveta({
    sobre: `Gerar PDF da proposta ${emp ? 'à empresa' : 'ao médico'}`, titulo: pm.nome || (emp ? 'Proposta à empresa' : 'Proposta ao médico'),
    meta: `<span class="tag"><i class="fa-solid fa-flask-vial"></i>${itens.length} exame(s)</span><span class="tag"><i class="fa-solid fa-hashtag"></i>${numeroProposta()}</span>`,
    corpo: `<div class="form-col">
      <div class="sec-t"><i class="fa-solid ${emp ? 'fa-building' : 'fa-user-doctor'}"></i>${emp ? 'Empresa' : 'Médico'}</div>
      ${campo('pdf-dest', emp ? 'Razão social' : 'Nome do médico', f.destinatario, { tipo: 'text', ph: emp ? 'Nome da empresa' : 'Dr(a). Nome', aoMudar: 'pm.pdf.destinatario=this.value' })}
      <div class="fgrid sem-pad">
        ${campo('pdf-cnpj', emp ? 'CNPJ' : 'CRM / especialidade', f.cnpj, { tipo: 'text', ph: 'opcional', aoMudar: 'pm.pdf.cnpj=this.value' })}
        ${campo('pdf-ac', emp ? 'A/C (contato)' : 'Clínica / consultório', f.aosCuidados, { tipo: 'text', ph: 'opcional', aoMudar: 'pm.pdf.aosCuidados=this.value' })}
      </div>
      <div class="sec-t"><i class="fa-solid fa-align-left"></i>Textos desta proposta</div>
      <div id="pdf-selo"></div>
      ${htmlTextosPdf(f, 'pm.pdf', 'pm.sujo=true;seloTextoPdf()')}
      <div class="sec-t"><i class="fa-solid fa-sliders"></i>Conteúdo</div>
      <div class="casc">
        ${sw('ref', 'Valor de tabela e desconto', `colunas com o valor normal e o percentual de desconto ao lado do valor ${emp ? 'da proposta' : 'ao paciente'}`, 'fa-tags')}
        ${semVol ? `<div class="casc-r muted"><div class="lft"><i class="fa-solid fa-calculator"></i><div>${emp ? 'Quantidade e totais' : 'Expectativa mensal e totais'}<div class="s">sem ${emp ? 'quantidade informada' : 'volume informado'}</div></div></div><span class="badge-s off">sem volume</span></div>`
          : sw('totais', emp ? 'Quantidade e totais' : 'Expectativa mensal e totais', emp ? 'colunas Qtd e Total, com o total da proposta' : 'colunas Qtd/mês e Total/mês com o volume esperado de pacientes', 'fa-calculator')}
        ${sw('setor', 'Agrupar por setor', 'exames separados por setor, em ordem alfabética', 'fa-layer-group')}
        ${sw('material', 'Coluna de material', 'material biológico do catálogo', 'fa-vial')}
      </div>
      <div class="hint"><i class="fa-solid fa-lock"></i> Custo, margem e lucro nunca saem no PDF.</div>
    </div>`,
    rodape: `${pode('simulador', 'criar') ? `<button class="btn" style="margin-right:auto" onclick="salvarModeloPdf(pdfAtual())" title="Os textos desta proposta passam a ser o padrão de ${PM().todos}"><i class="fa-solid fa-bookmark"></i>Salvar como padrão</button>` : '<span style="margin-right:auto"></span>'}
      <button class="btn" onclick="fecharGaveta()">Fechar</button>
      <button class="btn pri" id="pdf-gerar" onclick="gerarPdfLab()"><i class="fa-solid fa-file-pdf"></i>Gerar PDF</button>`
  });
  seloTextoPdf();
}

// Aviso: texto padrão ou personalizado nesta proposta
function seloTextoPdf() {
  const el = document.getElementById('pdf-selo');
  if (!el || !pdfAtual()) return;
  const n = TEXTOS_PDF.filter(k => textoPersonalizado(pdfAtual(), k)).length;
  el.innerHTML = n
    ? `<div class="alert a" style="margin:0"><i class="fa-solid fa-pen"></i><div><b>Texto personalizado nesta proposta</b> (${n} campo(s)). Fica salvo com a simulação; o padrão não muda.
        <div style="margin-top:6px"><button class="btn sm" onclick="restaurarTextosPdf()"><i class="fa-solid fa-rotate-left"></i>Voltar ao padrão</button></div></div></div>`
    : `<div class="alert x" style="margin:0"><i class="fa-solid fa-file-signature"></i><div><b>Usando o texto padrão</b> (vale para ${PM().todos}). Editar aqui muda só esta proposta${pode('simulador', 'criar') ? '; para mudar o padrão use "Texto padrão" no simulador' : ''}.</div></div>`;
}

function restaurarTextosPdf() {
  const m = PM().modelo(), st = PM().st();
  TEXTOS_PDF.forEach(k => { st.pdf[k] = m[k]; });
  st.sujo = true;
  PM().abrir();
}

// ── Gaveta: texto padrão (todas as propostas) ─────────────────
let _mpd = null;
function abrirModeloPdf(base) {
  _mpd = { ...(base || PM().modelo()) };
  const edit = pode('simulador', 'criar'), salvo = ESTADO[PM().caminho];
  abrirGaveta({
    sobre: PM().aba, titulo: PM().tituloPadrao,
    meta: salvo?.atualizadoPor ? `<span class="tag"><i class="fa-solid fa-user-pen"></i>${esc(salvo.atualizadoPor)} · ${dataHora(salvo.atualizadoEm)}</span>` : '<span class="tag"><i class="fa-solid fa-file-signature"></i>texto original do sistema</span>',
    corpo: `<div class="form-col">
      <div class="alert x" style="margin:0"><i class="fa-solid fa-users"></i><div>Vale para <b>${PM().todos}</b>. As que têm texto personalizado mantêm a versão delas.</div></div>
      ${htmlTextosPdf(_mpd, '_mpd')}
    </div>`,
    rodape: `<button class="btn" style="margin-right:auto" onclick="abrirModeloPdf(PM().original)" title="Volta ao texto original do sistema"><i class="fa-solid fa-rotate-left"></i>Texto original</button>
      <button class="btn" onclick="fecharGaveta()">${edit ? 'Cancelar' : 'Fechar'}</button>
      ${edit ? `<button class="btn pri" onclick="salvarModeloPdf(_mpd, true)"><i class="fa-solid fa-floppy-disk"></i>Salvar padrão</button>` : ''}`
  });
  if (!edit) document.querySelectorAll('#gaveta textarea, #gaveta input').forEach(x => { x.disabled = true; });
}

async function salvarModeloPdf(f, fechar) {
  const P = PM(), st = P.st(), u = usuarioAtual();
  const dados = { ...Object.fromEntries(TEXTOS_PDF.map(k => [k, f[k] ?? P.original[k]])), validade: f.validade || P.original.validade, atualizadoPor: u.nome, atualizadoEm: Date.now() };
  // proposta aberta: o que era igual ao padrão antigo passa a seguir o novo
  if (st.pdf) { const proprio = pdfParaSalvar(st.pdf, P.modelo()); TEXTOS_PDF.forEach(k => { if (!(k in proprio)) st.pdf[k] = dados[k]; }); }
  await DB.gravar(CAMINHOS[P.caminho], dados);
  ESTADO[P.caminho] = dados;
  registrar('simulador', `Texto padrão do PDF ${P.doc} alterado`);
  if (fechar) fecharGaveta(); else seloTextoPdf();
  toast(`Texto padrão salvo: vale para ${P.todos}`);
}

// ── Geração ───────────────────────────────────────────────────
async function gerarPdfLab() {
  const bt = document.getElementById('pdf-gerar');
  if (bt) { bt.disabled = true; bt.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>Gerando…'; }
  try {
    await Promise.all([carregarLibsPdf(), garantirCatalogo()]);
    const doc = montarPdfLab(await logoPdf()), P = PM(), st = P.st();
    const nome = `${P.nome} LAMIC - ${(st.pdf.destinatario || st.nome || ({ cli: 'cliente', med: 'médico', emp: 'empresa' }[_pdfModo] || 'laboratório')).trim()}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
    doc.save(nome);
    st.sujo = true;
    registrar('simulador', `PDF ${P.doc} "${st.nome || st.pdf.destinatario}" gerado (${P.itens().length} exames)`);
    toast('PDF gerado · salve a simulação para guardar os textos');
  } catch (e) {
    console.error(e);
    toast(e.message || 'Erro ao gerar o PDF', 'erro');
  } finally {
    if (bt) { bt.disabled = false; bt.innerHTML = '<i class="fa-solid fa-file-pdf"></i>Gerar PDF'; }
  }
}

function montarPdfLab(logo) {
  const { jsPDF } = window.jspdf, f = pdfAtual(), C = COR_PDF, cli = _pdfModo === 'cli', med = _pdfModo === 'med' || _pdfModo === 'emp', emp = _pdfModo === 'emp';
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setLineHeightFactor(1.42);
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 42, LW = W - 2 * M;
  const TOPO = 96, BASE = H - 64;                        // área útil das páginas seguintes
  const hoje = new Date(), validade = new Date(hoje.getTime() + (f.validade || 0) * 864e5);
  const dt = d => d.toLocaleDateString('pt-BR'), nProp = numeroProposta();
  const brl = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cor = (c, tipo = 'text') => tipo === 'text' ? doc.setTextColor(...c) : tipo === 'fill' ? doc.setFillColor(...c) : doc.setDrawColor(...c);
  const fonte = (estilo = 'normal', tam = 10) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); };
  let y;
  const quebra = h => { if (y + h > BASE) { doc.addPage(); y = TOPO + 6; } };

  // ── Página 1: faixa de título e destinatário ──
  y = 128;
  fonte('bold', 19); cor(C.navy);
  doc.text(cli ? `Orçamento de ${f.itVacina ? (f.itExame !== false ? 'Exames e Vacinas' : 'Vacinas') : 'Exames Laboratoriais'}` : emp ? 'Proposta de Prestação de Serviços Laboratoriais' : med ? 'Proposta de Desconto para Pacientes' : 'Proposta de Prestação de Serviços Laboratoriais', M, y);
  y += 10;
  cor(C.azul, 'fill'); doc.rect(M, y, 46, 3, 'F');
  cor(C.cinza, 'fill'); doc.rect(M + 50, y, 14, 3, 'F');
  y += 18;

  const itens = PM().itens().map(x => ({ ...x, tot: x.tot ?? x.preco * (x.vol || 0), setor: grupoPdf(x.e), material: ESTADO.catalogo?.[x.k]?.material || x.e.material || '' }));
  const vol = itens.reduce((s, x) => s + (x.vol || 0), 0), total = itens.reduce((s, x) => s + x.tot, 0);
  // sem volume (0): relatório só com valores brutos, sem receita nem dados mensais (o orçamento sempre tem total)
  const comVol = cli || (f.totais && vol > 0);

  // cartão do destinatário (esquerda) e dados da proposta (direita)
  const cardH = 78, colD = LW * 0.6;
  cor(C.fundo, 'fill'); cor(C.linha, 'draw'); doc.setLineWidth(0.6);
  doc.roundedRect(M, y, LW, cardH, 6, 6, 'FD');
  cor(C.azul, 'fill'); doc.rect(M, y + 10, 3, cardH - 20, 'F');
  const rot = (t, x, yy) => { fonte('bold', 7.5); cor(C.muted); doc.text(t.toUpperCase(), x, yy, { charSpace: 0.6 }); };
  rot(emp ? 'Empresa' : med ? 'Médico' : 'Destinatário', M + 16, y + 18);
  fonte('bold', 12.5); cor(C.navy);
  const dest = doc.splitTextToSize(f.destinatario || '—', colD - 30);
  doc.text(dest.slice(0, 2), M + 16, y + 34);
  fonte('normal', 9); cor(C.texto);
  // médico: CRM/especialidade e clínica saem como digitados
  const extra = [f.cnpj ? `${cli ? 'CPF/CNPJ ' : med && !emp ? '' : 'CNPJ '}${f.cnpj}` : '', f.aosCuidados ? `${med && !emp ? '' : 'A/C '}${f.aosCuidados}` : ''].filter(Boolean).join('   ·   ');
  if (extra) doc.text(extra, M + 16, y + 34 + dest.slice(0, 2).length * 14);
  const xD = M + colD + 10;
  cor(C.linha, 'draw'); doc.line(xD - 12, y + 12, xD - 12, y + cardH - 12);
  [[cli ? 'Nº do orçamento' : 'Nº da proposta', nProp], ['Emissão', dt(hoje)], ['Validade', f.validade ? `${dt(validade)} (${f.validade} dias)` : '—']].forEach(([r, v], i) => {
    const yy = y + 24 + i * 19;
    rot(r, xD, yy); fonte('bold', 9.5); cor(C.navy); doc.text(v, W - M - 14, yy, { align: 'right' });
    if (i < 2) { cor(C.linha, 'draw'); doc.setLineWidth(0.4); doc.line(xD, yy + 7, W - M - 14, yy + 7); }
  });
  y += cardH + 22;

  // ── Texto de apresentação ──
  const blocoTexto = (texto, tam = 10) => {
    trocarItensPdf(texto, f).replace(/\{destinatario\}/gi, f.destinatario || '').split('\n').forEach(linha => {
      const t = linha.trim();
      if (!t) { y += 7; return; }
      const item = /^[•\-–]\s*/.test(t), sub = !item && /:$/.test(t) && t.length < 90;
      if (sub) {
        quebra(26); y += 4;
        fonte('bold', tam); cor(C.navy); doc.text(t, M, y); y += tam + 5;
        return;
      }
      fonte('normal', tam); cor(C.texto);
      const x = item ? M + 14 : M, w = item ? LW - 14 : LW, txt = item ? t.replace(/^[•\-–]\s*/, '') : t;
      const ls = doc.splitTextToSize(txt, w), h = ls.length * (tam * 1.42);
      quebra(h);
      if (item) { cor(C.azul, 'fill'); doc.circle(M + 4, y - tam * 0.32, 1.9, 'F'); cor(C.texto); }
      if (item || ls.length === 1) doc.text(ls, x, y);
      else doc.text(txt, x, y, { maxWidth: w, align: 'justify' });
      y += h + 2;
    });
  };
  blocoTexto(f.apresentacao);
  y += 10;

  // ── Resumo ──
  const caixas = [[cli ? 'Exames no orçamento' : med ? 'Exames com desconto' : 'Exames na proposta', String(itens.length)]];
  // médico: desconto médio por exame sobre o valor normal
  const cRef = itens.filter(x => x.ref), descMed = cRef.length ? 1 - cRef.reduce((s, x) => s + x.preco, 0) / cRef.reduce((s, x) => s + x.ref, 0) : null;
  if (emp) {
    // venda única: quantidade de exames e total, como no orçamento
    if (f.ref && descMed != null) caixas.push(['Desconto médio', pct(descMed)]);
    caixas.push(...(comVol ? [['Quantidade de exames', vol.toLocaleString('pt-BR')], ['Total da proposta', brl(total)]] : [['Validade da proposta', f.validade ? `${f.validade} dias` : '—']]));
  } else if (med) {
    if (f.ref && descMed != null) caixas.push(['Desconto médio', pct(descMed)]);
    caixas.push(comVol ? ['Pacientes/mês estimados', vol.toLocaleString('pt-BR')] : ['Validade da proposta', f.validade ? `${f.validade} dias` : '—']);
  } else if (cli) caixas.push(['Quantidade de exames', vol.toLocaleString('pt-BR')], ['Total do orçamento', brl(total)]);
  else if (comVol) caixas.push(['Volume mensal estimado', `${vol.toLocaleString('pt-BR')} exame(s)`], ['Investimento mensal estimado', brl(total)]);
  else caixas.push(['Validade da proposta', f.validade ? `${f.validade} dias` : '—']);
  quebra(70);
  const bw = (LW - (caixas.length - 1) * 10) / caixas.length;
  caixas.forEach(([r, v], i) => {
    const x = M + i * (bw + 10), destaque = i === caixas.length - 1 && (comVol || med);
    cor(destaque ? C.navy : C.fundo, 'fill'); cor(destaque ? C.navy : C.linha, 'draw');
    doc.roundedRect(x, y, bw, 50, 5, 5, 'FD');
    fonte('bold', 7.5); cor(destaque ? [190, 214, 230] : C.muted); doc.text(r.toUpperCase(), x + 12, y + 18, { charSpace: 0.5 });
    fonte('bold', 14); cor(destaque ? [255, 255, 255] : C.navy); doc.text(v, x + 12, y + 38);
  });
  y += 72;

  // ── Relação de exames ──
  quebra(80);
  fonte('bold', 12); cor(C.navy); doc.text(`Relação de ${trocarItensPdf('{itens}', f).replace(' e ', ', ')} e valores`, M, y);
  fonte('normal', 8.5); cor(C.muted); doc.text(med && !emp ? 'Valores ao paciente em reais (R$), por exame realizado.' : 'Valores unitários em reais (R$), por exame realizado.', W - M, y, { align: 'right' });
  y += 8;
  const cols = [{ k: 'mn', t: 'Mnemônico', w: 62 }, { k: 'ex', t: 'Exame' }];
  if (f.material) cols.push({ k: 'mat', t: 'Material', w: 70 });
  cols.push({ k: 'pz', t: 'Prazo', w: 64, a: 'center' });
  if (med && f.ref) cols.push({ k: 'rf', t: 'Valor normal', w: 62, a: 'right' }, { k: 'dc', t: 'Desc.', w: 40, a: 'center' });
  cols.push({ k: 'vl', t: med && !emp ? 'Valor paciente' : 'Valor', w: med ? 66 : 62, a: 'right' });
  if (comVol) cols.push({ k: 'qt', t: cli || emp ? 'Qtd' : 'Qtd/mês', w: 44, a: 'center' }, { k: 'tt', t: cli || emp ? 'Total' : 'Total/mês', w: 68, a: 'right' });
  const linhaTab = x => ({ mn: x.e.mn, ex: x.e.descricao || '', mat: x.material || '-', pz: textoPrazoPdf(x.k) || '-', vl: brl(x.preco), qt: x.vol ? String(x.vol) : '-', tt: x.vol ? brl(x.tot) : '-',
    rf: x.ref != null ? brl(x.ref) : '-', dc: x.desc != null && x.desc > 0.0005 ? pct(x.desc, 0) : '-' });
  const ord = (a, b) => a.e.mn.localeCompare(b.e.mn, 'pt-BR', { sensitivity: 'base' });
  const corpo = [];
  if (f.setor) {
    const grupos = {};
    itens.forEach(x => (grupos[x.setor] ??= []).push(x));
    Object.keys(grupos).sort(ordemGrupoPdf).forEach(s => {
      corpo.push([{ content: `${s}  (${grupos[s].length})`, colSpan: cols.length, styles: { fillColor: [232, 243, 249], textColor: C.navy, fontStyle: 'bold', fontSize: 8.5 } }]);
      grupos[s].sort(ord).forEach(x => { const r = linhaTab(x); corpo.push(cols.map(c => r[c.k])); });
    });
  } else itens.sort(ord).forEach(x => { const r = linhaTab(x); corpo.push(cols.map(c => r[c.k])); });
  const colStyles = {};
  cols.forEach((c, i) => { colStyles[i] = { cellWidth: c.w || 'auto', halign: c.a || 'left' }; });
  colStyles[0].fontStyle = 'bold'; colStyles[0].textColor = C.navy;
  const iVl = cols.findIndex(c => c.k === 'vl');
  colStyles[iVl].fontStyle = 'bold';
  doc.autoTable({
    startY: y, head: [cols.map(c => c.t)], body: corpo,
    foot: comVol ? [[{ content: cli ? 'Total do orçamento' : emp ? 'Total da proposta' : med ? 'Total mensal estimado (expectativa de envio)' : 'Total mensal estimado', colSpan: cols.length - 2, styles: { halign: 'right' } }, { content: vol.toLocaleString('pt-BR'), styles: { halign: 'center' } }, { content: brl(total), styles: { halign: 'right' } }]] : undefined,
    showFoot: 'lastPage', theme: 'plain',
    margin: { left: M, right: M, top: TOPO + 6, bottom: H - BASE + 4 },
    styles: { font: 'helvetica', fontSize: 8.4, cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 }, textColor: C.texto, lineColor: C.linha, lineWidth: { bottom: 0.5 }, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: C.navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, lineWidth: 0, halign: 'left' },
    footStyles: { fillColor: C.fundo, textColor: C.navy, fontStyle: 'bold', fontSize: 9, lineWidth: { top: 1 }, lineColor: C.navy },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: colStyles,
    didParseCell: d => { if (d.section === 'head') d.cell.styles.halign = cols[d.column.index]?.a || 'left'; }
  });
  y = doc.lastAutoTable.finalY + 26;

  // ── Encerramento e assinatura ──
  blocoTexto(f.encerramento);
  quebra(110);
  y += 20;
  fonte('normal', 10); cor(C.texto);
  doc.text(`Juazeiro do Norte - CE, ${hoje.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.`, M, y);
  y += 54;
  const xs = W / 2;
  cor(C.navy, 'draw'); doc.setLineWidth(0.8); doc.line(xs - 110, y, xs + 110, y);
  fonte('bold', 11); cor(C.navy); doc.text(f.assinatura || '', xs, y + 15, { align: 'center' });
  fonte('normal', 9); cor(C.muted); doc.text(f.cargo || '', xs, y + 28, { align: 'center' });

  // ── Cabeçalho e rodapé em todas as páginas ──
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    // faixa superior
    cor(C.navy, 'fill'); doc.rect(0, 0, W, 5, 'F');
    cor(C.azul, 'fill'); doc.rect(W * 0.62, 0, W * 0.38, 5, 'F');
    if (i === 1) {
      if (logo) { const p = doc.getImageProperties(logo), lw = 150; doc.addImage(logo, 'PNG', M - 14, 18, lw, lw * p.height / p.width); }
      fonte('bold', 8); cor(C.azul); doc.text(cli ? 'ORÇAMENTO' : emp ? 'PROPOSTA À EMPRESA' : med ? 'PROPOSTA AO MÉDICO' : 'PROPOSTA COMERCIAL', W - M, 38, { align: 'right', charSpace: 1.2 });
      fonte('bold', 15); cor(C.navy); doc.text(nProp, W - M, 56, { align: 'right' });
      fonte('normal', 8.5); cor(C.muted); doc.text(`Emitida em ${dt(hoje)}`, W - M, 70, { align: 'right' });
      cor(C.linha, 'draw'); doc.setLineWidth(0.6); doc.line(M, 86, W - M, 86);
    } else {
      if (logo) { const p = doc.getImageProperties(logo), lw = 92; doc.addImage(logo, 'PNG', M - 8, 16, lw, lw * p.height / p.width); }
      fonte('bold', 9); cor(C.navy); doc.text(f.destinatario || (cli ? 'Orçamento' : emp ? 'Proposta à empresa' : med ? 'Proposta ao médico' : 'Proposta comercial'), W - M, 38, { align: 'right' });
      fonte('normal', 8); cor(C.muted); doc.text(`${PM().nome} ${nProp} · continuação`, W - M, 51, { align: 'right' });
      cor(C.linha, 'draw'); doc.setLineWidth(0.6); doc.line(M, 66, W - M, 66);
    }
    // rodapé
    cor(C.azul, 'draw'); doc.setLineWidth(1); doc.line(M, H - 46, M + 40, H - 46);
    cor(C.linha, 'draw'); doc.setLineWidth(0.5); doc.line(M + 44, H - 46, W - M, H - 46);
    fonte('normal', 7.8); cor(C.muted);
    doc.text(doc.splitTextToSize(f.rodape || '', LW - 90)[0] || '', M, H - 32);
    doc.text(`${PM().nome} ${nProp}${f.validade ? ` · válida até ${dt(validade)}` : ''}`, M, H - 21);
    fonte('bold', 8); cor(C.navy); doc.text(`Página ${i} de ${n}`, W - M, H - 32, { align: 'right' });
  }
  return doc;
}
