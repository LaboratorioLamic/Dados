// Carregamento sob demanda das bibliotecas pesadas de terceiros.
//
// Três delas serviam a ações que a maioria das sessões nunca dispara:
//
//   xlsx.full.min.js   881 KB  exportar/importar planilha (só o painel admin)
//   jspdf.umd.min.js   364 KB  baixar certificado
//   html2canvas.min.js 199 KB  baixar certificado
//
// Somadas, 1,4 MB que todo aluno baixava ao abrir o portal para, quase sempre,
// assistir a um vídeo. Aqui elas saem do HTML e passam a ser buscadas no
// primeiro uso real. A promessa é guardada por chave: dez cliques no botão de
// exportar baixam a biblioteca uma vez só.
//
// Uma falha de rede NÃO fica em cache — o registro é limpo, para que a próxima
// tentativa possa dar certo em vez de repetir o erro para sempre.
(function () {
    var U = window.UniAdmin = window.UniAdmin || {};

    var SOURCES = {
        xlsx: ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'],
        // Fork da mesma SheetJS 0.18.5 com suporte a estilo de célula (cor,
        // negrito, borda), que a versão community não tem. Só o relatório do
        // colaborador precisa disso — os demais exports continuam na 'xlsx'
        // normal. As duas expõem `window.XLSX` e são compatíveis entre si, de
        // modo que carregar esta por cima da outra não quebra nada.
        'xlsx-style': ['https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'],
        // Zip em ~30 KB. O relatório do colaborador abre o .xlsx recém-escrito
        // pra injetar as partes de gráfico (ver js/admin-xlsx-charts.js) e
        // fecha de novo — a SheetJS não expõe o zip dela pra isso.
        fflate: ['https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js'],
        // O certificado precisa das duas juntas; pedir "pdf" traz o par.
        pdf: [
            'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
            'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
        ]
    };

    var pending = {};

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            // Já presente no documento (ex.: uma página que ainda declare a
            // tag no HTML): não injeta de novo.
            var existing = document.querySelector('script[data-vendor-src="' + src + '"]');
            if (existing) {
                if (existing.dataset.vendorLoaded === '1') { resolve(); return; }
                existing.addEventListener('load', function () { resolve(); }, { once: true });
                existing.addEventListener('error', function () { reject(new Error('Falha ao carregar ' + src)); }, { once: true });
                return;
            }
            var el = document.createElement('script');
            el.src = src;
            el.async = false; // preserva a ordem entre os scripts de um mesmo grupo
            el.dataset.vendorSrc = src;
            el.addEventListener('load', function () { el.dataset.vendorLoaded = '1'; resolve(); }, { once: true });
            el.addEventListener('error', function () {
                el.remove();
                reject(new Error('Falha ao carregar ' + src));
            }, { once: true });
            document.head.appendChild(el);
        });
    }

    /**
     * Garante que um grupo de bibliotecas esteja disponível.
     * `U.loadVendor('xlsx')` → Promise que resolve quando `window.XLSX` existe.
     * Rejeita com mensagem legível quando a rede falha; quem chama decide o
     * que dizer ao usuário.
     */
    U.loadVendor = function (name) {
        var sources = SOURCES[name];
        if (!sources) return Promise.reject(new Error('Biblioteca desconhecida: ' + name));
        if (pending[name]) return pending[name];
        pending[name] = Promise.all(sources.map(loadScript))
            .catch(function (error) {
                // Sem cache de falha: a próxima tentativa baixa de novo.
                delete pending[name];
                throw error;
            });
        return pending[name];
    };
})();
