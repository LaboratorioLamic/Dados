// Cálculo de status de prazo por curso (tema). Função pura, compartilhada
// entre o portal (js/main.js) e o painel admin (js/admin.js).
//
// deadline = { mode: 'livre' | 'prazo', startAt, endAt, closeAt } (timestamps ms)
// gravado em data.trainingData[subjectId].themes[themeId].deadline.
(function () {
    const U = window.UniAdmin;

    // Status possíveis:
    // 'livre'       — curso sem prazo definido, sempre disponível.
    // 'not_started' — prazo ainda não começou (antes de startAt).
    // 'on_time'     — dentro do prazo (entre startAt e endAt).
    // 'late'        — passou do prazo final mas ainda não encerrou (entre endAt e closeAt).
    // 'closed'      — passou da data de encerramento; avaliação bloqueada.
    function computeDeadlineStatus(deadline, now = Date.now()) {
        if (!deadline || deadline.mode !== 'prazo') return 'livre';
        if (deadline.startAt && now < deadline.startAt) return 'not_started';
        if (!deadline.endAt || now <= deadline.endAt) return 'on_time';
        if (!deadline.closeAt || now <= deadline.closeAt) return 'late';
        return 'closed';
    }

    // Só a avaliação é bloqueada quando o prazo se encerra; conteúdo continua
    // visível (decisão do produto — ver plano, seção F).
    function isAssessmentBlocked(deadline, now = Date.now()) {
        return computeDeadlineStatus(deadline, now) === 'closed';
    }

    const STATUS_LABELS = {
        livre: 'Sem prazo',
        not_started: 'Ainda não iniciado',
        on_time: 'No prazo',
        late: 'Em atraso',
        closed: 'Encerrado',
        forgiven: 'Atraso desconsiderado'
    };

    function formatDeadlineDate(timestamp) {
        if (!timestamp) return '—';
        return new Date(timestamp).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    U.Deadlines = { computeDeadlineStatus, isAssessmentBlocked, STATUS_LABELS, formatDeadlineDate };
})();
