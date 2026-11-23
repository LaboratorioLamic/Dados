// Demografia das agendas domiciliares: mapa por bairro, rankings e tabela.
//
// Privacidade: só "bairro, cidade, UF" é enviado ao geocodificador
// (Nominatim/OpenStreetMap) — nunca logradouro, número ou nome de paciente.
// Cada bairro é geocodificado uma única vez; a coordenada fica em cache no
// Firebase (`geoBairros`, compartilhado) e no localStorage (fallback).

const DEMO_CORES = ['#bfdbfe', '#93c5fd', '#60a5fa', '#2563eb', '#1e3a8a'];
const DEMO_FAIXAS = [[0, 17, '0–17'], [18, 39, '18–39'], [40, 59, '40–59'], [60, 79, '60–79'], [80, 200, '80+']];
const DEMO_ZOOM_CIDADE = 12;          // abaixo deste zoom os bairros se agrupam por cidade
const DEMO_RETENTAR_FALHA_MS = 30 * 24 * 3600 * 1000;

let demoMetrica = 'qtd';
let _demoMapa = null, _demoCamada = null, _demoLegenda = null;
let _demoMarcadores = {};             // chave do bairro → circleMarker
let _demoGrupos = [];                  // agregação atual por bairro
let _demoAssinatura = '';              // conjunto de bairros do último enquadramento
let _demoUsuarioMoveu = false;         // usuário mexeu no mapa: não reenquadrar sozinho

// ── CACHE DE COORDENADAS ───────────────────────────────────
const _geoCache = {};
let _geoCarregado = false;
const _geoFila = [];
let _geoProcessando = false;

const _normGeo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
// Bairro: além de acento/caixa, ignora o prefixo "BAIRRO" ("BAIRRO LAGOA SECA" = "LAGOA SECA")
const _normBairro = s => _normGeo(s).replace(/^(BAIRRO|BAIRO|B\.)\s+/, '').trim();
const _chaveGeo = (cidade, bairro) => `${_normGeo(cidade)}|${_normBairro(bairro)}`.replace(/[.#$\[\]\/]/g, '_');

function _carregarGeoCache() {
    if (_geoCarregado) return Promise.resolve();
    _geoCarregado = true;
    try { Object.assign(_geoCache, JSON.parse(localStorage.getItem('geoBairros') || '{}')); } catch (e) { /* sem storage */ }
    if (typeof database === 'undefined') return Promise.resolve();
    return database.ref('geoBairros').once('value')
        .then(snap => Object.assign(_geoCache, snap.val() || {}))
        .catch(err => console.warn('geoBairros: leitura negada, usando cache local', err));
}

function _salvarGeo(chave, valor) {
    _geoCache[chave] = valor;
    try { localStorage.setItem('geoBairros', JSON.stringify(_geoCache)); } catch (e) { /* sem storage */ }
    if (typeof database !== 'undefined') {
        database.ref(`geoBairros/${chave}`).set(valor)
            .catch(err => console.warn('geoBairros: gravação negada', err));
    }
}

function _precisaGeocodificar(chave) {
    const c = _geoCache[chave];
    if (!c) return true;
    return c.falhou && Date.now() - (c.em || 0) > DEMO_RETENTAR_FALHA_MS;
}

function _enfileirarGeo(grupos) {
    grupos.forEach(g => {
        if (g.semBairro || !_precisaGeocodificar(g.chave)) return;
        if (_geoFila.some(f => f.chave === g.chave)) return;
        _geoFila.push({ chave: g.chave, bairro: g.bairro, cidade: g.cidade, uf: g.uf });
    });
    _processarGeoFila();
}

// Nominatim aceita no máximo 1 requisição por segundo
async function _processarGeoFila() {
    if (_geoProcessando) return;
    _geoProcessando = true;
    while (_geoFila.length) {
        const item = _geoFila.shift();
        _atualizarStatusGeo();
        const q = [item.bairro, item.cidade, item.uf, 'Brasil'].filter(Boolean).join(', ');
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`,
                { headers: { 'Accept-Language': 'pt-BR' } });
            const json = resp.ok ? await resp.json() : [];
            if (json.length) _salvarGeo(item.chave, { lat: +json[0].lat, lng: +json[0].lon, fonte: 'auto', em: Date.now() });
            else _salvarGeo(item.chave, { falhou: true, em: Date.now() });
        } catch (e) {
            console.warn('Geocodificação falhou', q, e);
        }
        _desenharMapa();
        await new Promise(r => setTimeout(r, 1100));
    }
    _geoProcessando = false;
    _atualizarStatusGeo();
}

function _atualizarStatusGeo() {
    const el = document.getElementById('demo-geo-status');
    if (!el) return;
    const semCoord = _demoGrupos.filter(g => !g.semBairro && !_coord(g)).length;
    const semBairro = _demoGrupos.filter(g => g.semBairro).reduce((s, g) => s + g.qtd, 0);
    const partes = [];
    if (_geoFila.length || _geoProcessando) partes.push(`Localizando bairros… ${_geoFila.length} na fila`);
    else if (semCoord) partes.push(`${semCoord} bairro(s) não localizado(s) no mapa — aparecem só na tabela`);
    if (semBairro) partes.push(`${semBairro} atendimento(s) sem bairro informado`);
    el.innerText = partes.join(' · ');
}

const _coord = g => {
    const c = _geoCache[g.chave];
    return c && !c.falhou && isFinite(c.lat) ? c : null;
};

// ── AGREGAÇÃO ──────────────────────────────────────────────
function _agruparPorBairro(dados) {
    const mapa = {};
    dados.forEach(a => {
        const semBairro = !String(a.bairro || '').trim();
        const bairro = semBairro ? 'SEM BAIRRO' : _normBairro(a.bairro);
        const cidade = _normGeo(a.cidade) || 'SEM CIDADE';
        const chave = _chaveGeo(cidade, bairro);
        const g = mapa[chave] || (mapa[chave] = {
            chave, bairro, cidade, uf: _normGeo(a.estado), semBairro,
            qtd: 0, receita: 0, idadeSoma: 0, idadeN: 0, qtdConv: 0, conv: {}
        });
        g.qtd++;
        if ((a.taxaColetaTipos || []).includes('Convênio')) g.qtdConv++;
        _conveniosDoRegistro(a).forEach(c => { g.conv[c] = (g.conv[c] || 0) + 1; });
        if (a.status !== 'Cancelado') { const r = _receitaRegistro(a); g.receita += r.pedido + r.taxa; }
        const idade = Number(a.idade);
        if (a.idade !== '' && a.idade != null && isFinite(idade)) { g.idadeSoma += idade; g.idadeN++; }
    });
    return Object.values(mapa).sort((x, y) => y.qtd - x.qtd);
}

// ── MAPA ───────────────────────────────────────────────────
function setDemoMetrica(m) {
    demoMetrica = m;
    document.querySelectorAll('[data-demo-metrica]').forEach(b =>
        b.classList.toggle('ativo', b.dataset.demoMetrica === m));
    _desenharMapa();
}

function _iniciarMapa() {
    if (_demoMapa || typeof L === 'undefined') return;
    _demoMapa = L.map('demo-mapa', { zoomControl: true, attributionControl: true }).setView([-7.2, -39.3], 10);
    // Base cinza-clara da Esri (sem API key; o OSM bloqueia apps sem Referer)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap'
    }).addTo(_demoMapa);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16, pane: 'shadowPane'
    }).addTo(_demoMapa);
    _demoCamada = L.layerGroup().addTo(_demoMapa);
    _demoMapa.on('zoomend', _desenharMapa);
    // Interação real do usuário (roda, arraste, toque, botões +/−)
    ['wheel', 'mousedown', 'touchstart', 'dblclick'].forEach(ev =>
        _demoMapa.getContainer().addEventListener(ev, () => { _demoUsuarioMoveu = true; }, { passive: true }));
}

const _escDemo = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _corEscala = frac => DEMO_CORES[Math.min(DEMO_CORES.length - 1, Math.floor(frac * DEMO_CORES.length))];
const _raio = (qtd, max) => 5 + 25 * Math.sqrt(qtd / (max || 1));

// Pontos visíveis: bairros, ou cidades (centro ponderado) quando o zoom está afastado
function _pontosDoMapa() {
    const bairros = _demoGrupos.filter(g => !g.semBairro && _coord(g))
        .map(g => ({ ...g, ..._coord(g), rotulo: g.bairro, sub: g.cidade }));
    if (!_demoMapa || _demoMapa.getZoom() >= DEMO_ZOOM_CIDADE) return bairros;
    const cid = {};
    bairros.forEach(b => {
        const c = cid[b.cidade] || (cid[b.cidade] = { rotulo: b.cidade, sub: 'cidade', qtd: 0, receita: 0, idadeSoma: 0, idadeN: 0, qtdConv: 0, conv: {}, lat: 0, lng: 0 });
        c.qtd += b.qtd; c.receita += b.receita; c.idadeSoma += b.idadeSoma; c.idadeN += b.idadeN; c.qtdConv += b.qtdConv;
        Object.entries(b.conv).forEach(([k, v]) => { c.conv[k] = (c.conv[k] || 0) + v; });
        c.lat += b.lat * b.qtd; c.lng += b.lng * b.qtd;
    });
    return Object.values(cid).map(c => ({ ...c, lat: c.lat / c.qtd, lng: c.lng / c.qtd }));
}

// Bloco do popup: % de convênio e os principais convênios do ponto
function _popupConvenios(p) {
    if (!Object.keys(p.conv || {}).length) return '';
    const top = Object.entries(p.conv).sort((a, b) => b[1] - a[1]);
    const linhas = top.slice(0, 6).map(([n, q]) =>
        `<div style="display:flex;justify-content:space-between;gap:12px"><span${n === CONV_NAO_INFORMADO || n === CONV_NAO_ESPECIFICADO ? ' style="color:#94a3b8;font-style:italic"' : ''}>${_escDemo(n)}</span><b>${q}</b></div>`).join('');
    const resto = top.length > 6 ? `<div style="color:#94a3b8">+${top.length - 6} outro(s)</div>` : '';
    return `<div style="font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0">
        <div>Convênio: <b>${Math.round(p.qtdConv / p.qtd * 100)}%</b> · Particular: <b>${Math.round((p.conv.Particular || 0) / p.qtd * 100)}%</b>${p.conv[CONV_NAO_INFORMADO] ? ` · N/A: <b>${Math.round(p.conv[CONV_NAO_INFORMADO] / p.qtd * 100)}%</b>` : ''}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px">${linhas}${resto}</div></div>`;
}

function _desenharMapa() {
    if (!_demoMapa) return;
    _demoCamada.clearLayers();
    _demoMarcadores = {};
    const pontos = _pontosDoMapa();
    const total = _demoGrupos.reduce((s, g) => s + g.qtd, 0);
    const maxQtd = Math.max(1, ...pontos.map(p => p.qtd));
    const valor = p => demoMetrica === 'receita' ? p.receita
        : demoMetrica === 'convenio' ? p.qtdConv / p.qtd
        : demoMetrica === 'particular' ? (p.conv.Particular || 0) / p.qtd : p.qtd;
    // Percentuais já são fração 0–1: escala absoluta, não relativa ao maior
    const pct = demoMetrica === 'convenio' || demoMetrica === 'particular';
    const maxVal = pct ? 1 : Math.max(1, ...pontos.map(valor));

    // Maiores primeiro, para os pequenos ficarem por cima e clicáveis
    pontos.sort((a, b) => b.qtd - a.qtd).forEach(p => {
        const cor = _corEscala(valor(p) / maxVal);
        const idade = p.idadeN ? Math.round(p.idadeSoma / p.idadeN) : '—';
        const marcador = L.circleMarker([p.lat, p.lng], {
            radius: _raio(p.qtd, maxQtd), color: '#fff', weight: 1.5,
            fillColor: cor, fillOpacity: 0.7
        }).bindPopup(`<div style="font-family:Inter,sans-serif;min-width:160px">
                <div style="font-weight:900;color:#0e1628">${_escDemo(p.rotulo)}</div>
                <div style="font-size:10px;color:#94a3b8;font-weight:700;margin-bottom:6px">${_escDemo(p.sub)}</div>
                <div style="font-size:12px"><b>${p.qtd}</b> atendimento(s) · ${total ? Math.round(p.qtd / total * 100) : 0}%</div>
                <div style="font-size:12px">Receita: <b>${_fmtBRL(p.receita)}</b></div>
                <div style="font-size:12px">Idade média: <b>${idade}</b></div>
                ${_popupConvenios(p)}</div>`)
          .bindTooltip(`${_escDemo(p.rotulo)}: ${p.qtd}`, { direction: 'top' })
          .addTo(_demoCamada);
        if (p.chave) _demoMarcadores[p.chave] = marcador;
    });

    _desenharLegenda(maxQtd, maxVal);
    _atualizarStatusGeo();
    _renderDemoTabela();

    // Reenquadra só quando o conjunto de bairros muda (não a cada geocodificação)
    // Assinatura pelos bairros localizados (independe do zoom/agrupamento por cidade)
    const comCoord = _demoGrupos.filter(g => !g.semBairro && _coord(g));
    const assinatura = comCoord.map(g => g.chave).sort().join(',');
    if (comCoord.length && assinatura !== _demoAssinatura && !_demoUsuarioMoveu) {
        const limites = L.latLngBounds(comCoord.map(g => [_coord(g).lat, _coord(g).lng]));
        _demoMapa.fitBounds(limites.pad(0.2), { maxZoom: 15 });
    }
    _demoAssinatura = assinatura;
}

function _desenharLegenda(maxQtd, maxVal) {
    if (_demoLegenda) _demoLegenda.remove();
    _demoLegenda = L.control({ position: 'bottomright' });
    _demoLegenda.onAdd = () => {
        const div = L.DomUtil.create('div');
        div.style.cssText = 'background:#fff;padding:10px 12px;border-radius:12px;box-shadow:0 6px 20px rgba(14,22,40,.15);font:700 10px Inter,sans-serif;color:#475569';
        const refs = [...new Set([maxQtd, Math.max(1, Math.round(maxQtd / 4)), Math.max(1, Math.round(maxQtd / 16))])];
        const circulos = refs.map(q => {
            const r = _raio(q, maxQtd);
            return `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                <span style="width:${2 * r}px;height:${2 * r}px;border-radius:50%;border:1.5px solid #64748b;display:inline-block"></span>${q}</div>`;
        }).join('');
        const pct = demoMetrica === 'convenio' || demoMetrica === 'particular';
        const rotMax = demoMetrica === 'receita' ? _fmtBRL(maxVal) : pct ? '100%' : maxVal;
        const rotMin = pct ? '0%' : '0';
        const rotCor = { qtd: 'atendimentos', receita: 'receita', convenio: '% convênio', particular: '% particular' }[demoMetrica];
        div.innerHTML = `<div style="font-weight:900;color:#0e1628;text-transform:uppercase;letter-spacing:.08em">Tamanho = atendimentos</div>${circulos}
            <div style="font-weight:900;color:#0e1628;text-transform:uppercase;letter-spacing:.08em;margin-top:8px">Cor = ${rotCor}</div>
            <div style="display:flex;margin-top:4px">${DEMO_CORES.map(c => `<span style="width:22px;height:8px;background:${c}"></span>`).join('')}</div>
            <div style="display:flex;justify-content:space-between"><span>${rotMin}</span><span>${rotMax}</span></div>`;
        return div;
    };
    _demoLegenda.addTo(_demoMapa);
}

// ── TABELA / CSV ───────────────────────────────────────────
const DEMO_TOP = 10;
const demoTabela = { busca: '', ordem: 'qtd', dir: -1, recolhidas: new Set(), todas: new Set() };

function ordenarDemoTabela(campo) {
    if (demoTabela.ordem === campo) demoTabela.dir *= -1;
    else { demoTabela.ordem = campo; demoTabela.dir = campo === 'bairro' ? 1 : -1; }
    _renderDemoTabela();
}
function buscarDemoTabela(v) { demoTabela.busca = v; _renderDemoTabela(); }
function alternarDemoCidade(c) {
    demoTabela.recolhidas.has(c) ? demoTabela.recolhidas.delete(c) : demoTabela.recolhidas.add(c);
    _renderDemoTabela();
}
function verTodosDemoCidade(c) {
    demoTabela.todas.has(c) ? demoTabela.todas.delete(c) : demoTabela.todas.add(c);
    _renderDemoTabela();
}

// Linha da tabela → centraliza o mapa no bairro e abre o popup
function focarBairroDemo(chave) {
    const g = _demoGrupos.find(x => x.chave === chave);
    const c = g && _coord(g);
    if (!c || !_demoMapa) return;
    _demoUsuarioMoveu = true;
    document.getElementById('demo-mapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
    _demoMapa.once('moveend', () => { const m = _demoMarcadores[chave]; if (m) m.openPopup(); });
    _demoMapa.setView([c.lat, c.lng], Math.max(_demoMapa.getZoom(), 14));
}

const _idadeMedia = g => g.idadeN ? Math.round(g.idadeSoma / g.idadeN) : null;

function _renderDemoTabela() {
    const tb = document.getElementById('demo-tabela');
    if (!tb) return;
    const total = _demoGrupos.reduce((s, g) => s + g.qtd, 0);
    if (!total) {
        tb.innerHTML = '<p class="py-6 text-center text-xs font-semibold text-slate-400">Nenhum atendimento no filtro.</p>';
        return;
    }
    document.querySelectorAll('[data-demo-ordem]').forEach(th => {
        const ativo = th.dataset.demoOrdem === demoTabela.ordem;
        th.classList.toggle('text-blue-600', ativo);
        const seta = th.querySelector('i');
        if (seta) seta.className = `fas ${ativo ? (demoTabela.dir < 0 ? 'fa-caret-down' : 'fa-caret-up') : 'fa-sort opacity-30'} ml-1`;
    });

    const busca = _normGeo(demoTabela.busca);
    const valorOrdem = g => demoTabela.ordem === 'bairro' ? g.bairro
        : demoTabela.ordem === 'idade' ? (_idadeMedia(g) ?? -1) : g[demoTabela.ordem];
    const cmp = (a, b) => {
        const x = valorOrdem(a), y = valorOrdem(b);
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * demoTabela.dir;
    };
    const maxQtd = Math.max(..._demoGrupos.map(g => g.qtd));

    // Agrupa por cidade, cidades em ordem de volume
    const cidades = {};
    _demoGrupos.forEach(g => (cidades[g.cidade] = cidades[g.cidade] || []).push(g));
    const ordemCidades = Object.entries(cidades)
        .map(([c, lista]) => [c, lista, lista.reduce((s, g) => s + g.qtd, 0)])
        .sort((a, b) => b[2] - a[2]);

    let html = '';
    ordemCidades.forEach(([cidade, lista, qtdCidade]) => {
        const filtrada = busca ? lista.filter(g => g.bairro.includes(busca)) : lista;
        if (!filtrada.length) return;
        const recolhida = demoTabela.recolhidas.has(cidade) && !busca;
        const cEsc = _escDemo(cidade).replace(/'/g, '&#39;');
        html += `<button type="button" onclick="alternarDemoCidade('${cEsc}')" class="demo-cidade">
            <i class="fas fa-chevron-${recolhida ? 'right' : 'down'} text-[9px] text-slate-400 w-3"></i>
            <span>${_escDemo(cidade)}</span>
            <span class="ml-auto text-slate-400">${qtdCidade} · ${Math.round(qtdCidade / total * 100)}%</span></button>`;
        if (recolhida) return;

        const ordenada = filtrada.slice().sort(cmp);
        const mostrarTodas = demoTabela.todas.has(cidade) || busca;
        const visiveis = mostrarTodas ? ordenada : ordenada.slice(0, DEMO_TOP);
        html += visiveis.map(g => {
            const coord = !g.semBairro && _coord(g);
            const naFila = !g.semBairro && !coord && (_geoFila.some(f => f.chave === g.chave) || !_geoCache[g.chave]);
            const aviso = g.semBairro || coord ? ''
                : naFila ? '<i class="fas fa-spinner fa-spin text-slate-300 text-[9px]" title="Localizando no mapa…"></i>'
                : '<i class="fas fa-location-crosshairs text-amber-500 text-[10px]" title="Bairro não encontrado no mapa — confira a grafia no cadastro"></i>';
            const idade = _idadeMedia(g);
            return `<div class="demo-linha ${coord ? 'cursor-pointer' : ''}" ${coord ? `onclick="focarBairroDemo('${g.chave.replace(/'/g, '&#39;')}')"` : ''}>
                <span class="truncate ${g.semBairro ? 'italic text-slate-400' : 'text-slate-700'}">${_escDemo(g.bairro)} ${aviso}</span>
                <span class="demo-barra"><span style="width:${Math.max(2, g.qtd / maxQtd * 100)}%"></span></span>
                <span class="text-right font-black text-navy-900">${g.qtd}</span>
                <span class="text-right text-slate-400">${Math.round(g.qtd / total * 100)}%</span>
                <span class="text-right">${_fmtBRL(g.receita)}</span>
                <span class="text-right text-slate-500">${idade !== null ? idade + 'a' : '—'}</span></div>`;
        }).join('');
        if (!busca && ordenada.length > DEMO_TOP) {
            html += `<button type="button" onclick="verTodosDemoCidade('${cEsc}')" class="demo-ver-todos">
                ${mostrarTodas ? 'Mostrar só os 10 maiores' : `Ver todos (${ordenada.length})`}</button>`;
        }
    });
    tb.innerHTML = html || '<p class="py-6 text-center text-xs font-semibold text-slate-400">Nenhum bairro encontrado.</p>';
}

function exportarDemografiaCSV() {
    const total = _demoGrupos.reduce((s, g) => s + g.qtd, 0) || 1;
    const linhas = [['Bairro', 'Cidade', 'Atendimentos', '%', 'Receita', 'Idade média']].concat(
        _demoGrupos.map(g => [g.bairro, g.cidade, g.qtd, Math.round(g.qtd / total * 100),
            g.receita.toFixed(2).replace('.', ','), g.idadeN ? Math.round(g.idadeSoma / g.idadeN) : '']));
    const csv = '﻿' + linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `demografia-${currentAgendaId}-${_textoPeriodo().replace(/[^\w-]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── RENDER ─────────────────────────────────────────────────
function renderDemografia() {
    const agenda = currentAgenda();
    if (!temCampo('endereco', agenda)) return;
    const cor = agendaCores(agenda).chart;
    const dados = filterIndData();
    _renderIndFiltrosUI(dados);
    document.querySelectorAll('[data-demo-metrica]').forEach(b =>
        b.classList.toggle('ativo', b.dataset.demoMetrica === demoMetrica));

    _demoGrupos = _agruparPorBairro(dados);
    // Filtro mudou: volta a enquadrar automaticamente
    _demoUsuarioMoveu = false;
    const total = dados.length || 1;

    _graficoRanking('demoBairros', 'chart-demo-bairros',
        _demoGrupos.filter(g => !g.semBairro).slice(0, 15).map(g => [g.bairro, g.qtd]), cor);

    const porCidade = {};
    _demoGrupos.forEach(g => { porCidade[g.cidade] = (porCidade[g.cidade] || 0) + g.qtd; });
    _graficoRanking('demoCidades', 'chart-demo-cidades',
        Object.entries(porCidade).sort((a, b) => b[1] - a[1]).slice(0, 12), cor);

    const faixas = DEMO_FAIXAS.map(([, , rot]) => [rot, 0]);
    let semIdade = 0;
    dados.forEach(a => {
        const idade = Number(a.idade);
        if (a.idade === '' || a.idade == null || !isFinite(idade)) { semIdade++; return; }
        const i = DEMO_FAIXAS.findIndex(([de, ate]) => idade >= de && idade <= ate);
        if (i >= 0) faixas[i][1]++;
    });
    if (semIdade) faixas.push(['Sem idade', semIdade, '#cbd5e1']);
    _graficoRanking('demoIdade', 'chart-demo-idade', faixas, cor);

    _renderDemoTabela();

    _iniciarMapa();
    // A aba acabou de ficar visível: o Leaflet precisa remedir o contêiner
    setTimeout(() => { if (_demoMapa) _demoMapa.invalidateSize(); _desenharMapa(); }, 50);
    _carregarGeoCache().then(() => { _desenharMapa(); _enfileirarGeo(_demoGrupos); });
}
