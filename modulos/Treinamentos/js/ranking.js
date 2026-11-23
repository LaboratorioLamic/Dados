// Ranking competitivo entre colaboradores (portal do aluno).
//
// Mesma fonte de dados da aba "Histórico" das Configurações (U.getHistoryRows),
// para que o ranking nunca divirja do que o administrador vê ali. Nada é
// gravado no Firebase — esta tela é somente leitura.
//
// Vale só para Treinamentos e Educação Continuada: Estágios não tem conta
// vinculada (results/estagiosLivre é texto livre) nem público por função, então
// não há denominador possível para "% de cursos concluídos da função".
var UniAdmin = window.UniAdmin || {};

(function () {
    const U = UniAdmin;

    // Categorias fora do ranking (ver cabeçalho).
    const DISABLED_SLUGS = ['estagios'];

    // Comparação de ponto flutuante: duas médias que diferem na 12ª casa são o
    // mesmo valor para efeito de desempate, não um critério decidido.
    const EPS = 1e-6;

    // Faixas de troféu por % de conclusão — meta intermediária para quem está
    // longe do pódio.
    const TIERS = [
        { min: 90, cls: 'tier-gold', label: 'Ouro' },
        { min: 75, cls: 'tier-silver', label: 'Prata' },
        { min: 50, cls: 'tier-bronze', label: 'Bronze' }
    ];

    const CATEGORY_LABELS = {
        treinamentos: 'Treinamentos',
        educacao_continuada: 'Educação Continuada',
        estagios: 'Estágios'
    };

    // Posição da última visita, por categoria — alimenta o "▲ subiu 3 posições".
    const LAST_POS_KEY = slug => `uniadmin.ranking.lastPos.${slug}`;

    /* ─── Helpers ─── */

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function norm(value) {
        return U.normalizeName ? U.normalizeName(value) : String(value || '').trim().toLowerCase();
    }

    // Mesmas duas funções de js/main.js (courseInitials/initialsHue): iniciais
    // e matiz estável derivada do nome, para o avatar sem foto.
    function initials(name) {
        const clean = (name || '').trim();
        if (!clean) return '?';
        const words = clean.split(/\s+/).filter(w => /[a-zA-ZÀ-ÿ0-9]/.test(w));
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
        return clean.slice(0, 2).toUpperCase();
    }

    function initialsHue(name) {
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
        return hash;
    }

    // Primeiro nome + inicial do sobrenome: o pódio não tem largura para
    // "Maria Aparecida da Silva Gonçalves".
    // Conectivos que não contam como "segundo nome" — "Maria de Souza" deve
    // virar "Maria Souza", não "Maria De".
    const NAME_PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

    function shortName(name) {
        const words = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (words.length <= 1) return words[0] || '—';
        const rest = words.slice(1).filter(w => !NAME_PARTICLES.has(norm(w)));
        if (rest.length === 0) return words[0];
        return `${words[0]} ${rest[0]}`;
    }

    function fmt1(n) {
        return Number(n || 0).toFixed(1).replace('.', ',');
    }

    // Nota trabalha com 2 casas: é a precisão que o desempate enxerga, então a
    // tela mostra o mesmo número que decidiu a posição.
    function fmt2(n) {
        return Number(n || 0).toFixed(2).replace('.', ',');
    }

    function round2(n) {
        return Math.round((Number(n) || 0) * 100) / 100;
    }

    function fmtInt(n) {
        return String(Math.round(Number(n) || 0));
    }

    // Tempo médio em forma compacta ("2h 10m", "42m", "35s"). Zero vira "—":
    // registros anteriores à métrica de activeMs não têm o dado, e "0s" leria
    // como se a pessoa tivesse concluído instantaneamente.
    function fmtDuration(ms) {
        const total = Math.round(Number(ms) || 0) / 1000;
        if (!Number.isFinite(total) || total <= 0) return '—';
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = Math.floor(total % 60);
        if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
        if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
        return `${s}s`;
    }

    // Janela de desempenho recente: nota média, retentativas e pontualidade
    // olham só os últimos 12 meses (ver aggregate). Usa data de calendário,
    // não 365 dias fixos, para não deslocar em ano bissexto.
    const PERFORMANCE_WINDOW_MONTHS = 12;

    function windowCutoff(now = Date.now()) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - PERFORMANCE_WINDOW_MONTHS);
        return date.getTime();
    }

    // Registro sem data (planilha antiga sem a coluna) conta como recente: é
    // mais justo que descartá-lo silenciosamente do desempenho da pessoa.
    function isRecent(submittedAt, cutoff) {
        const n = Number(submittedAt);
        if (!Number.isFinite(n) || n <= 0) return true;
        return n >= cutoff;
    }

    function tierFor(pct) {
        return TIERS.find(t => pct >= t.min) || null;
    }

    // Categoria vigente: mesma resolução de js/main.js (query > localStorage >
    // Treinamentos), repetida aqui para não depender da ordem de carga.
    function currentSlug() {
        const paths = U.categoryPaths || { Treinamentos: 'treinamentos' };
        const fromQuery = new URLSearchParams(location.search).get('cat');
        let stored = null;
        try { stored = localStorage.getItem('uniadmin.category'); } catch (error) { /* indisponível */ }
        const category = fromQuery || stored;
        return paths[category] || 'treinamentos';
    }

    function isEnabledFor(slug) {
        return !DISABLED_SLUGS.includes(slug || currentSlug());
    }

    /* ─── Correspondência de função ─── */

    // O cargo do colaborador vem livre da planilha (coluna F) e costuma trazer
    // a especialização junto — "Analista - Biomédico", "RH - Gerente". Já a
    // função marcada no curso é o nome-base ("Analista", "RH"). Comparar por
    // igualdade exata deixava essas pessoas com denominador 0: o curso não
    // entrava na conta delas nem quando já o tinham concluído.
    //
    // A regra é hierárquica e só desce um nível: "Analista - Biomédico" casa
    // com "Analista", mas "Analista" NÃO casa com "Analista - Biomédico" — quem
    // é só "Analista" não deve herdar o curso exclusivo do biomédico.
    // O separador é o hífen entre espaços, que é como a planilha escreve; a
    // barra ("Atendente/Coletador") é cargo próprio, não hierarquia, e por isso
    // fica de fora.
    function roleBase(role) {
        const key = norm(role);
        const cut = key.indexOf(' - ');
        return cut === -1 ? key : key.slice(0, cut).trim();
    }

    // `courseRole` é a função marcada no curso; `userRole`, o cargo da pessoa.
    function roleMatches(courseRole, userRole) {
        const course = norm(courseRole);
        const user = norm(userRole);
        if (!course || !user) return false;
        if (course === user) return true;
        // Especialização do colaborador cobre a função-base do curso.
        return roleBase(user) === course;
    }

    /* ─── Denominador por função ─── */

    // Quantos cursos ativos cada função enxerga, e a lista completa deles.
    // Espelha themeVisibleForSession() de js/main.js:1086 — assunto sem
    // `roles` vale para todo mundo; com `roles`, só para quem tem uma dessas
    // funções. A lista (não só a contagem) alimenta "Ver cursos" no detalhe.
    function buildRoleCourseCounts(trainingData) {
        let openTotal = 0;
        const byRole = new Map();
        const openCourses = [];
        const roleCourses = new Map(); // normalizeName(role) -> [{subjectId, themeId, subjectName, themeName}]

        Object.keys(trainingData || {}).forEach(subjectId => {
            const subject = trainingData[subjectId];
            const themes = subject?.themes || {};
            Object.keys(themes).forEach(themeId => {
                const theme = themes[themeId];
                if (!theme || !theme.name || !String(theme.name).trim()) return;
                if (theme.active === false) return;
                const course = {
                    subjectId, themeId,
                    subjectName: subject?.name || subjectId,
                    themeName: theme.name
                };
                const roles = Array.isArray(theme.roles) ? theme.roles.filter(Boolean) : [];
                if (roles.length === 0) { openTotal += 1; openCourses.push(course); return; }
                roles.forEach(role => {
                    const key = norm(role);
                    byRole.set(key, (byRole.get(key) || 0) + 1);
                    if (!roleCourses.has(key)) roleCourses.set(key, []);
                    roleCourses.get(key).push(course);
                });
            });
        });

        // Cursos marcados para funções que casam com o cargo da pessoa. Varre
        // as chaves em vez de fazer lookup direto porque a correspondência é
        // hierárquica (ver roleMatches), não igualdade.
        function coursesMatching(role) {
            const found = [];
            roleCourses.forEach((courses, courseRoleKey) => {
                if (roleMatches(courseRoleKey, role)) found.push(...courses);
            });
            return found;
        }

        return {
            openTotal,
            byRole,
            // Sem função cadastrada, a pessoa só enxerga os cursos abertos.
            totalFor(role) { return this.coursesFor(role).length; },
            // Lista completa (abertos + os da função). Desduplicada: um curso
            // pode ser aberto E marcado para a função, ou estar marcado para
            // duas funções que casam com o mesmo cargo.
            coursesFor(role) {
                const seen = new Set();
                const merged = [];
                openCourses.concat(coursesMatching(role)).forEach(c => {
                    const k = `${c.subjectId}/${c.themeId}`;
                    if (seen.has(k)) return;
                    seen.add(k);
                    merged.push(c);
                });
                return merged;
            }
        };
    }

    /* ─── Chave de curso ─── */

    // Um curso precisa casar entre duas origens que nomeiam as coisas de forma
    // diferente: results/byUser traz subjectId/themeId, e results/imported (a
    // planilha) traz só os nomes das colunas Tema/Assunto. Quando há ID, ele
    // manda; senão, o nome normalizado é a chave.
    //
    // Atenção à inversão de vocabulário: na linha do histórico, `subject` é o
    // TEMA (pasta) e `theme` é o ASSUNTO (curso) — ver flatten() em
    // js/admin-history.js:193.
    function courseKeyOfRow(row) {
        if (row.subjectId && row.themeId) return `id:${row.subjectId}/${row.themeId}`;
        const subject = norm(row.subject);
        const theme = norm(row.theme);
        if (!theme) return null;
        return `name:${subject}/${theme}`;
    }

    function courseKeysOfCourse(course) {
        return [
            `id:${course.subjectId}/${course.themeId}`,
            `name:${norm(course.subjectName)}/${norm(course.themeName)}`
        ];
    }

    /* ─── Agregação ─── */

    // Uma entrada por colaborador com conta ativa. As linhas cruas trazem cada
    // tentativa; aqui elas viram uma situação final por curso (mesma lógica de
    // lastAttemptByPerson em js/admin-dashboard.js:118).
    function aggregate(rows, users, roleCounts, slug, now = Date.now()) {
        const cutoff = windowCutoff(now);

        // Duas chaves de agrupamento: userId (resultados gravados pelo portal)
        // e nome normalizado (results/imported, vindo de planilha, que não tem
        // userId). Mesmo pareamento de js/admin-users.js:65 — sem ele todo o
        // histórico importado ficava fora do ranking.
        const byUser = new Map();
        const byNameKey = new Map();

        rows.forEach(row => {
            if (row.slug !== slug) return;
            if (row.userId) {
                if (!byUser.has(row.userId)) byUser.set(row.userId, []);
                byUser.get(row.userId).push(row);
                return;
            }
            const key = norm(row.fullName);
            if (!key) return; // estágio livre sem nome: não dá para vincular
            if (!byNameKey.has(key)) byNameKey.set(key, []);
            byNameKey.get(key).push(row);
        });

        const entries = [];

        Object.keys(users || {}).forEach(userId => {
            const user = users[userId];
            if (!user || user.disabled === true) return;

            const nameKey = norm(user.fullNameKey || user.fullName);
            const userRows = (byUser.get(userId) || []).concat(byNameKey.get(nameKey) || []);
            const fullName = user.fullName || '(sem nome)';
            const role = user.role || '';
            // Denominador = tamanho da lista de elegíveis, não uma contagem
            // paralela: totalFor() somava aberto+função e contava em dobro um
            // curso que fosse os dois.

            // Agrupa por curso: cada assunto vira uma situação final. Linhas
            // importadas de planilha não têm subjectId/themeId — só os nomes
            // de Tema/Assunto —, então a chave cai para o nome normalizado.
            const courses = new Map();
            userRows.forEach(row => {
                const key = courseKeyOfRow(row);
                if (!key) return;
                if (!courses.has(key)) courses.set(key, []);
                courses.get(key).push(row);
            });

            // Cursos elegíveis da função e a situação de cada um. Isto é
            // montado ANTES das métricas porque o numerador (concluídos) e o
            // denominador (elegíveis) têm de sair da MESMA lista: contar o
            // histórico inteiro no numerador fazia um curso fora da função —
            // ou já retirado do catálogo — empurrar a barra para 100% mesmo
            // com cursos faltando.
            const courseList = roleCounts.coursesFor(role).map(course => {
                // Procura pelas duas chaves: o registro pode ter vindo do
                // portal (com IDs) ou de planilha importada (só com nomes).
                const courseRows = courseKeysOfCourse(course)
                    .map(k => courses.get(k))
                    .find(Boolean);
                let status = 'pending';
                if (courseRows) {
                    const approvedEver = courseRows.some(r => r.approved === true);
                    status = approvedEver ? 'done' : 'failed';
                }
                return { ...course, status, rows: courseRows || null };
            });

            const denom = courseList.length;

            let concluidos = 0;
            let onTime = 0;
            let late = 0;
            let retentativas = 0;
            const notas = [];
            const tempos = [];

            // Só os cursos elegíveis alimentam as métricas — ver comentário
            // acima sobre numerador e denominador.
            let realizados = 0;
            courseList.forEach(({ rows: courseRows }) => {
                if (!courseRows) return;
                const sorted = courseRows.slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
                const approvedEver = sorted.some(r => r.approved === true);

                // "Realizado" conta só avaliação concluída COM aprovação —
                // reprovação não entra no desempate.
                if (approvedEver) realizados += 1;

                // Nota média, retentativas, pontualidade, comentários e tempo
                // médio valem só para os últimos 12 meses: são métricas de
                // desempenho recente, e um atraso de 2022 não deve pesar no
                // ranking de hoje. % de conclusão e cursos realizados continuam
                // olhando o histórico inteiro — um curso concluído não
                // "descompleta" com o tempo.
                const recentes = sorted.filter(r => isRecent(r.submittedAt, cutoff));

                // Retentativa = envio além do primeiro no mesmo curso. Quem
                // acertou de primeira em todos soma 0, o cenário ideal.
                retentativas += Math.max(0, recentes.length - 1);

                // Pontualidade lê o status congelado no envio da última
                // tentativa — reenviar não deve contar o prazo duas vezes.
                const lastRecente = recentes[recentes.length - 1];
                const status = lastRecente?.deadlineStatus;
                if (status === 'on_time' || status === 'forgiven') onTime += 1;
                else if (status === 'late' || status === 'closed') late += 1;

                if (approvedEver) concluidos += 1;

                // Nota do curso = melhor tentativa recente. Curso REPROVADO
                // também entra na média, com a nota que tirou: a média é a
                // leitura de desempenho nas avaliações, e deixar a reprovação
                // de fora fazia quem só passava nos cursos fáceis exibir média
                // alta enquanto quem tentou um curso difícil e ficou em 5,0
                // não via diferença nenhuma. Dentro do curso continua valendo
                // a melhor tentativa (a retentativa já é penalizada no 3º
                // critério, e a não conclusão na % de conclusão).
                const best = recentes.reduce((acc, r) => {
                    const n = Number(r.score);
                    return Number.isFinite(n) && n > acc ? n : acc;
                }, -Infinity);
                if (Number.isFinite(best)) notas.push(best);

                // Tempo médio segue só nos concluídos: curso abandonado no
                // meio não tem duração comparável com um curso terminado.
                if (!approvedEver) return;
                const activeMs = recentes.reduce((acc, r) => Math.max(acc, Number(r.activeMs) || 0), 0);
                if (activeMs > 0) tempos.push(activeMs);
            });

            // Comentários contam todas as linhas, não só as aprovadas: cada
            // avaliação enviada com comentário é uma contribuição.
            const comentarios = userRows
                .filter(r => isRecent(r.submittedAt, cutoff))
                .filter(r => String(r.comment || '').trim() !== '').length;

            const comPrazo = onTime + late;

            entries.push({
                userId,
                fullName,
                role,
                unit: user.unit || '',
                // `rows` era só o veículo do cruzamento; fora daqui a lista é
                // consumida como dado de exibição.
                courseList: courseList.map(({ rows, ...course }) => course),
                // 1º critério
                pctConclusao: denom > 0 ? Math.min(100, (concluidos / denom) * 100) : 0,
                concluidos,
                denom,
                // 2º critério
                // Arredondada a 2 casas na origem: comparação, frase de gap e
                // exibição usam todas o mesmo valor.
                notaMedia: notas.length ? round2(notas.reduce((a, b) => a + b, 0) / notas.length) : 0,
                // 3º critério — quanto MENOS retentativas, melhor (ideal: 0)
                retentativas,
                // 4º critério
                pctPontualidade: comPrazo > 0 ? (onTime / comPrazo) * 100 : 0,
                temPrazos: comPrazo > 0,
                onTime,
                late,
                // 5º critério — "realizado" = avaliação concluída (enviada)
                // apenas com aprovação.
                cursosRealizados: realizados,
                // 6º e 7º critérios
                comentarios,
                tempoMedioMs: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0
            });
        });

        return entries;
    }

    /* ─── Ordenação ─── */

    function cmpDesc(a, b) {
        return Math.abs(a - b) < EPS ? 0 : (b - a);
    }

    // Cascata de desempate, na ordem definida pelo produto. O último critério
    // é alfabético para que a lista não troque de ordem entre duas recargas
    // com os mesmos dados.
    function compareEntries(a, b) {
        return cmpDesc(a.pctConclusao, b.pctConclusao)
            || cmpDesc(a.notaMedia, b.notaMedia)
            // Único critério "quanto menor, melhor": ordem invertida.
            || (a.retentativas - b.retentativas)
            || cmpDesc(a.pctPontualidade, b.pctPontualidade)
            || (b.cursosRealizados - a.cursosRealizados)
            || (b.comentarios - a.comentarios)
            || cmpDesc(a.tempoMedioMs, b.tempoMedioMs)
            || a.fullName.localeCompare(b.fullName, 'pt-BR');
    }

    // Frase do card "Sua posição": o primeiro critério em que a pessoa está
    // atrás de quem vem logo acima é o que ela precisa mexer para subir.
    function gapToNext(me, ahead, aheadPos) {
        if (!me || !ahead) return null;
        const place = `${aheadPos}º lugar`;
        if (ahead.pctConclusao - me.pctConclusao > EPS) {
            return `Faltam <strong>${fmt1(ahead.pctConclusao - me.pctConclusao)}%</strong> de conclusão para alcançar o ${place}`;
        }
        if (ahead.notaMedia - me.notaMedia > EPS) {
            return `Faltam <strong>${fmt2(ahead.notaMedia - me.notaMedia)}</strong> de nota média para alcançar o ${place}`;
        }
        if (me.retentativas > ahead.retentativas) {
            const n = me.retentativas - ahead.retentativas;
            return `Você tem <strong>${n} retentativa${n > 1 ? 's' : ''}</strong> a mais que o ${place}`;
        }
        if (ahead.pctPontualidade - me.pctPontualidade > EPS) {
            return `Faltam <strong>${fmt1(ahead.pctPontualidade - me.pctPontualidade)}%</strong> de pontualidade para alcançar o ${place}`;
        }
        if (ahead.cursosRealizados > me.cursosRealizados) {
            const n = ahead.cursosRealizados - me.cursosRealizados;
            return `Falta${n > 1 ? 'm' : ''} <strong>${n} curso${n > 1 ? 's' : ''}</strong> para alcançar o ${place}`;
        }
        if (ahead.comentarios > me.comentarios) {
            const n = ahead.comentarios - me.comentarios;
            return `Falta${n > 1 ? 'm' : ''} <strong>${n} comentário${n > 1 ? 's' : ''}</strong> para alcançar o ${place}`;
        }
        if (ahead.tempoMedioMs - me.tempoMedioMs > EPS) {
            return `Falta <strong>${fmtDuration(ahead.tempoMedioMs - me.tempoMedioMs)}</strong> de tempo médio para alcançar o ${place}`;
        }
        return `Empate técnico com o ${place} — o desempate está no nome`;
    }

    /* ─── Dados ─── */

    async function loadData(slug) {
        const [rows, usersSnap] = await Promise.all([
            U.getHistoryRows ? U.getHistoryRows() : Promise.resolve([]),
            U.get(U.ref(U.db, `/${U.dbRoot}/users`))
        ]);
        const users = usersSnap.exists() ? usersSnap.val() : {};
        // trainingData da categoria é publicado por js/main.js assim que o
        // conteúdo carrega; sem ele o denominador seria 0 para todo mundo.
        const trainingData = U.portalTrainingData || {};
        const roleCounts = buildRoleCourseCounts(trainingData);
        const entries = aggregate(rows, users, roleCounts, slug).sort(compareEntries);
        return { entries, slug };
    }

    /* ─── Render ─── */

    // Chip de pontualidade — usado na lista, no card "Sua posição" e no pódio.
    // Único ponto de verdade: duas cópias do markup acabariam divergindo.
    function punctualChipHtml(entry) {
        const conteudo = entry.temPrazos
            ? `<span class="ranking-pie" style="--p:${entry.pctPontualidade.toFixed(2)}"></span> ${fmt1(entry.pctPontualidade)}% no prazo`
            : `<span class="ranking-pie is-empty"></span> sem prazos`;
        const titulo = entry.temPrazos
            ? `${entry.onTime} no prazo · ${entry.late} em atraso`
            : 'Nenhum curso com prazo definido';
        return `<span class="ranking-chip is-punctual ${entry.late > 0 ? 'has-late' : ''}" title="${titulo}">${conteudo}</span>`;
    }

    // Retentativas é o 3º critério de desempate e só aparecia no detalhe
    // expandido. No pódio ela ganha balão próprio, com a mesma leitura verde de
    // "0 = limpo" usada na lista.
    function retryChipHtml(entry) {
        const n = entry.retentativas;
        const texto = n === 0
            ? 'sem retentativas'
            : `${fmtInt(n)} retentativa${n > 1 ? 's' : ''}`;
        return `<span class="ranking-chip is-retry ${n === 0 ? 'is-clean' : ''}" title="Retentativas — envios além do primeiro em cada curso. Quanto menos, melhor (ideal: 0)">
            <i class="fas ${n === 0 ? 'fa-circle-check' : 'fa-rotate-right'}"></i> ${texto}
        </span>`;
    }

    function chipsHtml(entry) {
        return `
            <span class="ranking-chip is-score" title="Nota média entre os cursos avaliados — reprovações incluídas">
                <i class="fas fa-star"></i> ${entry.notaMedia > 0 ? fmt2(entry.notaMedia) : '—'}
            </span>
            ${punctualChipHtml(entry)}
            <span class="ranking-chip ${entry.retentativas === 0 ? 'is-clean' : ''}" title="Retentativas — quanto menos, melhor (ideal: 0)">
                <i class="fas fa-rotate-right"></i> ${fmtInt(entry.retentativas)}
            </span>
            <span class="ranking-chip" title="Cursos com avaliação concluída">
                <i class="fas fa-book"></i> ${fmtInt(entry.cursosRealizados)}
            </span>
            <span class="ranking-chip" title="Comentários deixados na avaliação dos cursos">
                <i class="fas fa-comment-dots"></i> ${fmtInt(entry.comentarios)}
            </span>
            <span class="ranking-chip" title="Tempo médio de conclusão por curso">
                <i class="fas fa-clock"></i> ${fmtDuration(entry.tempoMedioMs)}
            </span>`;
    }

    // Nota média é o critério que decide o pódio quase sempre (todo mundo no
    // topo tende a 100% de conclusão), então ela ganha bloco próprio em vez de
    // dividir uma linha de ícones — e as 5 estrelas dão a leitura imediata da
    // escala 0–10 sem o leitor ter de interpretar o número.
    function podiumScoreHtml(entry) {
        if (!(entry.notaMedia > 0)) {
            return '<div class="podium-score is-empty"><span class="podium-score-label">Nota média</span><b>—</b></div>';
        }
        const pct = Math.max(0, Math.min(100, entry.notaMedia * 10));
        return `
            <div class="podium-score" title="Nota média entre os cursos avaliados, reprovações incluídas — critério de desempate">
                <span class="podium-score-label">Nota média</span>
                <div class="podium-score-value">
                    <i class="fas fa-star"></i>
                    <b>${fmt2(entry.notaMedia)}</b>
                    <small>/10</small>
                </div>
                <div class="podium-score-stars" role="img" aria-label="${fmt2(entry.notaMedia)} de 10">
                    <span class="podium-score-stars-bg">★★★★★</span>
                    <span class="podium-score-stars-fill" style="width:${pct.toFixed(2)}%">★★★★★</span>
                </div>
            </div>`;
    }

    function podiumStepHtml(entry, place) {
        if (!entry) return '';
        const cls = ['is-first', 'is-second', 'is-third'][place - 1];
        return `
            <div class="podium-step ${cls}" data-user="${escapeHtml(entry.userId)}" role="button" tabindex="0" aria-expanded="false">
                ${place === 1 ? '<div class="podium-crown"><i class="fas fa-crown"></i></div>' : ''}
                <div class="podium-avatar" style="--initials-hue:${initialsHue(entry.fullName)}">
                    ${escapeHtml(initials(entry.fullName))}
                    <span class="podium-medal"><i class="fas fa-medal"></i></span>
                </div>
                <div class="podium-name" title="${escapeHtml(entry.fullName)}">${escapeHtml(shortName(entry.fullName))}</div>
                <div class="podium-role">${escapeHtml(entry.role || '—')}</div>
                <div class="podium-block">
                    <div class="podium-place">${place}º</div>
                    <div class="podium-pct" data-count="${entry.pctConclusao.toFixed(1)}" data-suffix="%">0%</div>
                    <div class="podium-caption">${entry.concluidos}/${entry.denom} cursos</div>
                    ${podiumScoreHtml(entry)}
                    <div class="podium-retry">${retryChipHtml(entry)}</div>
                    <div class="podium-punctual">${punctualChipHtml(entry)}</div>
                </div>
                <i class="fas fa-chevron-down podium-caret"></i>
            </div>`;
    }

    function rowHtml(entry, place, isMe) {
        const tier = tierFor(entry.pctConclusao);
        return `
            <div class="ranking-row ${isMe ? 'is-me' : ''}" data-user="${escapeHtml(entry.userId)}" role="button" tabindex="0" aria-expanded="false">
                <div class="ranking-pos">${place}º</div>
                <div class="ranking-avatar" style="--initials-hue:${initialsHue(entry.fullName)}">${escapeHtml(initials(entry.fullName))}</div>
                <div class="ranking-main">
                    <div class="ranking-name">
                        ${escapeHtml(entry.fullName)}
                        ${tier ? `<i class="fas fa-trophy ${tier.cls}" title="Faixa ${tier.label} — ${tier.min}% ou mais de conclusão"></i>` : ''}
                        ${isMe ? '<span class="ranking-you-tag">você</span>' : ''}
                    </div>
                    <div class="ranking-role">${escapeHtml(entry.role || 'Sem função')}${entry.unit ? ` · ${escapeHtml(entry.unit)}` : ''}</div>
                    <div class="ranking-bar-row" title="${entry.concluidos} de ${entry.denom} cursos da função">
                        <div class="ranking-bar"><span style="width:${entry.pctConclusao.toFixed(2)}%"></span></div>
                        <b data-count="${entry.pctConclusao.toFixed(1)}" data-suffix="%">0%</b>
                    </div>
                </div>
                <div class="ranking-chips">${chipsHtml(entry)}</div>
                <i class="fas fa-chevron-down ranking-caret"></i>
            </div>
            <div class="ranking-detail" data-detail="${escapeHtml(entry.userId)}" hidden></div>`;
    }

    function youCardHtml(entry, place, total, ahead, delta) {
        if (!entry) {
            return `
                <div class="ranking-you is-guest">
                    <div class="ranking-you-head"><i class="fas fa-user-lock"></i> Sua posição</div>
                    <p>Entre com sua conta para ver onde você está no ranking e quanto falta para subir.</p>
                    <button type="button" class="ranking-you-cta" id="ranking-login-cta">
                        <i class="fas fa-right-to-bracket"></i> Entrar
                    </button>
                </div>`;
        }
        const gap = gapToNext(entry, ahead, place - 1);
        let deltaHtml = '';
        if (delta > 0) deltaHtml = `<span class="ranking-delta is-up"><i class="fas fa-caret-up"></i> subiu ${delta} posiç${delta > 1 ? 'ões' : 'ão'}</span>`;
        else if (delta < 0) deltaHtml = `<span class="ranking-delta is-down"><i class="fas fa-caret-down"></i> caiu ${-delta} posiç${-delta > 1 ? 'ões' : 'ão'}</span>`;
        else if (delta === 0) deltaHtml = '<span class="ranking-delta is-flat"><i class="fas fa-minus"></i> manteve a posição</span>';

        return `
            <div class="ranking-you">
                <div class="ranking-you-head">
                    <span><i class="fas fa-location-crosshairs"></i> Sua posição</span>
                    ${deltaHtml}
                </div>
                <div class="ranking-you-body">
                    <div class="ranking-you-place">${place}<sup>º</sup><small>de ${total}</small></div>
                    <div class="ranking-avatar" style="--initials-hue:${initialsHue(entry.fullName)}">${escapeHtml(initials(entry.fullName))}</div>
                    <div class="ranking-main">
                        <div class="ranking-name">${escapeHtml(entry.fullName)}</div>
                        <div class="ranking-role">${escapeHtml(entry.role || 'Sem função')}</div>
                        <div class="ranking-bar-row" title="${entry.concluidos} de ${entry.denom} cursos da função">
                            <div class="ranking-bar"><span style="width:${entry.pctConclusao.toFixed(2)}%"></span></div>
                            <b data-count="${entry.pctConclusao.toFixed(1)}" data-suffix="%">0%</b>
                        </div>
                    </div>
                    <div class="ranking-chips">${chipsHtml(entry)}</div>
                </div>
                ${gap ? `<div class="ranking-you-gap"><i class="fas fa-fire"></i> ${gap}</div>` : `<div class="ranking-you-gap is-top"><i class="fas fa-crown"></i> Você está em 1º lugar. Segure a liderança!</div>`}
            </div>`;
    }

    // Botão no cabeçalho + popover com a explicação completa da cascata de
    // desempate. Fechado por padrão — a legenda compacta no rodapé virava
    // ruído visual em toda visita; agora é sob demanda.
    const LEGEND_ITEMS = [
        { title: '% de cursos concluídos da função', detail: 'Aprovados ÷ cursos ativos que a sua função enxerga (abertos a todos + os marcados para a sua função).' },
        { title: 'Nota média', detail: 'Média da melhor nota de cada curso avaliado, incluindo os reprovados.', recent: true },
        { title: 'Quantidade de retentativas', detail: 'Envios além do primeiro em cada curso — quanto menos, melhor. O ideal é 0.', recent: true },
        { title: '% de pontualidade', detail: 'Entregas no prazo ÷ (no prazo + em atraso), conforme a coluna Prazo do histórico.', recent: true },
        { title: 'Cursos realizados', detail: 'Quantidade de avaliações concluídas (enviadas), apenas com aprovação.' },
        { title: 'Comentários', detail: 'Quantidade de avaliações com comentário — quanto mais, melhor.', recent: true },
        { title: 'Tempo médio de conclusão', detail: 'Tempo médio ativo por curso concluído — quanto maior, melhor.', recent: true }
    ];

    function legendButtonHtml() {
        return `<button type="button" class="ranking-legend-btn" id="ranking-legend-toggle" aria-expanded="false" aria-controls="ranking-legend-panel">
            <i class="fas fa-scale-balanced"></i> Critério de desempate
        </button>`;
    }

    function legendHtml() {
        return `
            <div class="ranking-legend-panel" id="ranking-legend-panel" hidden>
                <div class="ranking-legend-panel-head">
                    <i class="fas fa-scale-balanced"></i> Como funciona o ranking
                </div>
                <p class="ranking-legend-panel-intro">Em caso de empate, o critério seguinte decide — nesta ordem:</p>
                <ol class="ranking-legend-list">
                    ${LEGEND_ITEMS.map(item => `<li><strong>${escapeHtml(item.title)}${item.recent ? '<em class="ranking-legend-window">últimos 12 meses</em>' : ''}</strong><span>${escapeHtml(item.detail)}</span></li>`).join('')}
                </ol>
                <p class="ranking-legend-panel-foot">
                    <i class="fas fa-clock-rotate-left"></i>
                    Os critérios marcados olham só os últimos 12 meses — desempenho recente.
                    A % de conclusão e os cursos realizados consideram todo o histórico.
                </p>
            </div>`;
    }

    /* ─── Escopo por função ─── */

    // "Estagio/Atendente" é um estagiário DA função Atendente: no seletor ele
    // pertence ao grupo Atendente, não a um grupo "Estagio" próprio. Só este
    // prefixo desce para o que vem depois da barra — "Atendente/Coletador" é
    // cargo duplo, um nome próprio, e continua inteiro.
    // A planilha é escrita à mão: o padrão cobre estagio/estágio/estagiario/
    // estagiária/plurais, com ou sem espaço antes da barra.
    const ROLE_INTERN_PREFIX = /^est[aá]gi(?:o|os|[aá]ri[oa]|[aá]ri[oa]s)\s*\//i;

    // O cargo da planilha traz a especialização junto ("Analista - Biomédico").
    // O seletor agrupa pela função-base (o que vem antes do " - "), que é como
    // o curso marca o público — mesma regra de roleBase() usada no denominador.
    function roleLabel(role) {
        let raw = String(role || '').trim();
        if (!raw) return '';
        // Antes do corte do " - ": "Estagio/Atendente - Noturno" tem de virar
        // "Atendente", não "Estagio/Atendente".
        if (ROLE_INTERN_PREFIX.test(raw)) raw = raw.replace(ROLE_INTERN_PREFIX, '').trim();
        if (!raw) return '';
        const cut = raw.indexOf(' - ');
        return (cut === -1 ? raw : raw.slice(0, cut)).trim();
    }

    // Uma opção por função-base presente no ranking, com a contagem de gente.
    // A grafia exibida é a primeira encontrada — a planilha é livre e às vezes
    // escreve a mesma função em caixas diferentes.
    //
    // Função em que NINGUÉM concluiu nada fica de fora: o recorte só mostraria
    // um pódio de zeros, que não é ranking nenhum. Basta uma pessoa acima de
    // 0% para o grupo voltar à lista.
    function roleOptions(entries) {
        const map = new Map();
        entries.forEach(entry => {
            const label = roleLabel(entry.role);
            if (!label) return;
            const key = norm(label);
            if (!map.has(key)) map.set(key, { key, label, count: 0, hasProgress: false });
            const option = map.get(key);
            option.count += 1;
            if (entry.pctConclusao > EPS) option.hasProgress = true;
        });
        // Ordena pelo tamanho do grupo: as funções com mais gente são as que
        // interessam a mais gente. O alfabético fica de desempate, para a lista
        // não trocar de ordem entre duas aberturas com os mesmos dados.
        return [...map.values()]
            .filter(option => option.hasProgress)
            .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label, 'pt-BR'));
    }

    // Uma função só filtra se ela ainda estiver na lista de opções: se o último
    // aprovado dela sair (ficando todo mundo em 0%), o recorte cai de volta no
    // Ranking Geral em vez de mostrar um pódio vazio sem opção de voltar.
    function isSelectableRole(entries, roleKey) {
        return !!roleKey && roleOptions(entries).some(option => option.key === roleKey);
    }

    function entriesForRole(entries, roleKey) {
        if (!isSelectableRole(entries, roleKey)) return entries;
        return entries.filter(entry => norm(roleLabel(entry.role)) === roleKey);
    }

    // Chip central sobre o pódio: fechado mostra o escopo vigente ("Ranking
    // Geral" ou o nome da função); aberto lista as funções participantes.
    function scopeHtml(entries, roleKey) {
        const options = roleOptions(entries);
        const active = options.find(o => o.key === roleKey) || null;
        const total = entries.length;
        return `
            <div class="ranking-scope" id="ranking-scope">
                <button type="button" class="ranking-scope-btn ${active ? 'is-filtered' : ''}" id="ranking-scope-toggle"
                        aria-expanded="false" aria-haspopup="listbox" aria-controls="ranking-scope-panel">
                    <i class="fas ${active ? 'fa-user-tag' : 'fa-globe'}"></i>
                    <span class="ranking-scope-label">${escapeHtml(active ? active.label : 'Ranking Geral')}</span>
                    <span class="ranking-scope-count">${active ? active.count : total}</span>
                    <i class="fas fa-chevron-down ranking-scope-caret"></i>
                </button>
                <div class="ranking-scope-panel" id="ranking-scope-panel" role="listbox" hidden>
                    <div class="ranking-scope-panel-head">
                        <i class="fas fa-users-viewfinder"></i> Ver ranking por função
                    </div>
                    <div class="ranking-scope-options">
                        <button type="button" class="ranking-scope-option ${active ? '' : 'is-active'}" role="option"
                                aria-selected="${active ? 'false' : 'true'}" data-role="">
                            <span class="ranking-scope-option-icon is-all"><i class="fas fa-globe"></i></span>
                            <span class="ranking-scope-option-name">Ranking Geral</span>
                            <span class="ranking-scope-option-count">${total}</span>
                        </button>
                        ${options.map(option => `
                            <button type="button" class="ranking-scope-option ${option.key === roleKey ? 'is-active' : ''}" role="option"
                                    aria-selected="${option.key === roleKey}" data-role="${escapeHtml(option.key)}">
                                <span class="ranking-scope-option-icon" style="--initials-hue:${initialsHue(option.label)}">${escapeHtml(initials(option.label))}</span>
                                <span class="ranking-scope-option-name">${escapeHtml(option.label)}</span>
                                <span class="ranking-scope-option-count">${option.count}</span>
                            </button>`).join('')}
                    </div>
                    ${options.length === 0 ? '<p class="ranking-scope-empty">Nenhuma função cadastrada.</p>' : ''}
                </div>
            </div>`;
    }

    function confettiHtml() {
        const colors = ['var(--gold)', 'var(--accent)', 'var(--success)', 'var(--silver)', 'var(--warning)'];
        let html = '<div class="ranking-confetti" aria-hidden="true">';
        for (let i = 0; i < 26; i++) {
            const left = Math.round((i / 26) * 100 + (Math.random() * 3));
            const delay = (Math.random() * 2.2).toFixed(2);
            const dur = (2.4 + Math.random() * 1.8).toFixed(2);
            const color = colors[i % colors.length];
            html += `<i style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
        }
        return html + '</div>';
    }

    // `allEntries` é o ranking completo da categoria; `roleKey` recorta a
    // função escolhida no seletor. O seletor lista sempre as funções do
    // conjunto completo — senão, ao filtrar, ele perderia as outras opções.
    function panelHtml(allEntries, slug, session, roleKey) {
        const label = CATEGORY_LABELS[slug] || slug;
        // Normaliza antes de usar: um recorte que deixou de existir vira geral,
        // e cabeçalho, chip e lista contam a mesma história.
        if (!isSelectableRole(allEntries, roleKey)) roleKey = '';
        const entries = entriesForRole(allEntries, roleKey);

        if (allEntries.length === 0) {
            return `
                <div class="ranking-panel">
                    <div class="ranking-head">
                        <div class="ranking-head-icon"><i class="fas fa-trophy"></i></div>
                        <div>
                            <h2>Ranking · ${escapeHtml(label)}</h2>
                            <p>Nenhum colaborador com dados ainda</p>
                        </div>
                    </div>
                    <div class="ranking-empty">
                        <i class="fas fa-trophy"></i>
                        <h3>Ninguém concluiu cursos ainda</h3>
                        <p>Seja o primeiro a aparecer no pódio 🏆</p>
                    </div>
                </div>`;
        }

        const myIndex = session?.userId ? entries.findIndex(e => e.userId === session.userId) : -1;
        const me = myIndex >= 0 ? entries[myIndex] : null;
        const myPlace = myIndex >= 0 ? myIndex + 1 : 0;

        // A posição da última visita é a do ranking geral: gravar a posição de
        // um recorte por função faria o "▲ subiu 3 posições" comparar duas
        // escalas diferentes na visita seguinte.
        let delta = null;
        if (me && !roleKey) {
            try {
                const stored = Number(localStorage.getItem(LAST_POS_KEY(slug)));
                if (Number.isFinite(stored) && stored > 0) delta = stored - myPlace;
                localStorage.setItem(LAST_POS_KEY(slug), String(myPlace));
            } catch (error) { /* localStorage indisponível */ }
        }

        const podium = entries.slice(0, 3);
        const rest = entries.slice(3);
        const meInTop3 = myIndex >= 0 && myIndex < 3;

        // Ordem visual do pódio: 2º, 1º, 3º — o degrau alto fica no meio.
        const podiumOrder = [
            podiumStepHtml(podium[1], 2),
            podiumStepHtml(podium[0], 1),
            podiumStepHtml(podium[2], 3)
        ].join('');

        return `
            <div class="ranking-panel">
                <div class="ranking-head">
                    <div class="ranking-head-icon"><i class="fas fa-trophy"></i></div>
                    <div>
                        <h2>Ranking · ${escapeHtml(label)}</h2>
                        <p>${entries.length} colaborador${entries.length !== 1 ? 'es' : ''}${roleKey ? ' nesta função' : ''} · atualizado agora</p>
                    </div>
                    <div class="ranking-legend-wrap">
                        ${legendButtonHtml()}
                        ${legendHtml()}
                    </div>
                </div>

                ${scopeHtml(allEntries, roleKey)}

                ${entries.length === 0 ? `
                <div class="ranking-empty">
                    <i class="fas fa-user-tag"></i>
                    <h3>Ninguém nesta função ainda</h3>
                    <p>Volte para o <strong>Ranking Geral</strong> para ver todos os colaboradores.</p>
                </div>` : `
                <div class="ranking-podium">
                    ${meInTop3 ? confettiHtml() : ''}
                    ${podiumOrder}
                </div>
                <div class="ranking-detail" data-detail="__podium__" hidden></div>

                ${roleKey && !me ? '' : youCardHtml(me, myPlace, entries.length, myIndex > 0 ? entries[myIndex - 1] : null, delta)}

                <div class="ranking-list">
                    ${rest.map((entry, i) => rowHtml(entry, i + 4, entry.userId === session?.userId)).join('')}
                </div>`}
            </div>`;
    }

    /* ─── Animações e interação ─── */

    // Números sobem de 0 até o valor: a revelação é o que dá a sensação de
    // resultado, e o custo é um rAF por elemento visível.
    function animateCounters(root) {
        const targets = root.querySelectorAll('[data-count]');
        targets.forEach((el, i) => {
            const to = Number(el.dataset.count) || 0;
            const suffix = el.dataset.suffix || '';
            const duration = 900;
            const startDelay = Math.min(i * 40, 600);
            const t0 = performance.now() + startDelay;
            function step(now) {
                const p = Math.min(1, Math.max(0, (now - t0) / duration));
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = fmt1(to * eased) + suffix;
                if (p < 1) requestAnimationFrame(step);
                else el.textContent = fmt1(to) + suffix;
            }
            requestAnimationFrame(step);
        });
    }

    // As barras nascem em 0 e só recebem a largura real no frame seguinte,
    // senão o navegador pinta o valor final sem transição.
    function animateBars(root) {
        const bars = root.querySelectorAll('.ranking-bar > span');
        bars.forEach((bar, i) => {
            const target = bar.style.width;
            bar.style.width = '0%';
            bar.style.transitionDelay = `${Math.min(i * 45, 700)}ms`;
            requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = target; }));
        });
    }

    const detailCharts = {};

    function destroyDetailChart(key) {
        if (detailCharts[key]) { detailCharts[key].destroy(); delete detailCharts[key]; }
    }

    // Detalhe expandido de uma pessoa. É o único ponto com Chart.js real: um
    // canvas por vez, já visível — desenhar dentro de container display:none
    // congela o layout em altura 0 (ver js/admin-dashboard.js:160).
    function renderDetail(container, entry) {
        if (!entry) { container.innerHTML = ''; return; }
        const canvasId = `ranking-detail-chart-${entry.userId}`;
        container.innerHTML = `
            <div class="ranking-detail-inner">
                <div class="ranking-detail-chart">
                    <div class="ranking-detail-canvas"><canvas id="${canvasId}"></canvas></div>
                    <span class="ranking-detail-chart-label">Pontualidade</span>
                </div>
                <div class="ranking-detail-stats">
                    <div class="ranking-detail-stat"><b>${entry.concluidos}<small>/${entry.denom}</small></b><span>Cursos concluídos da função</span></div>
                    <div class="ranking-detail-stat"><b>${entry.notaMedia > 0 ? fmt2(entry.notaMedia) : '—'}</b><span>Nota média</span></div>
                    <div class="ranking-detail-stat"><b>${entry.retentativas}</b><span>Retentativas</span></div>
                    <div class="ranking-detail-stat"><b>${entry.onTime}</b><span>Entregas no prazo</span></div>
                    <div class="ranking-detail-stat"><b>${entry.late}</b><span>Entregas em atraso</span></div>
                    <div class="ranking-detail-stat"><b>${entry.cursosRealizados}</b><span>Avaliações concluídas</span></div>
                    <div class="ranking-detail-stat"><b>${entry.comentarios}</b><span>Comentários</span></div>
                    <div class="ranking-detail-stat"><b>${fmtDuration(entry.tempoMedioMs)}</b><span>Tempo médio por curso</span></div>
                </div>
                <div class="ranking-detail-actions">
                    <button type="button" class="ranking-see-courses-btn" data-see-courses="${escapeHtml(entry.userId)}">
                        <i class="fas fa-list-check"></i> Ver cursos
                    </button>
                    <button type="button" class="ranking-params-btn" data-see-params="${escapeHtml(entry.userId)}">
                        <i class="fas fa-sliders"></i> Parâmetros
                    </button>
                </div>
            </div>`;

        if (typeof Chart === 'undefined') return;
        destroyDetailChart(entry.userId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const hasData = entry.temPrazos;
        detailCharts[entry.userId] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: hasData ? ['No prazo', 'Em atraso'] : ['Sem prazos'],
                datasets: [{
                    data: hasData ? [entry.onTime, entry.late] : [1],
                    backgroundColor: hasData ? ['#10b981', '#ef4444'] : ['#e2e8f0'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                    tooltip: { enabled: hasData }
                }
            }
        });
    }

    /* ─── Janela "Ver cursos" ─── */

    const COURSE_STATUS_META = {
        done:    { icon: 'fa-circle-check',   label: 'Concluído',   cls: 'is-done' },
        failed:  { icon: 'fa-circle-xmark',   label: 'Reprovado',   cls: 'is-failed' },
        pending: { icon: 'fa-circle',         label: 'Não realizado', cls: 'is-pending' }
    };

    function courseCardHtml(course) {
        const meta = COURSE_STATUS_META[course.status] || COURSE_STATUS_META.pending;
        return `
            <div class="course-mini-card ${meta.cls}">
                <div class="course-mini-status"><i class="fas ${meta.icon}"></i></div>
                <div class="course-mini-body">
                    <div class="course-mini-subject">${escapeHtml(course.subjectName)}</div>
                    <div class="course-mini-theme">${escapeHtml(course.themeName)}</div>
                </div>
                <span class="course-mini-tag">${meta.label}</span>
            </div>`;
    }

    // Janela secundária sobre o modal do ranking (ou sobre o painel inline),
    // com os cursos elegíveis da pessoa agrupados em feito/reprovado/pendente.
    // Usa a mesma lista de courseList montada em aggregate() — nenhuma leitura
    // nova ao Firebase.
    function openCoursesWindow(entry) {
        if (!entry) return;
        let overlay = document.getElementById('ranking-courses-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ranking-courses-overlay';
            overlay.className = 'ranking-courses-overlay';
            overlay.innerHTML = `
                <div class="ranking-courses-card">
                    <button type="button" class="ranking-courses-close" id="ranking-courses-close" aria-label="Fechar">&times;</button>
                    <div class="ranking-courses-head">
                        <div class="ranking-courses-avatar" id="ranking-courses-avatar"></div>
                        <div>
                            <h3 id="ranking-courses-name"></h3>
                            <p id="ranking-courses-sub"></p>
                        </div>
                    </div>
                    <div class="ranking-courses-body" id="ranking-courses-body"></div>
                </div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', event => { if (event.target === overlay) closeCoursesWindow(); });
            overlay.querySelector('#ranking-courses-close').addEventListener('click', closeCoursesWindow);
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && overlay.classList.contains('is-open')) closeCoursesWindow();
            });
        }

        const done = entry.courseList.filter(c => c.status === 'done');
        const failed = entry.courseList.filter(c => c.status === 'failed');
        const pending = entry.courseList.filter(c => c.status === 'pending');

        overlay.querySelector('#ranking-courses-avatar').innerHTML =
            `<span style="--initials-hue:${initialsHue(entry.fullName)}">${escapeHtml(initials(entry.fullName))}</span>`;
        overlay.querySelector('#ranking-courses-name').textContent = entry.fullName;
        overlay.querySelector('#ranking-courses-sub').textContent =
            `${entry.role || 'Sem função'} · ${done.length} de ${entry.courseList.length} cursos concluídos`;

        function section(title, list, emptyText) {
            if (list.length === 0) {
                return `<div class="course-mini-section"><h4>${title} (0)</h4><p class="course-mini-empty">${emptyText}</p></div>`;
            }
            return `<div class="course-mini-section"><h4>${title} (${list.length})</h4><div class="course-mini-grid">${list.map(courseCardHtml).join('')}</div></div>`;
        }

        overlay.querySelector('#ranking-courses-body').innerHTML = entry.courseList.length === 0
            ? '<p class="course-mini-empty">Nenhum curso elegível para esta função.</p>'
            : section('Concluídos', done, 'Nenhum curso concluído ainda.')
                + section('Reprovados', failed, 'Nenhuma reprovação.')
                + section('Não realizados', pending, 'Fez todos os cursos disponíveis 🎉');

        overlay.classList.add('is-open');
    }

    function closeCoursesWindow() {
        document.getElementById('ranking-courses-overlay')?.classList.remove('is-open');
    }

    /* ─── Janela "Parâmetros" ─── */

    // Os sete critérios na MESMA ordem de compareEntries() — esta é a fonte de
    // verdade visual da cascata de desempate. `value` devolve o texto exibido,
    // `meter` (0..100) desenha a barrinha e `better` diz se mais é melhor.
    const PARAM_ITEMS = [
        {
            icon: 'fa-graduation-cap', title: '% de cursos concluídos da função',
            hint: 'Aprovados ÷ cursos ativos que a função enxerga.',
            better: 'higher', recent: false,
            value: e => `${fmt1(e.pctConclusao)}%`,
            sub: e => `${e.concluidos} de ${e.denom} cursos`,
            meter: e => e.pctConclusao
        },
        {
            icon: 'fa-star', title: 'Nota média',
            hint: 'Média da melhor nota de cada curso avaliado, incluindo os reprovados.',
            better: 'higher', recent: true,
            value: e => e.notaMedia > 0 ? fmt2(e.notaMedia) : '—',
            sub: () => 'escala de 0 a 10',
            meter: e => Math.min(100, e.notaMedia * 10)
        },
        {
            icon: 'fa-rotate-right', title: 'Retentativas',
            hint: 'Envios além do primeiro em cada curso. O ideal é 0.',
            better: 'lower', recent: true,
            value: e => fmtInt(e.retentativas),
            sub: e => e.retentativas === 0 ? 'nenhuma retentativa' : 'quanto menos, melhor',
            meter: e => Math.max(0, 100 - Math.min(100, e.retentativas * 20))
        },
        {
            icon: 'fa-clock', title: '% de pontualidade',
            hint: 'Entregas no prazo ÷ (no prazo + em atraso).',
            better: 'higher', recent: true,
            value: e => e.temPrazos ? `${fmt1(e.pctPontualidade)}%` : '—',
            sub: e => e.temPrazos ? `${e.onTime} no prazo · ${e.late} em atraso` : 'sem prazos definidos',
            meter: e => e.temPrazos ? e.pctPontualidade : 0
        },
        {
            icon: 'fa-book', title: 'Cursos realizados',
            hint: 'Avaliações concluídas (enviadas), apenas com aprovação.',
            better: 'higher', recent: false,
            value: e => fmtInt(e.cursosRealizados),
            sub: e => `de ${e.denom} elegíveis`,
            meter: e => e.denom > 0 ? Math.min(100, (e.cursosRealizados / e.denom) * 100) : 0
        },
        {
            icon: 'fa-comment-dots', title: 'Comentários',
            hint: 'Avaliações enviadas com comentário — quanto mais, melhor.',
            better: 'higher', recent: true,
            value: e => fmtInt(e.comentarios),
            sub: e => e.cursosRealizados > 0 ? `em ${e.cursosRealizados} avaliações` : 'nenhuma avaliação',
            meter: e => e.cursosRealizados > 0 ? Math.min(100, (e.comentarios / e.cursosRealizados) * 100) : 0
        },
        {
            icon: 'fa-hourglass-half', title: 'Tempo médio de conclusão',
            hint: 'Tempo médio ativo por curso concluído — quanto maior, melhor.',
            better: 'higher', recent: true,
            value: e => fmtDuration(e.tempoMedioMs),
            sub: () => 'tempo ativo por curso',
            // 30 min de tempo ativo já enche a barra: acima disso a diferença
            // não diz mais nada visualmente.
            meter: e => Math.min(100, (Number(e.tempoMedioMs) || 0) / (30 * 60 * 1000) * 100)
        }
    ];

    function paramRowHtml(item, entry, index) {
        const meter = Math.max(0, Math.min(100, Number(item.meter(entry)) || 0));
        const lower = item.better === 'lower';
        return `
            <li class="param-row">
                <span class="param-order">${index + 1}º</span>
                <span class="param-icon"><i class="fas ${item.icon}"></i></span>
                <div class="param-body">
                    <div class="param-title">
                        <strong>${escapeHtml(item.title)}</strong>
                        <span class="param-goal ${lower ? 'is-lower' : ''}">
                            <i class="fas fa-arrow-${lower ? 'down' : 'up'}"></i> ${lower ? 'menos é melhor' : 'mais é melhor'}
                        </span>
                        ${item.recent ? '<span class="param-window">últimos 12 meses</span>' : ''}
                    </div>
                    <div class="param-hint">${escapeHtml(item.hint)}</div>
                    <div class="param-meter"><span style="width:${meter.toFixed(2)}%"></span></div>
                </div>
                <div class="param-value">
                    <b>${item.value(entry)}</b>
                    <small>${escapeHtml(item.sub(entry))}</small>
                </div>
            </li>`;
    }

    // Mesmo padrão da janela "Ver cursos": overlay próprio com id fixo,
    // reaproveitado entre aberturas, por cima do modal do ranking.
    function openParamsWindow(entry) {
        if (!entry) return;
        let overlay = document.getElementById('ranking-params-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ranking-params-overlay';
            overlay.className = 'ranking-courses-overlay ranking-params-overlay';
            overlay.innerHTML = `
                <div class="ranking-courses-card ranking-params-card">
                    <button type="button" class="ranking-courses-close" id="ranking-params-close" aria-label="Fechar">&times;</button>
                    <div class="ranking-params-head">
                        <div class="ranking-courses-avatar" id="ranking-params-avatar"></div>
                        <div class="ranking-params-head-text">
                            <span class="ranking-params-eyebrow"><i class="fas fa-scale-balanced"></i> Critério de desempate</span>
                            <h3 id="ranking-params-name"></h3>
                            <p id="ranking-params-sub"></p>
                        </div>
                    </div>
                    <div class="ranking-courses-body ranking-params-body">
                        <p class="ranking-params-intro">Os parâmetros são avaliados <strong>nesta ordem</strong>. O primeiro em que duas pessoas diferem decide a posição.</p>
                        <ol class="param-list" id="ranking-params-list"></ol>
                        <p class="ranking-params-foot">
                            <i class="fas fa-clock-rotate-left"></i>
                            Os critérios marcados como <em>últimos 12 meses</em> olham só o desempenho recente.
                            Persistindo o empate em todos eles, o desempate final é alfabético.
                        </p>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', event => { if (event.target === overlay) closeParamsWindow(); });
            overlay.querySelector('#ranking-params-close').addEventListener('click', closeParamsWindow);
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && overlay.classList.contains('is-open')) closeParamsWindow();
            });
        }

        overlay.querySelector('#ranking-params-avatar').innerHTML =
            `<span style="--initials-hue:${initialsHue(entry.fullName)}">${escapeHtml(initials(entry.fullName))}</span>`;
        overlay.querySelector('#ranking-params-name').textContent = entry.fullName;
        overlay.querySelector('#ranking-params-sub').textContent =
            `${entry.role || 'Sem função'}${entry.unit ? ` · ${entry.unit}` : ''}`;
        overlay.querySelector('#ranking-params-list').innerHTML =
            PARAM_ITEMS.map((item, i) => paramRowHtml(item, entry, i)).join('');

        overlay.classList.add('is-open');
        // As barras nascem em 0 (como em animateBars) para a janela abrir com
        // o preenchimento acontecendo, não já pronto.
        overlay.querySelectorAll('.param-meter > span').forEach((bar, i) => {
            const target = bar.style.width;
            bar.style.width = '0%';
            bar.style.transitionDelay = `${Math.min(i * 55, 500)}ms`;
            requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = target; }));
        });
    }

    function closeParamsWindow() {
        document.getElementById('ranking-params-overlay')?.classList.remove('is-open');
    }

    function wire(root, entries, onSelectRole) {
        const byId = new Map(entries.map(e => [e.userId, e]));

        // Linhas da lista (4º em diante): cada uma tem seu próprio container
        // de detalhe logo abaixo, identificado pelo userId.
        root.querySelectorAll('.ranking-row').forEach(row => {
            function toggle() {
                const userId = row.dataset.user;
                const detail = root.querySelector(`[data-detail="${CSS.escape(userId)}"]`);
                if (!detail) return;
                const open = !detail.hidden;
                if (open) {
                    detail.hidden = true;
                    detail.innerHTML = '';
                    destroyDetailChart(userId);
                } else {
                    detail.hidden = false;
                    renderDetail(detail, byId.get(userId));
                }
                row.classList.toggle('is-open', !open);
                row.setAttribute('aria-expanded', String(!open));
            }
            row.addEventListener('click', toggle);
            row.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
            });
        });

        // Pódio (1º a 3º): os três dividem um único container de detalhe logo
        // abaixo do pódio — só um fica aberto por vez.
        const podiumSteps = root.querySelectorAll('.podium-step');
        const podiumDetail = root.querySelector('[data-detail="__podium__"]');
        podiumSteps.forEach(step => {
            function toggle() {
                if (!podiumDetail) return;
                const userId = step.dataset.user;
                const wasOpenForMe = !podiumDetail.hidden && podiumDetail.dataset.openUser === userId;
                podiumSteps.forEach(s => { s.classList.remove('is-open'); s.setAttribute('aria-expanded', 'false'); });
                if (wasOpenForMe) {
                    podiumDetail.hidden = true;
                    podiumDetail.innerHTML = '';
                    podiumDetail.dataset.openUser = '';
                    destroyDetailChart(userId);
                } else {
                    podiumDetail.hidden = false;
                    podiumDetail.dataset.openUser = userId;
                    renderDetail(podiumDetail, byId.get(userId));
                    step.classList.add('is-open');
                    step.setAttribute('aria-expanded', 'true');
                }
            }
            step.addEventListener('click', toggle);
            step.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
            });
        });

        const loginCta = root.querySelector('#ranking-login-cta');
        if (loginCta) {
            loginCta.addEventListener('click', () => {
                closeModal();
                document.getElementById('student-account-btn')?.click();
            });
        }

        // "Ver cursos": delegado no root porque o botão só existe depois que
        // um detalhe (linha ou pódio) é expandido — renderDetail roda depois
        // deste wire().
        root.addEventListener('click', event => {
            const coursesBtn = event.target.closest('[data-see-courses]');
            if (coursesBtn) {
                event.stopPropagation();
                openCoursesWindow(byId.get(coursesBtn.dataset.seeCourses));
                return;
            }
            const paramsBtn = event.target.closest('[data-see-params]');
            if (paramsBtn) {
                event.stopPropagation();
                openParamsWindow(byId.get(paramsBtn.dataset.seeParams));
            }
        });

        // Botão "Critério de desempate": abre/fecha a legenda como popover.
        const legendToggle = root.querySelector('#ranking-legend-toggle');
        const legendPanel = root.querySelector('#ranking-legend-panel');
        if (legendToggle && legendPanel) {
            legendToggle.addEventListener('click', event => {
                event.stopPropagation();
                const open = legendPanel.hidden;
                legendPanel.hidden = !open;
                legendToggle.setAttribute('aria-expanded', String(open));
                legendToggle.classList.toggle('is-open', open);
            });
            // Handler no document: cada remontagem do painel cria um novo, então
            // ele se remove sozinho quando o elemento que observa sai do DOM.
            function onLegendOutside(event) {
                if (!legendPanel.isConnected) { document.removeEventListener('click', onLegendOutside); return; }
                if (legendPanel.hidden) return;
                if (legendPanel.contains(event.target) || legendToggle.contains(event.target)) return;
                legendPanel.hidden = true;
                legendToggle.setAttribute('aria-expanded', 'false');
                legendToggle.classList.remove('is-open');
            }
            document.addEventListener('click', onLegendOutside);
        }

        // Seletor "Ranking Geral": abre a lista de funções e devolve a escolha
        // a renderInto, que remonta o painel com o recorte novo.
        const scopeToggle = root.querySelector('#ranking-scope-toggle');
        const scopePanel = root.querySelector('#ranking-scope-panel');
        if (scopeToggle && scopePanel) {
            function closeScope() {
                scopePanel.hidden = true;
                scopeToggle.setAttribute('aria-expanded', 'false');
                scopeToggle.classList.remove('is-open');
            }
            scopeToggle.addEventListener('click', event => {
                event.stopPropagation();
                const open = scopePanel.hidden;
                scopePanel.hidden = !open;
                scopeToggle.setAttribute('aria-expanded', String(open));
                scopeToggle.classList.toggle('is-open', open);
            });
            scopePanel.addEventListener('click', event => {
                const option = event.target.closest('.ranking-scope-option');
                if (!option) return;
                event.stopPropagation();
                closeScope();
                onSelectRole?.(option.dataset.role || '');
            });
            function onScopeOutside(event) {
                if (!scopePanel.isConnected) { document.removeEventListener('click', onScopeOutside); return; }
                if (scopePanel.hidden) return;
                if (scopePanel.contains(event.target) || scopeToggle.contains(event.target)) return;
                closeScope();
            }
            document.addEventListener('click', onScopeOutside);
            root.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !scopePanel.hidden) { event.stopPropagation(); closeScope(); }
            });
        }
    }

    function loadingHtml() {
        return `
            <div class="ranking-panel is-loading">
                <div class="ranking-head">
                    <div class="ranking-head-icon"><i class="fas fa-trophy"></i></div>
                    <div><h2>Ranking</h2><p>Carregando classificação…</p></div>
                </div>
                <div class="ranking-skeleton">
                    <span></span><span></span><span></span><span></span><span></span>
                </div>
            </div>`;
    }

    function errorHtml() {
        return `
            <div class="ranking-panel">
                <div class="ranking-empty is-error">
                    <i class="fas fa-triangle-exclamation"></i>
                    <h3>Não foi possível carregar o ranking</h3>
                    <p>Verifique sua conexão e tente novamente.</p>
                    <button type="button" class="ranking-you-cta" data-ranking-retry>
                        <i class="fas fa-rotate-right"></i> Tentar de novo
                    </button>
                </div>
            </div>`;
    }

    /* ─── API ─── */

    async function renderInto(container, options = {}) {
        if (!container) return;
        const slug = options.slug || currentSlug();
        if (!isEnabledFor(slug)) { container.innerHTML = ''; return; }

        // Trocar o innerHTML não avisa o Chart.js: sem destruir antes, cada
        // remontagem deixa um gráfico órfão preso ao canvas que sumiu.
        Object.keys(detailCharts).forEach(destroyDetailChart);

        container.classList.add('ranking-host');
        container.classList.toggle('is-inline', options.mode === 'inline');
        container.innerHTML = loadingHtml();

        try {
            const { entries } = await loadData(slug);
            const session = U.StudentAuth?.getSession?.() || null;

            // Trocar a função remonta o painel a partir dos MESMOS dados já
            // carregados — o recorte é visual, não uma consulta nova.
            let roleKey = options.roleKey || '';
            function paint() {
                container.innerHTML = panelHtml(entries, slug, session, roleKey);
                wire(container, entries, next => {
                    if (next === roleKey) return;
                    roleKey = next;
                    Object.keys(detailCharts).forEach(destroyDetailChart);
                    paint();
                });
                animateCounters(container);
                animateBars(container);
            }
            paint();
        } catch (error) {
            console.error('Erro ao montar o ranking:', error);
            container.innerHTML = errorHtml();
            container.querySelector('[data-ranking-retry]')?.addEventListener('click', () => renderInto(container, options));
        }
    }

    function closeModal() {
        const modal = document.getElementById('ranking-modal');
        if (modal) modal.style.display = 'none';
        Object.keys(detailCharts).forEach(destroyDetailChart);
    }

    function open() {
        const modal = document.getElementById('ranking-modal');
        const body = document.getElementById('ranking-modal-body');
        if (!modal || !body) return;
        // display:flex antes de renderizar: o Chart.js do detalhe só mede certo
        // com o container já visível.
        modal.style.display = 'flex';
        renderInto(body, { mode: 'modal' });
    }

    /* ─── Boot ─── */

    document.addEventListener('DOMContentLoaded', () => {
        const slug = currentSlug();
        const button = document.getElementById('ranking-btn');

        if (!isEnabledFor(slug)) {
            if (button) button.style.display = 'none';
            return;
        }

        button?.addEventListener('click', open);

        const modal = document.getElementById('ranking-modal');
        document.getElementById('ranking-modal-close')?.addEventListener('click', closeModal);
        modal?.addEventListener('click', event => { if (event.target === modal) closeModal(); });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && modal && modal.style.display === 'flex') closeModal();
        });
    });

    // Uma conclusão de curso muda o ranking na hora; o cache do histórico já é
    // derrubado por esse mesmo evento (js/admin-history.js:600).
    document.addEventListener('uniadmin:results-changed', () => {
        const inline = document.getElementById('welcome-ranking');
        if (inline && inline.innerHTML && inline.closest('#welcome-screen')?.style.display !== 'none') {
            renderInto(inline, { mode: 'inline' });
        }
        const modal = document.getElementById('ranking-modal');
        if (modal && modal.style.display === 'flex') {
            renderInto(document.getElementById('ranking-modal-body'), { mode: 'modal' });
        }
    });

    U.Ranking = { open, closeModal, renderInto, isEnabledFor, compareEntries, aggregate, buildRoleCourseCounts, roleMatches, roleBase };
})();

window.UniAdmin = UniAdmin;
