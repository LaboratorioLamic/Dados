// === SNAPSHOTS DE HISTÓRICO (nó isolado /cardSnapshots) ===
//
// Cada entrada de histórico guardava uma cópia INTEIRA do card em `entry.snapshot`.
// Medido em 18/09/2026: 5,53 MB de 6,55 MB (81%) do banco e 197 mil dos 246 mil nós
// que o SDK do RTDB precisa construir no boot — para um dado que tem UM único leitor,
// o botão de olho do histórico (`viewHistoryItem`), e que quase nunca é aberto.
//
// Agora o snapshot mora em `/cardSnapshots/{snapId}` — fora de `_DATA_LISTEN_PATHS`,
// portanto nunca baixado no boot nem reenviado pelos listeners — e a entrada guarda
// só a referência `entry.snapId`.
//
// Compatibilidade: `entry.snapshot` inline (formato antigo) continua sendo lido
// normalmente. Nada quebra se a migração for parcial ou nem rodar.
(function () {
    'use strict';

    var PATH = 'cardSnapshots';

    // Snapshots já buscados nesta sessão. São imutáveis (registro histórico),
    // então cachear é seguro e evita refetch ao reabrir a mesma entrada.
    var _cache = {};

    function _newSnapId() {
        var base = (typeof window.generateId === 'function')
            ? window.generateId()
            : (Date.now() * 1000 + Math.floor(Math.random() * 1000));
        // Prefixo 's' separa o espaço de chaves do dos ids de card e garante
        // chave de RTDB válida (sem . $ # [ ] /).
        return 's' + base;
    }

    // --- LEITURA -------------------------------------------------------------
    // Resolve o snapshot de uma entrada de histórico nos dois formatos.
    // `fallbackItem` é o card atual, usado quando a entrada não tem snapshot algum
    // (entradas antigas, anteriores ao recurso) — mesmo comportamento de antes.
    window._resolveHistorySnapshot = async function (entry, fallbackItem) {
        var clone = function (v) { return JSON.parse(JSON.stringify(v)); };

        if (entry && entry.snapshot) return clone(entry.snapshot);   // formato antigo

        if (entry && entry.snapId) {
            if (_cache[entry.snapId]) return clone(_cache[entry.snapId]);
            try {
                var database = getFirebaseDatabase();
                var dbRef = getFirebaseRef();
                var dbGet = getFirebaseGet();
                var snap = await dbGet(dbRef(database, PATH + '/' + entry.snapId));
                if (snap.exists()) {
                    _cache[entry.snapId] = snap.val();
                    return clone(_cache[entry.snapId]);
                }
                console.warn('Snapshot ' + entry.snapId + ' não encontrado em /' + PATH);
            } catch (err) {
                console.error('Erro ao carregar snapshot do histórico:', err);
            }
        }

        return fallbackItem ? clone(fallbackItem) : {};
    };

    // --- ESCRITA -------------------------------------------------------------
    // Move para /cardSnapshots todo snapshot ainda inline e troca por `snapId`.
    // Chamado por _saveAllInternal, que é o único ponto de gravação das coleções.
    //
    // Ordem importa: grava o snapshot PRIMEIRO e só então desanexa da entrada. Se a
    // gravação falhar, o snapshot continua inline e nada se perde — o custo é apenas
    // tentar de novo no próximo save. O inverso (desanexar antes de confirmar)
    // perderia o histórico numa falha de rede.
    var MAX_POR_SAVE = 200;

    // Cópia do card dentro do snapshot não precisa das cópias antigas do histórico dele:
    // elas criavam aninhamento além do limite de 32 níveis do Firebase.
    function _semSnapshotsAninhados(o) {
        if (Array.isArray(o)) return o.map(_semSnapshotsAninhados);
        if (!o || typeof o !== 'object') return o;
        var out = {};
        Object.keys(o).forEach(function (k) {
            if (k === 'snapshot') return;
            out[k] = _semSnapshotsAninhados(o[k]);
        });
        return out;
    }

    // Repete em lotes até não sobrar snapshot inline (backup importado tem milhares).
    window._externalizeSnapshots = async function (collections) {
        var total = 0, n;
        do { n = await _externalizarLote(collections); total += n; } while (n > 0);
        return total;
    };

    async function _externalizarLote(collections) {
        var pendentes = [];
        (collections || []).forEach(function (arr) {
            (arr || []).forEach(function (item) {
                var h = (item && item.historico) || [];
                if (!Array.isArray(h)) return;
                h.forEach(function (entry) {
                    if (!entry || !entry.snapshot || entry.snapId) return;
                    if (pendentes.length >= MAX_POR_SAVE) return;
                    pendentes.push({ entry: entry, snapId: _newSnapId(), snapshot: entry.snapshot });
                });
            });
        });

        if (!pendentes.length) return 0;

        var payload = {};
        pendentes.forEach(function (p) { p.snapshot = _semSnapshotsAninhados(p.snapshot); payload[p.snapId] = p.snapshot; });

        var database = getFirebaseDatabase();
        var dbRef = getFirebaseRef();
        var update = getFirebaseUpdate();
        await update(dbRef(database, PATH), payload);

        // Confirmado: agora sim troca o conteúdo pela referência.
        pendentes.forEach(function (p) {
            delete p.entry.snapshot;
            p.entry.snapId = p.snapId;
            _cache[p.snapId] = p.snapshot;
        });
        return pendentes.length;
    }

    window._cardSnapshotsPath = PATH;
})();
