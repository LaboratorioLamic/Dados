// ── RESPONSÁVEL DO PACIENTE ─────────────────────────────────
// Campo opcional em geral; obrigatório automaticamente quando o paciente
// titular é menor de 18 anos (idade em `reg-idade`).

function _menorDeIdade() {
    const idade = parseInt(document.getElementById('reg-idade').value);
    return !isNaN(idade) && idade < 18;
}

// Abre/fecha manualmente a caixa do responsável (botão "Incluir Responsável").
// Não permite fechar quando o paciente é menor — nesse caso o campo é obrigatório.
function toggleResponsavel() {
    const box = document.getElementById('box-responsavel');
    if (!box.classList.contains('hidden') && _menorDeIdade()) return;
    box.classList.toggle('hidden');
}

// Chamada a cada alteração da Idade — liga o modo obrigatório para menores de 18.
function atualizarResponsavelPorIdade() {
    const box = document.getElementById('box-responsavel');
    const nome = document.getElementById('reg-responsavel-nome');
    const parentesco = document.getElementById('reg-responsavel-parentesco');
    const lblNome = document.getElementById('lbl-responsavel-nome');
    const lblParentesco = document.getElementById('lbl-responsavel-parentesco');
    const ajuda = document.getElementById('ajuda-responsavel-menor');
    const btn = document.getElementById('btn-toggle-responsavel');

    if (_menorDeIdade()) {
        box.classList.remove('hidden');
        nome.required = true;
        parentesco.required = true;
        lblNome.innerText = 'Nome do Responsável *';
        lblParentesco.innerText = 'Grau de Parentesco *';
        ajuda.classList.remove('hidden');
        btn.classList.add('hidden');
    } else {
        nome.required = false;
        parentesco.required = false;
        lblNome.innerText = 'Nome do Responsável';
        lblParentesco.innerText = 'Grau de Parentesco';
        ajuda.classList.add('hidden');
        btn.classList.remove('hidden');
    }
}

function limparResponsavel() {
    document.getElementById('box-responsavel').classList.add('hidden');
    document.getElementById('reg-responsavel-nome').value = '';
    document.getElementById('reg-responsavel-parentesco').value = '';
    atualizarResponsavelPorIdade();
}

function carregarResponsavel(app) {
    document.getElementById('reg-responsavel-nome').value = app.responsavelNome || '';
    document.getElementById('reg-responsavel-parentesco').value = app.responsavelParentesco || '';
    const box = document.getElementById('box-responsavel');
    if (app.responsavelNome || app.responsavelParentesco) box.classList.remove('hidden');
    else box.classList.add('hidden');
    atualizarResponsavelPorIdade();
}

// Pacientes adicionais atendidos na MESMA visita domiciliar.
// São pessoas do mesmo endereço, atendidas no mesmo horário: o agendamento
// continua sendo um só e não consome vaga extra na agenda.

let _acompanhanteSeq = 0;

// Status possíveis de cada paciente da visita — os mesmos do agendamento,
// menos "Em andamento", que só faz sentido para a visita como um todo.
const PACIENTE_STATUS = ['Agendado', 'Concluído', 'Cancelado', 'Ausente'];

// ── ESTADOS ENCERRADOS ──────────────────────────────────────
// Um paciente "encerrado" não será mais atendido nesta visita — não entra em
// conclusão, não aparece como pendente e não deixa a visita em aberto.
// "Ausente" (faltou / não compareceu) encerra tanto quanto "Cancelado".
//
// A diferença entre os dois está na LOTAÇÃO, não aqui: o cancelamento devolve a
// vaga à agenda, enquanto a ausência a mantém consumida — o horário foi perdido
// pela falta e não é reaproveitado. Por isso `vagaLiberada` só vale p/ cancelado.
const STATUS_ENCERRADOS = ['Concluído', 'Cancelado', 'Ausente'];

function pacienteEncerrado(status) {
    return STATUS_ENCERRADOS.includes(status);
}

// O status devolve a vaga para a agenda? Só o cancelamento devolve.
function vagaLiberada(status) {
    return status === 'Cancelado';
}

// Linha de formulário de um acompanhante
function _acompanhanteHtml(id, dados) {
    const d = dados || {};
    const statusAtual = statusPaciente(d);
    const opcoes = PACIENTE_STATUS.map(s =>
        `<option value="${s}"${s === statusAtual ? ' selected' : ''}>${s}</option>`).join('');
    return `
    <div class="acompanhante-linha grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 bg-slate-50 border border-slate-200 rounded-xl" data-acomp-id="${id}">
        <div class="md:col-span-4">
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2">Nome do Paciente *</label>
            <input type="text" data-acomp="nome" value="${_acompEscape(d.nome)}"
                oninput="this.value = this.value.toUpperCase()"
                class="w-full border border-slate-200 bg-white rounded-xl py-2.5 px-3 shadow-sm uppercase">
        </div>
        <div class="md:col-span-2">
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2">Idade *</label>
            <input type="number" data-acomp="idade" min="0" value="${d.idade ?? ''}"
                class="w-full border border-slate-200 bg-white rounded-xl py-2.5 px-3 shadow-sm">
        </div>
        <div class="md:col-span-2">
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2">Nº do Pedido</label>
            <input type="text" data-acomp="pedido" value="${_acompEscape(d.pedido)}"
                class="w-full border border-slate-200 bg-white rounded-xl py-2.5 px-3 shadow-sm">
        </div>
        <div class="md:col-span-3">
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2">Status</label>
            <select data-acomp="status" class="w-full border border-slate-200 bg-white rounded-xl py-2.5 px-3 shadow-sm font-bold text-navy-900">${opcoes}</select>
        </div>
        <div class="md:col-span-1 flex justify-end">
            <button type="button" onclick="removerAcompanhante('${id}')" title="Remover paciente"
                class="h-[42px] w-full md:w-[42px] rounded-xl border border-red-200 bg-white text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm flex items-center justify-center">
                <i class="fas fa-trash text-sm"></i>
            </button>
        </div>
    </div>`;
}

function _acompEscape(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function adicionarAcompanhante(dados) {
    const lista = document.getElementById('acompanhantes-lista');
    if (!lista) return;
    const id = `ac${++_acompanhanteSeq}`;
    lista.insertAdjacentHTML('beforeend', _acompanhanteHtml(id, dados));
    _atualizarAjudaAcompanhantes();
    if (!dados) lista.querySelector(`[data-acomp-id="${id}"] [data-acomp="nome"]`)?.focus();
}

function removerAcompanhante(id) {
    document.querySelector(`[data-acomp-id="${id}"]`)?.remove();
    _atualizarAjudaAcompanhantes();
}

function limparAcompanhantes() {
    const lista = document.getElementById('acompanhantes-lista');
    if (lista) lista.innerHTML = '';
    _atualizarAjudaAcompanhantes();
}

function _atualizarAjudaAcompanhantes() {
    const ajuda = document.getElementById('acompanhantes-ajuda');
    if (ajuda) ajuda.classList.toggle('hidden', !document.querySelectorAll('.acompanhante-linha').length);
}

// Preenche as linhas a partir de um registro salvo
function carregarAcompanhantes(app) {
    limparAcompanhantes();
    (app.acompanhantes || []).forEach(a => adicionarAcompanhante(a));
}

// Lê as linhas do formulário, descartando as que ficaram sem nome
function lerAcompanhantes() {
    return [...document.querySelectorAll('.acompanhante-linha')].map(linha => {
        const val = campo => linha.querySelector(`[data-acomp="${campo}"]`).value.trim();
        const idade = val('idade');
        const status = linha.querySelector('[data-acomp="status"]')?.value;
        return {
            nome: val('nome').toUpperCase(),
            idade: idade === '' ? null : parseInt(idade),
            pedido: val('pedido'),
            status: PACIENTE_STATUS.includes(status) ? status : 'Agendado'
        };
    }).filter(a => a.nome);
}

// ── LEITURA (usada pelos cards, tabela e ficha) ─────────────
// Total de pessoas atendidas na visita, incluindo o paciente titular
function totalPacientes(app) {
    return 1 + ((app.acompanhantes || []).length);
}

// Rótulo "+n" exibido ao lado do nome do titular
function extraPacientesLabel(app) {
    const extras = (app.acompanhantes || []).length;
    return extras ? `+${extras}` : '';
}

// Nomes de todos os pacientes da visita, na ordem
function nomesPacientes(app) {
    return [app.paciente, ...(app.acompanhantes || []).map(a => a.nome)].filter(Boolean);
}

// Rótulo "n/m" de progresso da visita — vazio quando não há acompanhantes
function progressoPacientesLabel(app) {
    if (!(app.acompanhantes || []).length) return '';
    const r = resumoPacientes(app);
    return `${r.concluidos}/${r.total}`;
}

// ── STATUS POR PACIENTE ─────────────────────────────────────
// Registros antigos não têm `status` no acompanhante: assumem 'Agendado'.
function statusPaciente(acomp) {
    const s = acomp && acomp.status;
    return PACIENTE_STATUS.includes(s) ? s : 'Agendado';
}

// Lista unificada da visita: titular na posição 0, depois os acompanhantes.
// `indice` -1 identifica o titular nas telas de conclusão.
function pacientesDaVisita(app) {
    return [
        { indice: -1, nome: app.paciente, idade: app.idade, pedido: app.pedido, status: app.status || 'Agendado', titular: true },
        ...(app.acompanhantes || []).map((a, i) => ({
            indice: i, nome: a.nome, idade: a.idade, pedido: a.pedido, status: statusPaciente(a), titular: false
        }))
    ];
}

// Quantos pacientes da visita já foram encerrados (concluídos, cancelados
// ou ausentes) e quantos ainda estão pendentes de atendimento.
function resumoPacientes(app) {
    const lista = pacientesDaVisita(app);
    return {
        total: lista.length,
        concluidos: lista.filter(p => p.status === 'Concluído').length,
        cancelados: lista.filter(p => p.status === 'Cancelado').length,
        ausentes: lista.filter(p => p.status === 'Ausente').length,
        pendentes: lista.filter(p => !pacienteEncerrado(p.status)).length
    };
}

// Status do agendamento derivado dos pacientes: só fecha quando todos
// encerraram; com parte encerrada a visita fica "Em andamento".
//
// Fechando a visita, a precedência entre os estados encerrados é:
// Concluído > Ausente > Cancelado. Quem foi atendido domina (a visita
// aconteceu); sem ninguém atendido, a falta domina o cancelamento, porque
// houve deslocamento perdido — informação que o cancelamento apagaria.
function statusDerivadoDaVisita(app) {
    const r = resumoPacientes(app);
    if (r.pendentes === 0) {
        if (r.concluidos) return 'Concluído';
        if (r.ausentes) return 'Ausente';
        return 'Cancelado';
    }
    if (r.concluidos || r.cancelados || r.ausentes) return 'Em andamento';
    return app.status || 'Agendado';
}
