// === SINCRONIZAÇÃO FIREBASE EM TEMPO REAL ===

    function forceFirebaseSync() {
        try {
            audits = [];
            activities = [];
            maintenances = [];
            documents = [];
            ocorrencias = [];
            rncItems = [];
            users = [];
            masterLists = JSON.parse(JSON.stringify(defaultMasterLists));
            // Invalida o baseline: enquanto não recarregamos, o estado local
            // vazio não deve ser interpretado como "tudo excluído" num save.
            _syncBaseline = null;
            loadCloudData();
        } catch (error) {
            console.error('Erro na sincronização forçada:', error);
        }
    }

    async function loadCloudData() {
        try {
            // (#5) Pinta a UI imediatamente a partir do cache local, se houver,
            // enquanto a rede responde. O cache é apenas visual: NUNCA alimenta o
            // baseline do merge nem é gravado de volta sem confirmação da rede.
            if (_paintFromLocalCache()) {
                if (typeof window.setBootLoaderStep === 'function') window.setBootLoaderStep('cache');
            }

            // (#1/#3) Lê SOMENTE as coleções de dados — não baixa /imgBlobs (imagens
            // Base64) nem /passwords, que são os nós mais pesados e desnecessários aqui.
            // O download é o PRÓPRIO evento inicial dos listeners (ver _primeDataListeners):
            // um dbGet aqui seria baixado em dobro, porque anexar o onValue logo depois
            // rebaixa o nó inteiro de novo.
            if (typeof window.setBootLoaderStep === 'function') window.setBootLoaderStep('download');
            const record = {};
            try {
                await _primeDataListeners();
                _DATA_LISTEN_PATHS.forEach(p => { record[p] = _remoteCache[p] == null ? undefined : _remoteCache[p]; });
            } catch (primeErr) {
                // Rede de segurança: se anexar os listeners falhar, cai no caminho
                // antigo (dbGet direto). Custa um download a mais, mas é melhor que
                // deixar o usuário sem dados — o tempo real é restabelecido depois
                // por startFirebaseListener().
                console.warn('Priming dos listeners falhou; usando dbGet como alternativa.', primeErr);
                const database = getFirebaseDatabase();
                const dbRef = getFirebaseRef();
                const dbGet = getFirebaseGet();
                const _snaps = await Promise.all(_DATA_LISTEN_PATHS.map(p => dbGet(dbRef(database, p))));
                _DATA_LISTEN_PATHS.forEach((p, i) => { record[p] = _snaps[i].exists() ? _snaps[i].val() : undefined; });
            }

            {
                audits = _toArray(record.audits);
                activities = _toArray(record.activities);
                maintenances = _toArray(record.maintenances);
                documents = _toArray(record.documents);
                ocorrencias = _toArray(record.ocorrencias);
                rncItems = _toArray(record.rncItems);
                if (typeof window.rncItems !== 'undefined') window.rncItems = rncItems;

                if (record.masterLists) {
                    masterLists = _normalizeMasterLists(record.masterLists);
                    if (Array.isArray(masterLists.mantItens) && masterLists.mantItens.length === 0) {
                        masterLists.mantItens = defaultMasterLists.mantItens;
                    }
                }

                kanbanOrder = record.kanbanOrder || {};
            }

            [audits, activities, maintenances, documents].forEach(arr => {
                arr.forEach(item => item.historico = item.historico || []);
            });

            // Baseline para o merge 3-vias: estado remoto recém-adotado.
            captureSyncBaseline();

            // Lixeira temporária: purga cards deletados há +30 dias.
            // Roda APÓS captureSyncBaseline() de propósito — o baseline precisa
            // conter os cards para que a remoção local seja reconhecida pelo
            // merge 3-vias como exclusão real (item no base, ausente no local =>
            // deletado). Se rodasse antes, o merge não propagaria a remoção e o
            // card voltaria do remoto. Limpa imgBlobs órfãos e registra a
            // exclusão no deletionHistory (auditoria) — exceto RNC, que tem
            // lixeira própria sem histórico persistido (não cria nó/log extra).
            if (typeof window.purgeExpiredTrash === 'function') {
                let _purgedTotal = 0;
                const _taskCols = [
                    { arr: audits,       tab: 'auditoria',    tipo: 'Rotina' },
                    { arr: activities,   tab: 'atividades',   tipo: 'Atividade' },
                    { arr: maintenances, tab: 'manutencao',   tipo: 'Manutenção' },
                    { arr: documents,    tab: 'documentos',   tipo: 'Documento' }
                ];
                _taskCols.forEach(c => {
                    const removed = window.purgeExpiredTrash(c.arr);
                    _purgedTotal += removed.length;
                    if (removed.length && masterLists) {
                        if (!masterLists.deletionHistory) masterLists.deletionHistory = [];
                        removed.forEach(it => {
                            masterLists.deletionHistory.push({
                                histId: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                                titulo: it.titulo || it.categoria || '—',
                                tipo: c.tipo,
                                tab: c.tab,
                                setor: it.setor || '',
                                deletedAt: it.deletedAt || '',
                                deletedBy: it.deletedBy || '',
                                deletedReason: it.deletedReason || '',
                                permanentlyDeletedAt: new Date().toISOString(),
                                permanentlyDeletedBy: 'Sistema (expiração 30 dias)',
                                permanentReason: 'Exclusão automática após 30 dias na lixeira'
                            });
                        });
                    }
                });
                const _purgedRnc = window.purgeExpiredTrash(rncItems);
                _purgedTotal += _purgedRnc.length;

                if (_purgedTotal > 0 && typeof saveAll === 'function') {
                    if (typeof window.rncItems !== 'undefined') window.rncItems = rncItems;
                    saveAll();
                }
            }

            if (typeof window.setBootLoaderStep === 'function') window.setBootLoaderStep('users');
            // loadusers() e loadUserPrefsFromFirebase() são independentes: o caminho das
            // preferências vem de currentuser.user, definido no login, e não da lista de
            // usuários recém-baixada. Em série eram dois round-trips enfileirados; em
            // paralelo, um só tempo de ida e volta. migrateResponsaveisToIds() continua
            // depois das duas — ela depende de `users` já carregado.
            await Promise.all([
                loadusers(),
                loadUserPrefsFromFirebase()
            ]);
            // Atualiza referência do currentuser para o objeto recém-carregado (com id)
            if (typeof currentuser !== 'undefined' && currentuser && currentuser.user) {
                const _refreshed = users.find(u => String(u.user).toLowerCase() === String(currentuser.user).toLowerCase());
                if (_refreshed) currentuser = _refreshed;
            }
            if (typeof window.setBootLoaderStep === 'function') window.setBootLoaderStep('prefs');
            await migrateResponsaveisToIds();

            if (typeof window.setBootLoaderStep === 'function') window.setBootLoaderStep('render');
            cleanInvalidResponsaveis();
            populateYearSelects();
            populateSelects();
            restoreFiltersFromFirebase();

            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            if (typeof window.updateRncNotificationBell === 'function') window.updateRncNotificationBell();

            startFirebaseListener();
            _saveLocalCache();

        } catch (err) {
            console.error("Erro ao carregar dados do Firebase:", err);
            _bootLoadFailed = err || true;   // o motivo vai para a tela de carregamento

            cleanInvalidResponsaveis();
            populateYearSelects();
            populateSelects();
            restoreFiltersFromFirebase();
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
        }
        switchTab('dashboard');
        // Só agora o painel tem dados de verdade na tela: encerra a tela de
        // carregamento (em erro, ela avisa que o conteúdo veio do cache local).
        if (typeof window.hideBootLoader === 'function') window.hideBootLoader(_bootLoadFailed);
        _bootLoadFailed = false;
    }

    var _bootLoadFailed = false;

    function isEditingCardOpen() {
        const drawerIds = ['modalAuditoria', 'modalAtividades', 'modalManutencao', 'modalDocumentos', 'modalOcorrencia', 'modalRnc'];
        if (drawerIds.some(id => {
            const el = document.getElementById(id);
            return el && el.classList.contains('open');
        })) return true;
        // Checklist do viewModal com marcações pendentes (ainda não aplicadas):
        // congela o listener para não sobrescrever as alterações locais antes do "Aplicar".
        if (window._checklistPendingDirty) return true;
        return false;
    }

    // === CACHE LOCAL (#5) — pintura instantânea da UI a partir do localStorage ===
    // Puramente visual: acelera o primeiro render enquanto a rede responde. Nunca
    // alimenta o baseline do merge nem é gravado de volta sem confirmação da rede.
    var _LOCAL_CACHE_KEY = 'auditoriaIamic:cacheV1';

    function _saveLocalCache() {
        try {
            localStorage.setItem(_LOCAL_CACHE_KEY, JSON.stringify({
                audits, activities, maintenances, documents,
                ocorrencias, rncItems, masterLists, kanbanOrder, ts: Date.now()
            }));
        } catch (_) { /* quota cheia ou indisponível — cache é opcional */ }
    }

    function _paintFromLocalCache() {
        try {
            // Só pinta se ainda não há dados em memória (evita sobrepor sessão viva).
            const empty = !audits.length && !activities.length &&
                          !maintenances.length && !documents.length && !ocorrencias.length && !rncItems.length;
            if (!empty) return false;
            const raw = localStorage.getItem(_LOCAL_CACHE_KEY);
            if (!raw) return false;
            const c = JSON.parse(raw);
            if (!c) return false;
            audits       = _toArray(c.audits);
            activities   = _toArray(c.activities);
            maintenances = _toArray(c.maintenances);
            documents    = _toArray(c.documents);
            ocorrencias  = _toArray(c.ocorrencias);
            rncItems     = _toArray(c.rncItems);
            if (typeof window.rncItems !== 'undefined') window.rncItems = rncItems;
            if (c.masterLists) masterLists = _normalizeMasterLists(c.masterLists);
            kanbanOrder = c.kanbanOrder || {};
            try {
                populateSelects();
                if (typeof window.renderDashboard === 'function') window.renderDashboard();
            } catch (_) {}
            return true;
        } catch (_) { return false; }
    }

    // === LISTENER ESCOPADO POR COLEÇÃO (#1) ===
    // Caminhos de dados lidos/ouvidos. NUNCA inclui imgBlobs (imagens Base64) nem
    // passwords — assim o Firebase jamais reenvia esses nós pesados nas sincronizações.
    var _DATA_LISTEN_PATHS = ['audits','activities','maintenances','documents','ocorrencias','rncItems','masterLists','kanbanOrder'];

    var dataListeners = [];          // um listener por coleção (substitui o único em "/")
    var _remoteCache = {};           // último valor remoto de cada caminho ouvido
    var _remoteApplyScheduled = false;
    var _dataListenersPrimed = false;  // as 8 coleções já entregaram o 1º snapshot?
    // Caminhos com evento remoto ainda NÃO conciliado. Só eles são comparados em
    // _applyRemoteSnapshot — antes, todo evento fazia JSON.stringify das 6 coleções
    // inteiras (~7 MB) na main thread só para descobrir o que mudou. Um caminho só
    // sai daqui quando é de fato reconciliado (adotado ou constatado idêntico); se a
    // adoção estiver bloqueada por edição aberta ou save pendente, ele permanece
    // sujo e é reavaliado no próximo evento — igual ao comportamento anterior.
    var _remoteDirtyPaths = {};

    // Coalesce as rajadas de eventos das várias coleções num único re-render.
    function _scheduleRemoteApply() {
        // Enquanto as 8 coleções não entregaram o primeiro snapshot, o _remoteCache
        // está incompleto: aplicar agora faria _applyRemoteSnapshot ler undefined de
        // uma coleção ainda não chegada, adotá-la como [] e envenenar o baseline.
        if (!_dataListenersPrimed) return;
        if (_remoteApplyScheduled) return;
        _remoteApplyScheduled = true;
        setTimeout(() => { _remoteApplyScheduled = false; _applyRemoteSnapshot(); }, 50);
    }

    // Anexa os listeners das coleções e resolve quando TODAS entregaram o primeiro
    // snapshot — é ele que alimenta a carga inicial. Antes, loadCloudData baixava as
    // 8 coleções por dbGet e logo depois o onValue as baixava DE NOVO (o evento
    // inicial de um listener recém-anexado sempre traz o nó inteiro, o get() não
    // estabelece sincronia): eram ~14 MB por login em vez de ~7 MB. Anexar primeiro
    // também fecha a janela entre a leitura e a escuta, em que uma alteração de outra
    // sessão passava despercebida.
    function _primeDataListeners() {
        const database = getFirebaseDatabase();
        const dbRef = getFirebaseRef();
        const dbOnValue = getFirebaseOnValue();

        // Já anexados (loadCloudData chamado de novo sem logout): cache quente.
        if (dataListeners.length) {
            _dataListenersPrimed = true;
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            let pending = _DATA_LISTEN_PATHS.length;
            let settled = false;
            let timer = null;

            const finish = (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (err) {
                    // Priming incompleto: desanexa tudo para que uma nova tentativa
                    // recomece do zero em vez de achar o cache pela metade.
                    try { stopFirebaseListener(); } catch (_) {}
                    reject(err);
                } else {
                    _dataListenersPrimed = true;
                    resolve();
                }
            };

            // Timeout de ESTAGNAÇÃO, não de duração total: o relógio reinicia a cada
            // coleção que chega. Um banco grande em link lento pode levar minutos e
            // isso é legítimo — o que não pode é ficar parado. Um teto de duração
            // fixo transformaria "lento" em "falhou", que é justamente o problema
            // que estamos tentando resolver.
            const STALL_MS = 90000;
            const armStall = () => {
                clearTimeout(timer);
                timer = setTimeout(() => finish(new Error(
                    'O banco de dados parou de responder durante a sincronização (' +
                    (_DATA_LISTEN_PATHS.length - pending) + ' de ' + _DATA_LISTEN_PATHS.length +
                    ' coleções recebidas).'
                )), STALL_MS);
            };
            armStall();

            _DATA_LISTEN_PATHS.forEach(path => {
                let first = true;
                const handler = dbOnValue(
                    dbRef(database, path),
                    (snapshot) => {
                        _remoteCache[path] = snapshot.exists() ? snapshot.val() : null;
                        if (first) {
                            first = false;
                            // O primeiro snapshot é consumido por loadCloudData.
                            if (--pending === 0) { finish(null); return; }
                            armStall();   // houve progresso: reinicia o relógio
                            return;
                        }
                        _remoteDirtyPaths[path] = true;
                        _scheduleRemoteApply();
                    },
                    (err) => finish(err)
                );
                dataListeners.push({ path, handler });
            });
        });
    }

    function startFirebaseListener() {
        try {
            if (!currentuser) return;

            // Os listeners das coleções já foram anexados por _primeDataListeners(), que
            // é quem faz a carga inicial. Este ramo é só a rede de segurança para quem
            // chamar startFirebaseListener() fora do fluxo de loadCloudData — ter dois
            // pontos anexando handlers diferentes para os mesmos caminhos foi o que se
            // quis evitar aqui. (#1: um listener por coleção, nunca em "/", para o
            // Firebase jamais reenviar /imgBlobs nem /passwords.)
            if (dataListeners.length === 0) {
                _primeDataListeners().catch(err =>
                    console.error('Erro ao anexar listeners das coleções:', err));
            }

            startUsersListener();
        } catch (error) {
            console.error('Erro no listener Firebase:', error);
        }
    }

    // Reaproveita exatamente a lógica de adoção/guarda do listener original,
    // montando um "record" a partir do cache das coleções ouvidas.
    function _applyRemoteSnapshot() {
        try {
            const record = {
                audits:       _remoteCache.audits,
                activities:   _remoteCache.activities,
                maintenances: _remoteCache.maintenances,
                documents:    _remoteCache.documents,
                ocorrencias:  _remoteCache.ocorrencias,
                rncItems:     _remoteCache.rncItems,
                masterLists:  _remoteCache.masterLists,
                kanbanOrder:  _remoteCache.kanbanOrder
            };
            const editingCard = isEditingCardOpen();

                // masterLists e kanbanOrder sincronizam mesmo durante edição de card (para
                // refletir listas criadas por outras sessões nos selects), MAS nunca enquanto
                // há gravação local pendente: durante um save, o próprio _saveAllInternal
                // reconcilia masterLists por merge — adotar o remoto aqui reverteria a edição
                // local ainda não confirmada e o follow-up do coalescing regravaria o estado
                // revertido (perda de marcador). Por isso o guard _pendingSaves === 0.
                //
                // Só compara o que teve evento. As guardas (_pendingSaves/editingCard)
                // vêm ANTES dos stringify, para que uma edição aberta nem chegue a pagar
                // o custo da comparação.
                const _DATA_KEYS = ['audits', 'activities', 'maintenances', 'documents', 'ocorrencias', 'rncItems'];
                const _live = { audits, activities, maintenances, documents, ocorrencias, rncItems };
                const listsDirty = !!(_remoteDirtyPaths.masterLists || _remoteDirtyPaths.kanbanOrder);
                const dataDirty  = _DATA_KEYS.some(k => _remoteDirtyPaths[k]);

                const listsChanged = listsDirty && _pendingSaves === 0 && (
                    JSON.stringify(record.masterLists) !== JSON.stringify(masterLists) ||
                    JSON.stringify(record.kanbanOrder) !== JSON.stringify(kanbanOrder)
                );

                // Não adota o remoto enquanto há edição aberta OU gravação local
                // pendente: evita sobrescrever alterações locais ainda não salvas.
                const dataUnblocked = dataDirty && !editingCard && _pendingSaves === 0;
                const dataChanged = dataUnblocked && _DATA_KEYS.some(k =>
                    _remoteDirtyPaths[k] && JSON.stringify(record[k]) !== JSON.stringify(_live[k])
                );

                // Comparado e idêntico (eco da nossa própria gravação, tipicamente):
                // reconciliado, sai da lista de sujos. Se a adoção está BLOQUEADA por
                // edição/save, o caminho continua sujo e volta a ser avaliado no próximo
                // evento — sem isso a alteração remota se perderia.
                if (listsDirty && _pendingSaves === 0 && !listsChanged) {
                    delete _remoteDirtyPaths.masterLists;
                    delete _remoteDirtyPaths.kanbanOrder;
                }
                if (dataUnblocked && !dataChanged) {
                    _DATA_KEYS.forEach(k => { delete _remoteDirtyPaths[k]; });
                }

                if (!listsChanged && !dataChanged) return;

                if (listsChanged) {
                    delete _remoteDirtyPaths.masterLists;
                    delete _remoteDirtyPaths.kanbanOrder;
                    if (record.masterLists) {
                        masterLists = _normalizeMasterLists(record.masterLists);
                    }
                    kanbanOrder = record.kanbanOrder || {};
                    // Atualiza SÓ o baseline de masterLists (sem chamar captureSyncBaseline,
                    // que sobrescreveria o baseline dos arrays — que podem ter edições locais
                    // ainda não salvas durante uma edição de card).
                    if (_syncBaseline) _syncBaseline.masterLists = _deepClone(masterLists);
                }

                if (dataChanged) {
                    _DATA_KEYS.forEach(k => { delete _remoteDirtyPaths[k]; });
                    audits = record.audits || [];
                    activities = record.activities || [];
                    maintenances = record.maintenances || [];
                    documents = record.documents || [];
                    ocorrencias = record.ocorrencias || [];
                    rncItems = record.rncItems || [];
                    if (typeof window.rncItems !== 'undefined') window.rncItems = rncItems;
                    // Adotamos o estado remoto: atualiza o baseline do merge.
                    captureSyncBaseline();
                }

                populateSelects();
                if (currentTab === 'ocorrencias') { if (typeof window.ocRenderTable === 'function') window.ocRenderTable(); }
                else if (currentTab === 'rnc') { if (typeof window.rncRenderTable === 'function') window.rncRenderTable(); }
                else if (currentTab === 'dashboard') {
                    var _ocDashEl = document.getElementById('dashboardOcContent');
                    if (_ocDashEl && _ocDashEl.style.display !== 'none') {
                        if (typeof window.renderOcDashboard === 'function') window.renderOcDashboard();
                    } else {
                        if (typeof window.renderDashboard === 'function') window.renderDashboard();
                    }
                } else {
                    if (typeof window.renderCards === 'function') window.renderCards();
                }
                if (typeof window.updateRncNotificationBell === 'function') window.updateRncNotificationBell();
        } catch (err) {
            console.error('Erro ao aplicar dados remotos:', err);
        }
    }

    function startUsersListener() {
        const database = getFirebaseDatabase();
        const dbRef = getFirebaseRef();
        const dbOnValue = getFirebaseOnValue();
        if (typeof startUserGroupsListener === 'function') startUserGroupsListener();
        if (usersListener) return;
        usersListener = dbOnValue(dbRef(database, 'passwords'), (snapshot) => {
            if (isEditingCardOpen()) return;

            let rawUsers = snapshot.exists() ? snapshot.val() : [];
            if (!Array.isArray(rawUsers)) rawUsers = [];

            const newUsers = rawUsers.map(_normalizeUser);

            if (JSON.stringify(newUsers) !== JSON.stringify(users)) {
                users = newUsers;
                if (typeof _refreshCurrentUserPerms === 'function') _refreshCurrentUserPerms();
                if (currentTab === 'configuracoes') {
                    renderusersConfigTable();
                    if (typeof renderUserGroupsTable === 'function') renderUserGroupsTable();
                }
                msRefreshUsers();
                populateSelects();
            }
        });
    }

    function stopFirebaseListener() {
        try {
            const database = getFirebaseDatabase();
            const dbRef = getFirebaseRef();
            const dbOff = getFirebaseOff();
            if (dataListeners.length) {
                dataListeners.forEach(({ path, handler }) => {
                    try { dbOff(dbRef(database, path), handler); } catch (_) {}
                });
                dataListeners = [];
                _remoteCache = {};
                _dataListenersPrimed = false;
                _remoteDirtyPaths = {};
            }
            if (usersListener) {
                dbOff(dbRef(database, 'passwords'), usersListener);
                usersListener = null;
            }
            if (typeof stopUserGroupsListener === 'function') stopUserGroupsListener();
        } catch (error) {
            console.error('Erro ao parar listener Firebase:', error);
        }
    }

    // === MERGE 3-VIAS / BASELINE (previne perda de dados em edições concorrentes) ===
    // _syncBaseline guarda um snapshot das coleções no último estado remoto que
    // adotamos integralmente. Ao salvar, comparamos o estado local com esse
    // baseline para descobrir o que ESTE usuário realmente alterou (adições,
    // edições e exclusões) e aplicamos apenas esses deltas sobre o estado remoto
    // mais recente — sem sobrescrever alterações feitas por outras sessões.
    var _syncBaseline = null;
    var _saveAllQueue = Promise.resolve(); // serializa gravações concorrentes
    var _pendingSaves = 0;                 // nº de saves em andamento (guard do listener)

    function _deepClone(v) {
        try { return JSON.parse(JSON.stringify(v == null ? [] : v)); } catch (_) { return []; }
    }

    function captureSyncBaseline() {
        _syncBaseline = {
            audits: _deepClone(audits),
            activities: _deepClone(activities),
            maintenances: _deepClone(maintenances),
            documents: _deepClone(documents),
            ocorrencias: _deepClone(ocorrencias),
            rncItems: _deepClone(rncItems),
            // masterLists (listas mestras: marcadores, status, categorias, etc.) entra no
            // baseline para que o save reconcilie suas alterações por delta, igual aos arrays.
            masterLists: _deepClone(masterLists)
        };
    }

    // Normaliza valores do Firebase RTDB para array JS.
    // O RTDB serializa arrays como objetos {0:x,1:y,...} — Object.values() recupera.
    function _toArray(val) {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        if (typeof val === 'object') return Object.values(val);
        return [];
    }

    // Reconcilia uma coleção: parte do estado REMOTO e reaplica somente as
    // alterações locais reais (detectadas contra o baseline) por id de item.
    function _mergeCollection(localArr, remoteArr, baseArr) {
        localArr  = Array.isArray(localArr)  ? localArr  : [];
        remoteArr = _toArray(remoteArr);
        baseArr   = Array.isArray(baseArr)   ? baseArr   : [];

        const hasId = (it) => it && it.id !== undefined && it.id !== null && it.id !== '';

        // Sem ids confiáveis não há como reconciliar com segurança: mantém a
        // visão local (fallback seguro; não deve ocorrer no fluxo normal).
        if (localArr.some(it => !hasId(it)) || remoteArr.some(it => !hasId(it))) {
            return _deepClone(localArr);
        }

        const baseById  = new Map(baseArr.map(it => [String(it.id), it]));
        const localById = new Map(localArr.map(it => [String(it.id), it]));

        // Começa do remoto para preservar alterações de outras sessões.
        const merged = new Map(remoteArr.map(it => [String(it.id), it]));

        // Exclusões locais: itens que existiam no baseline e sumiram do local.
        baseById.forEach((_v, id) => {
            if (!localById.has(id)) merged.delete(id);
        });

        // Adições/edições locais: o item local difere do baseline => local vence.
        localById.forEach((item, id) => {
            const base = baseById.get(id);
            if (!base || JSON.stringify(base) !== JSON.stringify(item)) {
                merged.set(id, item);
            }
        });

        const result = Array.from(merged.values());

        // Guarda de segurança: se o resultado ficou vazio mas o estado local
        // tem itens, o remoto provavelmente voltou null/vazio por inconsistência
        // transitória do Firebase (array vazio → null no RTDB) e NÃO por uma
        // exclusão real. Preserva o estado local para evitar apagar dados.
        // Não afeta exclusões legítimas: nesse caso localArr também seria [].
        if (result.length === 0 && localArr.length > 0) {
            return _deepClone(localArr);
        }

        return result;
    }

    // === MERGE de masterLists (listas mestras: marcadores, status, categorias, subcats…) ===
    // masterLists é um OBJETO de listas (não um array com ids), então o merge é feito por
    // chave de topo e por identidade do item (id > name > value > JSON). Reaproveita a mesma
    // disciplina baseline+remoto dos arrays para NÃO sobrescrever alterações de outras sessões.
    // Antes, masterLists era gravado como objeto inteiro (last-write-wins): duas sessões
    // editando marcadores/listas concorrentemente perdiam a alteração de uma delas.
    function _mlIdentity(el) {
        if (el === null || el === undefined) return '∅';
        if (typeof el !== 'object') return 'v:' + String(el);
        if (el.id !== undefined && el.id !== null && el.id !== '') return 'id:' + String(el.id);
        if (el.name !== undefined) return 'name:' + String(el.name);
        if (el.value !== undefined) return 'value:' + String(el.value);
        return 'j:' + JSON.stringify(el);
    }

    function _isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

    // Merge de uma lista (array de strings/objetos) por identidade — mesma lógica de
    // _mergeCollection, mas a identidade aceita name/value (marcadores, status, setores…).
    function _mergeIdentityArray(localArr, remoteArr, baseArr) {
        localArr  = Array.isArray(localArr) ? localArr : [];
        remoteArr = _toArray(remoteArr);
        baseArr   = Array.isArray(baseArr)  ? baseArr  : [];

        const baseById  = new Map(baseArr.map(e => [_mlIdentity(e), e]));
        const localById = new Map(localArr.map(e => [_mlIdentity(e), e]));
        const merged    = new Map(remoteArr.map(e => [_mlIdentity(e), e]));

        // Exclusões locais: item que existia no baseline e sumiu do local.
        baseById.forEach((_v, k) => { if (!localById.has(k)) merged.delete(k); });
        // Adições/edições locais: difere do baseline => local vence.
        localById.forEach((el, k) => {
            const b = baseById.get(k);
            if (!b || JSON.stringify(b) !== JSON.stringify(el)) merged.set(k, el);
        });

        const out = Array.from(merged.values());
        // Mesma guarda dos arrays: remoto transitoriamente vazio (RTDB: []→null) não apaga o local.
        if (out.length === 0 && localArr.length > 0) return _deepClone(localArr);
        return out;
    }

    function _mergeMasterNode(localV, remoteV, baseV) {
        // Listas (arrays de strings/objetos) → merge por identidade.
        if (Array.isArray(localV) || Array.isArray(remoteV)) {
            return _mergeIdentityArray(localV, remoteV, baseV);
        }
        // Mapas aninhados (ex.: auditSubcats {cat:[…]}, ncMotivos {catId:[…]}) → recursão.
        if (_isPlainObject(localV) || _isPlainObject(remoteV)) {
            const lo = _isPlainObject(localV) ? localV : {};
            const ro = _isPlainObject(remoteV) ? remoteV : {};
            const bo = _isPlainObject(baseV)   ? baseV   : {};
            const keys = new Set([...Object.keys(lo), ...Object.keys(ro)]);
            const out = {};
            keys.forEach(k => {
                // Subchave excluída localmente (estava no baseline, sumiu do local) → remove.
                if (!(k in lo) && (k in bo)) return;
                out[k] = _mergeMasterNode(lo[k], ro[k], bo[k]);
            });
            return out;
        }
        // Escalares: local vence se difere do baseline; senão mantém o remoto.
        if (JSON.stringify(localV) !== JSON.stringify(baseV)) return localV;
        return remoteV !== undefined ? remoteV : localV;
    }

    // Chaves de lista de masterLists que NÃO estão em defaultMasterLists (criadas sob demanda).
    var _ML_EXTRA_ARRAY_KEYS = ['rncMarcadores'];

    // Normaliza masterLists vindo do RTDB: o Firebase serializa arrays ESPARSOS como
    // objetos {0:x,1:y,…}. Se uma lista (marcadores/status/categorias) voltar como objeto,
    // list.push/.some/.find quebram e o CRUD falha "sem persistir" — e ensureLists() do RNC
    // chega a ZERAR rncMarcadores ao ver que não é array. Converter de volta para array real
    // (idempotente em arrays já corretos) blinda todo o fluxo de marcadores.
    function _normalizeMasterLists(ml) {
        const out = { ...defaultMasterLists, ...(ml || {}) };
        Object.keys(out).forEach(k => {
            const dv = defaultMasterLists[k];
            if (Array.isArray(dv) || _ML_EXTRA_ARRAY_KEYS.includes(k)) {
                out[k] = _toArray(out[k]);
            } else if (_isPlainObject(dv)) {
                // Mapas aninhados (auditSubcats, mantItens, ncMotivos…): cada valor é uma lista.
                const node = _isPlainObject(out[k]) ? out[k] : {};
                const norm = {};
                Object.keys(node).forEach(sub => { norm[sub] = _toArray(node[sub]); });
                out[k] = norm;
            }
        });
        return out;
    }

    function _mergeMasterLists(localML, remoteML, baseML) {
        localML  = _isPlainObject(localML)  ? localML  : {};
        remoteML = _isPlainObject(remoteML) ? remoteML : {};
        baseML   = _isPlainObject(baseML)   ? baseML   : {};
        const keys = new Set([
            ...Object.keys(defaultMasterLists),
            ...Object.keys(localML),
            ...Object.keys(remoteML)
        ]);
        const out = {};
        keys.forEach(k => { out[k] = _mergeMasterNode(localML[k], remoteML[k], baseML[k]); });
        return out;
    }

    // Wrapper público: enfileira as gravações para que duas chamadas de saveAll
    // não se intercalem (read-merge-write atômico por chamada).
    //
    // COALESCING: o save lê o estado LOCAL (não congelado) no instante em que roda,
    // então N chamadas disparadas em rajada não precisam de N gravações do banco
    // inteiro — basta UMA regravação após o save atual para capturar todas as
    // mutações acumuladas. Enquanto há um save em andamento/agendado, chamadas
    // extras apenas marcam `_saveCoalesced` em vez de empilhar ciclos redundantes.
    // Exceção: `showAlert` (sincronização manual) sempre força um ciclo próprio,
    // pois precisa reportar sucesso/erro daquela ação específica ao usuário.
    var _saveCoalesced = false;
    function saveAll(showAlert = false) {
        if (!showAlert && _pendingSaves > 0) {
            // Já há um save no ar; ele (ou seu follow-up) relerá o estado local
            // atualizado. Evita gravações redundantes do banco inteiro em rajada.
            _saveCoalesced = true;
            return _saveAllQueue;
        }
        _pendingSaves++;
        _saveAllQueue = _saveAllQueue
            .catch(() => {})
            .then(() => _saveAllInternal(showAlert))
            .finally(() => { _pendingSaves = Math.max(0, _pendingSaves - 1); });
        // Follow-up único: se chegaram mutações durante este save, regrava uma vez.
        _saveAllQueue = _saveAllQueue.then(() => {
            if (_saveCoalesced && _pendingSaves === 0) {
                _saveCoalesced = false;
                return saveAll();
            }
            _saveCoalesced = false;
        });
        return _saveAllQueue;
    }

    async function _saveAllInternal(showAlert = false) {
        try {
            const database = getFirebaseDatabase();
            const dbRef = getFirebaseRef();
            const update = getFirebaseUpdate();
            const dbGet = getFirebaseGet();
            const runTransaction = getFirebaseRunTransaction();

            cleanInvalidResponsaveis();
            cleanMalformedItems();

            const maxHistoryItems = 150;
            [audits, activities, maintenances, documents].forEach(arr => {
                arr.forEach(item => {
                    if (item.historico && item.historico.length > maxHistoryItems) {
                        item.historico = item.historico.slice(-maxHistoryItems);
                    }
                });
            });

            // Tira os snapshots de dentro dos cards antes de montar o payload: eles vão
            // para /cardSnapshots (fora das coleções lidas no boot) e a entrada fica só
            // com `snapId`. Roda ANTES do _deepClone para que o estado local e o que será
            // gravado fiquem idênticos — se divergissem, o merge veria todo card como
            // alterado e regravaria o banco inteiro a cada save. Falha aqui não é fatal:
            // o snapshot continua inline e tenta de novo no próximo save.
            if (typeof window._externalizeSnapshots === 'function') {
                try {
                    await window._externalizeSnapshots([audits, activities, maintenances, documents]);
                } catch (snapErr) {
                    console.warn('Não foi possível externalizar snapshots do histórico:', snapErr);
                }
            }

            // Baseline ausente: trata como vazio para que todo item local vire
            // "novo" (upsert) sem excluir nada — evita apagar dados com estado parcial.
            const base = _syncBaseline || {
                audits: [], activities: [], maintenances: [], documents: [], ocorrencias: [], rncItems: [], masterLists: {}
            };

            // Snapshots locais estáveis capturados antes da leitura remota.
            const local = {
                audits: _deepClone(audits),
                activities: _deepClone(activities),
                maintenances: _deepClone(maintenances),
                documents: _deepClone(documents),
                ocorrencias: _deepClone(ocorrencias),
                rncItems: _deepClone(rncItems)
            };
            const mlSnapshot = JSON.parse(JSON.stringify(masterLists));
            const koSnapshot = JSON.parse(JSON.stringify(kanbanOrder));

            // (#3) Lê SOMENTE as coleções de dados para o merge 3-vias — não baixa
            // /imgBlobs (imagens Base64) nem /passwords. Esta é a leitura mais frequente
            // do sistema (roda a cada gravação), então excluir as imagens daqui é o maior
            // corte de banda. A escrita usa runTransaction por coleção (abaixo) — nunca
            // runTransaction(/) na raiz, que falha com internal_error em bancos grandes.
            const _mergePaths = ['audits','activities','maintenances','documents','ocorrencias','rncItems','masterLists','kanbanOrder'];
            const _remoteSnaps = await Promise.all(_mergePaths.map(p => dbGet(dbRef(database, p))));
            const remoteState = {};
            _mergePaths.forEach((p, i) => { remoteState[p] = _remoteSnaps[i].exists() ? _remoteSnaps[i].val() : undefined; });

            const mergedAudits       = _mergeCollection(local.audits,       remoteState.audits,       base.audits);
            const mergedActivities   = _mergeCollection(local.activities,   remoteState.activities,   base.activities);
            const mergedMaintenances = _mergeCollection(local.maintenances, remoteState.maintenances, base.maintenances);
            const mergedDocuments    = _mergeCollection(local.documents,    remoteState.documents,    base.documents);
            const mergedOcorrencias  = _mergeCollection(local.ocorrencias,  remoteState.ocorrencias,  base.ocorrencias);
            const mergedRncItems     = _mergeCollection(local.rncItems,     remoteState.rncItems,     base.rncItems);
            // masterLists também é reconciliado por merge (antes: objeto inteiro = last-write-wins).
            const mergedMasterLists  = _mergeMasterLists(mlSnapshot, remoteState.masterLists, base.masterLists);

            // (#2) Decide SOMENTE quais coleções mudaram em relação a este dbGet — heurística
            // barata que decide O QUÊ gravar. A gravação em si (abaixo) roda via runTransaction
            // por coleção, que relê o valor no servidor no momento do commit; não depende deste
            // snapshot estar perfeitamente fresco.
            const _changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
            const _dirty = {
                audits:       _changed(mergedAudits,       _toArray(remoteState.audits)),
                activities:   _changed(mergedActivities,   _toArray(remoteState.activities)),
                maintenances: _changed(mergedMaintenances, _toArray(remoteState.maintenances)),
                documents:    _changed(mergedDocuments,    _toArray(remoteState.documents)),
                ocorrencias:  _changed(mergedOcorrencias,  _toArray(remoteState.ocorrencias)),
                rncItems:     _changed(mergedRncItems,     _toArray(remoteState.rncItems)),
                masterLists:  _changed(mergedMasterLists, remoteState.masterLists || {}),
                kanbanOrder:  _changed(koSnapshot, remoteState.kanbanOrder || {})
            };

            // Cada coleção suja grava com runTransaction NO PRÓPRIO CAMINHO (nunca na raiz —
            // é isso que causava internal_error em bancos grandes, por arrastar todo o resto).
            // A callback da transação roda de novo com o dado ATUAL do servidor a cada
            // tentativa/conflito, recalculando o merge 3-vias contra ele em vez do snapshot do
            // dbGet acima — fecha a janela de corrida entre a leitura e a escrita que permitia
            // uma gravação concorrente sumir sob um update() baseado em dado já desatualizado.
            const _txArrayMerge = (localArr, baseArr) => (currentData) =>
                _mergeCollection(localArr, _toArray(currentData), baseArr);
            const _txSpecs = [];
            if (_dirty.audits)       _txSpecs.push(['audits',       _txArrayMerge(local.audits,       base.audits)]);
            if (_dirty.activities)   _txSpecs.push(['activities',   _txArrayMerge(local.activities,   base.activities)]);
            if (_dirty.maintenances) _txSpecs.push(['maintenances', _txArrayMerge(local.maintenances, base.maintenances)]);
            if (_dirty.documents)    _txSpecs.push(['documents',    _txArrayMerge(local.documents,    base.documents)]);
            if (_dirty.ocorrencias)  _txSpecs.push(['ocorrencias',  _txArrayMerge(local.ocorrencias,  base.ocorrencias)]);
            if (_dirty.rncItems)     _txSpecs.push(['rncItems',     _txArrayMerge(local.rncItems,     base.rncItems)]);
            if (_dirty.masterLists)  _txSpecs.push(['masterLists',  (currentData) => _mergeMasterLists(mlSnapshot, currentData, base.masterLists)]);
            if (_dirty.kanbanOrder)  _txSpecs.push(['kanbanOrder',  () => koSnapshot]);

            const _txSettled = await Promise.allSettled(
                _txSpecs.map(([path, mergeFn]) => runTransaction(dbRef(database, path), mergeFn))
            );

            // Mapa dos valores REALMENTE gravados (transação confirmada pelo servidor) e lista
            // de caminhos cuja gravação falhou (rejeitada ou abortada pelo servidor).
            const committed = {};
            const failedPaths = [];
            _txSettled.forEach((r, i) => {
                const path = _txSpecs[i][0];
                if (r.status === 'fulfilled' && r.value.committed) {
                    committed[path] = r.value.snapshot.val();
                } else {
                    failedPaths.push(path + ': ' + (r.status === 'rejected' ? ((r.reason && (r.reason.code || r.reason.message)) || r.reason) : 'abortada'));
                    console.error(`Erro ao gravar "${path}" no Firebase:`, r.status === 'rejected' ? r.reason : 'transação abortada');
                }
            });
            if (Object.keys(committed).length > 0) {
                await update(dbRef(database, "/"), { lastUpdate: new Date().toISOString() });
            }

            // SÓ AGORA (por coleção, cada uma confirmada pelo commit da SUA PRÓPRIA transação)
            // adota o resultado reconciliado como novo estado local + baseline. Coleção sem
            // alteração local usa o merge já calculado acima (só "puxa" o que outras sessões
            // gravaram, nada foi escrito por esta sessão). Coleção suja cuja transação falhou
            // mantém o array local intacto (edição do usuário preservada) e o baseline INTOCADO
            // — sem isso, capturar baseline a partir do valor local não-confirmado faria a
            // próxima gravação achar "nada mudou" e nunca reenviar a edição perdida.
            const _adopt = (key, mergedFallback) => {
                if (key in committed) return _toArray(committed[key]);
                if (_dirty[key]) return undefined; // falhou: não adota, não atualiza baseline
                return mergedFallback; // sem alteração local: comportamento igual ao anterior
            };
            const _newAudits       = _adopt('audits',       mergedAudits);
            const _newActivities   = _adopt('activities',   mergedActivities);
            const _newMaintenances = _adopt('maintenances', mergedMaintenances);
            const _newDocuments    = _adopt('documents',    mergedDocuments);
            const _newOcorrencias  = _adopt('ocorrencias',  mergedOcorrencias);
            const _newRncItems     = _adopt('rncItems',     mergedRncItems);

            // O merge incorporou novidades de outras sessões? (para re-render)
            const pulledRemoteChanges =
                (_newAudits       !== undefined && JSON.stringify(_newAudits)       !== JSON.stringify(audits)) ||
                (_newActivities   !== undefined && JSON.stringify(_newActivities)   !== JSON.stringify(activities)) ||
                (_newMaintenances !== undefined && JSON.stringify(_newMaintenances) !== JSON.stringify(maintenances)) ||
                (_newDocuments    !== undefined && JSON.stringify(_newDocuments)    !== JSON.stringify(documents)) ||
                (_newOcorrencias  !== undefined && JSON.stringify(_newOcorrencias)  !== JSON.stringify(ocorrencias)) ||
                (_newRncItems     !== undefined && JSON.stringify(_newRncItems)     !== JSON.stringify(rncItems));

            if (_newAudits       !== undefined) audits       = _newAudits;
            if (_newActivities   !== undefined) activities   = _newActivities;
            if (_newMaintenances !== undefined) maintenances = _newMaintenances;
            if (_newDocuments    !== undefined) documents    = _newDocuments;
            if (_newOcorrencias  !== undefined) ocorrencias  = _newOcorrencias;
            if (_newRncItems     !== undefined) rncItems     = _newRncItems;
            if (typeof window.rncItems !== 'undefined') window.rncItems = rncItems;

            // masterLists: se a transação gravou, adota o estado CONFIRMADO preservando edições
            // feitas DURANTE o await (ex.: usuário adicionou outro marcador em rajada → saveAll
            // coalescido) — reaplica os deltas da masterLists viva atual (vs. snapshot do início
            // do save) sobre o resultado gravado, para que o follow-up do coalescing os persista
            // sem perder o que outras sessões trouxeram. Se não havia alteração local, usa o
            // merge já calculado (só pull). Se a transação falhou, mantém tudo intocado.
            const _committedMasterLists = 'masterLists' in committed ? committed.masterLists : ( !_dirty.masterLists ? mergedMasterLists : undefined );
            if (_committedMasterLists !== undefined) {
                masterLists = _mergeMasterLists(masterLists, _committedMasterLists, mlSnapshot);
            }

            const _newBaseline = _syncBaseline ? { ..._syncBaseline } : {
                audits: [], activities: [], maintenances: [], documents: [], ocorrencias: [], rncItems: [], masterLists: {}
            };
            if (_newAudits       !== undefined) _newBaseline.audits       = _deepClone(_newAudits);
            if (_newActivities   !== undefined) _newBaseline.activities   = _deepClone(_newActivities);
            if (_newMaintenances !== undefined) _newBaseline.maintenances = _deepClone(_newMaintenances);
            if (_newDocuments    !== undefined) _newBaseline.documents    = _deepClone(_newDocuments);
            if (_newOcorrencias  !== undefined) _newBaseline.ocorrencias  = _deepClone(_newOcorrencias);
            if (_newRncItems     !== undefined) _newBaseline.rncItems     = _deepClone(_newRncItems);
            // O baseline de masterLists deve ser o ESTADO GRAVADO (não a masterLists viva) —
            // assim qualquer edição concorrente continua sendo um delta pendente para a próxima
            // gravação, em vez de virar "sem alteração".
            if (_committedMasterLists !== undefined) _newBaseline.masterLists = _deepClone(_committedMasterLists);
            _syncBaseline = _newBaseline;

            if (failedPaths.length > 0) {
                const msg = 'Erro ao salvar no banco de dados (' + failedPaths.join('; ') + ').';
                if (typeof showToast === 'function') showToast(msg, 'error');
                else if (showAlert) alert(msg);
            }
            // Flag consultável por fluxos que precisam saber se ESTA gravação persistiu de
            // fato antes de descartar estado local pendente (ex.: checklist do viewModal) —
            // saveAll() nunca rejeita (erros já viram toast aqui dentro), então quem chama
            // não tem como saber pelo retorno da Promise se a gravação realmente aconteceu.
            window._lastSaveOk = (failedPaths.length === 0);

            _saveLocalCache(); // (#5) atualiza o cache visual após gravação confirmada

            // Se incorporamos mudanças de outras sessões, atualiza a UI.
            if (pulledRemoteChanges && !isEditingCardOpen()) {
                populateSelects();
                if (currentTab === 'ocorrencias') { if (typeof window.ocRenderTable === 'function') window.ocRenderTable(); }
                else if (currentTab === 'rnc') { if (typeof window.rncRenderTable === 'function') window.rncRenderTable(); }
                else if (currentTab === 'dashboard') {
                    var _ocDashEl2 = document.getElementById('dashboardOcContent');
                    if (_ocDashEl2 && _ocDashEl2.style.display !== 'none') {
                        if (typeof window.renderOcDashboard === 'function') window.renderOcDashboard();
                    } else {
                        renderDashboard();
                    }
                } else {
                    renderCards();
                }
                if (typeof window.updateRncNotificationBell === 'function') window.updateRncNotificationBell();
            }

            if (showAlert && failedPaths.length === 0) alert("Dados sincronizados com sucesso!");

        } catch (err) {
            console.error("Erro ao sincronizar com Firebase:", err);
            // Falha de gravação: NÃO adota o resultado mesclado. As edições locais e
            // o baseline são preservados, então a alteração do usuário não é perdida
            // nem revertida pelo listener — bastará uma nova tentativa de salvar.
            // Mesmo em saves silenciosos (showAlert=false), avisa o usuário — do
            // contrário uma falha de permissão/rede no BD passa despercebida e a
            // alteração local parece "salva" quando na verdade não foi persistida.
            window._lastSaveOk = false;
            if (showAlert) {
                if (typeof showToast === 'function') showToast('Erro ao salvar. Verifique a conexão — suas alterações não foram perdidas.', 'error');
                else alert("Erro ao sincronizar dados. Verifique a conexão.");
            } else if (typeof showToast === 'function') {
                showToast('Erro ao salvar no banco de dados: ' + ((err && (err.code || err.message)) || err), 'error');
            }
        }
    }

    function getStatusType(statusname, category) {
        // Busca o objeto de status na lista correta para checar flags isConcluido/isCancelado
        let list;
        if (category === 'audit') list = masterLists.auditStatus;
        else if (category === 'ativ') list = masterLists.ativStatus;
        else if (category === 'mant') list = masterLists.mantStatus;
        else if (category === 'doc') list = masterLists.docStatus;
        const statusObj = (list || []).find(s => s.name === statusname);
        if (statusObj) {
            if (statusObj.isConcluido) return 'finalizado';
            if (statusObj.isCancelado) return 'inativo';
        }
        // Fallback por nome para compatibilidade
        const finalizadoKeywords = ['concluído', 'finalizado', 'publicado'];
        const inativoKeywords = ['cancelado', 'obsoleto'];
        const nameLower = (statusname || '').toLowerCase();
        if (finalizadoKeywords.includes(nameLower)) return 'finalizado';
        if (inativoKeywords.includes(nameLower)) return 'inativo';
        return 'ativo';
    }

    function normalizeStatusName(name) {
        return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function isStatusCancelled(name) {
        return normalizeStatusName(name) === 'cancelado';
    }

    function isStatusStandby(name) {
        const n = normalizeStatusName(name);
        return n === 'standby' || n === 'stand by';
    }

    function getStatusColor(statusname, category) {
        let list;
        if (category === 'audit') list = masterLists.auditStatus;
        else if (category === 'ativ') list = masterLists.ativStatus;
        else if (category === 'mant') list = masterLists.mantStatus;
        else if (category === 'doc') list = masterLists.docStatus;

        const statusObj = (list || []).find(s => s.name === statusname);
        return statusObj ? statusObj.color : 'default';
    }
