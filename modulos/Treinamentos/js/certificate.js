// Geração do certificado de conclusão em PDF (2 páginas: frente + verso).
//
// Monta a arte como HTML fora da tela (css/certificate.css), converte cada
// folha em imagem com html2canvas e empilha as duas num PDF paisagem A4 via
// jsPDF. Renderizar a partir do DOM mantém a arte editável em CSS, sem
// reconstruir o layout em comandos vetoriais.
(function () {
    const U = window.UniAdmin;

    const ASSETS = {
        logo: 'https://i.imgur.com/qVfGMyc.png',
        signFellipe: 'https://i.imgur.com/7xmTEZk.png',
        signLeonardo: 'https://i.imgur.com/hwy39IM.png'
    };

    const SIGNERS = [
        { name: 'Dr. Fellipe Brito', role: 'Analista da Qualidade' },
        { name: 'Dr. Leonardo Bezerra', role: 'Diretor Técnico' }
    ];

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    function formatLongDate(timestamp) {
        const date = timestamp ? new Date(timestamp) : new Date();
        return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // "Temas abordados" é guardado como texto livre (uma linha por tema).
    function parseTopics(raw) {
        if (Array.isArray(raw)) return raw.filter(Boolean);
        return String(raw || '').split('\n').map(t => t.trim()).filter(Boolean);
    }

    function bandHtml(text) {
        const parts = text.split('•').map(p => p.trim());
        return parts.map(p => escapeHtml(p)).join(' <span class="dot">&bull;</span> ');
    }

    // Fundo do miolo desenhado como uma única imagem já no tamanho final
    // (1308x700) com o mosaico feito por <pattern> dentro do próprio SVG.
    // Substitui o antigo `background-image: repeat`, que o html2canvas
    // converte em createPattern e era um dos caminhos que quebravam a geração.
    const TEXTURE_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1308' height='700'%3E%3Cdefs%3E%3Cpattern id='cd' width='34' height='34' patternUnits='userSpaceOnUse'%3E%3Cpath d='M17 0L34 17L17 34L0 17Z' fill='none' stroke='%230f2244' stroke-opacity='0.05' stroke-width='1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='1308' height='700' fill='%23fbf7ee'/%3E%3Crect width='1308' height='700' fill='url(%23cd)'/%3E%3C/svg%3E";

    function textureHtml() {
        return `<img class="cert-texture" src="${TEXTURE_SVG}" alt="">`;
    }

    function cornersHtml() {
        return `
            <div class="cert-corner tl"></div><div class="cert-corner tr"></div>
            <div class="cert-corner bl"></div><div class="cert-corner br"></div>
            <div class="cert-corner-dot tl"></div><div class="cert-corner-dot tr"></div>
            <div class="cert-corner-dot bl"></div><div class="cert-corner-dot br"></div>`;
    }

    // `assets` traz as imagens já convertidas em data URI (ver resolveAssets);
    // quando alguma falha vem null e o bloco correspondente é omitido.
    function frontPageHtml({ studentName, courseTitle, hours, dateLabel, assets }) {
        return `
        <div class="cert-page" data-cert-page="front">
            <div class="cert-band is-top"><div class="cert-band-text">${bandHtml('Eficiência • Qualidade • Excelência')}</div></div>
            ${textureHtml()}
            ${cornersHtml()}
            <div class="cert-body">
                <div class="cert-head">
                    <div class="cert-logo">${assets.logo ? `<img src="${assets.logo}" alt="LAMIC">` : ''}</div>
                    <div class="cert-head-center">
                        <div class="cert-kicker">Certificado de</div>
                        <div class="cert-title">CONCLUSÃO</div>
                        <div class="cert-subtitle">de Curso Profissional</div>
                    </div>
                    <div class="cert-seal"><div class="cert-seal-inner"><span class="cert-seal-mark"></span></div></div>
                </div>
                <div class="cert-rule"></div>
                <div class="cert-content">
                    <div class="cert-certify">Certificamos que</div>
                    <div class="cert-name">${escapeHtml(studentName)}</div>
                    <div class="cert-diamonds">
                        <span class="cert-diamond"></span>
                        <span class="cert-diamond small"></span>
                        <span class="cert-diamond"></span>
                    </div>
                    <div class="cert-text">
                        concluiu com êxito o curso de <strong>${escapeHtml(courseTitle)}</strong>, com carga horária total de
                        <strong>${escapeHtml(String(hours))} horas</strong>, realizado em <strong>${escapeHtml(dateLabel)}</strong>. Certificamos que o(a) participante demonstrou desempenho satisfatório e cumpriu integralmente
                        todas as exigências necessárias para a obtenção deste certificado de conclusão.
                    </div>
                </div>
                <div class="cert-signatures">
                    <div class="cert-sign">
                        <div class="cert-sign-img">${assets.signFellipe ? `<img src="${assets.signFellipe}" alt="">` : ''}</div>
                        <div class="cert-sign-line"></div>
                        <div class="cert-sign-name">${escapeHtml(SIGNERS[0].name)}</div>
                        <div class="cert-sign-role">${escapeHtml(SIGNERS[0].role)}</div>
                    </div>
                    <div class="cert-sign-divider"></div>
                    <div class="cert-sign">
                        <div class="cert-sign-img">${assets.signLeonardo ? `<img src="${assets.signLeonardo}" alt="">` : ''}</div>
                        <div class="cert-sign-line"></div>
                        <div class="cert-sign-name">${escapeHtml(SIGNERS[1].name)}</div>
                        <div class="cert-sign-role">${escapeHtml(SIGNERS[1].role)}</div>
                    </div>
                </div>
            </div>
            <div class="cert-band is-bottom"><div class="cert-band-text">${bandHtml('Certificado Oficial • Ensino & Capacitação • ' + new Date().getFullYear())}</div></div>
        </div>`;
    }

    function backPageHtml({ courseTitle, hours, topics, assets }) {
        return `
        <div class="cert-page" data-cert-page="back">
            <div class="cert-band is-top"><div class="cert-band-text">${bandHtml('Conteúdo Programático • Temas do Curso')}</div></div>
            ${textureHtml()}
            ${cornersHtml()}
            <div class="cert-body">
                <div class="cert-head">
                    <div class="cert-logo">${assets.logo ? `<img src="${assets.logo}" alt="LAMIC">` : ''}</div>
                    <div class="cert-head-center">
                        <div class="cert-kicker">Programa do Curso</div>
                        <div class="cert-title" style="font-size:47px;">CONTEÚDO PROGRAMÁTICO</div>
                        <div class="cert-subtitle">${escapeHtml(courseTitle)}</div>
                    </div>
                    <div class="cert-hours-badge">
                        <span class="num">${escapeHtml(String(hours))}</span>
                        <span class="label">HORAS</span>
                    </div>
                </div>
                <div class="cert-rule"></div>
                <div class="cert-topics-label">Temas abordados</div>
                <div class="cert-topics">
                    ${topics.map((topic, i) => `
                        <div class="cert-topic">
                            <span class="cert-topic-num">${String(i + 1).padStart(2, '0')}</span>
                            <span class="cert-topic-text">${escapeHtml(topic)}</span>
                        </div>`).join('')}
                </div>
            </div>
            <div class="cert-band is-bottom"><div class="cert-band-text">${bandHtml('Verso do Certificado • ' + courseTitle + ' • ' + new Date().getFullYear())}</div></div>
        </div>`;
    }

    // Imagens remotas (logo/assinaturas) viram data URI antes do html2canvas.
    // Sem isso, um servidor que não devolve o cabeçalho CORS "suja" o canvas e
    // `toDataURL` lança SecurityError, derrubando o PDF inteiro. Cacheado por
    // sessão porque as mesmas 3 imagens valem para todos os certificados.
    const assetCache = new Map();

    async function toDataUri(url) {
        if (assetCache.has(url)) return assetCache.get(url);
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(String(response.status));
            const blob = await response.blob();
            const dataUri = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            assetCache.set(url, dataUri);
            return dataUri;
        } catch (error) {
            // Sem conversão o certificado ainda sai, só que sem a arte.
            assetCache.set(url, null);
            return null;
        }
    }

    async function resolveAssets() {
        const [logo, signFellipe, signLeonardo] = await Promise.all([
            toDataUri(ASSETS.logo),
            toDataUri(ASSETS.signFellipe),
            toDataUri(ASSETS.signLeonardo)
        ]);
        return { logo, signFellipe, signLeonardo };
    }

    // A fonte serifada só é baixada quando algum elemento visível a usa — e o
    // palco fica oculto. `font.load()` força o download e evita que o snapshot
    // saia com a fonte de fallback.
    async function ensureFontsLoaded() {
        if (!document.fonts) return;
        try {
            await Promise.all([
                document.fonts.load('700 62px "Cormorant Garamond"'),
                document.fonts.load('600 15px "Cormorant Garamond"'),
                document.fonts.load('400 17px "Inter"'),
                document.fonts.load('700 17px "Inter"')
            ]);
            await document.fonts.ready;
        } catch (error) { /* fallback serif/sans resolve a renderização */ }
    }

    // html2canvas dispara antes das imagens remotas carregarem se elas ainda
    // estiverem em voo; aguardar explicitamente evita folha sem logo/assinatura.
    // O timeout cobre o caso de uma imagem que já falhou antes deste ponto
    // (`complete` com naturalWidth 0): onload/onerror nunca mais disparam e a
    // promessa ficaria pendente para sempre, travando o botão de download.
    function waitForImages(container) {
        const images = [...container.querySelectorAll('img')];
        return Promise.all(images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                const done = () => { clearTimeout(timer); resolve(); };
                const timer = setTimeout(done, 8000);
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            });
        }));
    }

    // Rede de segurança para o erro
    // "Failed to execute 'createPattern' ... width or height of 0".
    // O html2canvas 1.4.1 pinta todo `background-image` criando um canvas do
    // tamanho da caixa do elemento; se a caixa medir menos de 1px em qualquer
    // eixo, `canvas.width` trunca para 0 e o render inteiro é abortado. A arte
    // já evita background-image (ver css/certificate.css), mas qualquer estilo
    // herdado ou futuro cairia na mesma armadilha — então, no clone, todo
    // elemento fino demais perde o background-image antes da pintura.
    // `stripAll` é usado na segunda tentativa: descarta a textura de fundo em
    // troca de garantir que o certificado saia.
    function sanitizeClone(clonedDoc, stripAll) {
        clonedDoc.querySelectorAll('.cert-stage').forEach(stage => {
            // O palco fica com visibility:hidden na página real; no clone ele
            // precisa ser visível, senão a captura sai em branco.
            stage.classList.add('is-capturing');
        });
        clonedDoc.querySelectorAll('.cert-page, .cert-page *').forEach(el => {
            if (stripAll) {
                el.style.backgroundImage = 'none';
                return;
            }
            const rect = el.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) el.style.backgroundImage = 'none';
        });
        if (stripAll) {
            clonedDoc.querySelectorAll('.cert-texture').forEach(img => img.remove());
        }
    }

    async function renderPageToCanvas(pageEl, stripAll) {
        const canvas = await html2canvas(pageEl, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#fdfaf3',
            width: 1308,
            height: 924,
            windowWidth: 1308,
            windowHeight: 924,
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDoc) => sanitizeClone(clonedDoc, stripAll)
        });
        // Um canvas vazio viraria uma página em branco no PDF (ou um erro em
        // addImage); melhor falhar aqui e cair na tentativa de recuperação.
        if (!canvas || !canvas.width || !canvas.height) {
            throw new Error('folha renderizada com dimensão zero');
        }
        return canvas;
    }

    // Overlay bloqueante enquanto o PDF é montado: a geração leva alguns
    // segundos (html2canvas + jsPDF) e, sem ele, a tela parece travada e o
    // usuário clica de novo, disparando outra geração em paralelo.
    let pendingDownloads = 0;
    let overlayEl = null;

    function showDownloadOverlay(options) {
        pendingDownloads++;
        if (overlayEl) return;
        const icon = options?.icon || 'fa-award';
        const title = options?.title || 'Baixando certificado';
        const hint = options?.hint || 'Aguarde, estamos gerando seu PDF...';
        overlayEl = document.createElement('div');
        overlayEl.className = 'cert-loading-overlay';
        overlayEl.setAttribute('role', 'alert');
        overlayEl.setAttribute('aria-live', 'assertive');
        overlayEl.innerHTML = `
            <div class="cert-loading-panel">
                <div class="cert-loading-spinner"><i class="fas ${icon}"></i></div>
                <div class="cert-loading-title">${title}</div>
                <div class="cert-loading-hint">${hint}</div>
                <div class="cert-loading-bar"><span></span></div>
            </div>`;
        // Trava rolagem e qualquer interação com a página por trás.
        overlayEl.addEventListener('click', e => e.stopPropagation(), true);
        document.body.appendChild(overlayEl);
        document.body.classList.add('cert-loading-lock');
    }

    function hideDownloadOverlay() {
        pendingDownloads = Math.max(0, pendingDownloads - 1);
        if (pendingDownloads > 0 || !overlayEl) return;
        overlayEl.classList.add('is-leaving');
        const el = overlayEl;
        overlayEl = null;
        document.body.classList.remove('cert-loading-lock');
        setTimeout(() => el.remove(), 220);
    }

    // `course` traz os campos gravados no cadastro do assunto
    // (certificateEnabled/certificateTitle/certificateHours/certificateTopics).
    async function download({ studentName, course, courseName, submittedAt }) {
        // jsPDF e html2canvas (~560 KB) não vêm mais no HTML: são buscadas aqui,
        // no único momento em que servem para alguma coisa. Ver js/vendor-loader.js.
        try {
            if (U.loadVendor) await U.loadVendor('pdf');
        } catch (error) {
            U.showWarning?.('Não foi possível carregar a biblioteca de PDF. Verifique sua conexão e tente novamente.');
            return;
        }
        if (!window.jspdf?.jsPDF || !window.html2canvas) {
            U.showWarning?.('Biblioteca de PDF não carregada. Recarregue a página e tente novamente.');
            return;
        }

        showDownloadOverlay();

        const courseTitle = course?.certificateTitle?.trim() || courseName || 'Curso';
        const hours = course?.certificateHours || 10;
        const topics = parseTopics(course?.certificateTopics);
        const dateLabel = formatLongDate(submittedAt);

        let assets;
        try {
            assets = await resolveAssets();
        } catch (error) {
            hideDownloadOverlay();
            U.showWarning?.('Erro ao preparar o certificado: ' + (error?.message || error));
            return;
        }

        const pagesHtml = [frontPageHtml({ studentName, courseTitle, hours, dateLabel, assets })];
        if (topics.length > 0) pagesHtml.push(backPageHtml({ courseTitle, hours, topics, assets }));

        // Uma folha por vez no palco: com as duas empilhadas, a segunda ficava
        // fora da janela de captura (924px) e o html2canvas precisava acertar
        // offsets de um contêiner `position: fixed`. Com uma só, a folha
        // sempre começa em (0,0) e o recorte é exato.
        const stage = document.createElement('div');
        stage.className = 'cert-stage';
        document.body.appendChild(stage);

        // Uma folha renderiza; se o html2canvas tropeçar em algum background,
        // repete sem nenhum background-image em vez de perder o certificado.
        async function renderSheet(html) {
            stage.innerHTML = html;
            const pageEl = stage.querySelector('.cert-page');
            await waitForImages(stage);
            await ensureFontsLoaded();
            try {
                return await renderPageToCanvas(pageEl, false);
            } catch (error) {
                console.warn('[certificado] render padrão falhou, repetindo sem texturas:', error);
                return renderPageToCanvas(pageEl, true);
            }
        }

        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            for (let i = 0; i < pagesHtml.length; i++) {
                const canvas = await renderSheet(pagesHtml[i]);
                if (i > 0) pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageWidth, pageHeight);
            }

            const safeName = studentName.replace(/\s+/g, '_').replace(/[^\wÀ-ÿ_-]/g, '');
            pdf.save(`Certificado_${safeName}.pdf`);
        } catch (error) {
            console.error('[certificado] falha ao gerar o PDF:', error);
            U.showWarning?.('Erro ao gerar o certificado: ' + (error?.message || error));
        } finally {
            stage.remove();
            hideDownloadOverlay();
        }
    }

    // Um curso só emite certificado se estiver habilitado no cadastro do assunto.
    function isEnabled(course) {
        return !!course?.certificateEnabled;
    }

    // O overlay serve a qualquer geração de PDF do sistema (certificado,
    // relatório do colaborador): é o mesmo bloqueio de tela, com o mesmo
    // contador de downloads pendentes, só trocando o texto.
    U.Certificate = { download, isEnabled, parseTopics, showOverlay: showDownloadOverlay, hideOverlay: hideDownloadOverlay };
})();
