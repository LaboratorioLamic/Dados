// Camada de integridade de dados: escrita segura, sincronização entre sessões
// e feedback visual de gravação.
//
// Três problemas concretos que este arquivo resolve:
//
// 1. Sobrescrita entre sessões. O painel carregava a categoria inteira em
//    memória e regravava a árvore toda a cada save (`set(categoria, data)`).
//    Dois administradores abertos ao mesmo tempo — ou o mesmo administrador em
//    duas abas — faziam o último save apagar tudo que o outro tinha feito
//    desde o carregamento. `buildDiff` transforma "regravar a árvore" em
//    "atualizar só o que mudou" (multi-path update), então edições em partes
//    diferentes convivem em vez de se anularem.
//
// 2. Sessão com dado velho. Sem escuta ao vivo, quem ficava com a tela aberta
//    seguia vendo o conteúdo do momento em que entrou. `U.live()` padroniza a
//    assinatura em um caminho e o cancelamento dela.
//
// 3. Gravação invisível. Ações do painel que alteram o banco precisam mostrar
//    que algo está acontecendo e impedir um segundo clique no meio. Em vez de
//    caçar dezenas de pontos de chamada, as próprias operações de escrita do
//    SDK são interceptadas aqui — qualquer set/update/remove/transaction feito
//    de dentro do painel acende o overlay e o apaga ao terminar.
(function () {
    var U = window.UniAdmin;
    if (!U || !U.db) return;

    // ─── Overlay de gravação ───────────────────────────────────────────────
    // Contador, não booleano: uma ação pode disparar escritas encadeadas e o
    // fim da primeira não pode apagar o overlay enquanto as outras correm.
    var busyCount = 0;
    var busyEl = null;
    var busyShownAt = 0;
    var busyHideTimer = null;
    // Uma gravação rápida acendendo e apagando o overlay em 40ms vira um
    // flash desagradável; mantido no mínimo visível, ele lê como confirmação.
    var BUSY_MIN_VISIBLE_MS = 420;

    function buildBusyOverlay() {
        var el = document.createElement('div');
        el.id = 'db-busy-overlay';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-label', 'Salvando alterações');
        el.innerHTML = ''
            + '<div class="db-busy-card">'
            + '  <div class="db-busy-spinner" aria-hidden="true"></div>'
            + '  <p class="db-busy-label">Salvando alterações…</p>'
            + '  <p class="db-busy-hint">Não feche a página.</p>'
            + '</div>';
        return el;
    }

    function showBusy(label) {
        busyCount += 1;
        if (busyCount > 1) return;
        clearTimeout(busyHideTimer);
        if (!busyEl) busyEl = buildBusyOverlay();
        busyEl.querySelector('.db-busy-label').textContent = label || 'Salvando alterações…';
        if (!busyEl.isConnected) document.body.appendChild(busyEl);
        void busyEl.offsetWidth; // reflow, para a transição de opacidade rodar
        busyEl.classList.add('is-visible');
        document.body.classList.add('is-db-busy');
        busyShownAt = Date.now();
    }

    function hideBusy() {
        busyCount = Math.max(0, busyCount - 1);
        if (busyCount > 0) return;
        var remaining = Math.max(0, BUSY_MIN_VISIBLE_MS - (Date.now() - busyShownAt));
        clearTimeout(busyHideTimer);
        busyHideTimer = setTimeout(function () {
            if (busyCount > 0) return;
            if (busyEl) busyEl.classList.remove('is-visible');
            document.body.classList.remove('is-db-busy');
        }, remaining);
    }

    U.busy = showBusy;
    U.idle = hideBusy;

    /**
     * Executa uma gravação com overlay e checagem de conexão.
     * Use quando a ação não é uma única chamada do SDK (ex.: várias escritas
     * em sequência) e você quer um overlay só para o conjunto.
     */
    U.mutate = function (task, label) {
        try { if (U.Connection) U.Connection.assertOnline(); }
        catch (error) { return Promise.reject(error); }
        showBusy(label);
        return Promise.resolve()
            .then(task)
            .finally(function () { hideBusy(); });
    };

    // ─── Interceptação das escritas do SDK ─────────────────────────────────
    // O painel administrativo é a única superfície que precisa do overlay: no
    // portal do aluno as gravações são de fundo (progresso, tempo de curso) e
    // escurecer a tela no meio de um vídeo seria ruído.
    function isAdminContext() {
        var root = document.getElementById('cfg-root');
        return !!root && !root.hidden && root.offsetParent !== null;
    }

    // `.info/*` é metainformação de conexão, não dado do produto.
    function isInternalPath(reference) {
        var path = String(reference && reference.toString ? reference.toString() : '');
        return path.indexOf('/.info') !== -1;
    }

    // O `set` pode estar no protótipo direto ou mais acima na cadeia,
    // dependendo de como o SDK compat monta a Reference. Procurar o dono real
    // evita patch em objeto errado, que falharia calado (sem overlay, sem erro).
    function ownerOf(instance, method) {
        var node = Object.getPrototypeOf(instance);
        while (node && !Object.prototype.hasOwnProperty.call(node, method)) {
            node = Object.getPrototypeOf(node);
        }
        return node;
    }

    var sampleRef = U.db.ref('/');
    ['set', 'update', 'remove', 'transaction'].forEach(function (method) {
        var refProto = ownerOf(sampleRef, method);
        if (!refProto) { console.warn('db-sync: não encontrei Reference.' + method + ' para instrumentar.'); return; }
        var original = refProto[method];
        if (typeof original !== 'function' || original.__uniadminWrapped) return;
        var wrapped = function () {
            var args = arguments;
            var self = this;
            if (!isAdminContext() || isInternalPath(self)) {
                return original.apply(self, args);
            }
            // Escrita do painel sem rede: o SDK aceitaria e enfileiraria, e a
            // interface diria "salvo" para algo que não saiu do navegador.
            try { if (U.Connection) U.Connection.assertOnline(); }
            catch (error) { return Promise.reject(error); }
            showBusy();
            var result;
            try { result = original.apply(self, args); }
            catch (error) { hideBusy(); throw error; }
            return Promise.resolve(result).finally(function () { hideBusy(); });
        };
        wrapped.__uniadminWrapped = true;
        refProto[method] = wrapped;
    });

    // ─── Diferença entre duas árvores → multi-path update ──────────────────
    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function deepEqual(a, b) {
        if (a === b) return true;
        if (Array.isArray(a) || Array.isArray(b)) {
            if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
            return true;
        }
        if (isPlainObject(a) && isPlainObject(b)) {
            var ka = Object.keys(a), kb = Object.keys(b);
            if (ka.length !== kb.length) return false;
            for (var j = 0; j < ka.length; j++) {
                if (!Object.prototype.hasOwnProperty.call(b, ka[j])) return false;
                if (!deepEqual(a[ka[j]], b[ka[j]])) return false;
            }
            return true;
        }
        return false;
    }
    U.deepEqual = deepEqual;

    /**
     * Forma canônica de um valor "como o Realtime Database o guardaria".
     *
     * O RTDB não tem array nem container vazio: `[a, b]` vira `{0:a, 1:b}`,
     * e `[]`/`{}`/`null` simplesmente não existem — gravar um apaga o nó. Na
     * volta, um objeto de chaves numéricas contíguas é reconstruído como
     * array, com buraco onde faltava chave. Resultado: o que a tela manda e o
     * que o servidor devolve podem representar o MESMO dado em formas que
     * `deepEqual` considera diferentes (`[null, x]` vs `{1:x}`, `len 7` vs
     * `len 8` por causa de um `[]` no fim).
     *
     * Essa diferença fantasma fazia o listener de sessão acusar alteração
     * remota em todo snapshot — toast "atualizado por outra sessão" e
     * repopulação da tela em laço. Normalizar os dois lados antes de comparar
     * elimina a classe inteira do problema, não só o caso conhecido.
     */
    function normalizeForCompare(value) {
        if (value === null || value === undefined) return undefined;
        if (Array.isArray(value)) {
            var fromArray = {};
            value.forEach(function (item, index) {
                var norm = normalizeForCompare(item);
                if (norm !== undefined) fromArray[String(index)] = norm;
            });
            return Object.keys(fromArray).length ? fromArray : undefined;
        }
        if (isPlainObject(value)) {
            var fromObject = {};
            Object.keys(value).forEach(function (key) {
                var norm = normalizeForCompare(value[key]);
                if (norm !== undefined) fromObject[key] = norm;
            });
            return Object.keys(fromObject).length ? fromObject : undefined;
        }
        return value;
    }
    U.normalizeForCompare = normalizeForCompare;

    /**
     * Igualdade na semântica do banco: use para decidir "o servidor mudou?".
     * Para comparar dois valores em memória, `deepEqual` continua sendo o certo.
     */
    U.deepEqualDb = function (a, b) {
        return deepEqual(normalizeForCompare(a), normalizeForCompare(b));
    };

    U.deepClone = function (value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    };

    /**
     * Constrói o mapa de caminhos alterados entre `base` (o que o servidor
     * tinha na última leitura) e `next` (o que está na tela agora).
     *
     * Só desce por objetos: arrays são folha e vão inteiros. É de propósito —
     * a lista de módulos de um curso é um valor único, e gravar índice a
     * índice deixaria a lista inconsistente se uma das escritas falhasse.
     *
     * Chave que sumiu vira `null`, que é como o Realtime Database apaga um nó
     * dentro de um update.
     */
    // `.`, `#`, `$`, `[`, `]` e `/` não podem aparecer num caminho de update —
    // o Firebase rejeita a escrita inteira. Um nó com chave assim é gravado
    // como valor único (o pai vai inteiro) em vez de derrubar o save todo.
    var ILLEGAL_KEY = /[.#$[\]\/]/;

    function hasIllegalKeys(obj) {
        return Object.keys(obj).some(function (key) { return ILLEGAL_KEY.test(key); });
    }

    function buildDiff(base, next, basePath, out) {
        if (isPlainObject(base) && isPlainObject(next)
            && !hasIllegalKeys(base) && !hasIllegalKeys(next)) {
            Object.keys(next).forEach(function (key) {
                buildDiff(base[key], next[key], basePath + '/' + key, out);
            });
            Object.keys(base).forEach(function (key) {
                if (!Object.prototype.hasOwnProperty.call(next, key)) out[basePath + '/' + key] = null;
            });
            return out;
        }
        if (!deepEqual(base, next)) {
            out[basePath] = next === undefined ? null : next;
        }
        return out;
    }
    U.buildDiff = function (base, next, basePath) { return buildDiff(base, next, basePath, {}); };

    /**
     * Grava só a diferença entre `base` e `next` sob `basePath`.
     * Resolve com o número de caminhos escritos (0 = nada mudou, e nesse caso
     * nem chega a ir ao servidor).
     */
    U.saveDiff = function (basePath, base, next) {
        var updates = U.buildDiff(base, next, basePath);
        var paths = Object.keys(updates);
        if (!paths.length) return Promise.resolve(0);
        return U.db.ref().update(updates).then(function () { return paths.length; });
    };

    // ─── Assinatura ao vivo ────────────────────────────────────────────────
    /**
     * Escuta um caminho e devolve a função que cancela a escuta.
     * Existe para que cada tela não precise guardar o par (ref, callback) só
     * para conseguir dar `off` depois — motivo comum de listener órfão
     * consumindo quota muito depois de a tela ter saído.
     */
    U.live = function (path, handler, onError) {
        var reference = U.db.ref(path);
        var callback = reference.on('value', handler, function (error) {
            console.error('Listener de ' + path + ' interrompido:', error.message);
            if (onError) onError(error);
        });
        return function () { reference.off('value', callback); };
    };
})();
