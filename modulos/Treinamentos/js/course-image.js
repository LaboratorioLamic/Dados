// Imagens de curso: compressão para o banco e cache local no navegador.
//
// O banco guarda um bitmap de no máximo 128x128 já comprimido (WebP quando o
// navegador suporta, JPEG como alternativa) em data URL, junto de um carimbo de
// versão. O portal lê a imagem uma vez por versão e mantém uma cópia no
// localStorage — trocas de curso e recarregamentos passam a usar o cache em vez
// de reprocessar o bitmap vindo do Firebase.
(function () {

    const MAX_SIZE = 128;
    const CACHE_PREFIX = 'uniadmin.courseImg.';
    // Firebase é cobrado por byte: acima disso a imagem vira peso morto no JSON.
    const MAX_BYTES = 24 * 1024;
    // Questões da avaliação: altura fixa, largura proporcional.
    const QUESTION_MAX_HEIGHT = 256;
    const QUESTION_MAX_BYTES = 60 * 1024;

    let webpSupport = null;

    function supportsWebp() {
        if (webpSupport !== null) return webpSupport;
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
        return webpSupport;
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
            reader.readAsDataURL(file);
        });
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
            img.src = src;
        });
    }

    // Recorta no centro para caber num quadrado e reduz até 128x128.
    function drawSquare(img) {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = MAX_SIZE;
        canvas.height = MAX_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX_SIZE, MAX_SIZE);
        return canvas;
    }

    function dataUrlBytes(dataUrl) {
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        return Math.floor(base64.length * 0.75);
    }

    // Reduz até a altura alvo mantendo a proporção original — a largura sai do
    // formato da imagem, sem recorte. Imagens já menores não são ampliadas.
    function drawToHeight(img, maxHeight) {
        const scale = Math.min(1, maxHeight / img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    // Baixa a qualidade em degraus até o data URL caber no limite de bytes.
    function compress(canvas, maxBytes = MAX_BYTES) {
        const mime = supportsWebp() ? 'image/webp' : 'image/jpeg';
        let best = canvas.toDataURL(mime, 0.82);
        for (const quality of [0.7, 0.6, 0.5, 0.4, 0.3]) {
            if (dataUrlBytes(best) <= maxBytes) break;
            best = canvas.toDataURL(mime, quality);
        }
        return best;
    }

    function describe(dataUrl, canvas) {
        return {
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            version: Date.now(),
            bytes: dataUrlBytes(dataUrl),
            mime: dataUrl.slice(5, dataUrl.indexOf(';'))
        };
    }

    // Arquivo escolhido no painel -> { dataUrl, version, bytes, mime }.
    async function processFile(file) {
        if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
        const source = await readFile(file);
        const img = await loadImage(source);
        const canvas = drawSquare(img);
        return describe(compress(canvas), canvas);
    }

    // Imagem de questão da avaliação: altura fixa em 256px, largura conforme o
    // formato original. Vive dentro do mesmo JSON do quiz, então também é
    // comprimida — só com um teto de bytes maior que o card de curso.
    async function processQuestionFile(file) {
        if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
        const source = await readFile(file);
        const img = await loadImage(source);
        const canvas = drawToHeight(img, QUESTION_MAX_HEIGHT);
        return describe(compress(canvas, QUESTION_MAX_BYTES), canvas);
    }

    function cacheKey(categorySlug, subjectId, themeId) {
        return `${CACHE_PREFIX}${categorySlug}.${subjectId}.${themeId}`;
    }

    function readCache(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error) { return null; }
    }

    function writeCache(key, entry) {
        try {
            localStorage.setItem(key, JSON.stringify(entry));
        } catch (error) {
            // Cota estourada: limpa as imagens antigas e tenta uma vez mais.
            try {
                Object.keys(localStorage)
                    .filter(k => k.startsWith(CACHE_PREFIX) && k !== key)
                    .forEach(k => localStorage.removeItem(k));
                localStorage.setItem(key, JSON.stringify(entry));
            } catch (retryError) { /* segue sem cache */ }
        }
    }

    // Devolve a imagem do curso, preferindo a cópia local quando a versão bate.
    function resolve(categorySlug, subjectId, themeId, theme) {
        const key = cacheKey(categorySlug, subjectId, themeId);
        const cached = readCache(key);

        if (!theme || !theme.image) {
            if (cached) { try { localStorage.removeItem(key); } catch (error) { /* ignora */ } }
            return null;
        }

        const version = theme.imageVersion || 0;
        if (cached && cached.version === version && cached.dataUrl) return cached.dataUrl;

        writeCache(key, { version, dataUrl: theme.image });
        return theme.image;
    }

    function clearCache(categorySlug, subjectId, themeId) {
        try { localStorage.removeItem(cacheKey(categorySlug, subjectId, themeId)); }
        catch (error) { /* ignora */ }
    }

    window.UniAdminImages = {
        processFile, processQuestionFile, resolve, clearCache,
        MAX_SIZE, MAX_BYTES, QUESTION_MAX_HEIGHT, QUESTION_MAX_BYTES
    };

})();
