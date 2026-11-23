// Registro de agendas — toda regra específica de cada agenda vive aqui.
// Para criar uma nova agenda, basta acrescentar uma entrada em AGENDAS.
//
// `janela` aceita uma LISTA de faixas [inicioMin, fimMin] por dia da semana,
// permitindo turnos separados (ex.: manhã e tarde).

const AGENDAS = {
    respiratorio: {
        id: 'respiratorio',
        nome: 'Teste Respiratório',
        curto: 'Respiratório',
        subtitulo: 'TRESP · TSBAC',
        descricao: 'Teste respiratório de hidrogênio e supercrescimento bacteriano',
        icon: 'fa-lungs',
        cor: 'blue',

        // Persistência
        fbPath: 'agendas/respiratorio',
        legacyPath: 'appointments',      // nó antigo, migrado uma única vez
        lsKey: 'respiroLamicData',

        // Janela operacional (minutos desde 00:00)
        dias: [1, 2, 3, 4, 5, 6],        // 0 = domingo
        janela: { 6: [[450, 480]], default: [[450, 540]] },
        slotMin: null,                   // horário livre dentro da janela
        slotUnico: false,                // não bloqueia slot ocupado
        limiteDia: 3,

        // Reserva etária: o começo da janela fica guardado para as crianças.
        // A partir de `desdeMin` (08:30) todas as idades podem marcar. No sábado
        // a janela fecha 08:00, então lá a liberação acompanha o último horário.
        idadeMinima: { idade: 14, desdeMin: { 6: 480, default: 510 } },
        semana: { startHour: 7, endHour: 14 },

        // Duração
        duracao: { tipo: 'porExame', porExame: { TRESP: 180, TSBAC: 120 } },

        // Campos do formulário
        campos: { exame: true, substrato: true, metano: true, idade: true, pedido: true, abstinencia: false, endereco: false, pontoReferencia: false, coletador: false, multiPaciente: false },
        faixaEtaria: ['infantil'],       // realces etários usados por esta agenda
        substratos: { TRESP: ['Lactose', 'Frutose', 'Sorbitol', 'Sacarose', 'D-Xilose', 'Frutano'], TSBAC: ['Lactulose', 'Glicose'] },

        // Operação
        checklist: ['orientacao', 'anexo'],
        regra48h: true,

        // Indicadores
        kpis: ['total', 'tresp', 'tsbac', 'concluidos', 'ausentes', 'cancelados', 'mediaDia'],
        charts: ['volume', 'horario', 'semana', 'status', 'exame', 'substrato', 'motivoPerda'],
        legenda: ['tresp', 'tsbac', 'cancelado', 'concluido', 'atrasado', 'infantil', 'andamento', 'selo-checklist']
    },

    espermograma: {
        id: 'espermograma',
        nome: 'Espermograma',
        curto: 'Espermograma',
        subtitulo: 'Coleta seminal',
        descricao: 'Agendamento de coleta para análise seminal',
        icon: 'fa-microscope',
        cor: 'teal',

        fbPath: 'agendas/espermograma',
        legacyPath: null,
        lsKey: 'espermogramaLamicData',

        dias: [1, 2, 3, 4, 5, 6],
        // Seg–sex: 08:00–11:00 e 13:00–15:00 · Sábado: 08:00–10:00
        janela: { 6: [[480, 600]], default: [[480, 660], [780, 900]] },
        slotMin: 60,                        // 1 h entre um paciente e outro
        slotUnico: true,                    // um paciente por slot
        limiteDia: 'slots',                 // 3 manhã + 2 tarde seg–sex, 2 sáb
        limiteDiaExcedivel: { 6: 1 },       // sábado: 1 agenda além do limite, com aprovação do setor responsável
        semana: { startHour: 8, endHour: 15 },

        duracao: { tipo: 'fixa', fixaMin: 60 },

        campos: { exame: false, substrato: false, metano: false, idade: true, pedido: true, abstinencia: true, endereco: false, pontoReferencia: false, coletador: false, multiPaciente: false },
        faixaEtaria: [],                    // não se aplica
        substratos: {},

        checklist: ['orientacao'],
        regra48h: false,

        kpis: ['total', 'concluidos', 'ausentes', 'cancelados', 'mediaDia'],
        charts: ['volume', 'horario', 'semana', 'status', 'motivoPerda'],
        legenda: ['agendado', 'cancelado', 'concluido', 'atrasado', 'andamento', 'selo-checklist']
    },

    coletaDomiciliar: {
        id: 'coletaDomiciliar',
        nome: 'Coleta Domiciliar',
        cidadeTag: 'CRAJUBAR',
        curto: 'Domiciliar',
        subtitulo: 'Atendimento em casa',
        descricao: 'Agendamento de coleta realizada no endereço do paciente',
        icon: 'fa-house-medical',
        cor: 'amber',

        fbPath: 'agendas/coleta-domiciliar',
        legacyPath: null,
        lsKey: 'coletaDomiciliarLamicData',

        dias: [0, 1, 2, 3, 4, 5, 6],
        // Seg–sex: 06:00–12:00 e 13:00–17:00 · Sáb–dom: 06:00–11:00
        janela: { 0: [[360, 660]], 6: [[360, 660]], default: [[360, 720], [780, 1020]] },
        slotMin: 60,                        // 60 min entre um paciente e outro
        slotUnico: true,
        limiteSlot: 3,                      // até 3 agendas por horário, mesmo que repitam endereço
        limiteSlotExcedivel: 1,             // 4º endereço permitido mediante confirmação com a equipe de coleta
        agrupaPorEndereco: false,           // cada agendamento consome uma vaga, mesmo endereço não faz carona
        limiteDia: 'slots',                 // 9 seg–sex, 5 no sáb/dom
        semana: { startHour: 6, endHour: 17 },

        duracao: { tipo: 'fixa', fixaMin: 60 },

        campos: { exame: false, substrato: false, metano: false, idade: true, pedido: true, abstinencia: false, endereco: true, pontoReferencia: true, coletador: true, multiPaciente: true },
        faixaEtaria: ['rn', 'infantil', 'adolescente', 'adulto'],
        substratos: {},

        checklist: ['orientacao', 'anexo'],
        regra48h: false,

        kpis: ['total', 'concluidos', 'ausentes', 'cancelados', 'mediaDia', 'receita', 'receitaPedido', 'receitaTaxa'],
        charts: ['volume', 'horario', 'semana', 'status', 'convenio', 'coletador', 'motivoPerda'],
        legenda: ['cancelado', 'concluido', 'atrasado', 'andamento', 'rn', 'infantil', 'adolescente', 'menores', 'selo-checklist', 'selo-distante', 'selo-coleta']
    },

    coletaDomiciliarMilagres: {
        id: 'coletaDomiciliarMilagres',
        nome: 'Coleta Domiciliar',
        cidadeTag: 'MILAGRES',
        curto: 'Domiciliar Milagres',
        subtitulo: 'Atendimento em casa',
        descricao: 'Agendamento de coleta realizada no endereço do paciente',
        icon: 'fa-house-medical',
        cor: 'ice',

        fbPath: 'agendas/coleta-domiciliar-milagres',
        legacyPath: null,
        lsKey: 'coletaDomiciliarMilagresLamicData',

        dias: [1, 2, 3, 4, 5, 6],
        // Seg–sex: 07:00–11:00 e 13:00–17:00 · Sábado: só a manhã
        janela: { 6: [[420, 660]], default: [[420, 660], [780, 1020]] },
        slotMin: 60,                        // 60 min entre um paciente e outro
        slotUnico: true,
        limiteSlot: 3,                      // até 3 agendas por horário, mesmo que repitam endereço
        limiteSlotExcedivel: 1,             // 4º endereço permitido mediante confirmação com a equipe de coleta
        agrupaPorEndereco: false,           // cada agendamento consome uma vaga, mesmo endereço não faz carona
        limiteDia: 'slots',                 // 8 seg–sex, 4 no sábado
        semana: { startHour: 7, endHour: 17 },

        duracao: { tipo: 'fixa', fixaMin: 60 },

        campos: { exame: false, substrato: false, metano: false, idade: true, pedido: true, abstinencia: false, endereco: true, pontoReferencia: true, coletador: true, multiPaciente: true },
        faixaEtaria: ['rn', 'infantil', 'adolescente', 'adulto'],
        substratos: {},

        checklist: ['orientacao', 'anexo'],
        regra48h: false,

        kpis: ['total', 'concluidos', 'ausentes', 'cancelados', 'mediaDia', 'receita', 'receitaPedido', 'receitaTaxa'],
        charts: ['volume', 'horario', 'semana', 'status', 'convenio', 'coletador', 'motivoPerda'],
        legenda: ['cancelado', 'concluido', 'atrasado', 'andamento', 'rn', 'infantil', 'adolescente', 'menores', 'selo-checklist', 'selo-distante', 'selo-coleta']
    }
};

const AGENDA_IDS = Object.keys(AGENDAS);
const AGENDA_PADRAO = 'respiratorio';

// Paleta por agenda (classes Tailwind resolvidas estaticamente para não caírem no purge)
const AGENDA_CORES = {
    blue: {
        bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700',
        accent: 'bg-blue-600', dot: 'bg-blue-500', chart: '#3b82f6',
        grad: 'from-blue-500 to-blue-700', ring: 'hover:border-blue-300'
    },
    teal: {
        bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700',
        accent: 'bg-teal-600', dot: 'bg-teal-500', chart: '#14b8a6',
        grad: 'from-teal-500 to-teal-700', ring: 'hover:border-teal-300'
    },
    amber: {
        bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700',
        accent: 'bg-amber-600', dot: 'bg-amber-500', chart: '#f59e0b',
        grad: 'from-amber-500 to-amber-700', ring: 'hover:border-amber-300'
    },
    ice: {
        bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700',
        accent: 'bg-sky-500', dot: 'bg-sky-400', chart: '#38bdf8',
        grad: 'from-sky-300 to-sky-500', ring: 'hover:border-sky-300'
    }
};

// Itens de checklist disponíveis no sistema
const CHECKLIST_ITENS = {
    orientacao: { chave: 'chkOrientacao', input: 'chk-orientacao-val', botao: 'btn-chk-orientacao', rotulo: 'Orientação', aviso: 'Enviar orientação ao paciente' },
    anexo:      { chave: 'chkAnexo',      input: 'chk-anexo-val',      botao: 'btn-chk-anexo',      rotulo: 'Anexo Unilab', aviso: 'Anexar guia no sistema UniLab' },
    endereco:   { chave: 'chkEndereco',   input: 'chk-endereco-val',   botao: 'btn-chk-endereco',   rotulo: 'Endereço', aviso: 'Confirmar endereço e contato com o paciente' }
};

// ── ACESSO ──────────────────────────────────────────────────
function getAgenda(id) {
    return AGENDAS[id] || AGENDAS[AGENDA_PADRAO];
}

function currentAgenda() {
    return getAgenda(currentAgendaId);
}

function agendaCores(agenda) {
    return AGENDA_CORES[(agenda || currentAgenda()).cor] || AGENDA_CORES.blue;
}

function temCampo(nome, agenda) {
    return !!(agenda || currentAgenda()).campos[nome];
}

function temChecklist(nome, agenda) {
    return (agenda || currentAgenda()).checklist.includes(nome);
}

// ── FAIXA ETÁRIA ────────────────────────────────────────────
// Retorna 'rn', 'infantil', 'adolescente' ou 'adulto', respeitando os realces
// que a agenda usa. 'adulto' só vira realce próprio nas agendas que o declaram.
function faixaEtariaDe(app, agenda) {
    const ag = agenda || currentAgenda();
    const titular = _faixaDaIdade(app.idade, ag);
    if (!ag.campos.multiPaciente) return titular;

    // Visita com vários pacientes: RN e infantil prevalecem sobre a faixa do
    // titular, nessa ordem, venham de quem vier. Acompanhante cancelado ou sem
    // idade informada não conta.
    const faixas = [titular, ...(app.acompanhantes || [])
        .filter(a => a.idade != null && a.idade !== '' && a.status !== 'Cancelado')
        .map(a => _faixaDaIdade(a.idade, ag))];
    return ['rn', 'infantil'].find(f => faixas.includes(f)) || titular;
}

function _faixaDaIdade(valor, ag) {
    const idade = Number(valor);
    if (isNaN(idade)) return 'adulto';
    if (idade < 1 && ag.faixaEtaria.includes('rn')) return 'rn';
    if (idade < 12 && ag.faixaEtaria.includes('infantil')) return 'infantil';
    if (idade < 18 && ag.faixaEtaria.includes('adolescente')) return 'adolescente';
    return 'adulto';
}

// Realce dos endereços marcados como distantes (logística de deslocamento).
// Usa violeta em vez do roxo `purple`, já reservado ao status "Em andamento".
const DISTANTE_TEMA = {
    bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-700',
    badge: 'bg-violet-600', icon: 'fa-road-circle-exclamation', rotulo: 'DISTANTE'
};

const FAIXA_ETARIA_TEMA = {
    rn:          { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-fuchsia-500', rotulo: 'RN' },
    infantil:    { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  badge: 'bg-orange-500',  rotulo: 'INFANTIL' },
    adolescente: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-500',   rotulo: 'ADOLESCENTE' },
    adulto:      { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    badge: 'bg-blue-500',    rotulo: 'ADULTO' }
};

// Tema de realce da faixa — só existe se a agenda declarar aquela faixa,
// senão o agendamento cai na cor padrão da agenda.
function temaFaixaEtaria(app, agenda) {
    const ag = agenda || currentAgenda();
    const faixa = faixaEtariaDe(app, ag);
    return ag.faixaEtaria.includes(faixa) ? FAIXA_ETARIA_TEMA[faixa] : null;
}

// ── JANELA HORÁRIA ──────────────────────────────────────────
// Retorna a LISTA de faixas [inicioMin, fimMin] de horários de INÍCIO
// permitidos no dia, ou [] se a agenda não atende nesse dia.
function janelaAgenda(dayOfWeek, agenda) {
    const ag = agenda || currentAgenda();
    if (!ag.dias.includes(dayOfWeek)) return [];
    const faixas = ag.janela[dayOfWeek] || ag.janela.default;
    if (!faixas || !faixas.length) return [];

    // Com slot fixo, o último início de cada faixa recua pela duração do exame
    if (ag.slotMin && ag.duracao.tipo === 'fixa') {
        return faixas
            .map(([ini, fim]) => [ini, fim - ag.duracao.fixaMin])
            .filter(([ini, fim]) => fim >= ini);
    }
    return faixas.map(f => [f[0], f[1]]);
}

// Primeiro minuto liberado para a idade da reserva etária neste dia.
// `desdeMin` aceita um número (vale todo dia) ou um mapa por dia da semana,
// no mesmo formato de `janela` — { 6: 480, default: 510 }.
function reservaDesdeMin(dayOfWeek, agenda) {
    const reserva = (agenda || currentAgenda()).idadeMinima;
    if (!reserva) return null;
    const d = reserva.desdeMin;
    if (typeof d === 'number') return d;
    const valor = d[dayOfWeek];
    return valor != null ? valor : d.default;
}

// Faixas brutas configuradas (sem recuo da duração) — usadas em rótulos
function faixasBrutas(dayOfWeek, agenda) {
    const ag = agenda || currentAgenda();
    if (dayOfWeek != null && !ag.dias.includes(dayOfWeek)) return [];
    return (dayOfWeek != null ? (ag.janela[dayOfWeek] || ag.janela.default) : ag.janela.default) || [];
}

// O minuto está dentro de alguma das faixas?
function dentroDaJanela(minuto, faixas) {
    return faixas.some(([ini, fim]) => minuto >= ini && minuto <= fim);
}

// A faixa que contém o minuto (usada para alinhar a grade de slots)
function faixaDoMinuto(minuto, faixas) {
    return faixas.find(([ini, fim]) => minuto >= ini && minuto <= fim) || null;
}

// Lista de horários de início válidos (minutos), percorrendo todas as faixas
function slotsAgenda(dayOfWeek, agenda) {
    const ag = agenda || currentAgenda();
    const faixas = janelaAgenda(dayOfWeek, ag);
    if (!faixas.length) return [];
    const passo = ag.slotMin || 30;
    const slots = [];
    faixas.forEach(([ini, fim]) => {
        for (let m = ini; m <= fim; m += passo) slots.push(m);
    });
    return slots;
}

// ── ENDEREÇO E LOTAÇÃO DO HORÁRIO ───────────────────────────
// Chave de comparação de endereço: logradouro + nº + bairro + cidade.
// O complemento fica de fora de propósito — apartamentos e blocos diferentes
// do mesmo prédio contam como UM endereço, que é o caso real da coleta domiciliar.
function chaveEndereco(app) {
    const partes = [app.logradouro, app.numero, app.bairro, app.cidade].map(v => normalizeStr(v));
    return partes.every(p => !p) ? '' : partes.join('|');
}

function mesmoEndereco(a, b) {
    const ka = chaveEndereco(a);
    return !!ka && ka === chaveEndereco(b);
}

// Quantas vagas o horário já consome: agendamentos do mesmo endereço contam
// como um só. Sem `agrupaPorEndereco`, cada agendamento vale uma vaga.
function vagasOcupadasNoSlot(lista, agenda) {
    const ag = agenda || currentAgenda();
    if (!ag.agrupaPorEndereco) return lista.length;
    const chaves = new Set();
    let semEndereco = 0;
    lista.forEach(a => {
        const k = chaveEndereco(a);
        if (k) chaves.add(k); else semEndereco++;
    });
    return chaves.size + semEndereco;
}

// Vagas consumidas no DIA — soma a lotação de cada horário. O agrupamento por
// endereço vale dentro do mesmo horário: o mesmo endereço em turnos diferentes
// são duas visitas e ocupam duas vagas.
function vagasOcupadasNoDia(lista, agenda) {
    const ag = agenda || currentAgenda();
    if (!ag.agrupaPorEndereco) return lista.length;
    const porHora = new Map();
    lista.forEach(a => {
        if (!porHora.has(a.horaInicio)) porHora.set(a.horaInicio, []);
        porHora.get(a.horaInicio).push(a);
    });
    let total = 0;
    porHora.forEach(doSlot => { total += vagasOcupadasNoSlot(doSlot, ag); });
    return total;
}

// Um horário aceita mais um agendamento? Retorna true se ainda há vaga OU se o
// candidato repete um endereço já marcado naquele horário (carona, sem vaga extra).
function slotAceita(candidato, lista, agenda) {
    const ag = agenda || currentAgenda();
    const limite = limiteDoSlot(ag);
    if (limite == null) return true;
    if (ag.agrupaPorEndereco && candidato && lista.some(a => mesmoEndereco(a, candidato))) return true;
    return vagasOcupadasNoSlot(lista, ag) < limite;
}

// O horário já estourou o limite, mas ainda cabe na margem excepcional?
// Nas domiciliares o 4º endereço é aceito mediante confirmação com a equipe
// de coleta — daí o excedente ser sinalizado, não barrado.
function slotAceitaComExcecao(candidato, lista, agenda) {
    const ag = agenda || currentAgenda();
    const margem = ag.limiteSlotExcedivel || 0;
    if (!margem) return false;
    const limite = limiteDoSlot(ag);
    if (limite == null) return false;
    if (ag.agrupaPorEndereco && candidato && lista.some(a => mesmoEndereco(a, candidato))) return true;
    return vagasOcupadasNoSlot(lista, ag) < limite + margem;
}

// Margem excepcional do DIA (`limiteDiaExcedivel` por dia da semana). Ex.: no
// sábado do espermograma cabe uma agenda além da grade, mediante aprovação do
// setor responsável — o encaixe pode dobrar um horário já ocupado.
function margemDiaExcedivel(dayOfWeek, agenda) {
    const ag = agenda || currentAgenda();
    const m = ag.limiteDiaExcedivel;
    if (!m) return 0;
    return m[dayOfWeek] ?? m.default ?? 0;
}

// O dia (e o horário) ainda comportam o encaixe excepcional do dia?
// `doDia` = agendamentos ativos do dia; `noSlot` = os do horário pretendido.
function diaAceitaExcedente(dataStr, doDia, noSlot, agenda) {
    const ag = agenda || currentAgenda();
    const dow = new Date(dataStr + 'T00:00:00').getDay();
    const margem = margemDiaExcedivel(dow, ag);
    if (!margem) return false;
    if (vagasOcupadasNoDia(doDia, ag) >= limiteDoDia(dow, ag) + margem) return false;
    const limiteSlot = limiteDoSlot(ag);
    return limiteSlot == null || vagasOcupadasNoSlot(noSlot || [], ag) < limiteSlot + margem;
}

// Vagas por horário — `limiteSlot` quando definido, 1 nas agendas de slot único,
// e sem teto por horário nas agendas de horário livre.
function limiteDoSlot(agenda) {
    const ag = agenda || currentAgenda();
    if (ag.limiteSlot) return ag.limiteSlot;
    return ag.slotUnico ? 1 : null;
}

// Limite de vagas ativas no dia — número fixo ou derivado da grade.
// Com `limiteSlot`, cada horário da grade comporta mais de um endereço.
function limiteDoDia(dayOfWeek, agenda) {
    const ag = agenda || currentAgenda();
    if (ag.limiteDia === 'slots') return slotsAgenda(dayOfWeek, ag).length * (limiteDoSlot(ag) || 1);
    return ag.limiteDia;
}

// Duração em minutos de um agendamento desta agenda
function duracaoAgenda(exame, agenda) {
    const ag = agenda || currentAgenda();
    if (ag.duracao.tipo === 'fixa') return ag.duracao.fixaMin;
    return ag.duracao.porExame[exame] || 0;
}

// Rótulo legível da duração ("3 Horas" / "30 Minutos")
function duracaoLabel(minutos) {
    if (!minutos) return '';
    if (minutos % 60 === 0) {
        const h = minutos / 60;
        return `${h} ${h === 1 ? 'Hora' : 'Horas'}`;
    }
    return `${minutos} Minutos`;
}
