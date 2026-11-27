        let trainingData = {};
        let quizData = {};
        let orderData = {};
        let quizStatus = {};

        // Formata nota com 1 casa decimal (vírgula), ex.: 8,2/10
        function formatScore(score) {
            const n = Number(score);
            if (!Number.isFinite(n)) return score;
            return n.toFixed(1).replace('.', ',');
        }

        // Categoria escolhida na home (index.html). Sem escolha, cai em Treinamentos.
        const CATEGORY_PATHS = {
            'Treinamentos': 'treinamentos',
            'Educação Continuada': 'educacao_continuada',
            'Estágios': 'estagios'
        };

        function resolveCategory() {
            const fromQuery = new URLSearchParams(location.search).get('cat');
            let stored = null;
            try { stored = localStorage.getItem('uniadmin.category'); } catch (error) { /* indisponível */ }
            const category = fromQuery || stored;
            return CATEGORY_PATHS[category] ? category : 'Treinamentos';
        }

        const currentCategory = resolveCategory();
        const currentCategorySlug = CATEGORY_PATHS[currentCategory];

        function sortItems(items, orderConfig, itemKey = 'id') {
            if (!orderConfig || !Array.isArray(orderConfig)) {
                return items.map((item, index) => ({
                    key: itemKey === 'index' ? index : item[itemKey] || index,
                    item,
                    order: index
                }));
            }
            const orderMap = new Map();
            orderConfig.forEach((orderItem, index) => {
                if (typeof orderItem === 'object' && orderItem.id !== undefined) {
                    orderMap.set(String(orderItem.id), orderItem.order || index);
                } else {
                    orderMap.set(String(orderItem), index);
                }
            });
            return items.map((item, index) => {
                const key = itemKey === 'index' ? index : (item[itemKey] || index);
                return {
                    key,
                    item,
                    order: orderMap.has(String(key)) ? orderMap.get(String(key)) : Infinity
                };
            }).sort((a, b) => a.order - b.order);
        }

        // Endpoint REST do Realtime Database — usado no carregamento dos cursos
        // e na gravação de saída da página via sendBeacon (flushProgressBeacon),
        // que não pode passar pelo SDK. Os caminhos montados por
        // progressPathFor já começam com "/", então a base não leva barra final.
        const PROGRESS_REST_BASE = (window.UniAdmin && window.UniAdmin.REST_BASE) || 'https://applamic-default-rtdb.firebaseio.com';
        // As regras exigem a sessão do Dados LAMIC também nas chamadas REST.
        const restAuthQuery = (sep) => { const q = window.UniAdmin?.restAuth?.(); return q ? sep + q : ''; };

        let initialContentLoaded = false;
        let stopContentLive = null;

        // A tela de boas-vindas vira o ranking assim que o conteúdo carrega.
        // O texto "Selecione um tema para começar" continua servindo Estágios
        // (sem ranking) e o caso de o módulo não ter carregado.
        function showWelcomeRanking() {
            const host = document.getElementById('welcome-ranking');
            const fallback = document.getElementById('welcome-fallback');
            const Ranking = window.UniAdmin?.Ranking;
            if (!host || !Ranking || !Ranking.isEnabledFor(currentCategorySlug)) return;
            if (fallback) fallback.style.display = 'none';
            document.getElementById('welcome-screen')?.classList.add('has-ranking');
            Ranking.renderInto(host, { mode: 'inline', slug: currentCategorySlug });
        }

        function applyCategoryContent(payload) {
            // Categoria ainda sem conteudo no banco: o Firebase devolve null.
            const data = payload || {};
            orderData = data.order || {};
            quizData = data.quizData || {};
            quizStatus = data.quizStatus || {};
            trainingData = data.trainingData || {};
            // Publicado para js/ranking.js, que precisa dos `roles` de cada
            // assunto para saber quantos cursos cada função deveria ter feito.
            if (window.UniAdmin) window.UniAdmin.portalTrainingData = trainingData;
        }

        // Redesenha o que já está na tela depois de uma alteração publicada
        // pelo administrador. A galeria pode ser refeita à vontade; um curso
        // aberto, não — arrancar o vídeo ou a avaliação de quem está no meio
        // dela para mostrar conteúdo novo troca um problema por outro pior. Os
        // dados novos já estão em memória e valem na próxima navegação.
        function refreshOpenContent() {
            const quizOpen = quizContainer && quizContainer.style.display !== 'none';
            const courseOpen = contentDiv && contentDiv.style.display !== 'none';
            if (quizOpen || courseOpen) return;
            if (courseGallery && courseGallery.style.display !== 'none' && currentTrainingId) {
                showCourseGallery(currentTrainingId);
            }
        }

        // Escuta ao vivo em vez de leitura única.
        //
        // Com a leitura única, o portal servia pelo resto da sessão o conteúdo
        // do instante em que a página abriu: um curso publicado, corrigido ou
        // desativado no painel só aparecia para quem recarregasse. Aluno com a
        // aba aberta o dia todo fazia avaliação de uma versão que já não era a
        // vigente. Agora cada alteração chega sozinha.
        function fetchFirebaseData() {
            const U = window.UniAdmin;
            const path = `/uniadmin/${currentCategorySlug}`;

            function finishInitialLoad() {
                document.getElementById('loading-overlay').style.display = 'none';
                if (initialContentLoaded) return;
                initialContentLoaded = true;
                // Progressão é lida uma vez por sessão: ela reflete o que o
                // aluno fez, não o que o administrador publicou, e reaplicá-la
                // a cada evento sobrescreveria o avanço da tela atual.
                loadProgression();
                showWelcomeRanking();
                openCourseFromQuery();
                document.dispatchEvent(new CustomEvent('uniadmin:cursos-prontos'));
            }

            // Link direto vindo do Portal LAMIC (vínculo de aviso): ?tema=<id>&curso=<id>.
            // Abre a galeria do tema e, se o curso existir e estiver ativo, o próprio curso.
            function openCourseFromQuery() {
                const query = new URLSearchParams(location.search);
                const subjectId = query.get('tema');
                const themeId = query.get('curso');
                const subject = subjectId && trainingData[subjectId];
                if (!subject || !subject.name) return;
                setSubjectLabel(subject.name);
                showCourseGallery(subjectId);
                const theme = themeId && subject.themes ? subject.themes[themeId] : null;
                if (theme && theme.name && theme.active !== false && themeVisibleForSession(theme)) {
                    openCourse(subjectId, themeId, theme.name);
                }
            }

            // Sem o SDK (ex.: página aberta de um contexto onde firebase-config
            // não carregou), o caminho REST antigo ainda serve o primeiro paint.
            if (!U || !U.live) {
                fetch(`${PROGRESS_REST_BASE}/uniadmin/${currentCategorySlug}.json${restAuthQuery('?')}`)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                        return response.json();
                    })
                    .then(payload => { applyCategoryContent(payload); populateDropdown(); finishInitialLoad(); })
                    .catch(error => {
                        console.error('Erro ao carregar dados do Firebase:', error);
                        showWarning('Não foi possível carregar os dados. Tente novamente.');
                        document.getElementById('loading-overlay').style.display = 'none';
                    });
                return;
            }

            if (stopContentLive) stopContentLive();
            stopContentLive = U.live(path, snapshot => {
                applyCategoryContent(snapshot.exists() ? snapshot.val() : {});
                populateDropdown();
                const wasFirst = !initialContentLoaded;
                finishInitialLoad();
                if (!wasFirst) refreshOpenContent();
            }, error => {
                console.error('Erro ao carregar dados do Firebase:', error);
                showWarning('Não foi possível carregar os dados. Tente novamente.');
                document.getElementById('loading-overlay').style.display = 'none';
            });
        }

        const btn = document.getElementById('dropdownBtn');
        const dropdownContent = document.getElementById('dropdownContent');
        const dropdownList = document.getElementById('dropdownList');
        const themeBtn = document.getElementById('themeBtn');
        const themeDropdown = document.getElementById('themeDropdown');
        const backToCoursesBtn = document.getElementById('back-to-courses');
        const selectionDivider = document.getElementById('selection-divider');
        const courseGallery = document.getElementById('course-gallery');
        const courseGrid = document.getElementById('course-grid');
        const galleryEmpty = document.getElementById('gallery-empty');
        const galleryFilter = document.getElementById('gallery-filter');
        const gallerySub = document.getElementById('gallery-sub');
        const galleryTitle = document.getElementById('gallery-title');
        const contentDiv = document.getElementById('content');
        const video = document.getElementById('video');
        const customPlayerContainer = document.getElementById('custom-player');
        const ytFrameContainer = document.getElementById('yt-frame');
        const playPauseBtn = document.getElementById('play-pause-btn');
        const muteBtn = document.getElementById('mute-btn');
        const progressRange = document.getElementById('progress-range');
        const volumeRange = document.getElementById('volume-range');
        const speedSelect = document.getElementById('speed-select');
        const timeLabels = document.getElementById('time-labels');
        const pdfContainer = document.getElementById('pdf-container');
        const pdfCanvas = document.getElementById('pdf-canvas');
        const pdfNavigation = document.getElementById('pdf-navigation');
        const titleEl = document.getElementById('title');
        const captionEl = document.getElementById('caption');
        const attachmentContainer = document.getElementById('attachment-container');
        const modulesDiv = document.getElementById('modules');
        const playerCard = document.querySelector('.player-card');
        const shortsStage = document.getElementById('shorts-stage');
        const shortsViewport = document.getElementById('shorts-viewport');
        const shortsSegmentsEl = document.getElementById('shorts-segments');
        const shortsCounterEl = document.getElementById('shorts-counter');
        const shortsHintEl = document.getElementById('shorts-hint');
        const shortsAutonextEl = document.getElementById('shorts-autonext');
        const shortsPrevBtn = document.getElementById('shorts-prev');
        const shortsNextBtn = document.getElementById('shorts-next');
        const shortsTotalEl = document.getElementById('shorts-total');
        const shortsTotalCountEl = document.getElementById('shorts-total-count');
        const shortsTotalPctEl = document.getElementById('shorts-total-pct');
        const shortsTotalFillEl = document.getElementById('shorts-total-fill');
        const quizContainer = document.getElementById('quiz-container');
        const resultContainer = document.getElementById('result-container');
        const formContainer = document.getElementById('form-container');
        const warningMessage = document.getElementById('warning-message');
        const warningText = document.getElementById('warning-text');
        const quizSubmit = document.createElement('button');
        quizSubmit.id = 'quiz-submit';
        quizSubmit.textContent = 'Enviar Avaliação';

        let currentTrainingId = null;
        let currentThemeId = null;
        let selectedAnswers = {};
        let pdfDoc = null;
        let currentPage = 1;
        let totalPages = 0;
        let ytPlayer = null;
        let progressTimer = null;
        let currentModuleIndex = null;
        let moduleIndexMapping = new Map();
        const completionStatus = {};
        let currentVideoId = null;
        let assessmentResults = {};

        // Cache do startedAt já gravado na nuvem por curso (subjectId/themeId)
        // — precisa ser preservado entre syncs (não sobrescrito), pois é a
        // referência usada no gráfico "Tempo para Conclusão" do dashboard.
        let remoteProgressStartedAt = {};

        // Cache do tempo ativo já acumulado e gravado na nuvem por curso
        // (subjectId/themeId), em ms — igual ao startedAt acima, preservado
        // entre syncs e somado à sessão em andamento (ver activeCourseTimer).
        let remoteProgressActiveMs = {};

        // ─── Persistência local do tempo ativo ───
        // A sincronização em nuvem (progress/byUser) exige conta logada, então
        // em Estágios — e em qualquer visita sem sessão — o acumulado só vivia
        // em memória e voltava a zero ao recarregar a página. O mesmo
        // localStorage que já guarda completionStatus/assessmentResults guarda
        // o contador, por categoria (o par subjectId/themeId se repete entre
        // categorias e misturá-las somaria tempo de cursos diferentes).
        const ACTIVE_MS_STORAGE_KEY = `uniadmin.activeMs.${currentCategorySlug}`;

        // Só quando não há gravação em nuvem para o caso (Estágios, ou visita
        // sem conta): com conta logada a nuvem continua sendo a única fonte,
        // para que o "Resetar curso" do administrador — que apaga o nó em
        // progress/byUser — continue zerando o contador do aluno.
        function usesLocalActiveMs() {
            return !isProgressSyncEligible();
        }

        function loadLocalActiveMs() {
            if (!usesLocalActiveMs()) return;
            let saved = null;
            try { saved = JSON.parse(localStorage.getItem(ACTIVE_MS_STORAGE_KEY) || 'null'); }
            catch (error) { /* indisponível ou corrompido */ }
            if (!saved || typeof saved !== 'object') return;
            Object.keys(saved).forEach(subjectId => {
                const themes = saved[subjectId];
                if (!themes || typeof themes !== 'object') return;
                Object.keys(themes).forEach(themeId => {
                    const ms = Number(themes[themeId]);
                    if (!Number.isFinite(ms) || ms < 0) return;
                    if (!remoteProgressActiveMs[subjectId]) remoteProgressActiveMs[subjectId] = {};
                    remoteProgressActiveMs[subjectId][themeId] = ms;
                });
            });
        }

        function saveLocalActiveMs() {
            if (!usesLocalActiveMs()) return;
            try { localStorage.setItem(ACTIVE_MS_STORAGE_KEY, JSON.stringify(remoteProgressActiveMs)); }
            catch (error) { /* storage cheio/bloqueado */ }
        }

        // Soma tempo ao acumulado do curso e o persiste na mesma operação —
        // todo ponto que faz a soma precisa das duas coisas, e separá-las era
        // o que deixava o contador escapar da gravação local.
        function addActiveMs(subjectId, themeId, elapsed) {
            if (!remoteProgressActiveMs[subjectId]) remoteProgressActiveMs[subjectId] = {};
            remoteProgressActiveMs[subjectId][themeId] = (remoteProgressActiveMs[subjectId][themeId] || 0) + elapsed;
            saveLocalActiveMs();
        }

        // "Contador oculto" do tempo com o curso aberto: soma só o tempo em
        // que a aba está visível com o curso carregado (loadTraining) — pausa
        // ao trocar de curso, sair para a galeria, trocar de aba/minimizar ou
        // fechar a página, e retoma na próxima abertura. Finaliza (para de
        // vez) quando a avaliação é aprovada. Guiado por timestamp real do
        // início da sessão corrente, não por contador incremental, para não
        // perder tempo em caso de recarregar a página no meio de uma sessão.
        let activeCourseTimer = { subjectId: null, themeId: null, sessionStartedAt: null };

        // Cursos já aprovados nesta carga da página — o contador não volta a
        // rodar neles (aluno pode reabrir só para revisar). Só isso trava a
        // recontagem: antes ela dependia de reler assessmentResults com a nota
        // de corte 8 repetida aqui, que saía de sincronia com a regra real da
        // avaliação se o corte mudasse.
        const finishedCourseTimers = new Set();
        const courseTimerKey = (subjectId, themeId) => `${subjectId}_${themeId}`;

        // Nota mínima de aprovação — mesma regra exibida na intro da avaliação
        // (ver loadQuiz) e usada para decidir se o contador já foi encerrado.
        // Varia por categoria (Estágios aprova com 7). Lida sob demanda porque
        // este arquivo é carregado antes de js/firebase-config.js.
        function getPassingScore() {
            return window.UniAdmin?.getPassingScore?.(currentCategory) ?? 8;
        }

        // Trava por vídeo: em módulo de vídeo o tempo só corre com o vídeo
        // tocando (deixar a aula aberta sem assistir não conta). Em módulo sem
        // vídeo (PDF/slide) não há como medir consumo, então a contagem é
        // livre enquanto a aba estiver visível.
        // 'free'    — módulo sem vídeo, conta livremente.
        // 'playing' — módulo de vídeo com o vídeo rodando, conta.
        // 'waiting' — módulo de vídeo parado/pausado, NÃO conta.
        let moduleTimerGate = 'free';

        // Tipo do módulo aberto: 'video' | 'pdf' | 'shorts'. Muda o texto do
        // painel de tempo quando a trava está ativa — no PDF a trava é a
        // página 1; no vídeo (longo ou curto) é o play.
        let currentModuleKind = 'video';

        // Módulos criados antes do campo `type` não o têm: a inferência
        // abaixo repete a regra que já valia na prática (pdfUrl ganhava de
        // videoId). O mesmo helper existe em js/admin.js — os dois arquivos
        // não compartilham escopo.
        function moduleKind(mod) {
            if (mod?.type === 'video' || mod?.type === 'pdf' || mod?.type === 'shorts' || mod?.type === 'quiz') return mod.type;
            if (Array.isArray(mod?.questions) && mod.questions.length) return 'quiz';
            if (Array.isArray(mod?.shorts) && mod.shorts.length) return 'shorts';
            if (mod?.pdfUrl) return 'pdf';
            return 'video';
        }

        function shortsCountOf(mod) {
            return moduleKind(mod) === 'shorts' && Array.isArray(mod?.shorts) ? mod.shorts.length : 0;
        }

        // Trava por inatividade: 5 min sem interação de estudo param a
        // contagem. Contam como estudo o play do vídeo, a virada de página do
        // PDF e, no módulo de quiz, responder ou trocar de card. Fica separada
        // de moduleTimerGate porque as duas travas somam — o tempo só corre com
        // o gate liberado E sem inatividade. Só essas interações soltam a
        // trava: mexer o mouse ou voltar para a aba não conta como estudo.
        const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
        let idlePaused = false;
        let idleTimer = null;

        function clearIdleTimer() {
            if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        }

        // Rearma a contagem regressiva de inatividade. Só faz sentido com uma
        // sessão aberta — sem sessão não há o que pausar, e o próximo evento de
        // estudo rearma de qualquer forma.
        function armIdleTimer() {
            clearIdleTimer();
            if (!activeCourseTimer.sessionStartedAt) return;
            idleTimer = setTimeout(onIdleTimeout, IDLE_TIMEOUT_MS);
        }

        // Estourou o tempo ocioso: fecha a sessão (o tempo já corrido é somado)
        // e pausa o vídeo, para o aluno não seguir "assistindo" sem contar.
        function onIdleTimeout() {
            idleTimer = null;
            if (!activeCourseTimer.sessionStartedAt) return;
            idlePaused = true;
            pauseVideoIfPlaying();
            pauseActiveCourseTimer();
            paintExpectedTimePanel();
        }

        // Chamado pelas interações que caracterizam estudo ativo: play do vídeo
        // e troca de página do PDF. Solta a trava de inatividade e retoma a
        // sessão (respeitando a trava de vídeo, que segue valendo).
        function registerStudyActivity() {
            const wasIdle = idlePaused;
            idlePaused = false;
            if (wasIdle && currentTrainingId && currentThemeId != null) {
                resumeActiveCourseTimer(currentTrainingId, currentThemeId);
            }
            armIdleTimer();
        }

        function setModuleTimerGate(gate) {
            if (moduleTimerGate === gate) return;
            moduleTimerGate = gate;
            if (gate === 'waiting') {
                // Fecha a sessão somando o que já correu, sem esquecer o curso
                // — o play retoma de onde parou.
                pauseActiveCourseTimer();
            } else if (currentTrainingId && currentThemeId != null) {
                resumeActiveCourseTimer(currentTrainingId, currentThemeId);
            }
            paintExpectedTimePanel();
        }

        // Grava o parcial da sessão em andamento sem fechá-la: o tempo até
        // agora entra no acumulado e o marco da sessão anda para frente, então
        // nada é contado duas vezes. Usado pelo autosave periódico, que evita
        // perder uma sessão longa inteira em queda de conexão/crash.
        function flushActiveCourseTimer() {
            const { subjectId, themeId, sessionStartedAt } = activeCourseTimer;
            if (!subjectId || !themeId || !sessionStartedAt) return;
            const now = Date.now();
            const elapsed = now - sessionStartedAt;
            if (elapsed <= 0) return;
            activeCourseTimer.sessionStartedAt = now;
            addActiveMs(subjectId, themeId, elapsed);
            syncCourseProgressToCloud(subjectId, themeId);
        }

        // Autosave a cada minuto enquanto há sessão aberta. Só roda com a aba
        // visível (aba escondida já pausou o contador via visibilitychange, e
        // o navegador estrangula timers em segundo plano de qualquer forma).
        const ACTIVE_TIMER_AUTOSAVE_MS = 60000;
        setInterval(() => {
            if (document.hidden) return;
            flushActiveCourseTimer();
        }, ACTIVE_TIMER_AUTOSAVE_MS);

        // ─── Painel "Tempo mínimo projetado" (sidebar do curso) ───
        // Espelha o contador de tempo ativo: barra de progresso contra o
        // expectedCompletionMs do curso e cronômetro que segue correndo mesmo
        // depois de 100% (o objetivo é registrar dedicação real, não parar no
        // alvo). Só aparece em curso com tempo esperado configurado.
        const expectedTimeCard = document.getElementById('expected-time-card');
        const expectedTimeTargetEl = document.getElementById('expected-time-target');
        const expectedTimeElapsedEl = document.getElementById('expected-time-elapsed');
        const expectedTimePctEl = document.getElementById('expected-time-pct');
        const expectedTimeFillEl = document.getElementById('expected-time-fill');
        const expectedTimeNoteEl = document.getElementById('expected-time-note');
        let expectedTimeTicker = null;

        function formatElapsedHHMMSS(ms) {
            const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000));
            const pad = v => String(v).padStart(2, '0');
            return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
        }

        // Tempo total do curso agora: o que já foi gravado na nuvem mais a
        // sessão em andamento (que ainda não foi somada ao acumulado).
        function currentActiveMsOf(subjectId, themeId) {
            const stored = remoteProgressActiveMs[subjectId]?.[themeId] || 0;
            const isRunning = activeCourseTimer.subjectId === subjectId
                && activeCourseTimer.themeId === themeId
                && activeCourseTimer.sessionStartedAt;
            return isRunning ? stored + (Date.now() - activeCourseTimer.sessionStartedAt) : stored;
        }

        function expectedMsOfCourse(subjectId, themeId) {
            const ms = Number(trainingData[subjectId]?.themes?.[themeId]?.expectedCompletionMs);
            return Number.isFinite(ms) && ms > 0 ? ms : null;
        }

        function paintExpectedTimePanel() {
            if (!expectedTimeCard) return;
            const subjectId = currentTrainingId;
            const themeId = currentThemeId;
            const expectedMs = (subjectId && themeId != null) ? expectedMsOfCourse(subjectId, themeId) : null;
            if (!expectedMs) { expectedTimeCard.style.display = 'none'; return; }

            expectedTimeCard.style.display = '';
            const elapsedMs = currentActiveMsOf(subjectId, themeId);
            const rawPct = (elapsedMs / expectedMs) * 100;
            const isComplete = rawPct >= 100;

            expectedTimeTargetEl.textContent = `Meta ${formatElapsedHHMMSS(expectedMs)}`;
            expectedTimeElapsedEl.textContent = formatElapsedHHMMSS(elapsedMs);
            // O texto passa de 100% (mostra a dedicação real), mas a barra
            // satura em 100% para não transbordar do trilho.
            expectedTimePctEl.textContent = `${Math.floor(rawPct)}%`;
            expectedTimeFillEl.style.width = `${Math.min(100, rawPct)}%`;
            expectedTimeCard.classList.toggle('is-complete', isComplete);

            const finished = isCourseTimerFinished(subjectId, themeId);
            const running = !!activeCourseTimer.sessionStartedAt
                && activeCourseTimer.subjectId === subjectId
                && activeCourseTimer.themeId === themeId;
            expectedTimeCard.classList.toggle('is-paused', !running);

            // Ícone + texto explicando por que está (ou não) contando. O ícone
            // de pausa é o sinal mais rápido de "seu tempo não está correndo".
            let icon, note;
            if (finished) {
                icon = 'fa-circle-check';
                note = 'Curso concluído — contagem encerrada.';
            } else if (!running && idlePaused) {
                icon = 'fa-circle-pause';
                note = 'Pausado por inatividade — dê play no vídeo ou passe uma página para retomar.';
            } else if (!running && moduleTimerGate === 'waiting') {
                // Caso mais comum da trava por vídeo: aula aberta, vídeo parado.
                // No PDF a trava equivalente é a capa (página 1).
                icon = 'fa-circle-pause';
                note = currentModuleKind === 'pdf'
                    ? 'Pausado — avance para a página 2 para contar o tempo.'
                    : currentModuleKind === 'shorts'
                        ? 'Pausado — dê play no vídeo curto para contar o tempo.'
                        : 'Pausado — dê play no vídeo para contar o tempo.';
            } else if (!running) {
                icon = 'fa-circle-pause';
                note = 'Pausado — a contagem volta ao retomar o curso.';
            } else if (isComplete) {
                icon = 'fa-circle-play';
                note = 'Tempo projetado atingido — a contagem continua.';
            } else {
                icon = 'fa-circle-play';
                note = 'Contando o tempo de estudo.';
            }
            expectedTimeNoteEl.innerHTML = `<i class="fas ${icon}"></i> ${note}`;
        }

        // Tick de 1s só para a interface — o valor real vem sempre de
        // timestamps (currentActiveMsOf), então um tick perdido com a aba em
        // segundo plano não desalinha a contagem.
        function startExpectedTimeTicker() {
            if (expectedTimeTicker) return;
            expectedTimeTicker = setInterval(paintExpectedTimePanel, 1000);
        }

        function stopExpectedTimeTicker() {
            if (!expectedTimeTicker) return;
            clearInterval(expectedTimeTicker);
            expectedTimeTicker = null;
        }

        function hideExpectedTimePanel() {
            stopExpectedTimeTicker();
            if (expectedTimeCard) expectedTimeCard.style.display = 'none';
        }

        // Fecha a sessão corrente (se houver) somando o tempo decorrido ao
        // acumulado em nuvem e sincronizando. Chamado ao trocar de curso, sair
        // para a galeria, esconder a aba ou aprovar na avaliação. `forget`
        // limpa subjectId/themeId do timer (usado ao sair para a galeria) —
        // sem isso, um simples minimizar/restaurar a aba na galeria faria o
        // visibilitychange achar que ainda há curso aberto e retomar a conta.
        function pauseActiveCourseTimer(forget = false) {
            clearIdleTimer();
            const { subjectId, themeId, sessionStartedAt } = activeCourseTimer;
            if (forget) { activeCourseTimer = { subjectId: null, themeId: null, sessionStartedAt: null }; }
            if (!subjectId || !themeId || !sessionStartedAt) { paintExpectedTimePanel(); return; }
            const elapsed = Date.now() - sessionStartedAt;
            if (!forget) activeCourseTimer.sessionStartedAt = null;
            if (elapsed <= 0) { paintExpectedTimePanel(); return; }
            addActiveMs(subjectId, themeId, elapsed);
            // Args explícitos: currentTrainingId/currentThemeId podem já
            // apontar para outro curso neste momento (ex.: loadTraining seta
            // o novo curso antes de pausar o anterior via resumeActiveCourseTimer).
            syncCourseProgressToCloud(subjectId, themeId);
            // Repinta já com o acumulado atualizado — o cronômetro precisa
            // congelar no valor certo ao pausar, sem esperar o próximo tick.
            paintExpectedTimePanel();
        }

        // Abre (ou retoma) a sessão do curso informado — chamado sempre que um
        // módulo é carregado dentro dele. Se já havia sessão ativa para outro
        // curso, fecha antes. Não reabre se o curso já foi aprovado (contador
        // final, não deve voltar a contar).
        function resumeActiveCourseTimer(subjectId, themeId) {
            if (activeCourseTimer.subjectId === subjectId && activeCourseTimer.themeId === themeId && activeCourseTimer.sessionStartedAt) return;
            pauseActiveCourseTimer();
            if (isCourseTimerFinished(subjectId, themeId)) { paintExpectedTimePanel(); return; }
            // Vídeo parado segura a contagem: o timer fica "armado" no curso
            // (subjectId/themeId setados) mas sem sessão aberta, então o play
            // é o que efetivamente inicia a contagem.
            // Idem para a trava de inatividade: timer armado no curso, mas sem
            // sessão até a próxima interação de estudo (ver registerStudyActivity).
            if (moduleTimerGate === 'waiting' || idlePaused) {
                activeCourseTimer = { subjectId, themeId, sessionStartedAt: null };
                paintExpectedTimePanel();
                return;
            }
            activeCourseTimer = { subjectId, themeId, sessionStartedAt: Date.now() };
            armIdleTimer();
            paintExpectedTimePanel();
        }

        // Curso já aprovado (nesta sessão ou em qualquer uma anterior, via
        // assessmentResults sincronizado da nuvem) não volta a contar.
        function isCourseTimerFinished(subjectId, themeId) {
            if (finishedCourseTimers.has(courseTimerKey(subjectId, themeId))) return true;
            const score = assessmentResults[subjectId]?.[themeId];
            return score !== undefined && score !== null && score >= getPassingScore();
        }

        // Encerra de vez o contador do curso aprovado — soma a sessão corrente
        // e impede que ele volte a contar (aluno pode reabrir o curso depois
        // só para revisar módulos, isso não deve inflar o tempo registrado).
        function finishActiveCourseTimer(subjectId, themeId) {
            finishedCourseTimers.add(courseTimerKey(subjectId, themeId));
            if (activeCourseTimer.subjectId === subjectId && activeCourseTimer.themeId === themeId) {
                // `forget` limpa subjectId/themeId: sem isso o visibilitychange
                // ao restaurar a aba reabriria a sessão do curso recém-aprovado.
                pauseActiveCourseTimer(true);
            }
            // Congela o painel no total final, com a nota de encerrado.
            stopExpectedTimeTicker();
            paintExpectedTimePanel();
        }

        // Pausa o vídeo se ele estiver rodando — usado ao minimizar/trocar de
        // aba, para o aluno não "assistir" com a página escondida (o YouTube
        // continua tocando o áudio em segundo plano). Silencioso quando não há
        // player ou a API ainda não carregou.
        function pauseVideoIfPlaying() {
            // Os curtos têm player próprio (só o atual), fora de ytPlayer:
            // precisam ser pausados antes do early return abaixo.
            pauseShortsIfPlaying();
            if (!ytPlayer || typeof ytPlayer.getPlayerState !== 'function') return;
            const YT_STATE = window.YT?.PlayerState;
            if (!YT_STATE) return;
            let state;
            // getPlayerState lança se o iframe já foi destruído no meio de uma
            // troca de módulo — nesse caso não há vídeo a pausar.
            try { state = ytPlayer.getPlayerState(); } catch { return; }
            // BUFFERING entra junto: o vídeo está em reprodução, só carregando.
            if (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING) {
                try { ytPlayer.pauseVideo(); } catch { /* player indisponível */ }
            }
        }

        document.addEventListener('visibilitychange', () => {
            // Pausar o vídeo dispara onPlayerStateChange → gate 'waiting', que
            // já fecha a sessão do contador. O pause explícito abaixo continua
            // necessário para módulos sem vídeo (contagem livre).
            if (document.hidden) {
                pauseVideoIfPlaying();
                pauseActiveCourseTimer();
            } else if (activeCourseTimer.subjectId && activeCourseTimer.themeId && !activeCourseTimer.sessionStartedAt) {
                resumeActiveCourseTimer(activeCourseTimer.subjectId, activeCourseTimer.themeId);
            }
            paintExpectedTimePanel();
        });
        // Saída da página: tenta o sendBeacon primeiro (única forma de a
        // gravação sobreviver ao fechamento da aba). Se ele não estiver
        // disponível ou não houver sessão aberta, cai no pause normal.
        function flushOnPageExit() {
            if (!flushProgressBeacon()) pauseActiveCourseTimer();
        }
        window.addEventListener('beforeunload', flushOnPageExit);
        window.addEventListener('pagehide', flushOnPageExit);

        function loadProgression() {
            const savedCompletion = localStorage.getItem('completionStatus');
            const savedAssessments = localStorage.getItem('assessmentResults');
            if (savedCompletion) Object.assign(completionStatus, JSON.parse(savedCompletion));
            if (savedAssessments) Object.assign(assessmentResults, JSON.parse(savedAssessments));
            loadLocalActiveMs();
            loadRemoteProgression();
        }

        function saveProgression() {
            localStorage.setItem('completionStatus', JSON.stringify(completionStatus));
            localStorage.setItem('assessmentResults', JSON.stringify(assessmentResults));
            saveLocalActiveMs();
            syncCourseProgressToCloud();
        }

        // Progressão do curso (% de módulos assistidos) associada à conta do
        // aluno logado, exceto em Estágios (fluxo sem conta, nome livre).
        // Grava em uniadmin/progress/byUser — irmão de results/byUser/byCourse
        // (mesmo padrão de fan-out), assim aparece tanto no Perfil quanto em
        // Configurações > Usuários mesmo trocando de navegador/dispositivo.
        function isProgressSyncEligible() {
            return currentCategory !== 'Estágios' && !!window.UniAdmin?.StudentAuth?.getSession();
        }

        function progressPathFor(userId) {
            const U = window.UniAdmin;
            return `/${U.dbRoot}/progress/byUser/${userId}/${currentCategorySlug}`;
        }

        // Sincroniza só o curso informado (por padrão, o atualmente aberto) —
        // evita reescrever a árvore inteira a cada módulo concluído. Aceita
        // subjectId/themeId explícitos porque pauseActiveCourseTimer pode
        // precisar sincronizar um curso que acabou de deixar de ser o atual
        // (ex.: trocando de curso ou saindo para a galeria).
        // Monta o registro de progressão a gravar e o caminho no banco, sem
        // enviar nada — separado de syncCourseProgressToCloud porque a
        // gravação de saída da página (sendBeacon, ver flushProgressBeacon)
        // precisa do mesmo payload por outro transporte.
        function buildCourseProgressRecord(subjectId, themeId) {
            if (!isProgressSyncEligible() || !subjectId || !themeId) return null;
            const U = window.UniAdmin;
            const session = U.StudentAuth.getSession();
            const theme = trainingData[subjectId]?.themes?.[themeId];
            if (!theme) return null;
            const { total, done, pct } = courseProgress(subjectId, theme);
            const approved = assessmentResults[subjectId]?.[themeId];
            const existingStartedAt = remoteProgressStartedAt[subjectId]?.[themeId];
            const startedAt = existingStartedAt || Date.now();
            const activeMs = remoteProgressActiveMs[subjectId]?.[themeId] || 0;
            const record = {
                total, done, pct,
                approved: approved !== undefined ? approved : null,
                startedAt,
                activeMs,
                updatedAt: Date.now()
            };
            if (!remoteProgressStartedAt[subjectId]) remoteProgressStartedAt[subjectId] = {};
            remoteProgressStartedAt[subjectId][themeId] = startedAt;
            if (!remoteProgressActiveMs[subjectId]) remoteProgressActiveMs[subjectId] = {};
            remoteProgressActiveMs[subjectId][themeId] = activeMs;
            return { record, path: `${progressPathFor(session.userId)}/${subjectId}/${themeId}` };
        }

        // Gravação de última chance ao sair da página: o .set() do SDK é
        // assíncrono e o navegador mata a requisição ao fechar a aba, então o
        // tempo da sessão em andamento se perdia. sendBeacon é entregue pelo
        // navegador mesmo depois da página morrer. PUT via REST do Realtime
        // Database (mesmo endpoint já usado no carregamento dos cursos), com
        // o método forçado por query string porque sendBeacon só faz POST.
        function flushProgressBeacon() {
            const { subjectId, themeId, sessionStartedAt } = activeCourseTimer;
            if (!subjectId || !themeId || !sessionStartedAt) return false;
            if (!navigator.sendBeacon) return false;
            const elapsed = Date.now() - sessionStartedAt;
            if (elapsed <= 0) return false;

            addActiveMs(subjectId, themeId, elapsed);
            activeCourseTimer.sessionStartedAt = null;

            // Sem conta logada (Estágios) não há registro em nuvem para enviar,
            // mas o tempo da sessão já entrou no acumulado local acima — é o
            // que preserva o cronômetro ao fechar e reabrir a página.
            const built = buildCourseProgressRecord(subjectId, themeId);
            if (!built) return false;
            const url = `${PROGRESS_REST_BASE}${built.path}.json?x-http-method-override=PUT${restAuthQuery('&')}`;
            // text/plain evita o preflight CORS, que o sendBeacon não faz.
            const blob = new Blob([JSON.stringify(built.record)], { type: 'text/plain;charset=UTF-8' });
            return navigator.sendBeacon(url, blob);
        }

        function syncCourseProgressToCloud(subjectId = currentTrainingId, themeId = currentThemeId) {
            if (!isProgressSyncEligible() || !subjectId || !themeId) return;
            const U = window.UniAdmin;
            // startedAt é gravado só na primeira sync do curso e preservado
            // depois — marca (aproximadamente) o início do 1º módulo. activeMs
            // é o tempo ativo acumulado (contador oculto, ver
            // resumeActiveCourseTimer/pauseActiveCourseTimer) — ambos usados
            // no gráfico "Tempo para Conclusão" do dashboard (Config >
            // Dashboard > curso > Gráficos), que exibe o activeMs.
            const built = buildCourseProgressRecord(subjectId, themeId);
            if (!built) return;
            const { record, path } = built;
            // Transação, não `set`: o mesmo aluno pode estar com o curso aberto
            // em duas abas ou dois aparelhos, e cada um carrega o activeMs de
            // quando entrou. Com `set`, quem gravasse por último devolvia o
            // contador ao valor dele e o tempo assistido no outro sumia —
            // junto com os módulos concluídos lá. A transação lê o valor no
            // servidor no momento da escrita e nunca deixa a progressão andar
            // para trás; só um reset do administrador (que apaga o nó) zera.
            U.ref(U.db, path).transaction(current => {
                if (!current) return record;
                return {
                    ...record,
                    total: record.total,
                    done: Math.max(record.done || 0, current.done || 0),
                    pct: Math.max(record.pct || 0, current.pct || 0),
                    approved: record.approved !== null && record.approved !== undefined
                        ? record.approved
                        : (current.approved !== undefined ? current.approved : null),
                    startedAt: Math.min(record.startedAt || Date.now(), current.startedAt || record.startedAt || Date.now()),
                    activeMs: Math.max(record.activeMs || 0, current.activeMs || 0),
                    updatedAt: Date.now()
                };
            }).catch(error => {
                console.error('Erro ao sincronizar progressão do curso:', error);
            });
        }

        // Aprovações já registradas no histórico do aluno, por curso.
        // Fonte: as mesmas linhas da aba Histórico (U.getHistoryRows), que
        // reúne results/byUser (avaliações feitas no portal) E
        // results/imported (histórico antigo trazido por planilha, sem
        // userId — casa pelo nome, mesmo critério do Perfil do aluno,
        // ver rowsForSession em js/student-profile.js).
        // Devolve Map "subjectId_themeId" -> maior nota aprovada.
        function fetchApprovedHistory(session) {
            const U = window.UniAdmin;
            if (!U.getHistoryRows) return Promise.resolve(new Map());
            const nameKey = U.normalizeName(session.fullName || '');
            return U.getHistoryRows().then(rows => {
                const byCourse = new Map();
                (rows || []).forEach(r => {
                    if (r.slug !== currentCategorySlug) return;
                    if (!r.subjectId || !r.themeId) return;
                    // Linha do próprio aluno: pela conta, ou — no histórico
                    // avulso/importado, que não tem conta — pelo nome.
                    const isMine = r.userId === session.userId
                        || (r.userId == null && U.normalizeName(r.fullName || '') === nameKey);
                    if (!isMine || !r.approved) return;
                    const score = Number(r.score);
                    if (!Number.isFinite(score)) return;
                    const key = `${r.subjectId}_${r.themeId}`;
                    const best = byCourse.get(key);
                    if (best === undefined || score > best) byCourse.set(key, score);
                });
                return byCourse;
            }).catch(error => {
                console.error('Erro ao carregar histórico aprovado:', error);
                return new Map();
            });
        }

        // Ao logar (ou recarregar já logado), sincroniza completionStatus/
        // assessmentResults locais com a progressão gravada na nuvem — cobre
        // tanto continuar o curso em outro navegador/dispositivo quanto um
        // reset feito pelo admin (Configurações > Dashboard > Resetar curso),
        // que apaga o registro em progress/byUser e precisa "puxar" o card do
        // aluno de volta para 0%/sem nota, não só somar progresso.
        function loadRemoteProgression() {
            if (!isProgressSyncEligible()) return;
            const U = window.UniAdmin;
            const session = U.StudentAuth.getSession();
            Promise.all([
                U.get(U.ref(U.db, progressPathFor(session.userId))),
                fetchApprovedHistory(session)
            ]).then(([snapshot, approvedHistory]) => {
                const remote = snapshot.exists() ? (snapshot.val() || {}) : {};
                let changed = false;

                Object.keys(trainingData).forEach(subjectId => {
                    Object.keys(trainingData[subjectId]?.themes || {}).forEach(themeId => {
                        const theme = trainingData[subjectId].themes[themeId];
                        const entry = remote[subjectId]?.[themeId];
                        if (entry?.startedAt) {
                            if (!remoteProgressStartedAt[subjectId]) remoteProgressStartedAt[subjectId] = {};
                            remoteProgressStartedAt[subjectId][themeId] = entry.startedAt;
                        }
                        if (Number.isFinite(entry?.activeMs)) {
                            if (!remoteProgressActiveMs[subjectId]) remoteProgressActiveMs[subjectId] = {};
                            // Maior dos dois, como faz a transação da nuvem: o
                            // acumulado local pode incluir uma sessão que ainda
                            // não subiu (queda de conexão, aba fechada antes do
                            // beacon), e sobrescrever puxaria o contador para trás.
                            remoteProgressActiveMs[subjectId][themeId] = Math.max(
                                entry.activeMs,
                                remoteProgressActiveMs[subjectId][themeId] || 0
                            );
                        }
                        // Curso aprovado no histórico (inclusive o importado
                        // por planilha, que não gera registro em
                        // progress/byUser) conta como concluído: o card mostra
                        // 100% e a nota, sem exigir reassistir os módulos.
                        // Só o reset do curso zera isso — ele apaga também as
                        // linhas de results/imported (ver resetCourse em
                        // js/admin-dashboard.js), então a aprovação some daqui
                        // junto com o resto.
                        const moduleCount = (theme.modules || []).length;
                        const historyScore = approvedHistory.get(`${subjectId}_${themeId}`);
                        const hasHistoryApproval = historyScore !== undefined;

                        const localDone = (completionStatus[subjectId]?.[themeId] || []).filter(Boolean).length;
                        const remoteDone = hasHistoryApproval
                            ? Math.max(entry?.done || 0, moduleCount)
                            : (entry?.done || 0);

                        // Reconstrói o array de booleans do tamanho certo sempre que a
                        // progressão remota diverge da local (para mais OU para menos).
                        if (remoteDone !== localDone) {
                            if (!completionStatus[subjectId]) completionStatus[subjectId] = {};
                            const arr = new Array(moduleCount).fill(false);
                            for (let i = 0; i < Math.min(remoteDone, arr.length); i++) arr[i] = true;
                            completionStatus[subjectId][themeId] = arr;
                            changed = true;
                        }

                        const entryApproved = (entry?.approved !== undefined && entry?.approved !== null) ? entry.approved : undefined;
                        // Entre a nota da nuvem e a do histórico vale a maior —
                        // o histórico importado costuma ser a única fonte de
                        // cursos feitos antes do portal.
                        const remoteApproved = hasHistoryApproval
                            ? (entryApproved !== undefined ? Math.max(entryApproved, historyScore) : historyScore)
                            : entryApproved;
                        const localApproved = assessmentResults[subjectId]?.[themeId];
                        if (remoteApproved !== localApproved) {
                            if (remoteApproved !== undefined) {
                                if (!assessmentResults[subjectId]) assessmentResults[subjectId] = {};
                                assessmentResults[subjectId][themeId] = remoteApproved;
                            } else if (assessmentResults[subjectId]) {
                                delete assessmentResults[subjectId][themeId];
                                if (Object.keys(assessmentResults[subjectId]).length === 0) delete assessmentResults[subjectId];
                            }
                            changed = true;
                        }
                    });
                });

                if (changed) {
                    localStorage.setItem('completionStatus', JSON.stringify(completionStatus));
                    localStorage.setItem('assessmentResults', JSON.stringify(assessmentResults));
                    if (currentTrainingId && courseGallery.style.display === 'block') showCourseGallery(currentTrainingId);
                }
                // O acumulado da nuvem chega depois da abertura do curso —
                // repinta para o cronômetro sair de 00:00:00 e mostrar o
                // tempo real já dedicado.
                paintExpectedTimePanel();
            }).catch(error => console.error('Erro ao carregar progressão da nuvem:', error));
        }

        // Login feito depois da página já carregada (modal de avaliação): traz
        // a progressão da nuvem e atualiza os cards com o % correto.
        document.addEventListener('uniadmin:session-updated', () => loadRemoteProgression());

        function resetCourseProgression() {
            if (currentTrainingId && currentThemeId) {
                if (completionStatus[currentTrainingId]) {
                    delete completionStatus[currentTrainingId][currentThemeId];
                    if (Object.keys(completionStatus[currentTrainingId]).length === 0) {
                        delete completionStatus[currentTrainingId];
                    }
                }
                if (assessmentResults[currentTrainingId]) {
                    delete assessmentResults[currentTrainingId][currentThemeId];
                    if (Object.keys(assessmentResults[currentTrainingId]).length === 0) {
                        delete assessmentResults[currentTrainingId];
                    }
                }
                saveProgression();
                loadTraining(currentTrainingId, currentThemeId);
                showWarning('Progressão do curso reiniciada com sucesso.');
            }
        }

        function loadYouTubeAPI() {
            return new Promise((resolve) => {
                if (window.YT && window.YT.Player) { resolve(); return; }
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                window.onYouTubeIframeAPIReady = () => resolve();
            });
        }

        function formatTime(seconds) {
            seconds = Math.max(0, Math.floor(seconds || 0));
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        }

        function initOrLoadVideo(videoId) {
            loadYouTubeAPI().then(() => {
                customPlayerContainer.style.display = 'block';
                video.style.display = 'none';
                currentVideoId = videoId;
                if (ytPlayer) { ytPlayer.destroy(); ytPlayer = null; }
                ytPlayer = new YT.Player('yt-frame', {
                    height: '390',
                    width: '640',
                    videoId: videoId,
                    playerVars: { controls: 0, modestbranding: 1, rel: 0, fs: 1, iv_load_policy: 3 },
                    events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
                });
            });
        }

        function onPlayerReady() {
            bindControls();
            updateTimeUI();
            const ytInnerIframe = document.querySelector('#yt-frame iframe');
            if (ytInnerIframe) {
                ytInnerIframe.setAttribute('allowfullscreen', '');
                const currentAllow = ytInnerIframe.getAttribute('allow') || '';
                if (!/fullscreen/i.test(currentAllow)) {
                    ytInnerIframe.setAttribute('allow', (currentAllow + '; fullscreen; autoplay').replace(/^;\s*/, ''));
                }
            }
        }

        function onPlayerStateChange(event) {
            const YT_STATE = window.YT.PlayerState;
            if (event.data === YT_STATE.PLAYING) {
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                startProgressTimer();
                // Play libera a contagem do tempo de curso (ver moduleTimerGate)
                // e conta como interação, soltando a trava de inatividade.
                registerStudyActivity();
                setModuleTimerGate('playing');
            } else if (event.data === YT_STATE.PAUSED || event.data === YT_STATE.ENDED) {
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                stopProgressTimer();
                // Pausou/terminou: para de contar até o próximo play.
                setModuleTimerGate('waiting');
                if (event.data === YT_STATE.ENDED) {
                    progressRange.value = 100;
                    updateTimeUI();
                    markCurrentModuleCompleted();
                }
            }
        }

        function markCurrentModuleCompleted() {
            if (currentTrainingId && currentThemeId != null && currentModuleIndex != null) {
                const theme = trainingData[currentTrainingId].themes[currentThemeId];
                if (!theme) return;
                if (!completionStatus[currentTrainingId]) completionStatus[currentTrainingId] = {};
                if (!completionStatus[currentTrainingId][currentThemeId]) completionStatus[currentTrainingId][currentThemeId] = [];
                const originalIndex = moduleIndexMapping.has(currentModuleIndex) ? moduleIndexMapping.get(currentModuleIndex) : currentModuleIndex;
                if (!completionStatus[currentTrainingId][currentThemeId][originalIndex]) {
                    completionStatus[currentTrainingId][currentThemeId][originalIndex] = true;
                    saveProgression();
                    const moduleTiles = modulesDiv.querySelectorAll('.module');
                    const tile = moduleTiles[currentModuleIndex];
                    if (tile) {
                        const modules = theme.modules;
                        const completedMod = moduleIndexMapping.has(currentModuleIndex)
                            ? modules[moduleIndexMapping.get(currentModuleIndex)]
                            : modules[currentModuleIndex];
                        tile.innerHTML = renderModuleTitle(completedMod?.title || '', true, shortsCountOf(completedMod));
                        tile.classList.add('completed');
                        tile.classList.remove('active');
                    }
                }
            }
        }


        // ═══════════════════════════════════════════════════════════════
        // VÍDEOS CURTOS — carrossel vertical (módulos type:'shorts')
        // ═══════════════════════════════════════════════════════════════
        // O avanço usa scroll-snap nativo do #shorts-viewport, então no
        // celular arrastar para cima já passa de vídeo sem JS de gesto; o
        // teclado, a roda do mouse e o arraste com ponteiro chamam
        // goToShort() para reproduzir o mesmo efeito no desktop.
        //
        // Regras de tempo (ver moduleTimerGate): o contador do curso só
        // corre com um curto tocando — igual ao módulo de vídeo longo. A
        // diferença é o debounce de SHORTS_GATE_IDLE_MS: a troca de vídeo
        // passa por PAUSED/ENDED e, sem a espera, cada transição fecharia a
        // sessão e gravaria progresso na nuvem.

        // Um curto conta como assistido aos 90% — não há controle de seek
        // no palco, então chegar aos 90% significa ter assistido mesmo.
        const SHORTS_WATCHED_RATIO = 0.9;
        const SHORTS_AUTONEXT_MS = 1000;
        const SHORTS_GATE_IDLE_MS = 1500;
        const SHORTS_HINT_OPEN_MS = 4500;
        const SHORTS_HINT_IDLE_MS = 3000;
        const SHORTS_HINT_IDLE_DELAY_MS = 6000;

        let shortsList = [];
        const shortsPlayers = new Map(); // índice → YT.Player (só o atual)
        let shortsWatched = [];
        let shortsActive = 0;
        let shortsKey = null;            // chave localStorage do módulo atual
        let shortsObserver = null;
        let shortsTicker = null;
        let shortsHintTimer = null;
        let shortsIdleHintTimer = null;
        let shortsAutonextTimer = null;
        let shortsGateIdleTimer = null;
        let shortsWheelLock = false;
        let shortsDragStartY = null;
        let shortsDragged = false;
        let shortsMuted = false;
        // Autoplay sem gesto do usuário é bloqueado pelo navegador: o
        // primeiro curto espera um toque, e daí em diante os próximos já
        // podem começar sozinhos ao virar.
        let shortsUserGesture = false;
        // Invalida callbacks assíncronos (carga da API do YouTube) quando o
        // aluno troca de módulo antes de a promessa resolver.
        let shortsToken = 0;

        function shortsSlideAt(index) {
            return shortsViewport?.querySelector(`.shorts-slide[data-index="${index}"]`) || null;
        }

        function shortsStorageKey(subjectId, themeId, originalIndex) {
            return `shortsWatched_${subjectId}_${themeId}_${originalIndex}`;
        }

        // Sub-progresso por vídeo é local (localStorage). A nuvem continua
        // guardando só a conclusão do módulo, via markCurrentModuleCompleted.
        function loadShortsWatched(key, count) {
            if (key) {
                try {
                    const saved = JSON.parse(localStorage.getItem(key) || 'null');
                    // Tamanho diferente = o admin mudou a lista de vídeos:
                    // recomeça zerado, mesmo critério do completionStatus.
                    if (Array.isArray(saved) && saved.length === count) return saved.map(Boolean);
                } catch { /* JSON inválido ou storage bloqueado */ }
            }
            return new Array(count).fill(false);
        }

        function saveShortsWatched() {
            if (!shortsKey) return;
            try { localStorage.setItem(shortsKey, JSON.stringify(shortsWatched)); } catch { /* storage cheio/bloqueado */ }
        }

        function buildShortsSlide(item, index, total) {
            const slide = document.createElement('div');
            slide.className = 'shorts-slide is-paused';
            slide.dataset.index = String(index);

            const frame = document.createElement('div');
            frame.className = 'shorts-frame';
            // Capa do vídeo: só o curto atual tem iframe montado.
            frame.style.backgroundImage = `url("https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg")`;

            // A API do YouTube substitui este elemento pelo iframe.
            const host = document.createElement('div');
            host.id = `shorts-frame-${index}`;
            frame.appendChild(host);

            const tap = document.createElement('button');
            tap.type = 'button';
            tap.className = 'shorts-tap';
            tap.setAttribute('aria-label', 'Reproduzir ou pausar');
            const badge = document.createElement('span');
            badge.className = 'shorts-play-badge';
            badge.innerHTML = '<i class="fas fa-play"></i>';
            tap.appendChild(badge);
            frame.appendChild(tap);

            const label = document.createElement('div');
            label.className = 'shorts-slide-label';
            const idx = document.createElement('span');
            idx.className = 'shorts-slide-index';
            idx.textContent = `${index + 1}/${total}`;
            label.appendChild(idx);
            if (item.title) {
                const title = document.createElement('span');
                title.className = 'shorts-slide-title';
                title.textContent = item.title;
                label.appendChild(title);
            }
            frame.appendChild(label);

            const mute = document.createElement('button');
            mute.type = 'button';
            mute.className = 'shorts-mute';
            mute.setAttribute('aria-label', 'Ativar ou desativar o som');
            mute.innerHTML = '<i class="fas fa-volume-high"></i>';
            frame.appendChild(mute);

            const progress = document.createElement('div');
            progress.className = 'shorts-progress';
            progress.appendChild(document.createElement('span'));
            frame.appendChild(progress);

            const check = document.createElement('div');
            check.className = 'shorts-check';
            check.innerHTML = '<i class="fas fa-circle-check"></i>';
            frame.appendChild(check);

            slide.appendChild(frame);
            return slide;
        }

        function renderShorts(list) {
            destroyShorts();
            if (!shortsStage || !shortsViewport) return;
            const token = shortsToken;
            shortsList = (list || []).filter(item => item && item.id);
            if (!shortsList.length) return;

            // completionStatus é indexado pelo índice ORIGINAL do módulo no
            // array (não pela posição exibida) — a chave local segue a mesma
            // referência para não trocar de módulo ao reordenar.
            const originalIndex = moduleIndexMapping.has(currentModuleIndex)
                ? moduleIndexMapping.get(currentModuleIndex)
                : currentModuleIndex;
            shortsKey = (currentTrainingId && currentThemeId != null && originalIndex != null)
                ? shortsStorageKey(currentTrainingId, currentThemeId, originalIndex)
                : null;
            shortsWatched = loadShortsWatched(shortsKey, shortsList.length);

            const total = shortsList.length;
            const slides = document.createDocumentFragment();
            shortsList.forEach((item, index) => slides.appendChild(buildShortsSlide(item, index, total)));
            shortsViewport.appendChild(slides);

            if (shortsSegmentsEl) {
                const segments = document.createDocumentFragment();
                shortsList.forEach(() => {
                    const segment = document.createElement('div');
                    segment.className = 'shorts-segment';
                    segment.appendChild(document.createElement('span'));
                    segments.appendChild(segment);
                });
                shortsSegmentsEl.appendChild(segments);
            }

            shortsActive = 0;
            shortsViewport.scrollTop = 0;
            shortsStage.style.display = 'block';
            if (shortsTotalEl) shortsTotalEl.style.display = '';
            shortsList.forEach((_, index) => setShortsProgress(index, shortsWatched[index] ? 1 : 0));
            paintShortsUI();
            observeShorts();
            applyShortsMute();
            showShortsHint(SHORTS_HINT_OPEN_MS);

            loadYouTubeAPI().then(() => {
                if (token !== shortsToken) return; // já trocou de módulo
                ensureShortsPlayer(shortsActive);
                startShortsTicker();
            });
        }

        function destroyShorts() {
            shortsToken++;
            stopShortsTicker();
            clearShortsGateIdle();
            cancelShortsAutonext();
            clearShortsIdleHint();
            if (shortsHintTimer) { clearTimeout(shortsHintTimer); shortsHintTimer = null; }
            if (shortsObserver) { shortsObserver.disconnect(); shortsObserver = null; }
            shortsPlayers.forEach(player => { try { player.destroy(); } catch { /* já destruído */ } });
            shortsPlayers.clear();
            shortsList = [];
            shortsWatched = [];
            shortsActive = 0;
            shortsKey = null;
            shortsDragStartY = null;
            shortsDragged = false;
            if (shortsViewport) shortsViewport.innerHTML = '';
            if (shortsSegmentsEl) shortsSegmentsEl.innerHTML = '';
            if (shortsHintEl) shortsHintEl.hidden = true;
            if (shortsStage) { shortsStage.style.display = 'none'; shortsStage.classList.remove('is-complete'); }
            if (shortsTotalEl) { shortsTotalEl.style.display = 'none'; shortsTotalEl.classList.remove('is-complete'); }
        }

        // Um único iframe vivo: o do curto atual. Os demais slides mostram só
        // a capa. Manter vizinhos montados (mesmo pausados) deixava o player
        // carregando indefinidamente a partir do terceiro curto; ao sair de um
        // vídeo ele é destruído e, na volta, remonta do início.
        function ensureShortsPlayer(active) {
            Array.from(shortsPlayers.keys()).forEach(index => {
                if (index === active) return;
                const player = shortsPlayers.get(index);
                shortsPlayers.delete(index);
                try { player.destroy(); } catch { /* já destruído */ }
                resetShortsHost(index);
                setShortsProgress(index, shortsWatched[index] ? 1 : 0);
            });
            createShortsPlayer(active);
        }

        // destroy() remove o iframe: repõe o div hospedeiro para o slide
        // poder ser remontado quando o aluno voltar para ele.
        function resetShortsHost(index) {
            const slide = shortsSlideAt(index);
            if (!slide) return;
            const frame = slide.querySelector('.shorts-frame');
            if (!frame) return;
            frame.querySelector('iframe')?.remove();
            if (!frame.querySelector(`#shorts-frame-${index}`)) {
                const host = document.createElement('div');
                host.id = `shorts-frame-${index}`;
                frame.insertBefore(host, frame.firstChild);
            }
            slide.classList.add('is-paused');
        }

        function createShortsPlayer(index) {
            if (shortsPlayers.has(index)) return;
            const host = document.getElementById(`shorts-frame-${index}`);
            if (!host || !window.YT || !window.YT.Player) return;
            // Sem controles nativos e sem teclado do YouTube: o palco não
            // oferece nenhuma forma de pular o vídeo.
            const player = new YT.Player(host, {
                videoId: shortsList[index].id,
                playerVars: {
                    controls: 0, modestbranding: 1, rel: 0, playsinline: 1,
                    iv_load_policy: 3, fs: 0, disablekb: 1,
                    // Sem legendas automáticas nos vídeos curtos.
                    cc_load_policy: 0
                },
                events: {
                    onReady: (event) => {
                        try { if (shortsMuted) event.target.mute(); else event.target.unMute(); } catch { /* indisponível */ }
                        if (index === shortsActive && shortsUserGesture) safeShortsPlay(event.target);
                    },
                    onStateChange: (event) => onShortsStateChange(index, event),
                    // Sem isto um vídeo bloqueado/removido fica só tela preta.
                    onError: (event) => console.warn(`Curto ${index + 1} (${shortsList[index]?.id}): erro ${event.data} do player do YouTube`)
                }
            });
            shortsPlayers.set(index, player);
        }

        function onShortsStateChange(index, event) {
            const YT_STATE = window.YT?.PlayerState;
            if (!YT_STATE) return;
            const slide = shortsSlideAt(index);
            if (event.data === YT_STATE.PLAYING) {
                slide?.classList.remove('is-paused');
                // Dar play de novo (replay) esconde o selo de "assistido":
                // ele é um aviso do instante em que passou dos 90%, não um
                // selo permanente sobre o vídeo.
                slide?.classList.remove('is-just-watched');
                // Um player fora de foco só pode ter voltado a tocar sozinho:
                // silencia para o áudio não se sobrepor.
                if (index !== shortsActive) { try { event.target.pauseVideo(); } catch { /* indisponível */ } return; }
                clearShortsGateIdle();
                registerStudyActivity();
                setModuleTimerGate('playing');
                return;
            }
            if (event.data === YT_STATE.PAUSED) {
                slide?.classList.add('is-paused');
                if (index === shortsActive) scheduleShortsGateIdle();
                return;
            }
            if (event.data === YT_STATE.ENDED) {
                slide?.classList.add('is-paused');
                if (index !== shortsActive) return;
                markShortWatched(index);
                setShortsProgress(index, 1);
                if (index < shortsList.length - 1) startShortsAutonext();
                else scheduleShortsGateIdle();
            }
        }

        function clearShortsGateIdle() {
            if (shortsGateIdleTimer) { clearTimeout(shortsGateIdleTimer); shortsGateIdleTimer = null; }
        }

        // Trocar de curto passa rapidamente por PAUSED/ENDED. Sem esta espera,
        // cada transição fecharia a sessão do contador e dispararia um
        // syncCourseProgressToCloud — dez curtos virariam dez escritas.
        function scheduleShortsGateIdle() {
            clearShortsGateIdle();
            shortsGateIdleTimer = setTimeout(() => {
                shortsGateIdleTimer = null;
                if (currentModuleKind === 'shorts') setModuleTimerGate('waiting');
            }, SHORTS_GATE_IDLE_MS);
        }

        function startShortsTicker() {
            stopShortsTicker();
            // Ticker próprio: progressTimer é compartilhado com o cronômetro
            // da avaliação (startQuizTimer) e não pode ser reaproveitado.
            shortsTicker = setInterval(() => {
                const player = shortsPlayers.get(shortsActive);
                if (!player || typeof player.getDuration !== 'function') return;
                let current = 0;
                let duration = 0;
                try {
                    current = player.getCurrentTime() || 0;
                    duration = player.getDuration() || 0;
                } catch { return; /* player entre montagens */ }
                if (duration <= 0) return;
                const ratio = Math.min(1, current / duration);
                setShortsProgress(shortsActive, ratio);
                if (ratio >= SHORTS_WATCHED_RATIO) markShortWatched(shortsActive);
            }, 250);
        }

        function stopShortsTicker() {
            if (!shortsTicker) return;
            clearInterval(shortsTicker);
            shortsTicker = null;
        }

        function setShortsProgress(index, ratio) {
            const pct = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
            const bar = shortsSlideAt(index)?.querySelector('.shorts-progress > span');
            if (bar) bar.style.width = pct;
            if (index !== shortsActive || shortsWatched[index]) return;
            const segment = shortsSegmentsEl?.children?.[index]?.firstElementChild;
            if (segment) segment.style.width = pct;
        }

        function markShortWatched(index) {
            if (shortsWatched[index]) return;
            shortsWatched[index] = true;
            saveShortsWatched();
            const slide = shortsSlideAt(index);
            if (slide) {
                slide.classList.remove('is-just-watched');
                void slide.offsetWidth; // reinicia a animação do selo
                slide.classList.add('is-just-watched');
            }
            paintShortsUI();
            if (shortsWatched.every(Boolean)) {
                // Todos vistos = módulo concluído. Daqui em diante é o fluxo
                // normal: localStorage + transação em progress/byUser.
                markCurrentModuleCompleted();
            } else {
                scheduleShortsIdleHint();
            }
        }

        function paintShortsUI() {
            const total = shortsList.length;
            const done = shortsWatched.filter(Boolean).length;
            if (shortsCounterEl) shortsCounterEl.textContent = `${Math.min(shortsActive + 1, total)} / ${total}`;
            if (shortsSegmentsEl) {
                Array.from(shortsSegmentsEl.children).forEach((segment, index) => {
                    const watched = !!shortsWatched[index];
                    segment.classList.toggle('is-watched', watched);
                    const fill = segment.firstElementChild;
                    if (!fill) return;
                    if (watched) fill.style.width = '100%';
                    else if (index !== shortsActive) fill.style.width = '0';
                });
            }
            const pct = total ? Math.round((done / total) * 100) : 0;
            if (shortsTotalCountEl) shortsTotalCountEl.textContent = `${done} de ${total}`;
            if (shortsTotalPctEl) shortsTotalPctEl.textContent = `${pct}%`;
            if (shortsTotalFillEl) shortsTotalFillEl.style.width = `${pct}%`;
            const complete = total > 0 && done === total;
            shortsTotalEl?.classList.toggle('is-complete', complete);
            shortsStage?.classList.toggle('is-complete', complete);
            if (shortsPrevBtn) shortsPrevBtn.disabled = shortsActive <= 0;
            if (shortsNextBtn) shortsNextBtn.disabled = shortsActive >= total - 1;
        }

        function observeShorts() {
            if (shortsObserver) shortsObserver.disconnect();
            if (!('IntersectionObserver' in window)) return;
            shortsObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const index = Number(entry.target.dataset.index);
                    if (Number.isNaN(index) || index === shortsActive) return;
                    setActiveShort(index);
                });
            }, { root: shortsViewport, threshold: 0.6 });
            shortsViewport.querySelectorAll('.shorts-slide').forEach(slide => shortsObserver.observe(slide));
        }

        function setActiveShort(index) {
            shortsActive = index;
            cancelShortsAutonext();
            clearShortsIdleHint();
            hideShortsHint();
            // Virar o vídeo é a interação de estudo dos curtos — equivale à
            // virada de página do PDF e rearma a trava de inatividade.
            registerStudyActivity();
            // Player novo: som e play são aplicados no onReady.
            ensureShortsPlayer(index);
            paintShortsUI();
        }

        function goToShort(index) {
            if (index < 0 || index >= shortsList.length) return;
            const slide = shortsSlideAt(index);
            if (!slide || !shortsViewport) return;
            // scrollTo no viewport, não scrollIntoView: este último também
            // rolaria a PÁGINA até o player quando ele está meio fora da tela.
            shortsViewport.scrollTo({ top: slide.offsetTop, behavior: 'smooth' });
        }

        function safeShortsPlay(player) {
            try { player.playVideo(); } catch { /* player ainda montando */ }
        }

        function toggleShortsPlayback() {
            const player = shortsPlayers.get(shortsActive);
            if (!player) return;
            // Este é o gesto que autoriza o autoplay dos próximos vídeos.
            shortsUserGesture = true;
            let state;
            try { state = player.getPlayerState(); } catch { return; }
            if (state === window.YT?.PlayerState?.PLAYING) {
                try { player.pauseVideo(); } catch { /* indisponível */ }
            } else {
                safeShortsPlay(player);
            }
        }

        function applyShortsMute() {
            shortsPlayers.forEach(player => {
                try { if (shortsMuted) player.mute(); else player.unMute(); } catch { /* indisponível */ }
            });
            shortsViewport?.querySelectorAll('.shorts-mute i').forEach(icon => {
                icon.className = shortsMuted ? 'fas fa-volume-xmark' : 'fas fa-volume-high';
            });
        }

        function pauseShortsIfPlaying() {
            const YT_STATE = window.YT?.PlayerState;
            if (!YT_STATE || !shortsPlayers.size) return;
            shortsPlayers.forEach(player => {
                let state;
                try { state = player.getPlayerState(); } catch { return; }
                if (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING) {
                    try { player.pauseVideo(); } catch { /* indisponível */ }
                }
            });
        }

        // ─── Avanço automático ao terminar o vídeo ───
        function startShortsAutonext() {
            const from = shortsActive;
            if (!shortsAutonextEl) { goToShort(from + 1); return; }
            cancelShortsAutonext();
            shortsAutonextEl.hidden = false;
            shortsAutonextEl.classList.add('is-running');
            shortsAutonextTimer = setTimeout(() => {
                shortsAutonextTimer = null;
                hideShortsAutonext();
                if (shortsActive === from) goToShort(from + 1);
            }, SHORTS_AUTONEXT_MS);
        }

        function cancelShortsAutonext() {
            if (shortsAutonextTimer) { clearTimeout(shortsAutonextTimer); shortsAutonextTimer = null; }
            hideShortsAutonext();
        }

        function hideShortsAutonext() {
            if (!shortsAutonextEl) return;
            shortsAutonextEl.classList.remove('is-running');
            shortsAutonextEl.hidden = true;
        }

        // ─── Instrução temporária de swipe ───
        // Aparece na abertura do módulo e volta quando o aluno termina um
        // vídeo e fica parado: só quando ainda há para onde avançar.
        function showShortsHint(duration) {
            if (!shortsHintEl || shortsList.length < 2) return;
            if (shortsActive >= shortsList.length - 1) return;
            if (shortsHintTimer) clearTimeout(shortsHintTimer);
            shortsHintEl.hidden = false;
            shortsHintTimer = setTimeout(() => {
                shortsHintTimer = null;
                shortsHintEl.hidden = true;
            }, duration);
        }

        function hideShortsHint() {
            if (shortsHintTimer) { clearTimeout(shortsHintTimer); shortsHintTimer = null; }
            if (shortsHintEl) shortsHintEl.hidden = true;
        }

        function clearShortsIdleHint() {
            if (shortsIdleHintTimer) { clearTimeout(shortsIdleHintTimer); shortsIdleHintTimer = null; }
        }

        function scheduleShortsIdleHint() {
            clearShortsIdleHint();
            shortsIdleHintTimer = setTimeout(() => {
                shortsIdleHintTimer = null;
                showShortsHint(SHORTS_HINT_IDLE_MS);
            }, SHORTS_HINT_IDLE_DELAY_MS);
        }

        // ─── Entrada de gestos/teclado (o toque usa o snap nativo) ───
        shortsViewport?.addEventListener('click', (event) => {
            const slide = event.target.closest('.shorts-slide');
            if (!slide) return;
            if (event.target.closest('.shorts-mute')) {
                shortsMuted = !shortsMuted;
                applyShortsMute();
                return;
            }
            if (!event.target.closest('.shorts-tap')) return;
            if (shortsDragged) { shortsDragged = false; return; }
            const index = Number(slide.dataset.index);
            if (index !== shortsActive) { goToShort(index); return; }
            toggleShortsPlayback();
        });

        shortsViewport?.addEventListener('wheel', (event) => {
            if (shortsList.length < 2) return;
            if (Math.abs(event.deltaY) < 8) return;
            // Conduz o avanço em vez de deixar a rolagem livre: com snap, a
            // roda do mouse costuma parar entre dois vídeos.
            event.preventDefault();
            if (shortsWheelLock) return;
            shortsWheelLock = true;
            setTimeout(() => { shortsWheelLock = false; }, 380);
            goToShort(shortsActive + (event.deltaY > 0 ? 1 : -1));
        }, { passive: false });

        shortsViewport?.addEventListener('pointerdown', (event) => {
            // No toque o scroll-snap já resolve; aqui é só para mouse/caneta.
            if (event.pointerType === 'touch') return;
            shortsDragStartY = event.clientY;
            shortsDragged = false;
        });
        shortsViewport?.addEventListener('pointerup', (event) => {
            if (shortsDragStartY === null) return;
            const delta = shortsDragStartY - event.clientY;
            shortsDragStartY = null;
            if (Math.abs(delta) < 60) return;
            // Marca o arraste para o clique seguinte não virar play/pausa.
            shortsDragged = true;
            goToShort(shortsActive + (delta > 0 ? 1 : -1));
        });
        shortsViewport?.addEventListener('pointercancel', () => { shortsDragStartY = null; });

        shortsViewport?.addEventListener('keydown', (event) => {
            if (!shortsList.length) return;
            if (event.key === 'ArrowDown' || event.key === 'PageDown') {
                event.preventDefault();
                goToShort(shortsActive + 1);
            } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
                event.preventDefault();
                goToShort(shortsActive - 1);
            } else if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                toggleShortsPlayback();
            }
        });

        shortsPrevBtn?.addEventListener('click', () => goToShort(shortsActive - 1));
        shortsNextBtn?.addEventListener('click', () => goToShort(shortsActive + 1));
        shortsAutonextEl?.addEventListener('click', () => {
            cancelShortsAutonext();
            // Ficar no vídeo é escolha do aluno: lembra como avançar depois.
            showShortsHint(SHORTS_HINT_IDLE_MS);
        });

        function bindControls() {
            playPauseBtn.onclick = () => {
                if (!ytPlayer) return;
                const state = ytPlayer.getPlayerState();
                const YT_STATE = window.YT.PlayerState;
                if (state !== YT_STATE.PLAYING) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
            };
            muteBtn.onclick = () => {
                if (!ytPlayer) return;
                if (ytPlayer.isMuted()) { ytPlayer.unMute(); muteBtn.innerHTML = '<i class="fas fa-volume-high"></i>'; }
                else { ytPlayer.mute(); muteBtn.innerHTML = '<i class="fas fa-volume-xmark"></i>'; }
            };
            volumeRange.oninput = () => {
                if (!ytPlayer) return;
                ytPlayer.setVolume(parseInt(volumeRange.value, 10));
                if (ytPlayer.isMuted() && parseInt(volumeRange.value, 10) > 0) {
                    ytPlayer.unMute();
                    muteBtn.innerHTML = '<i class="fas fa-volume-high"></i>';
                }
            };
            progressRange.oninput = () => {
                if (!ytPlayer) return;
                const duration = ytPlayer.getDuration() || 0;
                const seekTo = (parseFloat(progressRange.value) / 100) * duration;
                ytPlayer.seekTo(seekTo, true);
                updateTimeUI();
            };
            speedSelect.onchange = () => {
                if (!ytPlayer) return;
                ytPlayer.setPlaybackRate(parseFloat(speedSelect.value));
            };
            const fullscreenBtn = document.getElementById('fullscreen-btn');
            if (fullscreenBtn) {
                fullscreenBtn.onclick = () => {
                    const container = document.getElementById('custom-player');
                    if (!container.classList.contains('is-fullscreen')) {
                        container.classList.add('is-fullscreen');
                        const req = container.requestFullscreen || container.webkitRequestFullscreen;
                        if (req) req.call(container).catch(() => {});
                        fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                    } else {
                        container.classList.remove('is-fullscreen');
                        const exit = document.exitFullscreen || document.webkitExitFullscreen;
                        if (exit && (document.fullscreenElement || document.webkitFullscreenElement)) {
                            try { exit.call(document); } catch(e) {}
                        }
                        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
                    }
                };
                const onFsChange = () => {
                    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                        document.getElementById('custom-player').classList.remove('is-fullscreen');
                        const fsBtn = document.getElementById('fullscreen-btn');
                        if (fsBtn) fsBtn.innerHTML = '<i class="fas fa-expand"></i>';
                    }
                };
                document.addEventListener('fullscreenchange', onFsChange);
                document.addEventListener('webkitfullscreenchange', onFsChange);
            }
        }

        function startProgressTimer() {
            stopProgressTimer();
            progressTimer = setInterval(() => {
                if (!ytPlayer) return;
                const current = ytPlayer.getCurrentTime() || 0;
                const duration = ytPlayer.getDuration() || 0;
                if (duration > 0) progressRange.value = (current / duration) * 100;
                updateTimeUI();
            }, 250);
        }

        function stopProgressTimer() {
            if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
        }

        function updateTimeUI() {
            if (!ytPlayer) { timeLabels.textContent = '00:00 / 00:00'; return; }
            const current = ytPlayer.getCurrentTime() || 0;
            const duration = ytPlayer.getDuration() || 0;
            timeLabels.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
        }

        function applyCategoryToHeader() {
            const label = document.getElementById('header-category-label');
            const badge = document.getElementById('header-category-badge');
            if (label) label.textContent = 'Plataforma de ' + currentCategory;
            if (badge) badge.textContent = currentCategory;
            document.title = `Universidade LAMIC - ${currentCategory}`;
        }

        // DOMContentLoaded, não `load`. `load` só dispara quando TODO recurso
        // da página terminou — as cinco bibliotecas de CDN (~1,9 MB), as
        // fontes, os ícones, as imagens. Só depois disso é que a leitura do
        // conteúdo começava, e o ranking, que é o último elo da cadeia
        // (conteúdo → primeiro snapshot → showWelcomeRanking), herdava a
        // espera inteira. Com `defer` em todos os <script> do portal, neste
        // ponto o DOM está completo e as bibliotecas já executaram — é o
        // primeiro instante em que dá para começar, sem esperar o resto.
        document.addEventListener('DOMContentLoaded', () => {
            applyCategoryToHeader();
            warningMessage.style.display = 'none';
            resetContent();
            document.getElementById('loading-overlay').style.display = 'flex';
            fetchFirebaseData();
            courseGallery.style.display = 'none';
            courseGrid.innerHTML = '';
            themeBtn.textContent = 'Escolha um Assunto';
            // Guardado: uma falha de CDN aqui derrubava o resto do boot do
            // portal (a fiação do comentário abaixo nunca era ligada) por
            // causa de um módulo PDF que talvez nem seja aberto na sessão.
            if (window.pdfjsLib) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
            }

            const commentToggleBtn = document.getElementById('comment-toggle-btn');
            const commentSection = document.getElementById('comment-section');
            if (commentToggleBtn) {
                commentToggleBtn.onclick = () => {
                    const isVisible = commentSection.style.display === 'block';
                    commentSection.style.display = isVisible ? 'none' : 'block';
                    commentToggleBtn.innerHTML = isVisible
                        ? '<i class="fas fa-comment-alt" style="margin-right:6px;"></i>Deixe um Comentário'
                        : '<i class="fas fa-times" style="margin-right:6px;"></i>Fechar Comentário';
                };
            }
        });

        function populateDropdown() {
            dropdownList.innerHTML = '';
            const subjects = Object.keys(trainingData)
                .filter(id => trainingData[id] && trainingData[id].name && trainingData[id].name.trim() !== '')
                .map(id => ({ ...trainingData[id], id }));
            const sortedSubjects = sortItems(subjects, orderData.subjects, 'id');
            sortedSubjects.forEach(({item: subject}) => {
                const courseCount = Object.keys(subject.themes || {})
                    .filter(id => subject.themes[id] && subject.themes[id].name)
                    .filter(id => subject.themes[id].active !== false)
                    .filter(id => themeVisibleForSession(subject.themes[id])).length;
                if (courseCount === 0) return;

                const subjectLi = document.createElement('li');
                subjectLi.className = 'subject';
                subjectLi.dataset.subjectId = subject.id;
                subjectLi.setAttribute('role', 'option');
                if (subject.id === currentTrainingId) subjectLi.classList.add('is-selected');

                const icon = document.createElement('span');
                icon.className = 'subject-icon';
                icon.style.setProperty('--subject-hue', initialsHue(subject.name));
                icon.innerHTML = '<i class="fas fa-bookmark"></i>';

                const name = document.createElement('span');
                name.className = 'subject-name';
                name.textContent = subject.name;

                const count = document.createElement('span');
                count.className = 'subject-count';
                count.textContent = courseCount;
                count.title = courseCount === 1 ? '1 curso' : `${courseCount} cursos`;

                const check = document.createElement('i');
                check.className = 'fas fa-check subject-check';

                subjectLi.append(icon, name, count, check);
                subjectLi.onclick = (e) => {
                    e.stopPropagation();
                    if (currentTrainingId && currentThemeId != null && loadQuizAttempt(currentTrainingId, currentThemeId)) {
                        closeSubjectDropdown();
                        showWarning('Termine a avaliação em andamento antes de trocar de tema.');
                        return;
                    }
                    setSubjectLabel(subject.name);
                    closeSubjectDropdown();
                    currentTrainingId = subject.id;
                    dropdownList.querySelectorAll('li.subject').forEach(li => {
                        li.classList.toggle('is-selected', li.dataset.subjectId === subject.id);
                    });
                    themeBtn.textContent = 'Escolha um Assunto';
                    contentDiv.style.display = 'none';
                    resetContent();
                    showCourseGallery(subject.id);
                };
                dropdownList.appendChild(subjectLi);
            });
        }

        // O rótulo do botão vive num span próprio; o ícone e a seta ficam fixos.
        function setSubjectLabel(text) {
            const label = btn.querySelector('.dropdown-btn-label');
            if (label) label.textContent = text;
            else btn.textContent = text;
        }

        function getSubjectLabel() {
            const label = btn.querySelector('.dropdown-btn-label');
            return label ? label.textContent : btn.textContent;
        }

        function openSubjectDropdown() {
            dropdownContent.style.display = 'block';
            btn.setAttribute('aria-expanded', 'true');
        }

        function closeSubjectDropdown() {
            dropdownContent.style.display = 'none';
            btn.setAttribute('aria-expanded', 'false');
        }

        /* ─── GALERIA DE CURSOS (cards) ─── */

        // Visibilidade por função (cargo). O assunto sem `roles` aparece para
        // todos; com `roles`, só para quem está logado com uma dessas funções
        // (a função vem da conta, sincronizada da planilha via Colaboradores).
        // Gestor (isManager na conta) ignora essa restrição e vê tudo.
        function themeVisibleForSession(theme) {
            // Categoria sem conta logada (Estágios) não tem cargo de sessão
            // para comparar: um `roles` herdado de uma duplicação esconderia o
            // curso de todo mundo, sem ninguém que pudesse satisfazê-lo. O
            // campo é ignorado aqui, e não só deixado de gravar no painel,
            // para que os cursos já duplicados voltem a aparecer.
            if (window.UniAdmin?.categoryUsesRoles?.(currentCategory) === false) return true;
            const roles = Array.isArray(theme?.roles) ? theme.roles.filter(Boolean) : [];
            if (roles.length === 0) return true;
            const session = window.UniAdmin?.StudentAuth?.getSession();
            if (session?.isManager) return true;
            const role = (session?.role || '').trim();
            if (!role) return false;
            // Correspondência hierárquica (js/ranking.js:roleMatches): o cargo
            // da planilha traz a especialização ("Analista - Biomédico") e o
            // curso é marcado pelo nome-base ("Analista"). Igualdade exata
            // escondia o curso de quem tem cargo especializado.
            const matches = window.UniAdmin?.Ranking?.roleMatches;
            if (matches) return roles.some(r => matches(r, role));
            const key = window.UniAdmin.normalizeName(role);
            return roles.some(r => window.UniAdmin.normalizeName(r) === key);
        }

        // Lista de assuntos do tema, já na ordem definida no painel.
        function getSortedThemes(subjectId) {
            const themes = trainingData[subjectId]?.themes || {};
            const themeArray = Object.keys(themes)
                .filter(id => themes[id] && themes[id].name && themes[id].name.trim() !== '')
                .filter(id => themes[id].active !== false)
                .filter(id => themeVisibleForSession(themes[id]))
                .map(id => ({ ...themes[id], id }));
            return sortItems(themeArray, orderData.themes?.[subjectId], 'id').map(({ item }) => item);
        }

        function courseInitials(name) {
            const clean = (name || '').trim();
            if (!clean) return '?';
            const words = clean.split(/\s+/).filter(w => /[a-zA-ZÀ-ÿ0-9]/.test(w));
            if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
            return clean.slice(0, 2).toUpperCase();
        }

        // Cor estável derivada do nome: cursos sem imagem ficam distinguíveis entre si.
        function initialsHue(name) {
            let hash = 0;
            for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
            return hash;
        }

        function courseProgress(subjectId, theme) {
            const total = (theme.modules || []).length;
            const done = (completionStatus[subjectId]?.[theme.id] || []).filter(Boolean).length;
            const approved = assessmentResults[subjectId]?.[theme.id];
            const pct = total === 0 ? 0 : Math.round((Math.min(done, total) / total) * 100);
            return { total, done: Math.min(done, total), pct, approved };
        }

        function buildCourseCard(subjectId, theme) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'course-card';
            card.dataset.themeId = theme.id;
            card.dataset.search = (theme.name + ' ' + (theme.description || '')).toLowerCase();

            const { total, done, pct, approved } = courseProgress(subjectId, theme);

            const thumb = document.createElement('div');
            thumb.className = 'course-thumb';
            const imageSrc = window.UniAdminImages
                ? window.UniAdminImages.resolve(currentCategorySlug, subjectId, theme.id, theme)
                : (theme.image || null);
            if (imageSrc) {
                const img = document.createElement('img');
                img.src = imageSrc;
                img.alt = theme.name;
                img.width = 128; img.height = 128;
                img.loading = 'lazy';
                img.decoding = 'async';
                // Imagem quebrada no banco: cai nas iniciais em vez de deixar o card vazio.
                img.onerror = () => { thumb.innerHTML = ''; thumb.appendChild(buildInitials(theme.name)); };
                thumb.appendChild(img);
            } else {
                thumb.appendChild(buildInitials(theme.name));
            }
            if (approved !== undefined) {
                const badge = document.createElement('span');
                badge.className = 'course-badge-done';
                badge.innerHTML = '<i class="fas fa-circle-check"></i>';
                badge.title = `Aprovado com nota ${formatScore(approved)}`;
                thumb.appendChild(badge);
            }

            const body = document.createElement('div');
            body.className = 'course-body';

            const h3 = document.createElement('h3');
            h3.textContent = theme.name;
            body.appendChild(h3);

            const desc = document.createElement('p');
            desc.className = 'course-desc';
            desc.textContent = theme.description || 'Sem descrição cadastrada para este curso.';
            if (!theme.description) desc.classList.add('is-empty');
            body.appendChild(desc);

            const meta = document.createElement('div');
            meta.className = 'course-meta';
            meta.innerHTML = `
                <span><i class="fas fa-play-circle"></i> ${total} ${total === 1 ? 'módulo' : 'módulos'}</span>
                <span><i class="fas fa-clipboard-list"></i> ${quizData[`${subjectId}_${theme.id}`]?.length || 0} questões</span>`;
            body.appendChild(meta);

            const tagRow = document.createElement('div');
            tagRow.className = 'course-tag-row';

            const certTag = document.createElement('div');
            certTag.className = theme.certificateEnabled ? 'course-cert-tag has-cert' : 'course-cert-tag no-cert';
            certTag.innerHTML = theme.certificateEnabled
                ? '<i class="fas fa-award"></i> Emite certificado'
                : '<i class="fas fa-ban"></i> Não emite certificado';
            tagRow.appendChild(certTag);

            // Balão do tempo estimado: só aparece em curso com
            // expectedCompletionMs configurado (mesmo campo do painel
            // "Tempo mínimo projetado" da sidebar).
            const expectedMs = Number(theme.expectedCompletionMs);
            if (Number.isFinite(expectedMs) && expectedMs > 0) {
                const timeTag = document.createElement('div');
                timeTag.className = 'course-cert-tag course-time-tag';
                timeTag.innerHTML = `<i class="fas fa-clock"></i> Tempo estimado ${formatElapsedHHMMSS(expectedMs)}`;
                timeTag.title = `Tempo estimado para conclusão: ${formatElapsedHHMMSS(expectedMs)}`;
                tagRow.appendChild(timeTag);
            }

            body.appendChild(tagRow);

            const progress = document.createElement('div');
            progress.className = 'course-progress';
            progress.innerHTML = `
                <div class="course-progress-bar"><span style="width:${pct}%"></span></div>
                <div class="course-progress-label">${done}/${total} concluídos${approved !== undefined ? ` &bull; nota ${formatScore(approved)}` : ''}</div>`;
            if (pct === 100) progress.classList.add('is-complete');
            body.appendChild(progress);

            card.appendChild(thumb);
            card.appendChild(body);
            card.onclick = () => openCourse(subjectId, theme.id, theme.name);
            return card;
        }

        // O atalho de volta (e a seta que o antecede) só faz sentido com um curso aberto.
        function setBackToCoursesVisible(visible) {
            backToCoursesBtn.style.display = visible ? 'inline-flex' : 'none';
            if (selectionDivider) selectionDivider.style.display = visible ? 'block' : 'none';
        }

        function buildInitials(name) {
            const span = document.createElement('span');
            span.className = 'course-initials';
            span.textContent = courseInitials(name);
            span.style.setProperty('--initials-hue', initialsHue(name));
            return span;
        }

        function showCourseGallery(subjectId) {
            pendingMode = false;
            pauseActiveCourseTimer(true);
            hideExpectedTimePanel();
            currentTrainingId = subjectId;
            currentThemeId = null;
            courseGrid.innerHTML = '';
            const themes = getSortedThemes(subjectId);
            themes.forEach(theme => courseGrid.appendChild(buildCourseCard(subjectId, theme)));

            galleryTitle.textContent = trainingData[subjectId]?.name || 'Cursos disponíveis';
            gallerySub.textContent = themes.length === 1
                ? '1 curso disponível — clique no card para começar'
                : `${themes.length} cursos disponíveis — clique no card para começar`;
            galleryEmpty.style.display = themes.length ? 'none' : 'flex';
            if (galleryFilter) galleryFilter.value = '';

            document.getElementById('welcome-screen').style.display = 'none';
            contentDiv.style.display = 'none';
            courseGallery.style.display = 'block';
            setBackToCoursesVisible(false);
            themeBtn.textContent = 'Escolha um Assunto';
        }

        /* ─── FILTRO "PENDENTES" (js/pendentes-ui.js) ───
           Mostra na galeria só os cursos não concluídos desta plataforma, de
           todos os temas. Pendências de outra plataforma viram um aviso com
           link (portal.html?cat=…&pend=1 abre direto neste filtro). */
        let pendingMode = false;
        let pendingPrev = null; // galeria/tema em que o aluno estava antes do filtro

        function showPendingGallery(lista) {
            if (!trainingData || !Object.keys(trainingData).length) return false;
            if (!pendingMode) pendingPrev = { subjectId: currentTrainingId, label: getSubjectLabel(), gallery: courseGallery.style.display === 'block' };
            pauseActiveCourseTimer(true);
            hideExpectedTimePanel();
            currentThemeId = null;
            courseGrid.innerHTML = '';
            const daqui = (lista || []).filter(c => c.slug === currentCategorySlug && c.prazo !== 'closed');
            const fora = (lista || []).filter(c => c.slug !== currentCategorySlug && c.prazo !== 'closed');
            let n = 0;
            daqui.forEach(c => {
                const theme = trainingData[c.subjectId]?.themes?.[c.themeId];
                if (!theme) return;
                const card = buildCourseCard(c.subjectId, { ...theme, id: c.themeId });
                card.onclick = () => {
                    pendingMode = false;
                    currentTrainingId = c.subjectId;
                    setSubjectLabel(trainingData[c.subjectId]?.name || '');
                    openCourse(c.subjectId, c.themeId, theme.name);
                };
                courseGrid.appendChild(card);
                n++;
            });
            const porCat = {};
            fora.forEach(c => { (porCat[c.catNome] = porCat[c.catNome] || []).push(c); });
            Object.keys(porCat).forEach(cat => {
                const k = porCat[cat].length;
                const a = document.createElement('a');
                a.className = 'pend-outra-cat';
                a.href = `portal.html?cat=${encodeURIComponent(cat)}&pend=1`;
                a.innerHTML = `<i class="fas fa-arrow-up-right-from-square"></i><span><strong>${k} pendente${k === 1 ? '' : 's'} em ${cat}</strong><small>Abrir a plataforma já filtrada</small></span>`;
                courseGrid.appendChild(a);
            });
            setSubjectLabel('Pendentes');
            galleryTitle.textContent = 'Treinamentos pendentes';
            gallerySub.textContent = n === 0 ? 'Nenhum curso pendente nesta plataforma'
                : `${n} curso${n === 1 ? '' : 's'} não concluído${n === 1 ? '' : 's'} — clique no card para continuar`;
            galleryEmpty.style.display = (n || fora.length) ? 'none' : 'flex';
            if (galleryFilter) galleryFilter.value = '';
            document.getElementById('welcome-screen').style.display = 'none';
            contentDiv.style.display = 'none';
            courseGallery.style.display = 'block';
            setBackToCoursesVisible(false);
            pendingMode = true;
            return true;
        }

        function leavePendingGallery() {
            if (!pendingMode) return;
            pendingMode = false;
            const prev = pendingPrev; pendingPrev = null;
            if (prev?.subjectId && trainingData[prev.subjectId]) {
                setSubjectLabel(prev.label);
                showCourseGallery(prev.subjectId);
            } else {
                setSubjectLabel('Escolha um Tema');
                courseGallery.style.display = 'none';
                document.getElementById('welcome-screen').style.display = '';
            }
        }

        window.UniAdmin.PendingGallery = {
            show: showPendingGallery,
            hide: leavePendingGallery,
            isActive: () => pendingMode && courseGallery.style.display === 'block',
            ready: () => !!(trainingData && Object.keys(trainingData).length)
        };

        function openCourse(subjectId, themeId, themeName) {
            themeBtn.textContent = themeName;
            courseGallery.style.display = 'none';
            setBackToCoursesVisible(true);
            loadTraining(subjectId, themeId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (backToCoursesBtn) {
            backToCoursesBtn.onclick = () => {
                if (!currentTrainingId) return;
                if (currentThemeId != null && loadQuizAttempt(currentTrainingId, currentThemeId)) {
                    showWarning('Termine a avaliação em andamento antes de sair do curso.');
                    return;
                }
                if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
                resetContent();
                showCourseGallery(currentTrainingId);
            };
        }

        // Login/logout ou mudança de função na planilha: a lista de cursos
        // visíveis muda, então dropdown e galeria são remontados.
        document.addEventListener('uniadmin:session-updated', () => {
            populateDropdown();
            if (currentTrainingId && courseGallery.style.display === 'block') {
                showCourseGallery(currentTrainingId);
            }
        });

        if (galleryFilter) {
            galleryFilter.addEventListener('input', () => {
                const term = galleryFilter.value.trim().toLowerCase();
                let visible = 0;
                courseGrid.querySelectorAll('.course-card').forEach(card => {
                    const match = !term || card.dataset.search.includes(term);
                    card.style.display = match ? '' : 'none';
                    if (match) visible++;
                });
                galleryEmpty.style.display = visible ? 'none' : 'flex';
            });
        }

        function validateEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }

        document.getElementById('email').addEventListener('input', function() {
            if (!validateEmail(this.value)) this.classList.add('invalid');
            else this.classList.remove('invalid');
        });

        // Nome do estagiário sempre em caixa alta. O CSS só muda a aparência —
        // aqui o valor é convertido de fato, para gravar em maiúsculas no banco.
        // O cursor é reposicionado porque reescrever `value` o joga para o fim.
        document.getElementById('name').addEventListener('input', function() {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            const upper = this.value.toUpperCase();
            if (upper === this.value) return;
            this.value = upper;
            this.setSelectionRange(start, end);
        });

        function showWarning(message) {
            warningText.textContent = message;
            warningMessage.style.display = 'flex';
            setTimeout(() => { warningMessage.style.display = 'none'; }, 3000);
        }

        // Modal de confirmação para avaliação <= 4 estrelas sem comentário.
        // Não bloqueia o envio — apenas confirma que o aluno quer publicar
        // sem explicar o motivo da nota baixa.
        function openLowRatingModal({ onBack, onConfirm }) {
            const modal = document.getElementById('low-rating-modal');
            const backBtn = document.getElementById('low-rating-back-btn');
            const confirmBtn = document.getElementById('low-rating-confirm-btn');

            const close = () => { modal.classList.remove('active'); cleanup(); };
            const handleBack = () => { close(); onBack?.(); };
            const handleConfirm = () => { close(); onConfirm?.(); };
            const handleOverlayClick = (e) => { if (e.target === modal) handleBack(); };

            function cleanup() {
                backBtn.removeEventListener('click', handleBack);
                confirmBtn.removeEventListener('click', handleConfirm);
                modal.removeEventListener('click', handleOverlayClick);
            }

            backBtn.addEventListener('click', handleBack);
            confirmBtn.addEventListener('click', handleConfirm);
            modal.addEventListener('click', handleOverlayClick);

            modal.classList.add('active');
        }

        function renderPage(pageNum) {
            // Página 1 é capa: não conta tempo. A contagem começa na página 2.
            // Exceção: PDF curto (até 6 páginas) — aí a página 1 já é conteúdo.
            setModuleTimerGate(pageNum === 1 && totalPages > 6 ? 'waiting' : 'free');
            // Virar página é a interação de estudo do módulo de PDF: rearma (ou
            // solta) a trava de inatividade de 10 min.
            registerStudyActivity();
            pdfDoc.getPage(pageNum).then(page => {
                const viewport = page.getViewport({ scale: 1.5 });
                pdfCanvas.height = viewport.height;
                pdfCanvas.width = viewport.width;
                const context = pdfCanvas.getContext('2d');
                page.render({ canvasContext: context, viewport: viewport });
                currentPage = pageNum;
                renderPagination();
                if (currentPage === totalPages) markCurrentModuleCompleted();
            });
        }

        function renderPagination() {
            pdfNavigation.innerHTML = '';
            const maxButtons = 3;
            let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);
            if (endPage - startPage + 1 < maxButtons) startPage = Math.max(1, endPage - maxButtons + 1);

            const firstBtn = document.createElement('button');
            firstBtn.innerHTML = '<i class="fas fa-fast-backward"></i>';
            firstBtn.disabled = currentPage === 1;
            firstBtn.onclick = () => { if (currentPage !== 1) renderPage(1); };
            pdfNavigation.appendChild(firstBtn);

            for (let i = startPage; i <= endPage; i++) {
                const b = document.createElement('button');
                b.textContent = i;
                b.className = i === currentPage ? 'active' : '';
                b.onclick = () => renderPage(i);
                pdfNavigation.appendChild(b);
            }

            const lastBtn = document.createElement('button');
            lastBtn.innerHTML = '<i class="fas fa-fast-forward"></i>';
            let originalIndexForPDF = currentModuleIndex;
            if (currentTrainingId && currentThemeId != null && currentModuleIndex != null) {
                originalIndexForPDF = moduleIndexMapping.has(currentModuleIndex) ? moduleIndexMapping.get(currentModuleIndex) : currentModuleIndex;
            }
            lastBtn.disabled = currentPage === totalPages ||
                (currentTrainingId && currentThemeId != null && currentModuleIndex != null &&
                !completionStatus[currentTrainingId]?.[currentThemeId]?.[originalIndexForPDF]);
            lastBtn.onclick = () => {
                if (currentPage !== totalPages) {
                    if (currentTrainingId && currentThemeId != null && currentModuleIndex != null) {
                        const origIdx = moduleIndexMapping.has(currentModuleIndex) ? moduleIndexMapping.get(currentModuleIndex) : currentModuleIndex;
                        if (!completionStatus[currentTrainingId]?.[currentThemeId]?.[origIdx]) {
                            showWarning('Visualize todas as páginas antes de usar este atalho.');
                            return;
                        }
                    }
                    renderPage(totalPages);
                }
            };
            pdfNavigation.appendChild(lastBtn);

            // Em apostilas longas, avançar de 3 em 3 botões é inviável: acima de
            // a partir de PAGE_JUMP_MIN_PAGES aparece um seletor com a lista de páginas.
            if (totalPages >= PAGE_JUMP_MIN_PAGES) pdfNavigation.appendChild(buildPageJumpPicker());
        }

        // Seletor "Página X de N" — popover com busca e a lista completa de
        // páginas, ancorado no botão pela posição na viewport (a barra do PDF
        // tem overflow próprio e cortaria um popover posicionado por dentro).
        const PAGE_JUMP_MIN_PAGES = 6;

        function buildPageJumpPicker() {
            const wrap = document.createElement('div');
            wrap.className = 'pdf-jump';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pdf-jump-btn';
            btn.setAttribute('aria-haspopup', 'true');
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = `<i class="fas fa-list-ol"></i><span>Página ${currentPage} de ${totalPages}</span><i class="fas fa-chevron-up pdf-jump-arrow"></i>`;

            const popover = document.createElement('div');
            popover.className = 'pdf-jump-popover';
            popover.hidden = true;
            popover.innerHTML = `
                <div class="pdf-jump-head">
                    <input type="number" class="pdf-jump-search" min="1" max="${totalPages}" placeholder="Ir para a página..." autocomplete="off">
                </div>
                <div class="pdf-jump-list"></div>`;

            const searchInput = popover.querySelector('.pdf-jump-search');
            const listEl = popover.querySelector('.pdf-jump-list');

            function renderList() {
                const term = searchInput.value.trim();
                const pages = [];
                for (let i = 1; i <= totalPages; i++) {
                    if (!term || String(i).startsWith(term)) pages.push(i);
                }
                if (pages.length === 0) {
                    listEl.innerHTML = '<p class="pdf-jump-empty">Nenhuma página encontrada.</p>';
                    return;
                }
                listEl.innerHTML = pages.map(i => `
                    <button type="button" class="pdf-jump-option ${i === currentPage ? 'is-current' : ''}" data-page="${i}">
                        <span>Página ${i}</span>
                        ${i === currentPage ? '<i class="fas fa-check"></i>' : ''}
                    </button>`).join('');
                listEl.querySelectorAll('.pdf-jump-option').forEach(option => {
                    option.onclick = () => {
                        const page = Number(option.dataset.page);
                        close();
                        if (page !== currentPage) renderPage(page);
                    };
                });
            }

            function position() {
                if (popover.hidden) return;
                const rect = btn.getBoundingClientRect();
                const gap = 6;
                const margin = 10;
                const width = Math.max(rect.width, 190);
                popover.style.width = `${width}px`;
                popover.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
                // A barra de navegação fica no rodapé, então o padrão é abrir
                // para cima; só cai para baixo se não couber acima.
                popover.style.top = '0px';
                const spaceAbove = rect.top - gap - margin;
                const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
                const openUp = spaceAbove >= spaceBelow;
                const available = Math.max(160, openUp ? spaceAbove : spaceBelow);
                const chrome = popover.offsetHeight - listEl.offsetHeight;
                listEl.style.maxHeight = `${Math.max(120, available - chrome)}px`;
                popover.style.top = openUp
                    ? `${rect.top - gap - Math.min(popover.offsetHeight, available)}px`
                    : `${rect.bottom + gap}px`;
            }

            function onOutsideClick(event) {
                if (!popover.contains(event.target) && !btn.contains(event.target)) close();
            }
            function onKeydown(event) {
                if (event.key === 'Escape') close();
            }

            function close() {
                if (popover.hidden) return;
                popover.hidden = true;
                btn.setAttribute('aria-expanded', 'false');
                document.removeEventListener('click', onOutsideClick, true);
                document.removeEventListener('keydown', onKeydown);
                window.removeEventListener('resize', position);
                window.removeEventListener('scroll', position, true);
                popover.remove();
            }

            btn.onclick = () => {
                if (!popover.hidden) { close(); return; }
                document.body.appendChild(popover);
                popover.hidden = false;
                btn.setAttribute('aria-expanded', 'true');
                searchInput.value = '';
                renderList();
                position();
                // Rolar até a página atual evita abrir a lista no topo quando o
                // aluno já está na página 80 de 120.
                const currentOption = listEl.querySelector('.pdf-jump-option.is-current');
                if (currentOption) {
                    listEl.scrollTop = currentOption.offsetTop - (listEl.clientHeight / 2) + (currentOption.offsetHeight / 2);
                }
                document.addEventListener('click', onOutsideClick, true);
                document.addEventListener('keydown', onKeydown);
                window.addEventListener('resize', position);
                window.addEventListener('scroll', position, true);
                setTimeout(() => searchInput.focus(), 40);
            };

            searchInput.oninput = () => { renderList(); position(); };
            searchInput.onkeydown = (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const page = Number(searchInput.value);
                if (!Number.isInteger(page) || page < 1 || page > totalPages) return;
                close();
                if (page !== currentPage) renderPage(page);
            };

            wrap.appendChild(btn);
            return wrap;
        }

        function loadPDF(pdfPath) {
            const baseUrl = 'https://dl.dropboxusercontent.com/s/';
            const fullUrl = `${baseUrl}${pdfPath}`;
            fetch(fullUrl, { method: 'HEAD' })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                    return pdfjsLib.getDocument(fullUrl).promise;
                })
                .then(doc => {
                    pdfDoc = doc;
                    totalPages = doc.numPages;
                    currentPage = 1;
                    renderPage(currentPage);
                })
                .catch(error => {
                    console.error('Erro ao carregar PDF:', error);
                    showWarning('Não foi possível carregar o PDF.');
                });
        }

        btn.onclick = (e) => {
            e.stopPropagation();
            if (dropdownContent.style.display === 'block') closeSubjectDropdown();
            else openSubjectDropdown();
        };

        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdownContent.contains(e.target)) closeSubjectDropdown();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdownContent.style.display === 'block') {
                closeSubjectDropdown();
                btn.focus();
            }
        });

        function loadTraining(subjectId, themeId) {
            if (!subjectId || !themeId) return;
            currentTrainingId = subjectId;
            currentThemeId = themeId;
            const theme = trainingData[subjectId].themes[themeId];
            if (!theme) return;
            // Contador começa na ABERTURA do curso, antes de qualquer checagem
            // de conteúdo — curso ainda sem módulos cadastrados também conta o
            // tempo em que ficou aberto na tela.
            resumeActiveCourseTimer(subjectId, themeId);
            // Painel de tempo projetado acompanha o curso aberto (some sozinho
            // se este não tiver expectedCompletionMs configurado).
            startExpectedTimeTicker();
            paintExpectedTimePanel();
            if (!theme.modules || theme.modules.length === 0) return;

            document.getElementById('welcome-screen').style.display = 'none';
            courseGallery.style.display = 'none';
            setBackToCoursesVisible(true);
            contentDiv.style.display = 'block';

            const sidebarName = document.getElementById('sidebar-course-name');
            if (sidebarName) sidebarName.textContent = themeBtn.textContent;

            if (!completionStatus[subjectId]) completionStatus[subjectId] = {};
            if (!completionStatus[subjectId][themeId] || completionStatus[subjectId][themeId].length !== theme.modules.length) {
                completionStatus[subjectId][themeId] = new Array(theme.modules.length).fill(false);
                saveProgression();
            }

            const modulesWithIndex = theme.modules.map((mod, idx) => ({ mod, idx }));
            const sortedModules = sortItems(modulesWithIndex, orderData.modules?.[subjectId]?.[themeId], 'idx');
            const modules = sortedModules.map(({item}) => item.mod);
            moduleIndexMapping.clear();
            sortedModules.forEach(({item}, newIndex) => { moduleIndexMapping.set(newIndex, item.idx); });

            loadModule(modules[0], modules, 0);
            modulesDiv.innerHTML = '';

            modules.forEach((mod, displayIndex) => {
                const originalIndex = moduleIndexMapping.get(displayIndex);
                const div = document.createElement('div');
                div.className = 'module';
                div.innerHTML = renderModuleTitle(mod.title, completionStatus[subjectId][themeId][originalIndex], shortsCountOf(mod));
                if (completionStatus[subjectId][themeId][originalIndex]) div.classList.add('completed');
                div.onclick = () => {
                    // Avaliação em andamento: nada de módulo destrava o aluno
                    // dela — nem reload nem clique na sidebar.
                    if (loadQuizAttempt(subjectId, themeId)) {
                        showWarning('Termine a avaliação em andamento antes de voltar ao conteúdo.');
                        return;
                    }
                    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
                    div.classList.add('active');
                    loadModule(mod, modules, displayIndex);
                };
                if (displayIndex === 0) div.classList.add('active');
                modulesDiv.appendChild(div);
            });

            const assessmentDiv = document.createElement('div');
            assessmentDiv.className = 'module';
            assessmentDiv.id = 'assessment-module';
            assessmentDiv.innerHTML = renderAssessmentTitle(assessmentResults[subjectId]?.[themeId] !== undefined);
            if (assessmentResults[subjectId] && assessmentResults[subjectId][themeId]) assessmentDiv.classList.add('completed');

            assessmentDiv.onclick = () => {
                document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
                assessmentDiv.classList.add('active');
                if (assessmentResults[subjectId] && assessmentResults[subjectId][themeId]) {
                    showAssessmentResult(assessmentResults[subjectId][themeId]);
                    return;
                }
                const allDone = completionStatus[subjectId][themeId].every(Boolean);
                if (!allDone) { showWarning('Conclua todos os módulos antes da avaliação.'); return; }

                // Prazo encerrado bloqueia a avaliação; o conteúdo continua
                // acessível normalmente (só este clique é barrado).
                const theme = trainingData[subjectId]?.themes?.[themeId];
                if (window.UniAdmin?.Deadlines?.isAssessmentBlocked(theme?.deadline)) {
                    showWarning('O prazo deste curso foi encerrado. Fale com o administrador.');
                    return;
                }

                // Login obrigatório para realizar a avaliação, exceto em Estágios
                // (mantém o fluxo de nome digitado livremente, sem conta).
                if (currentCategory !== 'Estágios' && !window.UniAdmin?.StudentAuth?.getSession()) {
                    window.UniAdmin.StudentAuth.openModal({
                        intent: 'assessment',
                        onSuccess: () => openQuizGuarded(subjectId, themeId)
                    });
                    return;
                }
                openQuizGuarded(subjectId, themeId);
            };
            modulesDiv.appendChild(assessmentDiv);

            // Prova em andamento (não finalizada) para este curso: força a
            // retomada direto na tela do quiz, mesmo após recarregar a página
            // — impede "escapar" da avaliação voltando para os módulos.
            if (loadQuizAttempt(subjectId, themeId)) {
                assessmentDiv.classList.add('active');
                document.querySelectorAll('.module').forEach(m => { if (m !== assessmentDiv) m.classList.remove('active'); });
                openQuiz(subjectId, themeId);
            }
        }

        // ─── TENTATIVA DE AVALIAÇÃO PERSISTENTE (localStorage) ───
        // Guarda início real (timestamp) + respostas parciais, para o timer
        // sobreviver a reload/fechar a página e para forçar o envio ao expirar
        // sem depender da aba continuar aberta.
        function quizAttemptKey(subjectId, themeId) {
            return `quizAttempt_${subjectId}_${themeId}`;
        }

        function loadQuizAttempt(subjectId, themeId) {
            try {
                const raw = localStorage.getItem(quizAttemptKey(subjectId, themeId));
                return raw ? JSON.parse(raw) : null;
            } catch (error) { return null; }
        }

        function saveQuizAttempt(subjectId, themeId, attempt) {
            try { localStorage.setItem(quizAttemptKey(subjectId, themeId), JSON.stringify(attempt)); }
            catch (error) { /* indisponível */ }
        }

        function clearQuizAttempt(subjectId, themeId) {
            try { localStorage.removeItem(quizAttemptKey(subjectId, themeId)); }
            catch (error) { /* indisponível */ }
        }

        // Minutos da prova = 3 min por questão.
        function quizDurationMs(questionCount) {
            return questionCount * 3 * 60 * 1000;
        }

        function formatClock(ms) {
            const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
            const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const s = (totalSeconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        }

        // Trava de tentativas (js/attempts.js): confere o bloqueio na nuvem
        // antes de abrir a prova, para valer mesmo se o aluno trocar de
        // dispositivo. Estágios não tem conta, então não entra nesta trava.
        async function openQuizGuarded(subjectId, themeId) {
            const session = window.UniAdmin?.StudentAuth?.getSession();
            if (!session || !window.UniAdmin?.Attempts) { openQuiz(subjectId, themeId); return; }

            const state = await window.UniAdmin.Attempts.getState(session.userId, currentCategorySlug, subjectId, themeId);
            if (state.locked) { showAttemptsLockedAlert(state); return; }
            openQuiz(subjectId, themeId, state);
        }

        // Alerta elegante exibido quando as tentativas disponíveis foram
        // usadas sem aprovação. Substitui a tela normal de conteúdo — não é
        // um toast, pois a ação (falar com admin) precisa ficar visível até
        // o aluno sair.
        function showAttemptsLockedAlert(state) {
            const A = window.UniAdmin?.Attempts;
            const limit = A ? A.limitFor(state) : 3;
            resetContent();
            contentDiv.style.display = 'block';
            resultContainer.innerHTML = `
                <div class="attempts-locked-card">
                    <div class="attempts-locked-icon"><i class="fas fa-lock"></i></div>
                    <h2>Limite de tentativas atingido</h2>
                    <p>Você usou as ${limit} tentativas disponíveis para esta avaliação e não atingiu a nota mínima.</p>
                    <p>Fale com um administrador para liberar novas tentativas.</p>
                </div>`;
            resultContainer.style.display = 'flex';
        }

        function openQuiz(subjectId, themeId, attemptsState = null) {
            if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
            customPlayerContainer.style.display = 'none';
            video.style.display = 'none';
            video.src = '';
            pdfContainer.style.display = 'none';
            document.body.classList.remove('cinema-active');

            const quizKey = `${subjectId}_${themeId}`;
            if (quizStatus[quizKey] === false) { showWarning('Avaliação indisponível no momento.'); return; }
            const questions = quizData[quizKey];
            if (!questions) { showWarning('Nenhuma avaliação disponível para este tema.'); return; }

            // Tentativa já em andamento (reload/reabertura): pula intro e
            // confirmação, retoma direto no ponto (bloqueia "voltar" da prova).
            const existing = loadQuizAttempt(subjectId, themeId);
            if (existing) { loadQuiz(subjectId, themeId); return; }

            openQuizIntro(subjectId, themeId, questions.length, attemptsState);
        }

        function openQuizIntro(subjectId, themeId, questionCount, attemptsState = null) {
            resetContent();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const minutes = questionCount * 3;
            document.getElementById('quiz-intro-count').textContent = `${questionCount} questões`;
            document.getElementById('quiz-intro-time').textContent = `${minutes} minutos`;

            // Contador de tentativas (js/attempts.js): só aparece para aluno
            // logado com pelo menos 1 reprovação já registrada neste curso —
            // na primeira tentativa não há o que avisar ainda. O limite
            // exibido já reflete tentativas extras liberadas pelo admin.
            const attemptsFact = document.getElementById('quiz-intro-attempts-fact');
            const attemptsNote = document.getElementById('quiz-intro-attempts-note');
            const A = window.UniAdmin?.Attempts;
            const usedAttempts = attemptsState?.count || 0;
            const limit = A && attemptsState ? A.limitFor(attemptsState) : (A ? A.MAX_ATTEMPTS : 3);
            if (usedAttempts > 0) {
                const isLastChance = usedAttempts + 1 >= limit;
                const hasExtra = attemptsState?.extraAttempts > 0;
                document.getElementById('quiz-intro-attempts').textContent = `Tentativa ${usedAttempts + 1} de ${limit}${hasExtra ? ' (+1 extra liberada)' : ''}`;
                attemptsFact.style.display = 'flex';
                attemptsFact.classList.toggle('quiz-intro-fact--last-chance', isLastChance);
                attemptsNote.style.display = isLastChance ? 'block' : 'none';
            } else {
                attemptsFact.style.display = 'none';
                attemptsNote.style.display = 'none';
            }

            const modal = document.getElementById('quiz-intro-modal');
            const startBtn = document.getElementById('quiz-intro-start-btn');
            const cancelBtn = document.getElementById('quiz-intro-cancel-btn');

            const close = () => { modal.classList.remove('active'); cleanup(); };
            const handleStart = () => { close(); openQuizConfirm(subjectId, themeId, attemptsState); };
            const handleCancel = () => close();
            const handleOverlayClick = (e) => { if (e.target === modal) handleCancel(); };

            function cleanup() {
                startBtn.removeEventListener('click', handleStart);
                cancelBtn.removeEventListener('click', handleCancel);
                modal.removeEventListener('click', handleOverlayClick);
            }

            startBtn.addEventListener('click', handleStart);
            cancelBtn.addEventListener('click', handleCancel);
            modal.addEventListener('click', handleOverlayClick);

            modal.classList.add('active');
        }

        function openQuizConfirm(subjectId, themeId, attemptsState = null) {
            const modal = document.getElementById('quiz-confirm-modal');
            const startBtn = document.getElementById('quiz-confirm-start-btn');
            const backBtn = document.getElementById('quiz-confirm-back-btn');

            const close = () => { modal.classList.remove('active'); cleanup(); };
            const handleStart = () => {
                close();
                const questions = quizData[`${subjectId}_${themeId}`] || [];
                saveQuizAttempt(subjectId, themeId, {
                    startedAt: Date.now(),
                    durationMs: quizDurationMs(questions.length),
                    selectedAnswers: {}
                });
                loadQuiz(subjectId, themeId);
            };
            const handleBack = () => { close(); openQuizIntro(subjectId, themeId, (quizData[`${subjectId}_${themeId}`] || []).length, attemptsState); };
            const handleOverlayClick = (e) => { if (e.target === modal) handleBack(); };

            function cleanup() {
                startBtn.removeEventListener('click', handleStart);
                backBtn.removeEventListener('click', handleBack);
                modal.removeEventListener('click', handleOverlayClick);
            }

            startBtn.addEventListener('click', handleStart);
            backBtn.addEventListener('click', handleBack);
            modal.addEventListener('click', handleOverlayClick);

            modal.classList.add('active');
        }

        function renderAssessmentTitle(completed) {
            return completed
                ? '<i class="fas fa-clipboard-check" style="color:var(--success);margin-right:8px;"></i>Avaliação <i class="fas fa-circle-check status-icon" aria-hidden="true"></i>'
                : '<i class="fas fa-clipboard-list" style="color:#92400e;margin-right:8px;"></i>Avaliação Final';
        }

        // ═══════════════════════════════════════════════════════════════
        // QUIZ DE CARDS — perguntas rápidas (módulos type:'quiz')
        // ═══════════════════════════════════════════════════════════════
        // Um card por vez: o aluno responde e a correção aparece na hora,
        // sem nota nem envio. Serve como fixação dentro do conteúdo, então
        // não tem relação com a Avaliação Final (quizData/PASSING_SCORE).
        // O módulo conclui quando todas as perguntas foram respondidas.
        const mquizStage = document.getElementById('mquiz-stage');
        const mquizCardArea = document.getElementById('mquiz-card-area');
        const mquizDotsEl = document.getElementById('mquiz-dots');
        const mquizPrevBtn = document.getElementById('mquiz-prev');
        const mquizNextBtn = document.getElementById('mquiz-next');
        const mquizProgressFill = document.getElementById('mquiz-progress-fill');
        const mquizProgressCount = document.getElementById('mquiz-progress-count');
        const MQUIZ_LETTERS = ['A', 'B', 'C', 'D'];

        // O texto das perguntas vem do cadastro do admin e é injetado via
        // innerHTML abaixo — sem escapar, um "<" no enunciado quebraria o card.
        function escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, ch => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[ch]));
        }

        let mquizQuestions = [];
        let mquizIndex = 0;
        // Resposta escolhida em cada card (null = ainda não respondeu). Vive só
        // enquanto o módulo está aberto: reabrir o módulo começa de novo.
        let mquizAnswers = [];

        function hideModuleQuiz() {
            if (!mquizStage) return;
            mquizStage.style.display = 'none';
            if (mquizCardArea) mquizCardArea.innerHTML = '';
            mquizQuestions = [];
            mquizAnswers = [];
            mquizIndex = 0;
        }

        function renderModuleQuiz(questions) {
            if (!mquizStage) return;
            mquizQuestions = Array.isArray(questions) ? questions : [];
            mquizAnswers = mquizQuestions.map(() => null);
            mquizIndex = 0;
            mquizStage.style.display = 'flex';
            if (mquizQuestions.length === 0) {
                mquizCardArea.innerHTML = '<p class="mquiz-empty">Nenhuma pergunta cadastrada neste módulo.</p>';
                // Sem perguntas não há o que responder: o módulo já conta como visto.
                markCurrentModuleCompleted();
                return;
            }
            paintModuleQuiz();
        }

        function paintModuleQuiz() {
            const question = mquizQuestions[mquizIndex];
            if (!question) return;
            const answered = mquizAnswers[mquizIndex];
            const total = mquizQuestions.length;

            const optionsHtml = question.options.map((option, i) => {
                const isCorrect = i === question.correct;
                // Depois de responder, o card fica travado: a correta sempre
                // aparece e a errada escolhida fica destacada ao lado dela.
                const state = answered === null
                    ? ''
                    : isCorrect ? 'is-correct' : (i === answered ? 'is-wrong' : 'is-muted');
                return `
                    <button type="button" class="mquiz-answer ${state}" data-option="${i}" ${answered === null ? '' : 'disabled'}>
                        <span class="mquiz-answer-letter">${MQUIZ_LETTERS[i]}</span>
                        <span class="mquiz-answer-text">${escapeHtml(option)}</span>
                        ${answered !== null && isCorrect ? '<i class="fas fa-circle-check mquiz-answer-icon"></i>' : ''}
                        ${answered !== null && !isCorrect && i === answered ? '<i class="fas fa-circle-xmark mquiz-answer-icon"></i>' : ''}
                    </button>`;
            }).join('');

            const gotItRight = answered === question.correct;
            const feedbackText = gotItRight
                ? 'Resposta correta!'
                : `Resposta correta: <strong>${MQUIZ_LETTERS[question.correct]}</strong> — ${escapeHtml(question.options[question.correct])}`;
            const explanationHtml = question.explanation
                ? `<div class="mquiz-explanation">
                       <span class="mquiz-explanation-label"><i class="fas fa-lightbulb"></i> Explicação</span>
                       <p>${escapeHtml(question.explanation)}</p>
                   </div>`
                : '';
            const feedbackHtml = answered === null ? '' : `
                <div class="mquiz-feedback ${gotItRight ? 'is-right' : 'is-wrong'}">
                    <i class="fas ${gotItRight ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                    <span>${feedbackText}</span>
                </div>
                ${explanationHtml}`;

            const imageHtml = question.image
                ? `<div class="mquiz-card-image"><img src="${escapeHtml(question.image)}" alt=""></div>`
                : '';
            mquizCardArea.innerHTML = `
                <div class="mquiz-card" data-index="${mquizIndex}">
                    <span class="mquiz-card-badge">Pergunta ${mquizIndex + 1} de ${total}</span>
                    ${imageHtml}
                    <h3 class="mquiz-card-question">${escapeHtml(question.question)}</h3>
                    <div class="mquiz-answers">${optionsHtml}</div>
                    ${feedbackHtml}
                </div>`;

            mquizCardArea.querySelectorAll('.mquiz-answer[data-option]').forEach(btn => {
                btn.onclick = () => answerModuleQuiz(Number(btn.dataset.option));
            });

            const answeredCount = mquizAnswers.filter(a => a !== null).length;
            if (mquizProgressFill) mquizProgressFill.style.width = `${(answeredCount / total) * 100}%`;
            if (mquizProgressCount) mquizProgressCount.textContent = `${answeredCount} / ${total} respondidas`;

            if (mquizDotsEl) {
                mquizDotsEl.innerHTML = mquizQuestions.map((_, i) => {
                    const done = mquizAnswers[i] !== null;
                    const right = done && mquizAnswers[i] === mquizQuestions[i].correct;
                    const cls = i === mquizIndex ? 'is-active' : done ? (right ? 'is-right' : 'is-wrong') : '';
                    return `<button type="button" class="mquiz-dot ${cls}" data-goto="${i}" aria-label="Pergunta ${i + 1}"></button>`;
                }).join('');
                mquizDotsEl.querySelectorAll('.mquiz-dot[data-goto]').forEach(dot => {
                    dot.onclick = () => goToModuleQuizCard(Number(dot.dataset.goto));
                });
            }

            if (mquizPrevBtn) mquizPrevBtn.disabled = mquizIndex === 0;
            if (mquizNextBtn) mquizNextBtn.disabled = mquizIndex >= total - 1;
        }

        function answerModuleQuiz(option) {
            if (mquizAnswers[mquizIndex] !== null) return;
            mquizAnswers[mquizIndex] = option;
            // Responder é interação de estudo: rearma a janela de 5 min.
            registerStudyActivity();
            paintModuleQuiz();
            if (mquizAnswers.every(a => a !== null)) markCurrentModuleCompleted();
        }

        // Trocar de card também é estudo (o aluno pode só estar lendo as
        // perguntas). Como a janela de inatividade é rearmada a cada
        // interação e nada mais acontece dentro de um card, na prática cada
        // card contribui no máximo IDLE_TIMEOUT_MS (5 min) para o contador.
        function goToModuleQuizCard(index) {
            if (index < 0 || index >= mquizQuestions.length || index === mquizIndex) return;
            mquizIndex = index;
            registerStudyActivity();
            paintModuleQuiz();
        }

        mquizPrevBtn?.addEventListener('click', () => goToModuleQuizCard(mquizIndex - 1));
        mquizNextBtn?.addEventListener('click', () => goToModuleQuizCard(mquizIndex + 1));

        function renderModuleTitle(title, completed, shortsCount) {
            // Deixa claro, já na lista, quantos vídeos o módulo tem.
            const countTag = shortsCount > 1
                ? `<span class="module-count-tag">${shortsCount} vídeos</span>`
                : '';
            return completed
                ? `${title} ${countTag}<i class="fas fa-circle-check status-icon" aria-hidden="true"></i>`
                : `${title}${countTag}`;
        }

        function loadModule(mod, modules, moduleIndex) {
            resetContent();
            // Define a trava ANTES de retomar: módulo de vídeo entra em
            // 'waiting' (só conta ao dar play), módulo de PDF/slide conta
            // livremente. Sem isso, abrir uma aula de vídeo já contaria tempo
            // antes do primeiro play.
            // Vídeo: 'waiting' até o play. PDF: também 'waiting' — a página 1
            // é capa e não conta; renderPage libera ao sair dela (ou já na
            // página 1 se o PDF tiver só uma página).
            // Curtos entram como vídeo: 'waiting' até o primeiro play.
            moduleTimerGate = 'waiting';
            currentModuleKind = moduleKind(mod);
            // Abrir um módulo é interação: nunca cair num módulo novo já
            // pausado por inatividade anterior.
            idlePaused = false;
            // Fecha a sessão que vinha do módulo anterior: sem isso
            // resumeActiveCourseTimer sai cedo (mesmo curso, sessão aberta) e
            // a trava do novo módulo nunca chegaria a pausar a contagem.
            pauseActiveCourseTimer();
            // Retoma o contador ao voltar para o conteúdo — cobre tanto o
            // primeiro módulo quanto a volta depois de uma prova (loadQuiz
            // pausa e esquece o curso).
            if (currentTrainingId && currentThemeId != null) {
                resumeActiveCourseTimer(currentTrainingId, currentThemeId);
            }
            if (playerCard) playerCard.style.display = '';
            currentModuleIndex = moduleIndex;
            if (currentModuleKind === 'pdf') {
                if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
                pdfContainer.style.display = 'block';
                video.style.display = 'none';
                customPlayerContainer.style.display = 'none';
                loadPDF(mod.pdfUrl);
            } else if (currentModuleKind === 'shorts') {
                if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
                pdfContainer.style.display = 'none';
                video.style.display = 'none';
                customPlayerContainer.style.display = 'none';
                // currentModuleIndex já está definido acima: renderShorts o usa
                // para montar a chave do progresso local dos vídeos.
                renderShorts(mod.shorts || []);
            } else if (currentModuleKind === 'quiz') {
                if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
                pdfContainer.style.display = 'none';
                video.style.display = 'none';
                customPlayerContainer.style.display = 'none';
                // Não há play para destravar: a contagem começa ao abrir e é
                // a trava de inatividade que a limita — parada em um card por
                // 5 min sem responder nem navegar, o contador pausa.
                setModuleTimerGate('free');
                renderModuleQuiz(mod.questions || []);
            } else {
                initOrLoadVideo(mod.videoId);
                customPlayerContainer.style.display = 'block';
                video.style.display = 'none';
                pdfContainer.style.display = 'none';
            }
            titleEl.textContent = mod.title;
            captionEl.textContent = mod.caption;
            titleEl.style.display = 'block';
            captionEl.style.display = 'block';

            attachmentContainer.innerHTML = '';
            if (mod.attachments && mod.attachments.length > 0) {
                mod.attachments.forEach(attachment => {
                    const b = document.createElement('button');
                    b.className = 'attachment-btn';
                    b.textContent = attachment.title;
                    b.onclick = () => window.open(attachment.url, '_blank');
                    attachmentContainer.appendChild(b);
                });
                attachmentContainer.style.display = 'flex';
            } else {
                attachmentContainer.style.display = 'none';
            }
        }

        function loadQuiz(subjectId, themeId) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // A avaliação tem cronômetro próprio (durationSeconds, gráfico
            // "Tempo para Conclusão da Avaliação"), então o contador de tempo
            // de ESTUDO pausa aqui e só volta ao retornar para os módulos
            // (ver loadModule). `forget` para que restaurar a aba durante a
            // prova não retome a contagem pelo visibilitychange.
            pauseActiveCourseTimer(true);
            resetContent();
            const quizKey = `${subjectId}_${themeId}`;
            if (quizStatus[quizKey] === false) { showWarning('Avaliação indisponível no momento.'); return; }
            const questions = quizData[quizKey];
            if (!questions) { showWarning('Nenhuma avaliação disponível para este tema.'); return; }

            // Tentativa deve existir neste ponto (criada na confirmação, ou
            // retomada de um reload/reabertura anterior). Sem ela não há como
            // saber o prazo real — recria defensivamente para não travar o aluno.
            let attempt = loadQuizAttempt(subjectId, themeId);
            if (!attempt) {
                attempt = { startedAt: Date.now(), durationMs: quizDurationMs(questions.length), selectedAnswers: {} };
                saveQuizAttempt(subjectId, themeId, attempt);
            }
            selectedAnswers = { ...attempt.selectedAnswers };

            const deadline = attempt.startedAt + attempt.durationMs;
            if (Date.now() >= deadline) {
                // Prazo já esgotado (fechou a página e voltou depois): envia
                // automaticamente com o que estava marcado, sem reabrir a prova.
                finalizeQuizAttempt(subjectId, themeId, questions, true);
                return;
            }

            quizContainer.innerHTML = '';

            const timerBox = document.createElement('div');
            timerBox.className = 'quiz-timer-box';
            timerBox.id = 'quiz-timer-box';
            timerBox.innerHTML = `
                <div class="quiz-timer-icon"><i class="fas fa-hourglass-half"></i></div>
                <div class="quiz-timer-body">
                    <div class="quiz-timer-top">
                        <span class="quiz-timer-label">Tempo restante</span>
                        <span class="quiz-timer-clock" id="quiz-timer-clock">--:--</span>
                    </div>
                    <div class="quiz-timer-track"><div class="quiz-timer-fill" id="quiz-timer-fill"></div></div>
                </div>`;
            quizContainer.appendChild(timerBox);

            const header = document.createElement('div');
            header.className = 'quiz-header-section';
            header.innerHTML = `<h2><i class="fas fa-clipboard-list" style="margin-right:10px;"></i>Avaliação Final</h2><p>${questions.length} questões &bull; Mínimo ${formatScore(getPassingScore())} para aprovação</p>`;
            quizContainer.appendChild(header);

            questions.forEach((q, index) => {
                const card = document.createElement('div');
                card.className = 'quiz-card';
                card.id = `quiz-card-${index}`;
                const h3 = document.createElement('h3');
                h3.textContent = `${index + 1}. ${q.question}`;
                card.appendChild(h3);
                if (q.image) {
                    const img = document.createElement('img');
                    img.className = 'quiz-card-image';
                    img.src = q.image;
                    img.alt = 'Imagem da questão';
                    img.loading = 'lazy';
                    card.appendChild(img);
                }
                const order = Array.from({ length: q.options.length }, (_, i) => i);
                for (let i = order.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                order.forEach((optIndex) => {
                    const opt = q.options[optIndex];
                    const label = document.createElement('label');
                    label.className = 'quiz-option';
                    const input = document.createElement('input');
                    input.type = 'radio';
                    input.name = `q${index}`;
                    input.value = optIndex;
                    if (selectedAnswers[index] === optIndex) { input.checked = true; label.classList.add('selected'); }
                    input.onchange = () => {
                        selectedAnswers[index] = parseInt(input.value, 10);
                        card.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
                        label.classList.add('selected');
                        card.classList.remove('missing');
                        // Persiste a resposta parcial — sobrevive a reload/fechar aba.
                        const current = loadQuizAttempt(subjectId, themeId);
                        if (current) {
                            current.selectedAnswers = { ...selectedAnswers };
                            saveQuizAttempt(subjectId, themeId, current);
                        }
                    };
                    label.appendChild(input);
                    label.appendChild(document.createTextNode(opt));
                    card.appendChild(label);
                });
                quizContainer.appendChild(card);
            });

            quizContainer.appendChild(quizSubmit);
            quizContainer.style.display = 'flex';
            quizSubmit.onclick = () => calculateScore(subjectId, themeId);

            startQuizTimer(subjectId, themeId, questions, deadline);
        }

        // Timer baseado em timestamp real (deadline fixo), não em contador
        // incremental — assim recarregar a página não "ganha" tempo extra e o
        // valor exibido sempre reflete o tempo restante real.
        function stopQuizTimer() {
            if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
        }

        function startQuizTimer(subjectId, themeId, questions, deadline) {
            stopQuizTimer();
            const totalMs = deadline - (loadQuizAttempt(subjectId, themeId)?.startedAt || Date.now());

            const tick = () => {
                const remaining = deadline - Date.now();
                const clockEl = document.getElementById('quiz-timer-clock');
                const fillEl = document.getElementById('quiz-timer-fill');
                const boxEl = document.getElementById('quiz-timer-box');
                if (!clockEl || !fillEl || !boxEl) { stopQuizTimer(); return; }

                if (remaining <= 0) {
                    clockEl.textContent = '00:00';
                    fillEl.style.width = '100%';
                    stopQuizTimer();
                    finalizeQuizAttempt(subjectId, themeId, questions, true);
                    return;
                }

                clockEl.textContent = formatClock(remaining);
                const elapsedPct = Math.min(100, Math.max(0, ((totalMs - remaining) / totalMs) * 100));
                fillEl.style.width = `${elapsedPct}%`;
                boxEl.classList.toggle('is-urgent', remaining <= 60000);
            };

            tick();
            progressTimer = setInterval(tick, 1000);
        }

        // Envio automático ao esgotar o tempo — questões sem resposta contam
        // como incorretas. Usado tanto pelo timer ativo quanto ao reabrir a
        // página já com o prazo vencido.
        function finalizeQuizAttempt(subjectId, themeId, questions, auto) {
            stopQuizTimer();
            const attempt = loadQuizAttempt(subjectId, themeId);
            const startedAt = attempt?.startedAt || Date.now();
            // Mescla (storage primeiro, memória por último): o clique mais
            // recente pode não ter chegado ao localStorage (write falhou em
            // silêncio, ou o attempt foi limpo em outra aba) — sobrescrever
            // pelo storage descartaria a resposta que o aluno vê marcada.
            selectedAnswers = { ...(attempt?.selectedAnswers || {}), ...selectedAnswers };

            let correctCount = 0;
            questions.forEach((q, index) => { if (selectedAnswers[index] === q.correct) correctCount++; });
            const score = Math.round((correctCount / questions.length) * 100) / 10;
            const erros = getDetailedIncorrectAnswers(subjectId, themeId);
            const answerSnapshot = buildAnswerSnapshot(subjectId, themeId);
            const durationSeconds = Math.round((Date.now() - startedAt) / 1000);

            if (auto) showWarning('Tempo esgotado! Sua avaliação foi enviada com as respostas selecionadas.');
            showForm(score, erros, answerSnapshot, durationSeconds);
        }

        function calculateScore(subjectId, themeId) {
            const quizKey = `${subjectId}_${themeId}`;
            const questions = quizData[quizKey];
            let allAnswered = true;

            questions.forEach((q, index) => {
                if (!(index in selectedAnswers)) {
                    allAnswered = false;
                    const card = document.getElementById(`quiz-card-${index}`);
                    card.classList.add('missing');
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    document.getElementById(`quiz-card-${index}`).classList.remove('missing');
                }
            });

            if (!allAnswered) { showWarning('Por favor, responda todas as questões.'); return; }

            stopQuizTimer();
            const attempt = loadQuizAttempt(subjectId, themeId);
            const startedAt = attempt?.startedAt || Date.now();
            const durationSeconds = Math.round((Date.now() - startedAt) / 1000);

            let correctCount = 0;
            questions.forEach((q, index) => { if (selectedAnswers[index] === q.correct) correctCount++; });
            const score = Math.round((correctCount / questions.length) * 100) / 10;
            const erros = getDetailedIncorrectAnswers(subjectId, themeId);
            const answerSnapshot = buildAnswerSnapshot(subjectId, themeId);
            showForm(score, erros, answerSnapshot, durationSeconds);
        }

        // Snapshot completo do quiz respondido (todas as questões, com gabarito
        // e a opção escolhida) — usado pelo modal de detalhe do Histórico
        // (Configurações), que mostra certas/erradas com filtro.
        function buildAnswerSnapshot(subjectId, themeId) {
            const quizKey = `${subjectId}_${themeId}`;
            const questions = quizData[quizKey] || [];
            return questions.map((q, index) => ({
                question: q.question,
                options: q.options,
                correct: q.correct,
                // -1 (e não null) para não respondida: o Realtime Database
                // apaga chaves com null, e o detalhe do Histórico leria
                // `selected` como undefined.
                selected: index in selectedAnswers ? selectedAnswers[index] : -1
            }));
        }

        function getDetailedIncorrectAnswers(subjectId, themeId) {
            const quizKey = `${subjectId}_${themeId}`;
            const questions = quizData[quizKey];
            const errors = [];
            questions.forEach((q, index) => {
                if (selectedAnswers[index] !== q.correct) {
                    const userAnswer = q.options[selectedAnswers[index]] || '(não respondido)';
                    const correctAnswer = q.options[q.correct];
                    errors.push(
                        `${index + 1}) ${q.question}\n ` +
                        `;Resposta: ${userAnswer}\n` +
                        `;Gabarito: ${correctAnswer}\n` +
                        `---`
                    );
                }
            });
            return errors.length > 0 ? errors.join('\n') : '';
        }

        function getIncorrectQuestions(subjectId, themeId) {
            const quizKey = `${subjectId}_${themeId}`;
            const questions = quizData[quizKey];
            const incorrect = [];
            questions.forEach((q, index) => {
                if (selectedAnswers[index] !== q.correct) incorrect.push(q.question.trim());
            });
            return incorrect.length > 0 ? incorrect.join('\n') : '';
        }

        // Estágios usa o nome digitado livremente, sem vínculo com conta nem com a
        // planilha de colaboradores; as demais categorias exigem sessão e mostram o
        // nome já travado, sem input.
        function isFreeNameCategory() {
            return currentCategory === 'Estágios';
        }

        function showForm(score, erros = '', answerSnapshot = [], durationSeconds = null) {
            resetContent();
            formContainer.style.display = 'flex';
            const submitButton = document.getElementById('submit-form');
            const loadingSpinner = document.getElementById('loading-spinner');
            const newSubmitButton = submitButton.cloneNode(true);
            submitButton.parentNode.replaceChild(newSubmitButton, submitButton);
            loadingSpinner.style.display = 'none';
            newSubmitButton.disabled = false;
            newSubmitButton.style.opacity = '1';

            const freeGroup = document.getElementById('form-name-free-group');
            const loggedGroup = document.getElementById('form-name-logged-group');
            if (isFreeNameCategory()) {
                freeGroup.style.display = 'block';
                loggedGroup.style.display = 'none';
            } else {
                freeGroup.style.display = 'none';
                loggedGroup.style.display = 'block';
                const session = window.UniAdmin?.StudentAuth?.getSession();
                document.getElementById('form-logged-user-name').textContent = session ? session.fullName : '—';
            }

            const ratingContainer = document.getElementById('rating-container');
            const commentToggleBtn = document.getElementById('comment-toggle-btn');
            const commentSection = document.getElementById('comment-section');
            ratingContainer.style.display = 'block';
            commentToggleBtn.style.display = 'inline-flex';
            commentSection.style.display = 'block';
            setupEmojiRating();
            commentToggleBtn.innerHTML = '<i class="fas fa-times" style="margin-right:6px;"></i>Fechar Comentário';
            document.getElementById('comment').value = '';

            newSubmitButton.onclick = function(e) { e.preventDefault(); submitForm(score, erros, answerSnapshot, false, durationSeconds); };
        }

        // Avaliação por emoji (1 Péssimo .. 5 Ótimo). Os inputs continuam
        // radio[name="rating"] com value 1..5 — só a legenda é dinâmica aqui;
        // o estado visual (cor/animação) é puro CSS via input:checked + label.
        function setupEmojiRating() {
            const group = document.getElementById('emoji-rating');
            const caption = document.getElementById('emoji-rating-caption');
            if (!group || !caption) return;

            // Limpa a nota da tentativa anterior ao reabrir o formulário.
            group.querySelectorAll('input[name="rating"]').forEach(input => { input.checked = false; });
            caption.textContent = 'Toque em um emoji para avaliar';
            caption.classList.remove('is-selected');

            if (group.dataset.bound === '1') return;
            group.dataset.bound = '1';
            group.addEventListener('change', function(e) {
                const input = e.target.closest('input[name="rating"]');
                if (!input) return;
                const label = group.querySelector(`label[for="${input.id}"]`);
                caption.textContent = label?.dataset.label || '';
                caption.classList.add('is-selected');
            });
        }

        function submitForm(score, erros = '', answerSnapshot = [], skipLowRatingCheck = false, durationSeconds = null) {
            const loadingSpinner = document.getElementById('loading-spinner');
            const submitButton = document.getElementById('submit-form');
            const ratingContainer = document.getElementById('rating-container');
            const commentSection = document.getElementById('comment-section');

            const freeName = isFreeNameCategory();
            const name = document.getElementById('name');
            const email = document.getElementById('email');
            const session = freeName ? null : window.UniAdmin?.StudentAuth?.getSession();

            if (freeName) {
                name.classList.remove('invalid');
                email.classList.remove('invalid');
                if (!name.value) {
                    name.classList.add('invalid');
                    name.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    showWarning('Por favor, selecione o Nome.');
                    return;
                }
                if (!email.value || !validateEmail(email.value)) {
                    email.classList.add('invalid');
                    email.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    showWarning('Por favor, insira um email válido.');
                    return;
                }
            } else if (!session) {
                // Sessão pode ter expirado/sido limpa entre abrir o quiz e enviar.
                showWarning('Sua sessão expirou. Faça login novamente.');
                window.UniAdmin.StudentAuth.openModal({ intent: 'assessment', onSuccess: () => submitForm(score, erros, answerSnapshot, false, durationSeconds) });
                return;
            }

            const rating = document.querySelector('input[name="rating"]:checked');
            if (!rating) {
                showWarning('Por favor, avalie o curso escolhendo um emoji.');
                ratingContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            const commentField = document.getElementById('comment');
            const commentValue = commentField?.value.trim() || '';
            const ratingValue = parseInt(rating.value);
            if (ratingValue <= 4 && commentValue.length <= 3 && !skipLowRatingCheck) {
                openLowRatingModal({
                    onBack: () => {
                        commentSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        commentField.focus();
                    },
                    onConfirm: () => submitForm(score, erros, answerSnapshot, true, durationSeconds)
                });
                return;
            }

            loadingSpinner.style.display = 'block';
            submitButton.disabled = true;
            submitButton.style.opacity = '0.6';

            // Grava o status calculado no momento da submissão (não recalcula
            // depois) — necessário para os indicadores de prazo do dashboard
            // ficarem estáveis mesmo que o prazo do curso mude posteriormente.
            const theme = trainingData[currentTrainingId]?.themes?.[currentThemeId];
            const deadlineStatus = window.UniAdmin?.Deadlines?.computeDeadlineStatus(theme?.deadline) || 'livre';

            const resultPayload = {
                score,
                approved: score >= getPassingScore(),
                rating: ratingValue,
                comment: commentValue,
                errors: erros || '',
                answers: answerSnapshot || [],
                submittedAt: Date.now(),
                deadlineStatus,
                durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null
            };

            // Trava de tentativas (js/attempts.js): só conta para aluno logado
            // (Estágios não tem conta para associar o contador). Reprovação
            // soma 1 tentativa; aprovação zera o contador do curso.
            const updateAttemptsCounter = async () => {
                if (freeName || !session || !window.UniAdmin?.Attempts) return { locked: false };
                const A = window.UniAdmin.Attempts;
                if (score >= getPassingScore()) { await A.resetOnPass(session.userId, currentCategorySlug, currentTrainingId, currentThemeId); return { locked: false }; }
                return A.registerFailedAttempt(session.userId, currentCategorySlug, currentTrainingId, currentThemeId);
            };

            const finishSubmit = () => {
                loadingSpinner.style.display = 'none';
                submitButton.disabled = false;
                submitButton.style.opacity = '1';
                // Tentativa concluída e registrada: libera o localStorage. Só
                // agora, pois falha no envio deve manter o estado para retry.
                clearQuizAttempt(currentTrainingId, currentThemeId);
                updateAttemptsCounter().then(attemptsState => showResult(score, attemptsState));
            };

            // Promise.resolve().then(...) para que a checagem de conexão, que
            // lança de forma síncrona, caia no mesmo .catch() dos erros de
            // gravação em vez de escapar da função.
            Promise.resolve()
                .then(() => (freeName
                    ? saveEstagioResult({ name: name.value, email: email.value, ...resultPayload })
                    : saveLoggedResult({ session, ...resultPayload })))
                .then(() => {
                    // Avisa as Configurações (cache do Histórico) de que há
                    // resultado novo — relevante quando aluno e administrador
                    // usam a mesma aba do navegador.
                    document.dispatchEvent(new CustomEvent('uniadmin:results-changed'));
                })
                .then(finishSubmit)
                .catch((error) => {
                    console.error('Erro ao salvar resultado:', error);
                    showWarning(error?.message?.includes('Sem conexão')
                        ? error.message
                        : 'Não foi possível registrar sua avaliação. Tente novamente.');
                    loadingSpinner.style.display = 'none';
                    submitButton.disabled = false;
                    submitButton.style.opacity = '1';
                });
        }

        // Grava o resultado de um aluno logado nos dois caminhos de fan-out
        // (por usuário e por curso) numa única atualização atômica — ver
        // js/student-auth.js e o plano de dados em Configurações > Usuários.
        function saveLoggedResult({ session, ...result }) {
            const U = window.UniAdmin;
            // Sem rede, o SDK aceitaria a escrita e a resolveria contra o cache
            // local: o aluno veria "avaliação registrada" para algo que ainda
            // não saiu do navegador. Falhar aqui devolve o erro ao fluxo de
            // submissão, que reabilita o botão e pede para tentar de novo.
            U.Connection?.assertOnline();
            const attemptCount = ((assessmentResults[currentTrainingId]?.[currentThemeId] !== undefined) ? 2 : 1);
            const record = { ...result, attempt: attemptCount };
            const basePath = `results/byUser/${session.userId}/${currentCategorySlug}/${currentTrainingId}/${currentThemeId}`;
            const mirrorPath = `results/byCourse/${currentCategorySlug}/${currentTrainingId}/${currentThemeId}/${session.userId}`;
            const updates = {};
            updates[`/${U.dbRoot}/${basePath}`] = record;
            updates[`/${U.dbRoot}/${mirrorPath}`] = record;
            return U.db.ref().update(updates);
        }

        // Estágios: sem conta, cada submissão vira um registro solto (nome
        // digitado livremente, pode haver homônimos — aceito para este fluxo).
        function saveEstagioResult({ name, email, ...result }) {
            const U = window.UniAdmin;
            const record = { name, email: email || null, ...result };
            const path = `/${U.dbRoot}/results/estagiosLivre/${currentCategorySlug}/${currentTrainingId}/${currentThemeId}`;
            const newRef = U.ref(U.db, path).push();
            return U.set(newRef, record);
        }

        // Certificado só aparece para aluno logado, aprovado e em curso com
        // emissão habilitada no cadastro do assunto (Configurações).
        function appendCertificateButton(score) {
            const U = window.UniAdmin;
            const session = U?.StudentAuth?.getSession();
            const theme = trainingData[currentTrainingId]?.themes?.[currentThemeId];
            if (!session || score < 8 || !U?.Certificate?.isEnabled(theme)) return;

            const btn = document.createElement('button');
            btn.className = 'certificate-download-btn';
            btn.innerHTML = '<i class="fas fa-award" style="margin-right:8px;"></i>Baixar certificado';
            btn.onclick = () => U.Certificate.download({
                studentName: session.fullName,
                course: theme,
                courseName: theme?.name,
                submittedAt: Date.now()
            });
            resultContainer.appendChild(btn);
        }

        // ─── REINICIAR CURSO (só Estágios) ───
        // Em Estágios a progressão é toda local (não há conta para sincronizar),
        // então zerar o curso é apagar as chaves de localStorage dele e reabrir.
        // Os resultados já enviados em results/estagiosLivre são preservados: o
        // histórico do admin continua mostrando cada conclusão.
        function resetCourseProgress(subjectId, themeId) {
            const theme = trainingData[subjectId]?.themes?.[themeId];

            if (completionStatus[subjectId]) delete completionStatus[subjectId][themeId];
            if (assessmentResults[subjectId]) delete assessmentResults[subjectId][themeId];
            finishedCourseTimers.delete(courseTimerKey(subjectId, themeId));
            if (remoteProgressActiveMs[subjectId]) remoteProgressActiveMs[subjectId][themeId] = 0;
            if (activeCourseTimer.subjectId === subjectId && activeCourseTimer.themeId === themeId) {
                activeCourseTimer = { subjectId: null, themeId: null, sessionStartedAt: null };
            }

            clearQuizAttempt(subjectId, themeId);
            // Sub-progresso dos módulos de curtos vive numa chave por módulo.
            (theme?.modules || []).forEach((mod, index) => {
                try { localStorage.removeItem(shortsStorageKey(subjectId, themeId, index)); }
                catch (error) { /* indisponível */ }
            });

            saveProgression();
        }

        function appendRestartCourseButton() {
            if (!isFreeNameCategory()) return;
            const subjectId = currentTrainingId;
            const themeId = currentThemeId;
            if (!subjectId || themeId == null) return;

            const btn = document.createElement('button');
            btn.className = 'restart-course-btn';
            btn.innerHTML = '<i class="fas fa-rotate-left"></i> Reiniciar curso';
            btn.onclick = () => {
                const themeName = themeBtn.textContent;
                resetCourseProgress(subjectId, themeId);
                resetContent();
                openCourse(subjectId, themeId, themeName);
            };
            resultContainer.appendChild(btn);
        }

        function showResult(score, attemptsState = null) {
            const locked = !!attemptsState?.locked;
            resetContent();
            contentDiv.style.display = 'block';
            resultContainer.innerHTML = '';

            const scoreCard = document.createElement('div');
            scoreCard.className = 'result-score-card';
            const h2 = document.createElement('h2');
            h2.textContent = `${formatScore(score)}/10`;
            scoreCard.appendChild(h2);
            const scoreLabel = document.createElement('p');
            scoreLabel.textContent = score >= getPassingScore() ? 'Aprovado' : 'Reprovado';
            scoreLabel.style.color = score >= getPassingScore() ? 'var(--success)' : 'var(--danger)';
            scoreLabel.style.fontWeight = '600';
            scoreCard.appendChild(scoreLabel);
            resultContainer.appendChild(scoreCard);

            if (score < 8 && locked) {
                // 3ª reprovação: sem botão de tentar de novo, só o aviso de
                // que precisa de liberação do administrador.
                const lockCard = document.createElement('div');
                lockCard.className = 'attempts-locked-card attempts-locked-card--inline';
                const limit = window.UniAdmin?.Attempts?.limitFor(attemptsState) || 3;
                lockCard.innerHTML = `
                    <div class="attempts-locked-icon"><i class="fas fa-lock"></i></div>
                    <p><strong>Limite de ${limit} tentativas atingido.</strong></p>
                    <p>Fale com um administrador para liberar novas tentativas.</p>`;
                resultContainer.appendChild(lockCard);
            } else if (score < 8) {
                const p = document.createElement('p');
                p.textContent = 'Você não atingiu a nota mínima. Tente novamente!';
                p.style.color = 'var(--text-muted)';
                resultContainer.appendChild(p);
                const retryBtn = document.createElement('button');
                retryBtn.id = 'retry-btn';
                retryBtn.style.display = 'inline-block';
                retryBtn.innerHTML = '<i class="fas fa-redo" style="margin-right:8px;"></i>Tentar Novamente';
                retryBtn.onclick = () => openQuizGuarded(currentTrainingId, currentThemeId);
                resultContainer.appendChild(retryBtn);
            } else {
                const successDiv = document.createElement('div');
                successDiv.className = 'success-message';
                successDiv.innerHTML = '<i class="fas fa-trophy"></i> Parabéns pela aprovação!';
                resultContainer.appendChild(successDiv);

                appendCertificateButton(score);
                appendRestartCourseButton();

                const errors = getDetailedIncorrectAnswers(currentTrainingId, currentThemeId);
                if (errors) {
                    const incorrectDiv = document.createElement('div');
                    incorrectDiv.className = 'incorrect-answers';
                    incorrectDiv.innerHTML = '<h3><i class="fas fa-info-circle" style="margin-right:6px;color:var(--accent);"></i>Gabarito das Questões Incorretas</h3><ul></ul>';
                    const ul = incorrectDiv.querySelector('ul');
                    const errorList = errors.split('---').filter(e => e.trim());
                    errorList.forEach(error => {
                        const lines = error.trim().split(';').map(l => l.trim());
                        const li = document.createElement('li');
                        li.innerHTML = `<strong>${lines[0]}</strong><br>${lines[1]}<br>${lines[2]}`;
                        ul.appendChild(li);
                    });
                    resultContainer.appendChild(incorrectDiv);
                }

                if (!assessmentResults[currentTrainingId]) assessmentResults[currentTrainingId] = {};
                assessmentResults[currentTrainingId][currentThemeId] = score;
                // Aprovado: encerra de vez o contador de tempo do curso antes
                // de sincronizar, para o activeMs final já incluir esta
                // última sessão e não voltar a contar se o aluno reabrir o
                // curso só para revisar módulos.
                finishActiveCourseTimer(currentTrainingId, currentThemeId);
                saveProgression();

                const assessmentModule = document.getElementById('assessment-module');
                if (assessmentModule) {
                    assessmentModule.classList.add('completed');
                    assessmentModule.innerHTML = renderAssessmentTitle(true);
                }
            }

            resultContainer.style.display = 'flex';
        }

        function showAssessmentResult(score) {
            resetContent();
            contentDiv.style.display = 'block';
            if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
            customPlayerContainer.style.display = 'none';
            video.style.display = 'none';
            video.src = '';
            pdfContainer.style.display = 'none';
            titleEl.style.display = 'none';
            captionEl.style.display = 'none';
            attachmentContainer.style.display = 'none';

            resultContainer.innerHTML = '';
            const scoreCard = document.createElement('div');
            scoreCard.className = 'result-score-card';
            const h2 = document.createElement('h2');
            h2.textContent = `${formatScore(score)}/10`;
            scoreCard.appendChild(h2);
            const scoreLabel = document.createElement('p');
            scoreLabel.textContent = 'Aprovado';
            scoreLabel.style.color = 'var(--success)';
            scoreLabel.style.fontWeight = '600';
            scoreCard.appendChild(scoreLabel);
            resultContainer.appendChild(scoreCard);

            const successDiv = document.createElement('div');
            successDiv.className = 'success-message';
            successDiv.innerHTML = '<i class="fas fa-trophy"></i> Parabéns pela aprovação!';
            resultContainer.appendChild(successDiv);
            appendCertificateButton(score);
            appendRestartCourseButton();
            resultContainer.style.display = 'flex';
        }

        function resetContent() {
            stopQuizTimer();
            // Sem isso o áudio de um curto continuaria tocando ao trocar de
            // módulo (os players vivem fora de ytPlayer).
            destroyShorts();
            hideModuleQuiz();
            video.src = '';
            video.style.display = 'none';
            pdfContainer.style.display = 'none';
            pdfCanvas.width = 0;
            pdfCanvas.height = 0;
            pdfNavigation.innerHTML = '';
            titleEl.style.display = 'none';
            captionEl.style.display = 'none';
            attachmentContainer.style.display = 'none';
            // Some por padrão: fica vazio (fundo escuro + module-info branco
            // colapsados) atrás de quiz/resultado/formulário, criando um 2º
            // container fantasma acima. loadModule() reexibe explicitamente
            // ao voltar para vídeo/PDF.
            if (playerCard) playerCard.style.display = 'none';
            quizContainer.style.display = 'none';
            resultContainer.style.display = 'none';
            formContainer.style.display = 'none';
            warningMessage.style.display = 'none';
            document.getElementById('rating-container').style.display = 'none';
            document.getElementById('comment-toggle-btn').style.display = 'none';
            document.getElementById('comment-section').style.display = 'none';
        }

        // Refazer avaliação e reiniciar curso foram removidos deste fluxo:
        // reiniciar é ação exclusiva do admin (reseta progresso de todos os
        // alunos), não algo que o próprio aluno deva poder fazer sozinho.
