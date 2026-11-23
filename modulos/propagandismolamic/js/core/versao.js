// ===== js/core/versao.js =====
(function () {
'use strict';

/**
 * Versão do app, usada em dois lugares:
 *
 * 1. `?v=` de cada <script>/<link> no index.html — sem isso o navegador
 *    serve o JS antigo depois de uma atualização.
 * 2. Comparação com `/meta/appVersaoMinima` no banco: uma máquina que
 *    ficou com a pasta desatualizada é barrada no boot em vez de gravar
 *    dados no formato errado.
 *
 * Formato `AAAA-MM-DD-NN` — comparável como string.
 *
 * Ao publicar uma versão nova, rode na raiz do projeto (Git Bash):
 *   V=$(date +%Y-%m-%d)-01
 *   sed -i "s/?v=[0-9-]\{13\}/?v=$V/g" index.html
 *   sed -i "s/APP_VERSION = '[^']*'/APP_VERSION = '$V'/" js/core/versao.js
 */

NS.APP_VERSION = '2026-09-10-01';
})();
