// ─── ENDEREÇO DO AGENDAMENTO ─────────────────────────────────────────────────
// Três preenchimentos independentes sobre os mesmos 6 campos-alvo:
//   1. API ViaCEP  2. histórico do próprio paciente  3. digitação manual
// Nenhum deles destrói input humano já existente.

const ENDERECO_CAMPOS = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado', 'referencia'];
const ENDERECO_HIERARQUIA = ['estado', 'cidade', 'bairro', 'logradouro'];

// Padrão aplicado quando não há dado do paciente nem retorno do CEP.
const ENDERECO_PADRAO = { cidade: 'JUAZEIRO DO NORTE', estado: 'CE' };

const ESTADOS_BR = [
    { uf: 'AC', nome: 'Acre' }, { uf: 'AL', nome: 'Alagoas' }, { uf: 'AP', nome: 'Amapá' },
    { uf: 'AM', nome: 'Amazonas' }, { uf: 'BA', nome: 'Bahia' }, { uf: 'CE', nome: 'Ceará' },
    { uf: 'DF', nome: 'Distrito Federal' }, { uf: 'ES', nome: 'Espírito Santo' }, { uf: 'GO', nome: 'Goiás' },
    { uf: 'MA', nome: 'Maranhão' }, { uf: 'MT', nome: 'Mato Grosso' }, { uf: 'MS', nome: 'Mato Grosso do Sul' },
    { uf: 'MG', nome: 'Minas Gerais' }, { uf: 'PA', nome: 'Pará' }, { uf: 'PB', nome: 'Paraíba' },
    { uf: 'PR', nome: 'Paraná' }, { uf: 'PE', nome: 'Pernambuco' }, { uf: 'PI', nome: 'Piauí' },
    { uf: 'RJ', nome: 'Rio de Janeiro' }, { uf: 'RN', nome: 'Rio Grande do Norte' }, { uf: 'RS', nome: 'Rio Grande do Sul' },
    { uf: 'RO', nome: 'Rondônia' }, { uf: 'RR', nome: 'Roraima' }, { uf: 'SC', nome: 'Santa Catarina' },
    { uf: 'SP', nome: 'São Paulo' }, { uf: 'SE', nome: 'Sergipe' }, { uf: 'TO', nome: 'Tocantins' }
];

// ─── LOCAL DA APLICAÇÃO ──────────────────────────────────────────────────────
// Domiciliar exige endereço (é uma visita); Laboratório dispensa — o paciente
// vem até a clínica, então os campos ficam ocultos e sem obrigatoriedade.
// Começa sempre vazio: é uma escolha consciente por agendamento, não um padrão
// herdado que passe batido. As classes vão escritas por extenso porque o
// Tailwind via CDN não gera nomes montados em runtime.
const LOCAL_APLICACAO_OPCOES = [
    {
        valor: 'Laboratório', icone: 'fa-flask', desc: 'Paciente vem à clínica',
        btn: 'border-violet-200 bg-violet-50 hover:bg-violet-100',
        btnIcone: 'text-violet-500', btnTexto: 'text-violet-800',
        popSel: 'bg-violet-50', popIcone: 'bg-violet-100 text-violet-600', popCheck: 'text-violet-500'
    },
    {
        valor: 'Domiciliar', icone: 'fa-house-chimney-medical', desc: 'Visita no endereço',
        btn: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
        btnIcone: 'text-emerald-500', btnTexto: 'text-emerald-800',
        popSel: 'bg-emerald-50', popIcone: 'bg-emerald-100 text-emerald-600', popCheck: 'text-emerald-500'
    }
];

function _localAplicacaoOpcao(valor) {
    return LOCAL_APLICACAO_OPCOES.find(o => o.valor === valor) || null;
}

function localAplicacaoValida(valor) {
    return !!_localAplicacaoOpcao(valor);
}

// Só Laboratório dispensa endereço. Vazio ainda não decidiu — trata como
// "sem exigência" para não pedir endereço antes da escolha.
function localAplicacaoExigeEndereco(valor) {
    return valor === 'Domiciliar';
}

// O inverso do endereço: no Laboratório o que localiza a aplicação é a unidade
// de coleta, não a rua. Domiciliar não tem unidade — a visita vai ao paciente.
function localAplicacaoExigeUnidade(valor) {
    return valor === 'Laboratório';
}

// ─── TAXA DE DESLOCAMENTO ────────────────────────────────────────────────────
// Só existe na visita domiciliar: é o custo de ir até o paciente, não da dose.
// Por isso mora no objeto de endereço (`endereco.taxaDeslocamento` /
// `endereco.taxaPaga`) e não no valor da vacina — e é cobrada uma vez por
// visita, nunca por vacina aplicada nela.
// Fora do Domiciliar a taxa é zerada, não apenas escondida: guardar valor de
// deslocamento num atendimento de laboratório viraria cobrança fantasma.

function taxaLocalPermite(local) {
    return localAplicacaoExigeEndereco(local);
}

// Espalha o endereço da visita pelas vacinas do grupo. Todas ficam com o mesmo
// endereço, mas a taxa é cobrada uma única vez: a primeira vacina carrega o
// valor e as demais recebem taxa zero. Assim o total da visita soma uma taxa,
// não uma por dose, e o marcador "paga" tem um único dono.
function enderecoDaVisitaParaVacina(end, primeira) {
    const copia = { ...(end || {}) };
    if (!primeira) {
        copia.taxaDeslocamento = 0;
        copia.taxaPaga = false;
    }
    return copia;
}

// Leitura tolerante: registro antigo não tem as chaves, e o valor pode ter sido
// gravado como número ou como texto "12,50".
function getTaxaDeslocamento(end) {
    if (!end || !taxaLocalPermite(end.localAplicacao)) return 0;
    const v = end.taxaDeslocamento;
    if (v == null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseBRL(v);
    return n > 0 ? n : 0;
}

function getTaxaPaga(end) {
    return getTaxaDeslocamento(end) > 0 && !!(end && end.taxaPaga);
}

// Total da visita = vacina + taxa. Sem domiciliar (ou sem taxa) devolve só o
// valor da vacina, que é o que a tela deve mostrar sozinho.
function totalComTaxa(app) {
    if (!app) return 0;
    return parseBRL(app.valorAplicado) + getTaxaDeslocamento(app.endereco);
}

// Status consolidado do dinheiro da visita, para as telas que mostram um único
// selo: tudo pago, nada pago, ou parcial (uma ponta paga e a outra não).
function statusPagamentoVisita(app) {
    if (!app) return { rotulo: 'Não pago', estado: 'nao' };
    const temTaxa = getTaxaDeslocamento(app.endereco) > 0;
    const vacPago = !!app.pago;
    if (!temTaxa) return vacPago ? { rotulo: 'Pago', estado: 'pago' } : { rotulo: 'Não pago', estado: 'nao' };
    const taxaPaga = getTaxaPaga(app.endereco);
    if (vacPago && taxaPaga) return { rotulo: 'Pago', estado: 'pago' };
    if (!vacPago && !taxaPaga) return { rotulo: 'Não pago', estado: 'nao' };
    return {
        rotulo: vacPago ? 'Taxa pendente' : 'Vacina pendente',
        estado: 'parcial'
    };
}

// Prefixo dos IDs dos campos-alvo. O formulário de registro usa "reg"; outros
// formulários (ex.: endereço do modal Agendar Grupo) trocam o prefixo enquanto
// estão abertos, para reaproveitar CEP, sugestões, padrão e validação sem
// duplicar nada.
let _endPrefixo = 'reg';

function setEnderecoPrefixo(p) { _endPrefixo = p || 'reg'; }

function _endEl(campo) { return document.getElementById(_endPrefixo + '-' + campo); }

// O valor mora num input escondido; o botão é só a face visível do popover.
function _localAplicacaoEl() { return document.getElementById(_endPrefixo + '-local-aplicacao'); }

// ─── TAXA NO FORMULÁRIO ──────────────────────────────────────────────────────
// Segue o mesmo prefixo dos demais campos: o par (valor, pago) serve tanto ao
// registro ("reg") quanto ao editor de endereço do grupo ("grpend").
// O "pago" vive num input escondido porque o visível é um botão, igual ao
// marcador de pagamento da vacina.

function _taxaValorEl() { return document.getElementById(_endPrefixo + '-taxa-valor'); }
function _taxaPagaEl()  { return document.getElementById(_endPrefixo + '-taxa-paga'); }

function getTaxaValorForm() {
    const v = (_taxaValorEl()?.value || '').trim();
    const n = parseBRL(v);
    return n > 0 ? n : 0;
}

function getTaxaPagaForm() {
    // Taxa zerada não tem pagamento a marcar — evita gravar "pago" sem valor.
    return getTaxaValorForm() > 0 && _taxaPagaEl()?.value === '1';
}

function _paintTaxaPagaBtn() {
    const btn  = document.getElementById(_endPrefixo + '-taxa-pago-btn');
    if (!btn) return;
    const icon = document.getElementById(_endPrefixo + '-taxa-pago-icone');
    const txt  = document.getElementById(_endPrefixo + '-taxa-pago-texto');
    const on   = _taxaPagaEl()?.value === '1';
    const vazia = getTaxaValorForm() <= 0;

    btn.className = on
        ? 'w-full flex items-center justify-center gap-2 border-2 border-emerald-600 bg-emerald-600 rounded-lg py-2 px-3 text-white text-xs font-black uppercase tracking-wide transition hover:bg-emerald-700 hover:border-emerald-700 shadow-sm'
        : 'w-full flex items-center justify-center gap-2 border-2 border-slate-200 bg-white rounded-lg py-2 px-3 text-slate-400 text-xs font-black uppercase tracking-wide transition hover:border-emerald-300';
    btn.disabled = vazia;
    btn.classList.toggle('opacity-50', vazia);
    btn.classList.toggle('cursor-not-allowed', vazia);
    if (icon) icon.className = on ? 'fas fa-circle-check text-sm' : 'fas fa-circle-xmark text-sm';
    if (txt)  txt.textContent = on ? 'Paga' : 'Não paga';
}

function toggleTaxaPaga() {
    const el = _taxaPagaEl();
    if (!el) return;
    // Sem valor não há o que marcar.
    if (getTaxaValorForm() <= 0) { el.value = ''; _paintTaxaPagaBtn(); return; }
    el.value = el.value === '1' ? '' : '1';
    _paintTaxaPagaBtn();
}

// Chamado pelo `oninput` do campo: apagar o valor derruba o "paga" junto.
function onTaxaValorInput(input) {
    if (input) maskCurrency(input);
    if (getTaxaValorForm() <= 0 && _taxaPagaEl()) _taxaPagaEl().value = '';
    _paintTaxaPagaBtn();
}

function setTaxaForm(valor, paga) {
    const vEl = _taxaValorEl();
    const pEl = _taxaPagaEl();
    const n = typeof valor === 'number' ? valor : parseBRL(valor);
    if (vEl) vEl.value = n > 0 ? formatBRL(n) : '';
    if (pEl) pEl.value = (n > 0 && paga) ? '1' : '';
    _paintTaxaPagaBtn();
}

function getLocalAplicacao() {
    const v = _localAplicacaoEl()?.value || '';
    return localAplicacaoValida(v) ? v : '';
}

function setLocalAplicacao(valor) {
    const el = _localAplicacaoEl();
    if (!el) return;
    // Valor desconhecido (ou ausente) volta ao estado não escolhido.
    el.value = localAplicacaoValida(valor) ? valor : '';
    _renderLocalAplicacaoBotao();
    aplicarLocalAplicacao();
}

// Pinta o botão conforme a escolha. Sem escolha ele fica neutro e com o texto
// de placeholder, para não parecer preenchido.
function _renderLocalAplicacaoBotao() {
    const btn = document.getElementById(_endPrefixo + '-local-btn');
    if (!btn) return;
    const opt = _localAplicacaoOpcao(getLocalAplicacao());
    const icone = document.getElementById(_endPrefixo + '-local-btn-icone');
    const texto = document.getElementById(_endPrefixo + '-local-btn-texto');

    btn.className = 'w-full flex items-center gap-2.5 border rounded-lg py-2 px-3 text-sm text-left transition focus:ring-2 focus:ring-clinic-500 outline-none ' +
        (opt ? opt.btn : 'border-slate-200 bg-white hover:bg-slate-50');
    if (icone) {
        icone.className = opt
            ? `fas ${opt.icone} ${opt.btnIcone} text-sm w-4 text-center shrink-0`
            : 'fas fa-location-crosshairs text-slate-300 text-sm w-4 text-center shrink-0';
    }
    if (texto) {
        texto.textContent = opt ? opt.valor : 'Selecione...';
        texto.className = opt
            ? `flex-1 font-black truncate ${opt.btnTexto}`
            : 'flex-1 font-bold truncate text-slate-400';
    }
}

// Monta as opções do popover uma única vez por abertura.
function _renderLocalAplicacaoOpcoes() {
    const lista = document.getElementById(_endPrefixo + '-local-pop');
    if (!lista) return;
    const atual = getLocalAplicacao();
    lista.innerHTML = LOCAL_APLICACAO_OPCOES.map(o => {
        const sel = o.valor === atual;
        return `<button type="button" onclick="selecionarLocalAplicacao('${o.valor}')"
            class="w-full flex items-center gap-3 px-3 py-2.5 text-left transition border-b border-slate-100 last:border-0 ${sel ? o.popSel : 'hover:bg-slate-50'}">
            <span class="h-8 w-8 rounded-lg ${o.popIcone} flex items-center justify-center shrink-0">
                <i class="fas ${o.icone} text-xs"></i>
            </span>
            <span class="flex-1 min-w-0">
                <span class="block text-[12px] font-black text-navy-900 truncate">${o.valor}</span>
                <span class="block text-[10px] font-bold text-slate-400 truncate">${o.desc}</span>
            </span>
            ${sel ? `<i class="fas fa-check ${o.popCheck} text-xs shrink-0"></i>` : ''}
        </button>`;
    }).join('');
}

// O popover é `fixed` e posicionado por medida: dentro do modal ele nasceria
// recortado pelo `overflow-hidden` do card e pelo scroll do corpo.
function _posicionarLocalAplicacaoPop() {
    const pop = document.getElementById(_endPrefixo + '-local-pop');
    const btn = document.getElementById(_endPrefixo + '-local-btn');
    if (!pop || !btn) return;
    const r = btn.getBoundingClientRect();
    const alturaPop = pop.offsetHeight || 0;
    const margem = 8;
    // Abre para cima quando não há espaço abaixo — o modal costuma ficar colado
    // no rodapé da tela.
    const abaixo = r.bottom + 4;
    const cabeAbaixo = abaixo + alturaPop + margem <= window.innerHeight;
    pop.style.left  = `${r.left}px`;
    pop.style.width = `${r.width}px`;
    pop.style.top   = cabeAbaixo ? `${abaixo}px` : `${Math.max(margem, r.top - 4 - alturaPop)}px`;
}

function toggleLocalAplicacaoPop() {
    const pop = document.getElementById(_endPrefixo + '-local-pop');
    if (!pop) return;
    if (pop.classList.contains('hidden')) {
        _renderLocalAplicacaoOpcoes();
        pop.classList.remove('hidden');
        // Só dá para medir a altura depois de visível.
        _posicionarLocalAplicacaoPop();
    } else pop.classList.add('hidden');
}

function fecharLocalAplicacaoPop() {
    document.getElementById(_endPrefixo + '-local-pop')?.classList.add('hidden');
}

function selecionarLocalAplicacao(valor) {
    setLocalAplicacao(valor);
    fecharLocalAplicacaoPop();
}

// Sendo `fixed`, o popover não acompanha rolagem nem redimensionamento —
// fecha junto para nunca ficar deslocado do botão. Captura na fase de captura
// para pegar o scroll do corpo do modal, que não borbulha até window.
['scroll', 'resize'].forEach(evt =>
    window.addEventListener(evt, () => {
        document.querySelectorAll('[id$="-local-pop"]').forEach(p => p.classList.add('hidden'));
    }, true)
);

// ─── UNIDADE DE COLETA ───────────────────────────────────────────────────────
// Vive junto do local da aplicação e usa o mesmo prefixo: o mesmo par de campos
// serve ao formulário de registro ("reg") e ao editor de endereço ("grpend").

function _unidadeEl() { return document.getElementById(_endPrefixo + '-unidade'); }

function getUnidadeAplicacao() {
    // Só vale quando o local pede unidade; Domiciliar nunca grava unidade.
    if (!localAplicacaoExigeUnidade(getLocalAplicacao())) return null;
    const v = _unidadeEl()?.value || '';
    return v ? Number(v) : null;
}

function setUnidadeAplicacao(id) {
    const el = _unidadeEl();
    if (!el) return;
    // Repopula antes de escolher: a unidade salva pode estar inativa e, sem a
    // opção na lista, o select cairia para vazio silenciosamente.
    if (typeof populateUnidadeSelects === 'function') populateUnidadeSelects(id);
    el.value = id != null && id !== '' ? String(id) : '';
}

// Mostra/esconde os campos de endereço conforme o local. Enquanto nada foi
// escolhido o bloco fica oculto: não faz sentido pedir endereço antes.
function aplicarLocalAplicacao() {
    const exige = localAplicacaoExigeEndereco(getLocalAplicacao());
    const box = document.getElementById(_endPrefixo + '-endereco-campos');
    if (box) box.classList.toggle('hidden', !exige);
    // Unidade aparece só no Laboratório; fora dele o valor escolhido é descartado
    // para não voltar sozinho se o usuário alternar o local de novo.
    const unidadeWrap = document.getElementById(_endPrefixo + '-unidade-wrap');
    const pedeUnidade = localAplicacaoExigeUnidade(getLocalAplicacao());
    if (unidadeWrap) unidadeWrap.classList.toggle('hidden', !pedeUnidade);
    if (!pedeUnidade && _unidadeEl()) _unidadeEl().value = '';
    // Taxa de deslocamento só na visita domiciliar. Saindo dela o valor é
    // zerado (não só oculto) para não sobrar cobrança de uma escolha desfeita.
    const taxaWrap = document.getElementById(_endPrefixo + '-taxa-wrap');
    if (taxaWrap) taxaWrap.classList.toggle('hidden', !exige);
    if (!exige) setTaxaForm(0, false);
    else _paintTaxaPagaBtn();
    // Mapa aberto perde o sentido sem endereço visível.
    if (!exige) {
        const mapaBox = document.getElementById(_endPrefixo + '-mapa-box');
        const mapaFrame = document.getElementById(_endPrefixo + '-mapa-frame');
        if (mapaBox) mapaBox.classList.add('hidden');
        if (mapaFrame) mapaFrame.src = '';
    }
    return exige;
}

// Paciente dono das sugestões. Formulários sem o campo escondido do registro
// (ex.: Agendar Grupo) declaram o paciente aqui.
let _endPacienteIdOverride = null;
function setEnderecoPacienteId(id) { _endPacienteIdOverride = id ? String(id) : null; }
function _endPacienteId() {
    return _endPacienteIdOverride || document.getElementById('hidden-patient-id')?.value || '';
}

// ─── MÁSCARA / BUSCA POR CEP ─────────────────────────────────────────────────

function formatCep(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    input.value = v;
}

async function buscarCep() {
    const cepEl = _endEl('cep');
    if (!cepEl) return;
    const cep = cepEl.value.replace(/\D/g, '');
    // Guard silencioso: campo parcial não é erro do usuário, só ainda não terminou.
    if (cep.length !== 8) return;

    const alvos = ENDERECO_CAMPOS.map(_endEl).filter(Boolean);
    alvos.forEach(el => el.classList.add('opacity-60'));
    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        // ViaCEP devolve 200 mesmo para CEP inexistente — o erro vem no corpo.
        if (data.erro) { showNotification('CEP não encontrado.', 'error'); return; }

        const logradouroEl = _endEl('logradouro');
        const bairroEl     = _endEl('bairro');
        const cidadeEl     = _endEl('cidade');
        const estadoEl     = _endEl('estado');
        // `|| valor atual` preserva digitação quando o CEP é de cidade inteira.
        if (logradouroEl) logradouroEl.value = (data.logradouro || logradouroEl.value || '').toUpperCase();
        if (bairroEl)     bairroEl.value     = (data.bairro || bairroEl.value || '').toUpperCase();
        if (cidadeEl)     cidadeEl.value     = (data.localidade || cidadeEl.value || '').toUpperCase();
        if (estadoEl)     estadoEl.value     = data.uf || estadoEl.value || '';
        // Retorno do CEP é dado real: deixa de valer como padrão da clínica.
        if (data.localidade && cidadeEl) delete cidadeEl.dataset.padrao;
        if (data.uf && estadoEl)         delete estadoEl.dataset.padrao;

        // Cursor pousa no próximo campo que ainda precisa de humano.
        const numeroEl = _endEl('numero');
        if (data.logradouro) { if (numeroEl) numeroEl.focus(); }
        else if (logradouroEl) logradouroEl.focus();
    } catch (err) {
        showNotification('Não foi possível consultar o CEP. Verifique sua conexão.', 'error');
    } finally {
        alvos.forEach(el => el.classList.remove('opacity-60'));
    }
}

// ─── HISTÓRICO DO PACIENTE ───────────────────────────────────────────────────
// Prioriza os endereços do próprio paciente. Quando ele nunca teve endereço
// preenchido, cai para a base de todos os pacientes — assim o primeiro
// agendamento também tem de onde escolher.

function _enderecosDoPaciente(patId) {
    if (!patId || typeof appointments === 'undefined') return [];
    return appointments
        .filter(a => String(a.patientId) === String(patId) && a.endereco &&
                     ENDERECO_CAMPOS.some(c => a.endereco[c]))
        .map(a => a.endereco);
}

// Todos os endereços já cadastrados, de qualquer paciente.
function _enderecosGlobais() {
    if (typeof appointments === 'undefined') return [];
    return appointments
        .filter(a => a.endereco && ENDERECO_CAMPOS.some(c => a.endereco[c]))
        .map(a => a.endereco);
}

// Base de sugestões: histórico do paciente quando existe, senão a base global.
// O fallback é do paciente inteiro, não campo a campo — misturar as duas fontes
// quebraria o cruzamento entre logradouro, bairro, cidade e UF.
function _baseSugestoesEndereco(patId) {
    const doPaciente = _enderecosDoPaciente(patId);
    return doPaciente.length ? doPaciente : _enderecosGlobais();
}

// Assinatura de um endereço, para contar frequência ignorando acento/caixa.
// Ponto de referência fica de fora: é texto livre e não distingue um local.
function _endChave(e) {
    return ENDERECO_CAMPOS.filter(c => c !== 'referencia').map(c => normalizeStr(e[c] || '')).join('|');
}

// Endereço usado com mais frequência pelo paciente; empate resolvido pelo mais recente.
function enderecoMaisFrequente(patId) {
    const lista = _enderecosDoPaciente(patId);
    if (!lista.length) return null;
    const grupos = new Map();
    lista.forEach((e, i) => {
        const k = _endChave(e);
        const g = grupos.get(k);
        if (g) { g.count++; g.ultimo = i; }
        else grupos.set(k, { count: 1, ultimo: i, endereco: e });
    });
    let melhor = null;
    grupos.forEach(g => {
        if (!melhor || g.count > melhor.count || (g.count === melhor.count && g.ultimo > melhor.ultimo)) melhor = g;
    });
    return melhor ? { ...melhor.endereco } : null;
}

// Preenche o formulário com o endereço mais usado do paciente, sem sobrescrever
// nada que o usuário já tenha digitado. O número nunca entra: é digitado à mão.
function autoFillEnderecoPaciente(patId, forcar) {
    const end = enderecoMaisFrequente(patId);
    if (!end) { aplicarPadraoEndereco(); return false; }
    ENDERECO_CAMPOS.filter(c => c !== 'numero').forEach(c => {
        const el = _endEl(c);
        if (!el) return;
        // Padrão da clínica cede lugar ao endereço real do paciente.
        if (forcar || !el.value.trim() || el.dataset.padrao === '1') {
            el.value = end[c] || '';
            if (end[c]) delete el.dataset.padrao;
        }
    });
    aplicarPadraoEndereco();
    return true;
}

// Todos os demais níveis da hierarquia que já estão preenchidos. O cruzamento é
// mútuo: escolher o logradouro restringe a cidade tanto quanto o contrário, para
// que só apareçam combinações que existem juntas no histórico.
// Referência não é um nível, mas é específica de um local — filtra por todos.
function _filtrosHierarquiaAcima(campo) {
    return ENDERECO_HIERARQUIA
        .filter(c => c !== campo)
        .map(c => {
            const el = _endEl(c);
            // Valor só de padrão da clínica não conta como escolha do usuário.
            if (!el || el.dataset.padrao === '1') return { campo: c, valor: '' };
            return { campo: c, valor: (el.value || '').trim() };
        })
        .filter(f => f.valor);
}

// Valores distintos do histórico para um campo, respeitando o que já foi
// escolhido nos outros níveis.
function _valoresHistorico(campo, termo) {
    const patId = _endPacienteId();
    const filtros = _filtrosHierarquiaAcima(campo);
    const termoNorm = normalizeStr(termo || '');
    const vistos = new Set();
    const out = [];
    _baseSugestoesEndereco(patId).forEach(e => {
        const val = (e[campo] || '').trim();
        if (!val) return;
        if (filtros.some(f => normalizeStr(e[f.campo] || '') !== normalizeStr(f.valor))) return;
        if (termoNorm && !normalizeStr(val).includes(termoNorm)) return;
        const k = normalizeStr(val);
        if (vistos.has(k)) return;
        vistos.add(k);
        out.push(val);
    });
    // Limite maior que o histórico de um paciente: a base global é bem mais ampla
    // e o popover já rola.
    return out.sort((a, b) => a.localeCompare(b, 'pt-BR')).slice(0, 30);
}

// Um registro do histórico que contenha determinado valor no campo — usado para
// completar os demais níveis quando o usuário escolhe um valor.
function _registroHistoricoPara(campo, valor) {
    const patId = _endPacienteId();
    const alvo = normalizeStr(valor);
    const filtros = _filtrosHierarquiaAcima(campo);
    return _baseSugestoesEndereco(patId).find(e =>
        normalizeStr(e[campo] || '') === alvo &&
        !filtros.some(f => normalizeStr(e[f.campo] || '') !== normalizeStr(f.valor))
    ) || null;
}

function _popoverEl(campo) { return document.getElementById(_endPrefixo + '-end-sug-' + campo); }

function mostrarSugestoesEndereco(campo) {
    const pop = _popoverEl(campo);
    const el  = _endEl(campo);
    if (!pop || !el) return;
    const opcoes = campo === 'estado' ? _opcoesEstado(el.value) : _valoresHistorico(campo, el.value);
    if (!opcoes.length) { pop.classList.add('hidden'); return; }
    pop.innerHTML = opcoes.map(v => {
        const label = typeof v === 'string' ? v : `${v.uf} — ${v.nome}`;
        const valor = typeof v === 'string' ? v : v.uf;
        return `<div class="px-3 py-2 hover:bg-clinic-50 hover:text-clinic-700 cursor-pointer text-sm font-bold text-navy-900 border-b border-slate-100 last:border-0 transition uppercase"
                     onmousedown="selecionarSugestaoEndereco('${campo}', '${String(valor).replace(/'/g, "\\'")}')">${label}</div>`;
    }).join('');
    pop.classList.remove('hidden');
}

function esconderSugestoesEndereco(campo) {
    setTimeout(() => _popoverEl(campo)?.classList.add('hidden'), 150);
}

// Escolher um valor completa os demais níveis do mesmo endereço que ainda estão
// vazios (ou que só têm o padrão da clínica). Vale nos dois sentidos: escolher o
// logradouro preenche bairro/cidade/UF, e escolher a cidade preenche a UF.
function selecionarSugestaoEndereco(campo, valor) {
    const el = _endEl(campo);
    if (!el) return;
    el.value = campo === 'estado' ? valor : String(valor).toUpperCase();
    delete el.dataset.padrao;
    _popoverEl(campo)?.classList.add('hidden');

    const reg = _registroHistoricoPara(campo, valor);
    if (!reg) return;

    // Só preenche o que o usuário ainda não definiu — padrão da clínica cede lugar.
    const preenchivel = alvo => alvo && (!alvo.value.trim() || alvo.dataset.padrao === '1');
    ENDERECO_HIERARQUIA.filter(c => c !== campo).forEach(c => {
        const outro = _endEl(c);
        if (preenchivel(outro) && reg[c]) { outro.value = reg[c]; delete outro.dataset.padrao; }
    });
    // CEP não é nível, mas acompanha o endereço escolhido. Número fica de fora:
    // é sempre digitado à mão, pois muda de casa para casa na mesma rua.
    const cepEl = _endEl('cep');
    if (preenchivel(cepEl) && reg.cep) { cepEl.value = reg.cep; delete cepEl.dataset.padrao; }
}

// ─── UF ──────────────────────────────────────────────────────────────────────

function _opcoesEstado(termo) {
    const t = normalizeStr(termo || '');
    if (!t) return ESTADOS_BR.slice();
    return ESTADOS_BR.filter(e => normalizeStr(e.uf).includes(t) || normalizeStr(e.nome).includes(t));
}

// Aceita sigla ou nome; grava sempre a sigla. Valor inválido é zerado no blur.
function validarEstadoEndereco() {
    const el = _endEl('estado');
    if (!el) return;
    const v = normalizeStr(el.value);
    if (!v) { el.value = ''; return; }
    const achado = ESTADOS_BR.find(e => normalizeStr(e.uf) === v || normalizeStr(e.nome) === v);
    el.value = achado ? achado.uf : '';
    if (!achado) showNotification('UF inválida. Use a sigla (ex.: RS) ou o nome do estado.', 'error');
}

function onEnderecoInputUpper(input) {
    const pos = input.selectionStart;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(pos, pos);
    // Digitou: o valor deixa de ser o padrão da clínica.
    delete input.dataset.padrao;
}

// ─── COLETA / RESET ──────────────────────────────────────────────────────────

function coletarEnderecoForm() {
    const local = getLocalAplicacao();
    // Nada escolhido e nada digitado: não há endereço a gravar.
    if (!local) return null;
    // Laboratório não é visita: o endereço digitado antes não é gravado — só o
    // local e a unidade de coleta que vai aplicar.
    if (!localAplicacaoExigeEndereco(local)) {
        return { localAplicacao: local, unidadeId: getUnidadeAplicacao() };
    }
    const end = { localAplicacao: local, unidadeId: null };
    ENDERECO_CAMPOS.forEach(c => {
        const v = (_endEl(c)?.value || '').trim();
        end[c] = c === 'cep' ? v : v.toUpperCase();
    });
    end.taxaDeslocamento = getTaxaValorForm();
    end.taxaPaga = getTaxaPagaForm();
    return end;
}

function preencherEnderecoForm(end) {
    ENDERECO_CAMPOS.forEach(c => {
        const el = _endEl(c);
        if (!el) return;
        el.value = (end && end[c]) || '';
        // Dado real do endereço não é padrão da clínica; vazio volta a ser elegível.
        delete el.dataset.padrao;
    });
    setUnidadeAplicacao(end ? end.unidadeId : null);
    // Registro antigo (anterior a este campo) com endereço de verdade era sempre
    // uma visita domiciliar. Cidade/UF sozinhas não contam: são só o padrão da
    // clínica, então o formulário ainda abre sem escolha feita.
    const temEnderecoReal = !!(end && (end.logradouro || end.numero || end.bairro || end.cep));
    // A taxa entra antes de aplicar o local: `setLocalAplicacao` dispara
    // `aplicarLocalAplicacao`, que zera a taxa se o local não for Domiciliar.
    setTaxaForm(end ? end.taxaDeslocamento : 0, end ? end.taxaPaga : false);
    setLocalAplicacao((end && end.localAplicacao) || (temEnderecoReal ? 'Domiciliar' : ''));
}

// Endereço para agendamentos criados fora do formulário (grupo de oportunidade,
// descarte). Copia o das vacinas irmãs do grupo; sem elas, o mais usado pelo
// paciente. Nunca fica sem cidade/UF.
function enderecoParaNovoAgendamento(patId, irmaos) {
    // Só conta como endereço da irmã o que tem rua/bairro/CEP de verdade —
    // cidade/UF sozinhas são o padrão da clínica, não uma escolha.
    const doGrupo = (irmaos || []).map(a => a && a.endereco)
        .find(e => e && (e.logradouro || e.numero || e.bairro || e.cep || e.localAplicacao));
    // Local segue as vacinas irmãs — é a mesma visita. Sem irmãs não há escolha
    // a herdar: fica vazio até alguém decidir no formulário.
    const local = (doGrupo && doGrupo.localAplicacao) || '';
    if (local && !localAplicacaoExigeEndereco(local)) {
        return { localAplicacao: local, unidadeId: (doGrupo && doGrupo.unidadeId) || null };
    }
    const base = doGrupo || enderecoMaisFrequente(patId);
    const end = { localAplicacao: local, unidadeId: null };
    ENDERECO_CAMPOS.forEach(c => { end[c] = (base && base[c]) || ''; });
    // A taxa é da visita, não da dose: uma vacina nova entrando na mesma visita
    // não herda a taxa das irmãs, senão o deslocamento seria cobrado duas vezes.
    end.taxaDeslocamento = 0;
    end.taxaPaga = false;
    // Número herdado das vacinas irmãs é a mesma visita, então vale. Vindo do
    // histórico é chute — some, para ser digitado à mão.
    if (!doGrupo) end.numero = '';
    if (!end.cidade) end.cidade = ENDERECO_PADRAO.cidade;
    if (!end.estado) end.estado = ENDERECO_PADRAO.estado;
    return end;
}

// Cidade/UF padrão da clínica — só entram onde não há dado, nunca por cima.
// Ficam marcados como "padrão" para não estreitarem as sugestões dos outros
// campos: o usuário não escolheu esse valor, ele só veio preenchido.
function aplicarPadraoEndereco() {
    const cidadeEl = _endEl('cidade');
    const estadoEl = _endEl('estado');
    if (cidadeEl && !cidadeEl.value.trim()) { cidadeEl.value = ENDERECO_PADRAO.cidade; cidadeEl.dataset.padrao = '1'; }
    if (estadoEl && !estadoEl.value.trim()) { estadoEl.value = ENDERECO_PADRAO.estado; estadoEl.dataset.padrao = '1'; }
}

function limparEnderecoForm() {
    preencherEnderecoForm(null);
    ENDERECO_CAMPOS.forEach(c => _popoverEl(c)?.classList.add('hidden'));
    aplicarPadraoEndereco();
    const box = document.getElementById(_endPrefixo + '-mapa-box');
    const frame = document.getElementById(_endPrefixo + '-mapa-frame');
    if (box) box.classList.add('hidden');
    if (frame) frame.src = '';
}

// ─── VALIDAÇÃO ───────────────────────────────────────────────────────────────
// Status "Agendado" exige endereço utilizável para a visita. CEP e ponto de
// referência seguem opcionais.
const ENDERECO_OBRIGATORIOS = [
    { campo: 'logradouro', label: 'Logradouro' },
    { campo: 'numero',     label: 'Número' },
    { campo: 'bairro',     label: 'Bairro' },
    { campo: 'cidade',     label: 'Cidade' },
    { campo: 'estado',     label: 'UF' }
];

// Mensagem única para os fluxos que validam um objeto de endereço (agendamento
// avulso e grupo), onde não há campos na tela para apontar. Vazio = está completo.
function enderecoIncompletoMsg(end) {
    if (!end || !end.localAplicacao) return 'Escolha o <b>Local da Aplicação</b> para agendar.';
    if (!localAplicacaoExigeEndereco(end.localAplicacao)) {
        if (localAplicacaoExigeUnidade(end.localAplicacao) && !end.unidadeId) {
            return 'Selecione a <b>Unidade de Coleta</b> onde a vacina será aplicada.';
        }
        return '';
    }
    const faltando = ENDERECO_OBRIGATORIOS.filter(f => !String(end[f.campo] || '').trim()).map(f => f.label);
    if (!faltando.length) return '';
    return `Endereço incompleto: preencha <b>${faltando.join(', ')}</b> para agendar.`;
}

function validarEnderecoObrigatorio(status) {
    if (status !== 'Agendado') return true;
    // Sem local escolhido não dá para saber se o endereço é exigido: decide primeiro.
    const local = getLocalAplicacao();
    if (!local) {
        showNotification('Escolha o <b>Local da Aplicação</b> para o status Agendado.', 'error');
        document.getElementById(_endPrefixo + '-local-btn')?.focus();
        return false;
    }
    // Laboratório dispensa endereço, mas exige a unidade de coleta que aplica.
    if (!localAplicacaoExigeEndereco(local)) {
        if (localAplicacaoExigeUnidade(local) && !getUnidadeAplicacao()) {
            showNotification('Selecione a <b>Unidade de Coleta</b> onde a vacina será aplicada.', 'error');
            _unidadeEl()?.focus();
            return false;
        }
        return true;
    }
    const faltando = ENDERECO_OBRIGATORIOS.filter(f => !(_endEl(f.campo)?.value || '').trim());
    if (!faltando.length) return true;
    showNotification(
        `Endereço incompleto: preencha <b>${faltando.map(f => f.label).join(', ')}</b> para o status Agendado.`,
        'error'
    );
    _endEl(faltando[0].campo)?.focus();
    return false;
}

// ─── MAPA (embed gratuito, sem geocoding nem API key) ─────────────────────────

// Ponto de referência fica de fora da query: é texto livre e só atrapalha o
// geocoding do Google.
function _enderecoParaMapaObj(end) {
    if (!end) return '';
    const rua = [end.logradouro, end.numero].filter(Boolean).join(', ');
    return [rua, end.bairro, end.cidade, end.estado, end.cep].filter(Boolean).join(', ');
}

function enderecoParaMapa() {
    return _enderecoParaMapaObj(coletarEnderecoForm());
}

function _mapaUrl(endereco) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(endereco)}&output=embed`;
}

function toggleMapaEndereco() {
    const box   = document.getElementById(_endPrefixo + '-mapa-box');
    const frame = document.getElementById(_endPrefixo + '-mapa-frame');
    if (!box || !frame) return;
    // Fechar zera o src: mata a request pendente e o tracking do iframe.
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); frame.src = ''; return; }
    const endereco = enderecoParaMapa();
    if (!endereco) { showNotification('Preencha o endereço para ver no mapa.', 'error'); return; }
    frame.src = _mapaUrl(endereco);
    box.classList.remove('hidden');
}

function _girarChevronMapa(aberto) {
    const chev = document.getElementById('vr-btn-mapa-chevron');
    if (chev) chev.style.transform = aberto ? 'rotate(180deg)' : '';
}

// Mesmo contrato na visualização, porém a partir do objeto salvo.
function toggleMapaEnderecoView() {
    const box   = document.getElementById('vr-mapa-box');
    const frame = document.getElementById('vr-mapa-frame');
    if (!box || !frame) return;
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); frame.src = ''; _girarChevronMapa(false); return; }
    const a = (typeof appointments !== 'undefined') ? appointments.find(x => x.id == window._vrCurrentId) : null;
    const endereco = _enderecoParaMapaObj(a && a.endereco);
    if (!endereco) { showNotification('Este agendamento não possui endereço.', 'error'); return; }
    frame.src = _mapaUrl(endereco);
    box.classList.remove('hidden');
    _girarChevronMapa(true);
}

// Nome da unidade gravada num endereço. Unidade excluída depois do agendamento
// não some do histórico: o id vira um rótulo genérico em vez de vazio.
function enderecoUnidadeNome(end) {
    if (!end || !end.unidadeId) return '';
    if (typeof unidadeNome === 'function') return unidadeNome(end.unidadeId);
    return '';
}

// Resumo textual completo (com a referência) — usado no log de auditoria.
function enderecoResumo(end) {
    if (!end) return '';
    const local = end.localAplicacao || '';
    if (local && !localAplicacaoExigeEndereco(local)) {
        const uni = enderecoUnidadeNome(end);
        return uni ? `${local} · ${uni}` : local;
    }
    const base = _enderecoParaMapaObj(end);
    const texto = end.referencia ? [base, `Ref.: ${end.referencia}`].filter(Boolean).join(' — ') : base;
    const resumo = local ? [local, texto].filter(Boolean).join(' · ') : texto;
    // A taxa faz parte do combinado da visita: aparece junto do endereço, com o
    // status de pagamento, para não precisar abrir o editor só para conferir.
    const taxa = getTaxaDeslocamento(end);
    if (taxa > 0) {
        const selo = getTaxaPaga(end) ? 'paga' : 'não paga';
        return [resumo, `Taxa R$ ${formatBRL(taxa)} (${selo})`].filter(Boolean).join(' · ');
    }
    return resumo;
}

// Partes já formatadas para o card da visualização. Cada linha só aparece se
// tiver conteúdo — endereço parcial não deixa rótulo órfão na tela.
function enderecoPartes(end) {
    if (!end) return null;
    const local = end.localAplicacao || '';
    const unidade = enderecoUnidadeNome(end);
    // Laboratório não tem endereço a exibir — local e unidade são a informação.
    if (local && !localAplicacaoExigeEndereco(local)) {
        return { linha: '', cidade: '', cep: '', referencia: '', local, unidade };
    }
    const rua    = [end.logradouro, end.numero].filter(Boolean).join(', ');
    const linha  = [rua, end.bairro].filter(Boolean).join(' · ');
    const cidade = [end.cidade, end.estado].filter(Boolean).join(' / ');
    const cep    = end.cep || '';
    const ref    = end.referencia || '';
    if (!linha && !cidade && !cep && !ref) return local ? { linha: '', cidade: '', cep: '', referencia: '', local, unidade: '' } : null;
    return { linha, cidade, cep, referencia: ref, local, unidade: '' };
}
