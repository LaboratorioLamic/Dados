// ═══════════════════════════════════════════════════════════════
// home.js — Dashboard KPI Principal — Manutenção LAMIC
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── ESTADO ───────────────────────────────────────────────────
  const _MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Período do Início no formato do seletor de meses (cq.js › _cqMpHTML):
  // { modo: 'geral' } | { modo: 'ano', ano } | { modo: 'intervalo', de, ate, atalho? } (de/ate em yyyymm).
  // dataInicio/dataFim (yyyy-mm-dd, fim limitado a hoje) são derivadas dele e usadas nos filtros.
  let _hf = { per: { modo: 'geral' }, dataInicio: '', dataFim: '' };
  // Aba do Início; a escolha fica no navegador só por conveniência
  let _homeAba = (function () { try { return localStorage.getItem('home-aba') || 'tarefas'; } catch (e) { return 'tarefas'; } })();
  let _homeOnlyMine   = false;
  let _hupMinhas = false; // toggle "Minhas Execuções" no card de últimas publicações
  let _hupPage   = 0;    // página atual das publicações (5 por página)
  let _falhaTabByAtivo = {}; // { [ativoKey]: 'falha'|'causa'|'deteccao'|'dano' }
  let _falhaPage = 0;        // página atual do bloco "OTs de Ativos com Falha" (3 por página)
  const KPI_CARDS_PER_PAGE = 6;
  let _kpiCardPage = 0;      // página atual do modal de cards KPI (ativosEmUso / ativosParados)
  let _kpiCardTipo = '';     // tipo do KPI aberto atualmente no modal

  // ── HELPERS DE DATA ──────────────────────────────────────────
  function _hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const _ymISO = (yyyymm) => `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
  const _mesRot = (yyyymm) => `${_MESES[+yyyymm.slice(4, 6) - 1]} ${yyyymm.slice(0, 4)}`;

  function _initPeriodo() {
    const p = _hf.per;
    let ini = '', fim = '';
    if (p.modo === 'ano') {
      ini = `${p.ano}-01-01`; fim = `${p.ano}-12-31`;
    } else if (p.modo === 'intervalo') {
      const ultimo = new Date(+p.ate.slice(0, 4), +p.ate.slice(4, 6), 0).getDate();
      ini = `${_ymISO(p.de)}-01`; fim = `${_ymISO(p.ate)}-${String(ultimo).padStart(2, '0')}`;
    }
    const hoje = _hojeISO();
    _hf.dataInicio = ini;
    _hf.dataFim    = fim && fim > hoje ? hoje : fim;
  }

  function _modoLabel() {
    const p = _hf.per;
    if (p.modo === 'ano') return String(p.ano);
    if (p.modo === 'intervalo') {
      if (p.atalho) return p.atalho === 1 ? _mesRot(p.de) : `Últimos ${p.atalho} meses`;
      return p.de === p.ate ? _mesRot(p.de) : `${_mesRot(p.de)} – ${_mesRot(p.ate)}`;
    }
    return 'Geral';
  }

  // ── HELPERS DE ACESSO AO ESTADO ──────────────────────────────
  // Ids dos setores visíveis pelo filtro de unidades/setores da topbar (org.js)
  function _setores() {
    return (typeof _getFilteredSetores === 'function') ? _getFilteredSetores() : [];
  }

  // Índices de todos os ativos da OT (a OT pode envolver vários; o primeiro é o principal)
  function _otIdxs(ot) {
    if (typeof otAtivoIdxs === 'function') return otAtivoIdxs(ot);
    const i = ot?.ativoIdx;
    return (i != null && i !== '' && state?.ativos[Number(i)]) ? [Number(i)] : [];
  }

  // OT entra no filtro de setor quando qualquer um dos seus ativos é do setor visível
  function _otSetor(ot) {
    if (typeof state !== 'undefined') {
      const ids = _otIdxs(ot).flatMap(i => _orgSetorIdsDoAtivo(state.ativos[i]));
      if (ids.length) return ids;
    }
    return _orgSetorIdDeRef(ot.setorId, ot.setor);
  }

  // Nome do(s) ativo(s) e rótulo "Unidade · Setor" do principal
  function _otAtivoMeta(ot) {
    const idxs = _otIdxs(ot);
    const a = idxs.length ? state.ativos[idxs[0]] : null;
    if (!a) return { nome: '', rotulo: _rotuloSetorItem(null, ot) || '—' };
    return { nome: a.nome + (idxs.length > 1 ? ` +${idxs.length - 1}` : ''), rotulo: _orgRotuloAtivo(a) };
  }

  function _otResponsaveis(ot) {
    return Array.isArray(ot.responsavelIds) && ot.responsavelIds.length ? ot.responsavelIds : [ot.responsavelId].filter(Boolean);
  }

  const _OT_FINAIS = ['concluida', 'cancelada'];
  const _otAberta = (o) => !_OT_FINAIS.includes(o.status);
  // Data de conclusão; registros antigos sem dataConclusao usam a última atualização
  const _otDataConclusao = (o) => o.dataConclusao || (o.atualizadoEm || '').split('T')[0];
  const _diasEntre = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

  function _rotinaSetor(rotina) {
    if (!rotina) return '';
    if (rotina.equipamentoIdx != null && state?.ativos[rotina.equipamentoIdx]) return _orgSetorIdsDoAtivo(state.ativos[rotina.equipamentoIdx]);
    return _orgSetorIdDeRef(rotina.setorId, rotina.setor);
  }

  function _tarefaSetor(t) {
    if (t.equipamentoIdx != null && typeof state !== 'undefined') {
      const a = state.ativos[t.equipamentoIdx];
      return a ? _orgSetorIdsDoAtivo(a) : '';
    }
    return _rotinaSetor(state?.rotinas?.find(r => r.id === t.rotinaId));
  }

  // setorId: um id ou a lista de setores do ativo (responsável + compartilhados)
  function _inSetor(setorId) {
    const ids = (Array.isArray(setorId) ? setorId : [setorId]).filter(Boolean);
    if (!ids.length) return true;
    const vis = _setores();
    return ids.some(id => vis.includes(id));
  }

  // Rótulo "Unidade · Setor" do ativo, ou do registro (OT/rotina) quando não há ativo
  function _rotuloSetorItem(a, rec) {
    return a ? _orgRotuloAtivo(a) : _orgRotuloRef(rec?.setorId, rec?.setor);
  }

  function _inPeriod(dateStr) {
    if (!dateStr || !_hf.dataInicio || !_hf.dataFim) return true;
    const d = (dateStr + '').split('T')[0];
    return d >= _hf.dataInicio && d <= _hf.dataFim;
  }

  function _hoje() {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }

  // ── CÁLCULO DE KPIs ─────────────────────────────────────────
  function calcKPIs() {
    const hoje = _hoje();
    const ordens      = (typeof otState !== 'undefined' ? otState.ordens : []) || [];
    const ativos      = state?.ativos      || [];
    const rotinas     = state?.rotinas     || [];
    const tarefas     = state?.tarefas     || [];
    const publicacoes = state?.publicacoes || [];

    // Filtro "Meus itens": restringe OTs, tarefas e pubs ao responsável logado
    const _sess = typeof currentSession !== 'undefined' ? currentSession : null;
    const _uid  = _sess?.userId;
    const _gid  = _sess?.grupoId;
    function _isMine_ot(o) {
      return _otResponsaveis(o).includes(_uid);
    }
    function _isMine_tarefa(t) {
      const resp = t.responsaveis || { usuarios: [], grupos: [] };
      return resp.usuarios.includes(_uid) || (_gid && resp.grupos.includes(_gid));
    }
    function _isMine_pub(p) {
      return p.publicadoPorId === _uid;
    }

    const ordensVis   = ordens.filter(o => _inSetor(_otSetor(o)) && (!_homeOnlyMine || !_uid || _isMine_ot(o)));
    const ativosVis   = ativos.filter(a => _inSetor(_orgSetorIdsDoAtivo(a)));  // ativos: sem filtro por responsável
    const rotinasVis  = rotinas.filter(r => _inSetor(_rotinaSetor(r)));
    const tarefasVis  = tarefas.filter(t => _inSetor(_tarefaSetor(t)) && (!_homeOnlyMine || !_uid || _isMine_tarefa(t)));
    const tarefasIds  = new Set(tarefasVis.map(t => t.id));
    const pubsVis     = publicacoes.filter(p => tarefasIds.has(p.tarefaId) && (!_homeOnlyMine || !_uid || _isMine_pub(p)));

    // OTs: "situação atual" usa as abertas (sem período); distribuições e histórico usam o período
    const otsAbertasList = ordensVis.filter(_otAberta);
    const ordensPeriodo  = ordensVis.filter(o => _inPeriod(o.criadoEm));

    const otByStatus = { pendente: 0, em_processo: 0, em_revisao: 0, concluida: 0, cancelada: 0 };
    ordensPeriodo.forEach(o => { if (otByStatus[o.status] !== undefined) otByStatus[o.status]++; });

    // Concluídas no período (pela data de conclusão) e tempo médio da abertura à conclusão
    const otConcluidasList = ordensVis.filter(o => o.status === 'concluida' && _inPeriod(_otDataConclusao(o)));
    const comDuracao = otConcluidasList.filter(o => o.dataConclusao && o.criadoEm);
    const otTempoMedio = comDuracao.length
      ? Math.round(comDuracao.reduce((s, o) => s + Math.max(0, _diasEntre(o.criadoEm.split('T')[0], o.dataConclusao)), 0) / comDuracao.length)
      : null;

    const otsFalhaList = ordensPeriodo.filter(o => o.tipo === 'corretiva' && o.ativoFalhou);
    const otsFalhaTotal = otsFalhaList.length;
    const otsParadaList = ordensPeriodo.filter(o => o.causouParada);

    const otByTipo = { corretiva: 0, implantacao: 0, melhoria: 0, alteracao: 0 };
    ordensPeriodo.forEach(o => { if (otByTipo[o.tipo] !== undefined) otByTipo[o.tipo]++; });

    // Severidade só das abertas: é o que ainda pede atenção
    const otBySev = { critica: 0, alta: 0, media: 0, baixa: 0 };
    otsAbertasList.forEach(o => { if (otBySev[o.severidade] !== undefined) otBySev[o.severidade]++; });

    // Carga por responsável (OTs abertas)
    const otPorResp = {};
    otsAbertasList.forEach(o => {
      const ids = _otResponsaveis(o);
      const nomes = (o.responsavelNome || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length) { (otPorResp.__sem__ = otPorResp.__sem__ || { nome: 'Sem responsável', n: 0 }).n++; return; }
      ids.forEach((id, i) => {
        const u = typeof authState !== 'undefined' ? authState.users.find(x => x.id === id) : null;
        (otPorResp[id] = otPorResp[id] || { nome: u?.nomeCompleto || u?.username || nomes[i] || 'Responsável', n: 0 }).n++;
      });
    });

    // Ativos com mais corretivas no período (cada ativo da OT conta)
    const corrPorAtivo = {};
    ordensPeriodo.filter(o => o.tipo === 'corretiva' && o.status !== 'cancelada').forEach(o => {
      _otIdxs(o).forEach(i => {
        const a = state.ativos[i];
        (corrPorAtivo[i] = corrPorAtivo[i] || { idx: i, nome: a.nome, rotulo: _orgRotuloAtivo(a), n: 0 }).n++;
      });
    });
    const topCorretivas = Object.values(corrPorAtivo).sort((a, b) => b.n - a.n).slice(0, 5);

    // Tarefas
    const tarefasAtrasadas = tarefasVis.filter(t =>
      t.status === 'Ativo' && t.proximaData &&
      new Date(t.proximaData + 'T00:00:00') < hoje
    );
    const tarefasProximas = tarefasVis.filter(t => {
      if (t.status !== 'Ativo' || !t.proximaData) return false;
      const due  = new Date(t.proximaData + 'T00:00:00');
      const diff = Math.ceil((due - hoje) / 86400000);
      return diff >= 0 && t.lembrete !== null && t.lembrete !== undefined && diff <= t.lembrete;
    });

    // Publicações — campo "tipo" pode não existir em registros antigos;
    // publicação de execução é qualquer pub sem tipo='notificacao'
    const pubsPeriodo  = pubsVis.filter(p => _inPeriod(p.dataPublicacao));
    const execsPeriodo = pubsPeriodo.filter(p => !p.tipo || p.tipo === 'execucao');

    // % cumprimento
    const tarefasVencPeriodo = tarefasVis.filter(t =>
      t.proximaData && _inPeriod(t.proximaData) && t.status === 'Ativo'
    );
    const base = tarefasVencPeriodo.length + execsPeriodo.length;
    const pctCumprimento = base > 0 ? Math.min(100, Math.round((execsPeriodo.length / base) * 100)) : 0;

    // Faixa de prazos das tarefas: hoje e próximos 7 dias (independe do lembrete)
    const _diasAte = (t) => Math.ceil((new Date(t.proximaData + 'T00:00:00') - hoje) / 86400000);
    const tarefasAtivas = tarefasVis.filter(t => t.status === 'Ativo' && t.proximaData);
    const tarefasHoje   = tarefasAtivas.filter(t => _diasAte(t) === 0).length;
    const tarefas7d     = tarefasAtivas.filter(t => { const d = _diasAte(t); return d >= 1 && d <= 7; }).length;

    // Abertas por tipo
    const otCorretivas   = otsAbertasList.filter(o => o.tipo === 'corretiva').length;
    const otsServicoList = otsAbertasList.filter(o => o.tipo !== 'corretiva');
    const otsServico     = otsServicoList.length;

    // OTs com Atraso: abertas com prazo vencido
    const otsAtrasoList = otsAbertasList.filter(o => o.prazo && new Date(o.prazo + 'T00:00:00') < hoje);
    const otsAtraso = otsAtrasoList.length;

    // Aguardando revisão (dependem de aprovação) e prioritárias (crítica/alta)
    const otsRevisaoList     = otsAbertasList.filter(o => o.status === 'em_revisao');
    const otsPrioritariasList = otsAbertasList.filter(o => o.severidade === 'critica' || o.severidade === 'alta');

    // Tarefas por tipo de rotina
    const tiposRotina = state?.tiposRotina || ['Preventivo', 'Rotina'];
    const tarefasByTipo = {};
    tiposRotina.forEach(tipo => {
      const rIds = new Set(rotinasVis.filter(r => r.tipo === tipo).map(r => r.id));
      tarefasByTipo[tipo] = tarefasVis.filter(t => rIds.has(t.rotinaId)).length;
    });

    // Ativos parados (statusUso === 'em_pausa') no setor filtrado
    const ativosParados = ativosVis.filter(a => a.statusUso === 'em_pausa');
    // Ativos em uso: exclui pausados E em desuso
    const ativosEmUsoFiltered = ativosVis.filter(a => a.statusUso !== 'em_pausa' && a.statusUso !== 'em_desuso');

    // OTs em que o ativo falhou, agrupadas por ativo (mesmo conjunto do KPI "OTs com Falha").
    // OT com vários ativos aparece em cada um deles.
    const otsFalhaByAtivo = {};
    otsFalhaList.forEach(o => {
      const idxs = _otIdxs(o);
      (idxs.length ? idxs : [null]).forEach(i => {
        const key = i === null ? '__sem_ativo__' : String(i);
        if (!otsFalhaByAtivo[key]) otsFalhaByAtivo[key] = { nome: i === null ? 'Sem ativo' : state.ativos[i].nome, ots: [] };
        otsFalhaByAtivo[key].ots.push(o);
      });
    });

    return {
      otsAbertasList,
      otsServico, otsServicoList,
      otsAtraso, otsAtrasoList,
      otsRevisaoList, otsPrioritariasList,
      otConcluidas: otConcluidasList.length, otConcluidasList, otTempoMedio,
      otsFalhaTotal, otsFalhaList,
      otsParadaList,
      otPorResp: Object.values(otPorResp).sort((a, b) => b.n - a.n),
      topCorretivas,
      tarefasAtrasadas: tarefasAtrasadas.length,
      tarefasHoje, tarefas7d,
      tarefasConcluidas: execsPeriodo.length,
      tarefasVencPeriodo: tarefasVencPeriodo.length,
      otCorretivas,
      rotinasAtivas: rotinasVis.filter(r => r.status === 'Ativo').length,
      rotinasAtivasList: rotinasVis.filter(r => r.status === 'Ativo'),
      totalAtivos:   ativosVis.length,
      ativosEmUso:   ativosEmUsoFiltered.length,
      ativosEmUsoList: ativosEmUsoFiltered,
      ativosParados: ativosParados.length,
      ativosParadosList: ativosParados,
      pctCumprimento,
      temBaseCumprimento: base > 0,
      execsPeriodo:  execsPeriodo.length,
      execsPeriodoList: execsPeriodo,
      otByStatus, otByTipo, otBySev, tarefasByTipo,
      otPorMes: _calcOtsPorMes(ordensVis),
      totalOTsPeriodo: ordensPeriodo.length,
      otsFalhaByAtivo,
      tarefasAtrasadasList: tarefasAtrasadas,
      tarefasProximasList:  tarefasProximas,
      ordensVis,
      tarefasVisList: tarefasVis,
    };
  }

  // Últimos 6 meses: OTs abertas (criadas) e concluídas em cada mês
  function _calcOtsPorMes(ordens) {
    const hoje = new Date();
    const mesDe = (s) => (s || '').slice(0, 7);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      const count = ordens.filter(o => mesDe(o.criadoEm) === ym).length;
      const concl = ordens.filter(o => o.status === 'concluida' && mesDe(_otDataConclusao(o)) === ym).length;
      return { label, count, concl };
    });
  }

  // ── GRÁFICOS SVG ─────────────────────────────────────────────
  function f(n) { return Number(n).toFixed(2); }

  function _donutChart(segments, size) {
    size = size || 130;
    const cx = size / 2, cy = size / 2;
    const r  = size * 0.32;
    const sw = size * 0.17;
    const C  = 2 * Math.PI * r;
    const total = segments.reduce((s, sg) => s + sg.value, 0);

    if (total === 0) {
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" class="home-ring-bg" stroke-width="${sw}"/>
      </svg>`;
    }

    let offset = 0;
    const arcs = segments.map(sg => {
      const dash = (sg.value / total) * C;
      const el = `<circle cx="${cx}" cy="${cy}" r="${r}"
        fill="none" stroke="${sg.color}" stroke-width="${sw}"
        stroke-dasharray="${f(Math.max(0, dash - 1.5))} ${f(Math.max(0, C - dash + 1.5))}"
        stroke-dashoffset="${f(-offset)}"/>`;
      offset += dash;
      return el;
    }).join('');

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
      style="transform:rotate(-90deg);display:block;">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" class="home-ring-bg" stroke-width="${sw}"/>
      ${arcs}
    </svg>`;
  }

  function _hBarChart(items) {
    const max = Math.max(...items.map(i => i.value), 1);
    return `<div class="home-hbar-chart">${items.map(it =>
      `<div class="home-hbar-row">
        <div class="home-hbar-label">${it.label}</div>
        <div class="home-hbar-track">
          <div class="home-hbar-fill"
            style="width:${((it.value / max) * 100).toFixed(1)}%;background:${it.color}"></div>
        </div>
        <div class="home-hbar-val">${it.value}</div>
      </div>`).join('')}</div>`;
  }

  // Barras agrupadas por mês: abertas (criadas) × concluídas
  function _barChart(items) {
    const max = Math.max(...items.map(i => Math.max(i.count, i.concl || 0)), 1);
    const h = (n) => Math.max(2, (n / max) * 80);
    return `<div class="home-bar-chart">${items.map(it => `
      <div class="home-bar-col" title="${it.label}: ${it.count} aberta(s), ${it.concl || 0} concluída(s)">
        <div class="home-bar-par">
          <div class="home-bar-item"><span class="home-bar-val">${it.count || ''}</span><div class="home-bar-bar" style="height:${h(it.count)}px"></div></div>
          <div class="home-bar-item"><span class="home-bar-val">${it.concl || ''}</span><div class="home-bar-bar concl" style="height:${h(it.concl || 0)}px"></div></div>
        </div>
        <div class="home-bar-lbl">${it.label}</div>
      </div>`).join('')}</div>
      <div class="home-bar-legenda"><span><i></i>Abertas</span><span><i class="concl"></i>Concluídas</span></div>`;
  }

  // ── RENDER PRINCIPAL ─────────────────────────────────────────
  function renderHome() {
    const container = document.getElementById('tab-inicio');
    if (!container) return;
    // Garante período sempre consistente com o modo atual
    _initPeriodo();

    const k = calcKPIs();
    // Ocorrências entram na aba Tarefas e Ativos; CQ só vira aba quando o módulo devolve o card
    // (permissão e dados carregados)
    const oc = typeof ocHomePartes === 'function' ? ocHomePartes() : null;
    const cqHTML = typeof cqRenderHomeCard === 'function'
      ? cqRenderHomeCard({ inicio: _hf.dataInicio, fim: _hf.dataFim, label: _modoLabel(), ativa: _homeAba === 'cq' }) : '';
    const abas = [
      { id: 'tarefas', label: 'Tarefas e Ativos', ico: _ico.task, n: k.tarefasAtrasadas, alerta: true, tit: 'tarefa(s) com atraso' },
      { id: 'ots', label: 'Ordens de Trabalho', ico: _ico.wrench, n: k.otsAbertasList.length, alerta: k.otsAtraso > 0, tit: 'OT(s) em aberto' },
      cqHTML && Object.assign({ id: 'cq', label: 'Controle de Qualidade', ico: _ico.flask, tit: 'pendência(s): corridas, NC e trocas de preparo' }, _contagemCq()),
    ].filter(Boolean);
    if (!abas.some(a => a.id === _homeAba)) _homeAba = 'tarefas';

    const corpo = _homeAba === 'ots' ? _renderAbaOTs(k)
      : _homeAba === 'cq' ? cqHTML
      : _renderAbaTarefas(k, oc);

    container.innerHTML = `
      <div class="home-dashboard">
        ${_renderFiltros(_renderAbas(abas))}
        <div class="home-aba-corpo" data-aba="${_homeAba}">${corpo}</div>
      </div>`;
  }

  // ── ABAS ─────────────────────────────────────────────────────
  function _renderAbas(abas) {
    return `<nav class="home-abas" role="tablist">${abas.map(a => {
      const on = a.id === _homeAba;
      return `<button type="button" role="tab" class="home-aba${on ? ' active' : ''}" aria-selected="${on}" onclick="homeSetAba('${a.id}')">
        ${a.ico}<span>${a.label}</span>${a.n ? `<span class="home-aba-n${a.alerta ? ' alerta' : ''}" title="${a.n} ${a.tit}">${a.n}</span>` : ''}
      </button>`;
    }).join('')}</nav>`;
  }

  // Contador da aba do CQ (mesmo número do selo do menu)
  function _contagemCq() {
    if (typeof _cqContagens !== 'function') return { n: 0 };
    const k = _cqContagens();
    const tr = typeof _cqTrocasAlertasTodas === 'function' ? _cqTrocasAlertasTodas() : [];
    return { n: k.pend + k.ncs + tr.length, alerta: k.rej > 0 || k.ncs > 0 || tr.some(a => a.tipo === 'danger') };
  }

  function _renderAbaTarefas(k, oc) {
    const l = _listasPendentes(k);
    const prazos = `<div class="home-prazos">
        <span class="${k.tarefasAtrasadas ? 'alerta' : ''}"><b>${k.tarefasAtrasadas}</b>vencidas</span>
        <span class="${k.tarefasHoje ? 'atencao' : ''}"><b>${k.tarefasHoje}</b>vencem hoje</span>
        <span><b>${k.tarefas7d}</b>nos próximos 7 dias</span>
      </div>`;
    return `${_renderKPIRow2(k)}
      <div class="home-cols home-cols-larga">
        ${_listaCard('Tarefas pendentes', l.cntT, l.tarefas, "switchTab('rotina');switchRotinaTab('agenda');", 'Abrir agenda', prazos)}
        <div class="home-col-stack">
          ${_renderCumprimento(k)}
          ${_renderAtivosParados(k)}
        </div>
      </div>
      <div class="home-cols">
        ${oc ? oc.lista : ''}
        ${_renderUltimasPublicacoes()}
      </div>
      ${oc ? oc.indicadores : ''}`;
  }

  function _renderAbaOTs(k) {
    const l = _listasPendentes(k);
    return `<div class="home-secao">Situação atual</div>
      ${_renderKPIRow1(k)}
      <div class="home-cols home-cols-larga">
        ${_listaCard('OTs em aberto', l.cntO, l.ots, "switchTab('os')", 'Ver todas')}
        <div class="home-col-stack">
          ${_renderSeveridade(k)}
          ${_renderPorResponsavel(k)}
        </div>
      </div>
      <div class="home-secao">No período · ${_modoLabel()}</div>
      ${_renderKPIRowPeriodoOT(k)}
      <div class="home-cols-3">
        ${_renderDonutOT(k)}
        ${_renderDonutTipos(k)}
        ${_renderOtsPorMes(k)}
      </div>
      <div class="home-cols">
        ${_renderTopCorretivas(k)}
        ${_renderFalhaCard(k)}
      </div>`;
  }

  function _listaCard(titulo, n, corpo, acao, rotAcao, topo) {
    return `<div class="home-chart-card home-lista-card">
      <div class="home-chart-header">
        <span class="home-chart-title">${titulo}<span class="home-chart-badge">${n}</span></span>
        <button type="button" class="hup-toggle-btn" onclick="${acao}">${rotAcao}${_ico.next}</button>
      </div>
      ${topo || ''}
      <div class="home-notif-body">${corpo}</div>
    </div>`;
  }

  // Cabeçalho padrão dos cards do Início
  function _cardHead(titulo, extra) {
    return `<div class="home-chart-header"><span class="home-chart-title">${titulo}</span>${extra || ''}</div>`;
  }
  const _vazio = (txt) => `<div class="home-chart-empty">${_ico.chart}<span>${txt}</span></div>`;

  // ── TAREFAS E ATIVOS: cumprimento e ativos parados ──────────
  function _renderCumprimento(k) {
    const tipos = Object.entries(k.tarefasByTipo).filter(([, n]) => n > 0);
    const cores = ['#00a8cc', '#2a9d8f', '#7c3aed', '#f4a261', '#718096'];
    const pct = k.pctCumprimento;
    const cls = pct >= 80 ? 'ok' : pct >= 50 ? 'atencao' : 'alerta';
    return `<div class="home-chart-card">
      ${_cardHead('Cumprimento das tarefas', `<span class="home-chart-sub">${_modoLabel()}</span>`)}
      <div class="home-chart-body">
        ${k.temBaseCumprimento ? `<div class="home-cumpr ${cls}">
            <div class="home-cumpr-top"><span class="home-cumpr-pct">${pct}%</span>
              <span class="home-cumpr-num"><b>${k.execsPeriodo}</b> execuções · <b>${k.tarefasVencPeriodo}</b> vencendo no período</span></div>
            <div class="home-cumpr-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
          </div>`
          : `<div class="home-cumpr-vazio">Sem execuções nem vencimentos no período</div>`}
        ${tipos.length ? `<div class="home-mini-tit">Tarefas por tipo de rotina</div>
          ${_hBarChart(tipos.map(([label, value], i) => ({ label: _esc(label), value, color: cores[i % cores.length] })))}` : ''}
      </div>
    </div>`;
  }

  function _renderAtivosParados(k) {
    const ordens = typeof otState !== 'undefined' ? otState.ordens : [];
    const ocs = typeof ocState !== 'undefined' ? ocState.ocorrencias || {} : {};
    const itens = k.ativosParadosList.map(a => {
      const idx = state.ativos.indexOf(a);
      const motivos = [
        ...(a.pausaOTs || []).map(id => {
          const ot = ordens.find(o => o.id === id);
          return ot ? `<button type="button" class="home-chip" title="Abrir OT" onclick="event.stopPropagation();otOpenView('${ot.id}')">${_esc(ot.numero || 'OT')}</button>` : '';
        }),
        ...(a.pausaOcorrencias || []).map(id => {
          const oc = ocs[id];
          return oc ? `<button type="button" class="home-chip" title="Abrir ocorrência" onclick="event.stopPropagation();ocOpenView('${oc.id}')">${_esc(oc.numero || 'Ocorrência')}</button>` : '';
        }),
      ].filter(Boolean).join('');
      return `<div class="home-notif-item" onclick="visualizarAtivo(${idx})">
        <div class="home-notif-dot" style="background:#e63946"></div>
        <div class="home-notif-content">
          <div class="home-notif-title">${_esc(a.nome)}</div>
          <div class="home-notif-meta">${_esc(_orgRotuloAtivo(a))}</div>
        </div>
        <div class="home-chips">${motivos || '<span class="home-notif-meta">sem vínculo</span>'}</div>
      </div>`;
    }).join('');
    return `<div class="home-chart-card home-lista-card">
      ${_cardHead(`Ativos parados<span class="home-chart-badge">${k.ativosParados}</span>`)}
      <div class="home-notif-body">${itens || `<div class="home-notif-empty">${_ico.ok}<span>Nenhum ativo parado</span></div>`}</div>
    </div>`;
  }

  // ── ORDENS DE TRABALHO: severidade, carga, histórico ─────────
  function _renderSeveridade(k) {
    const sevItems = [
      { label: 'Crítica', value: k.otBySev.critica || 0, color: '#e63946' },
      { label: 'Alta',    value: k.otBySev.alta    || 0, color: '#f4a261' },
      { label: 'Média',   value: k.otBySev.media   || 0, color: '#00a8cc' },
      { label: 'Baixa',   value: k.otBySev.baixa   || 0, color: '#2a9d8f' },
    ];
    return `<div class="home-chart-card">
      ${_cardHead('Severidade das abertas', `<span class="home-chart-badge">${k.otsAbertasList.length}</span>`)}
      <div class="home-chart-body">
        ${sevItems.some(i => i.value > 0) ? _hBarChart(sevItems) : _vazio('Nenhuma OT em aberto')}
      </div>
    </div>`;
  }

  function _renderPorResponsavel(k) {
    const lista = k.otPorResp.slice(0, 6);
    return `<div class="home-chart-card">
      ${_cardHead('Abertas por responsável')}
      <div class="home-chart-body">
        ${lista.length ? _hBarChart(lista.map(r => ({ label: _esc(r.nome), value: r.n, color: '#64748b' }))) : _vazio('Nenhuma OT em aberto')}
      </div>
    </div>`;
  }

  function _renderOtsPorMes(k) {
    return `<div class="home-chart-card">
      ${_cardHead('Abertas × concluídas', '<span class="home-chart-sub">últimos 6 meses</span>')}
      <div class="home-chart-body">
        ${k.otPorMes.some(m => m.count || m.concl) ? _barChart(k.otPorMes) : _vazio('Sem OTs nos últimos 6 meses')}
      </div>
    </div>`;
  }

  function _renderTopCorretivas(k) {
    const itens = k.topCorretivas.map(x => `
      <div class="home-notif-item" onclick="visualizarAtivo(${x.idx})">
        <div class="home-notif-content">
          <div class="home-notif-title">${_esc(x.nome)}</div>
          <div class="home-notif-meta">${_esc(x.rotulo)}</div>
        </div>
        <span class="home-notif-badge ${x.n > 1 ? 'notif-badge-red' : 'notif-badge-gray'}">${x.n} corretiva${x.n > 1 ? 's · reincidente' : ''}</span>
      </div>`).join('');
    return `<div class="home-chart-card home-lista-card">
      ${_cardHead('Ativos com mais corretivas', `<span class="home-chart-sub">${_modoLabel()}</span>`)}
      <div class="home-notif-body">${itens || `<div class="home-notif-empty">${_ico.ok}<span>Nenhuma corretiva no período</span></div>`}</div>
    </div>`;
  }

  // ── FILTRO DE PERÍODO ─────────────────────────────────────────
  function _renderFiltros(abasHTML) {
    const seletor = typeof _cqMpHTML === 'function'
      ? _cqMpHTML('home-mp', {
          get: () => _hf.per,
          set: (v) => { _hf.per = v; },
          onchange: _homePeriodoMudou,
          rotulo: _modoLabel,
          modos: ['geral', 'ano', 'intervalo'], atalhos: [1, 3, 6, 12], max: 60,
        })
      : '';
    return `
      <div class="home-filter-bar" id="home-filter-bar">
        ${abasHTML}
        <div class="home-filter-acoes">
          ${seletor}
          <button class="home-mine-btn${_homeOnlyMine ? ' active' : ''}" onclick="homeToggleMine()" title="Mostrar apenas meus itens">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Meus itens
          </button>
          <button class="home-mine-btn" onclick="switchTab('rotina');switchRotinaTab('agenda');" title="Abrir Agenda">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
        </div>
      </div>`;
  }

  // Período mudou no seletor: redesenha o Início. Se o seletor estava aberto (1º mês do
  // intervalo escolhido, navegação de ano), reabre o menu no mesmo estado.
  function _homePeriodoMudou() {
    _initPeriodo();
    const aberto = document.getElementById('home-mp')?.classList.contains('aberto');
    renderHome();
    if (aberto && typeof _cqMpMenuHTML === 'function') {
      document.getElementById('home-mp')?.classList.add('aberto');
      const menu = document.getElementById('home-mp-menu');
      if (menu) menu.innerHTML = _cqMpMenuHTML('home-mp');
    }
  }

  function _fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
  function _fmtDateTime(iso) {
    if (!iso) return '';
    if (!iso.includes('T')) return _fmtDate(iso);
    const [datePart, timePart] = iso.split('T');
    const [y, m, day] = datePart.split('-');
    const [h, min] = timePart.split(':');
    return `${day}/${m}/${y} ${h}:${min}`;
  }

  // ── ÍCONES SVG ───────────────────────────────────────────────
  const _ico = {
    clock:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    eye:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    check:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    alert:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    checkC:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    wrench:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    pause:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    bell:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    chart:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 6-6"/></svg>`,
    task:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    empty:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 6-6"/></svg>`,
    ok:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    next:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
    tri:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    flask:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9.5V3"/><line x1="7.5" y1="15" x2="16.5" y2="15"/></svg>`,
  };

  // ── KPI CARD ─────────────────────────────────────────────────
  function _kpi(titulo, valor, svg, cls, sub, tipo) {
    return `<div class="home-kpi-card ${cls}" onclick="homeOpenKPI('${tipo}')" title="Ver detalhes">
      <div class="home-kpi-head">
        <span class="home-kpi-title">${titulo}</span>
        <span class="home-kpi-icon">${svg}</span>
      </div>
      <div class="home-kpi-value">${valor}</div>
      <div class="home-kpi-foot">
        <span class="home-kpi-sub">${sub || ''}</span>
        <svg class="home-kpi-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>`;
  }

  // Row 1: OTs com Atraso | OTs de Serviço Abertas | OTs Concluídas | OTs Corretivas Abertas
  // OTs, situação atual (não depende do período)
  function _renderKPIRow1(k) {
    const nAb = k.otsAbertasList.length, nRev = k.otsRevisaoList.length, nPri = k.otsPrioritariasList.length;
    return `<div class="home-kpi-row">
      ${_kpi('OTs em Aberto',          nAb,         _ico.wrench,
          nAb > 0 ? 'kpi-cyan' : 'kpi-default', `${k.otCorretivas} corretiva(s) · ${k.otsServico} serviço`, 'otsAbertas')}
      ${_kpi('OTs com Atraso',         k.otsAtraso, _ico.clock,
          k.otsAtraso > 0 ? 'kpi-orange' : 'kpi-default', 'Prazo vencido', 'otsAtraso')}
      ${_kpi('Aguardando Revisão',     nRev,        _ico.eye,
          nRev > 0 ? 'kpi-yellow' : 'kpi-default', 'Dependem de aprovação', 'otsRevisao')}
      ${_kpi('Críticas e Altas',       nPri,        _ico.alert,
          nPri > 0 ? 'kpi-red' : 'kpi-default', 'Severidade crítica ou alta em aberto', 'otsPrioritarias')}
    </div>`;
  }

  // OTs no período selecionado
  function _renderKPIRowPeriodoOT(k) {
    const nPar = k.otsParadaList.length;
    return `<div class="home-kpi-row">
      ${_kpi('OTs Concluídas',         k.otConcluidas, _ico.checkC,
          k.otConcluidas > 0 ? 'kpi-green' : 'kpi-default', 'Pela data de conclusão', 'otConcluidas')}
      ${_kpi('Tempo Médio de Resolução', k.otTempoMedio === null ? '—' : `${k.otTempoMedio}d`, _ico.clock,
          'kpi-default', 'Da abertura à conclusão', 'otConcluidas')}
      ${_kpi('OTs com Falha',          k.otsFalhaTotal, _ico.alert,
          k.otsFalhaTotal > 0 ? 'kpi-red' : 'kpi-default', 'Corretivas com falha do ativo', 'otsFalha')}
      ${_kpi('Causaram Parada',        nPar,          _ico.pause,
          nPar > 0 ? 'kpi-orange' : 'kpi-default', 'Ativo ficou fora de uso', 'otsParada')}
    </div>`;
  }

  // Row 2: Tarefas com Atraso | Rotinas Ativas | Ativos Parados | Ativos Cadastrados
  function _renderKPIRow2(k) {
    return `<div class="home-kpi-row">
      ${_kpi('Tarefas com Atraso', k.tarefasAtrasadas,  _ico.alert,
          k.tarefasAtrasadas > 0 ? 'kpi-orange' : 'kpi-default',
          'Vencidas sem conclusão', 'tarefasAtrasadas')}
      ${_kpi('Rotinas Ativas',     k.rotinasAtivas,     _ico.refresh, 'kpi-cyan',
          'Planos ativos', 'rotinasAtivas')}
      ${_kpi('Ativos Parados',     k.ativosParados,     _ico.pause,
          k.ativosParados > 0 ? 'kpi-red' : 'kpi-default',
          'Em pausa / manutenção', 'ativosParados')}
      ${_kpi('Ativos em Uso',      k.ativosEmUso,       _ico.monitor, 'kpi-green',
          'Operando normalmente', 'ativosEmUso')}
    </div>`;
  }

  // ── MODAL DE LISTAGEM KPI ─────────────────────────────────────
  const _kpiTheme = {
    otsAtraso:        { theme: 'orange',  ico: _ico => _ico.clock   },
    otsServico:       { theme: 'cyan',    ico: _ico => _ico.eye     },
    otsFalha:         { theme: 'red',     ico: _ico => _ico.alert   },
    otCorretivas:     { theme: 'yellow',  ico: _ico => _ico.wrench  },
    tarefasAtrasadas: { theme: 'orange',  ico: _ico => _ico.alert   },
    rotinasAtivas:    { theme: 'cyan',    ico: _ico => _ico.refresh },
    ativosParados:    { theme: 'red',     ico: _ico => _ico.pause   },
    ativosEmUso:      { theme: 'green',   ico: _ico => _ico.monitor },
    otConcluidas:     { theme: 'green',   ico: _ico => _ico.checkC  },
    otsAbertas:       { theme: 'cyan',    ico: _ico => _ico.wrench  },
    otsRevisao:       { theme: 'yellow',  ico: _ico => _ico.eye     },
    otsPrioritarias:  { theme: 'red',     ico: _ico => _ico.alert   },
    otsParada:        { theme: 'orange',  ico: _ico => _ico.pause   },
    tarefasConcluidas:{ theme: 'default', ico: _ico => _ico.task    },
  };

  let _kpiRotinasTipo = ''; // filtro de tipo ativo no modal de rotinas ativas

  function _ensureKPIModal() {
    if (document.getElementById('home-kpi-modal')) return;
    const el = document.createElement('div');
    el.id = 'home-kpi-modal';
    el.className = 'hkm-overlay';
    el.innerHTML = `
      <div class="hkm-box" onclick="event.stopPropagation()">
        <div class="hkm-header">
          <div class="hkm-header-icon" id="hkm-icon"></div>
          <div class="hkm-title-area">
            <div class="hkm-title" id="hkm-title"></div>
            <div class="hkm-count" id="hkm-count"></div>
          </div>
          <div class="hkm-tipo-wrap" id="hkm-tipo-wrap" style="display:none;position:relative;">
            <button class="hkm-tipo-btn" id="hkm-tipo-btn" onclick="hkmToggleTipoPop(event)" title="Filtrar por tipo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              <span id="hkm-tipo-label">Tipo</span>
            </button>
            <div class="hkm-tipo-pop" id="hkm-tipo-pop"></div>
          </div>
          <button class="hkm-close" onclick="homeCloseKPI()" title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="hkm-header-divider" id="hkm-divider"></div>
        <div class="hkm-body" id="hkm-body"></div>
      </div>`;
    el.addEventListener('click', () => homeCloseKPI());
    document.body.appendChild(el);
    // Fecha popover de tipo ao clicar fora dele
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('hkm-tipo-pop');
      const btn = document.getElementById('hkm-tipo-btn');
      if (pop && !pop.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
        pop.classList.remove('open');
      }
    });
  }

  window.hkmToggleTipoPop = function (e) {
    e.stopPropagation();
    const pop = document.getElementById('hkm-tipo-pop');
    const btn = document.getElementById('hkm-tipo-btn');
    if (!pop || !btn) return;
    const isOpen = pop.classList.contains('open');
    if (!isOpen) {
      const rect = btn.getBoundingClientRect();
      pop.style.top  = (rect.bottom + 6) + 'px';
      pop.style.left = (rect.right - 160) + 'px'; // alinha pela direita
    }
    pop.classList.toggle('open', !isOpen);
  };

  window.hkmSelecionarTipo = function (tipo) {
    _kpiRotinasTipo = tipo;
    const btn  = document.getElementById('hkm-tipo-btn');
    const lbl  = document.getElementById('hkm-tipo-label');
    const pop  = document.getElementById('hkm-tipo-pop');
    if (lbl) lbl.textContent = tipo || 'Tipo';
    if (btn) btn.classList.toggle('active', !!tipo);
    if (pop) pop.classList.remove('open');
    _hkmRenderRotinasAtivas();
  };

  function _hkmPopularTipoPop() {
    const pop = document.getElementById('hkm-tipo-pop');
    if (!pop) return;
    const tipos = [...new Set((state?.rotinas || []).map(r => r.tipo).filter(Boolean))].sort();
    pop.innerHTML = `
      <div class="hkm-tipo-item${_kpiRotinasTipo === '' ? ' active' : ''}" onclick="hkmSelecionarTipo('')">Todos</div>
      ${tipos.map(t => `<div class="hkm-tipo-item${_kpiRotinasTipo === t ? ' active' : ''}" onclick="hkmSelecionarTipo('${t.replace(/'/g,"\\'")}')">
        ${t}
      </div>`).join('')}`;
  }

  function _hkmRenderRotinasAtivas() {
    const k = calcKPIs();
    const body  = document.getElementById('hkm-body');
    const count = document.getElementById('hkm-count');
    if (!body) return;

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const tarefasVis = k.tarefasVisList || [];

    let lista = k.rotinasAtivasList || [];
    if (_kpiRotinasTipo) lista = lista.filter(r => r.tipo === _kpiRotinasTipo);

    if (count) count.textContent = `${lista.length} item${lista.length !== 1 ? 's' : ''}`;

    const _fn = (expr) => `homeCloseKPI();${expr}`;

    if (lista.length === 0) {
      body.innerHTML = `<div class="hkm-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>Nenhuma rotina encontrada</span>
      </div>`;
      return;
    }

    // Para cada rotina, calcula a pior flag entre suas tarefas ativas
    const linhas = lista.map(r => {
      const a = r.equipamentoIdx != null ? state?.ativos[r.equipamentoIdx] : null;
      const aInfo = a ? `${_esc(a.nome)}<small>${_esc(_orgRotuloAtivo(a))}</small>` : _esc(_rotuloSetorItem(null, r) || '—');
      const tarefasR = tarefasVis.filter(t => t.rotinaId === r.id && t.status === 'Ativo');
      const numTarefas = tarefasVis.filter(t => t.rotinaId === r.id).length;

      let piorflag = 0; // 0=ok, 1=warning, 2=danger
      tarefasR.forEach(t => {
        if (!t.proximaData) return;
        const due  = new Date(t.proximaData + 'T00:00:00');
        const diff = Math.ceil((due - hoje) / 86400000);
        if (diff < 0) { piorflag = Math.max(piorflag, 2); }
        else if (t.lembrete != null && diff <= t.lembrete) { piorflag = Math.max(piorflag, 1); }
      });

      let iconHtml = '';
      let rowClass = '';
      if (piorflag === 2) {
        iconHtml = `<svg class="hkm-alert-icon hkm-alert-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" title="Tarefa atrasada"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        rowClass = 'hkm-row-danger';
      } else if (piorflag === 1) {
        iconHtml = `<svg class="hkm-alert-icon hkm-alert-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" title="Tarefa com alerta"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        rowClass = 'hkm-row-warning';
      }

      const nomeCell = `<span class="hkm-nome-wrap">${iconHtml}${_esc(r.nome)}</span>`;
      const numCell  = `<span style="font-weight:600;color:var(--cyan)">${numTarefas || 0}</span>`;

      return { rowClass, cells: [nomeCell, aInfo, _esc(r.tipo), numCell], fn: _fn(`viewRotina('${r.id}')`) };
    });

    // Ordena: danger > warning > ok
    linhas.sort((a, b) => {
      const order = { 'hkm-row-danger': 0, 'hkm-row-warning': 1, '': 2 };
      return (order[a.rowClass] ?? 2) - (order[b.rowClass] ?? 2);
    });

    body.innerHTML = `<table class="hkm-table">
      <thead><tr>${['Nome','Ativo / Unidade · Setor','Tipo','Tarefas'].map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>
        ${linhas.map(l =>
          `<tr onclick="${l.fn}" class="hkm-clickable${l.rowClass ? ' ' + l.rowClass : ''}">
            ${l.cells.map(c => `<td>${c}</td>`).join('')}
          </tr>`
        ).join('')}
      </tbody>
    </table>`;
  }

  function _otTipoLabel(t) {
    return { corretiva:'Corretiva', implantacao:'Implantação', melhoria:'Melhoria', alteracao:'Alteração' }[t] || t;
  }
  function _otStLabel(s) {
    return { pendente:'Pendente', em_processo:'Em Processo', em_revisao:'Em Revisão', concluida:'Concluída', cancelada:'Cancelada' }[s] || s;
  }
  function _sevLabel(s) {
    return { critica:'Crítica', alta:'Alta', media:'Média', baixa:'Baixa' }[s] || s;
  }

  function _buildKPIData(tipo, k) {
    const hoje = _hoje();

    const _otivoInfo = (ot) => {
      const m = _otAtivoMeta(ot);
      return m.nome ? `${_esc(m.nome)}<small>${_esc(m.rotulo)}</small>` : _esc(m.rotulo);
    };
    const _sevOrd = ['critica', 'alta', 'media', 'baixa'];
    const _porSev = (a, b) => _sevOrd.indexOf(a.severidade) - _sevOrd.indexOf(b.severidade);
    // Lista padrão de OTs abertas: severidade, status e prazo
    const _otsAbertasRows = (lista) => lista.slice().sort(_porSev).map(o => ({
      cells: [_esc(o.numero), _esc(o.titulo||'—'), _otivoInfo(o), _otTipoLabel(o.tipo),
              `<span class="hkm-badge hkm-sev-${o.severidade}">${_sevLabel(o.severidade)}</span>`,
              `<span class="hkm-badge hkm-st-${o.status}">${_otStLabel(o.status)}</span>`,
              o.prazo ? _fmtDate(o.prazo) : '—'],
      fn: _fn(`otOpenView('${o.id}')`),
    }));
    const _colsAbertas = ['Nº', 'Título', 'Ativo / Unidade · Setor', 'Tipo', 'Severidade', 'Status', 'Prazo'];
    const _tarefaAtivo = (t) => {
      const a = t.equipamentoIdx != null ? state?.ativos[t.equipamentoIdx] : null;
      const r = state?.rotinas?.find(x => x.id === t.rotinaId);
      return a ? `${_esc(a.nome)}<small>${_esc(_orgRotuloAtivo(a))}</small>` : _esc(_rotuloSetorItem(null, r) || '—');
    };

    // Wrapper: fecha o modal KPI antes de abrir o detalhe
    const _fn = (expr) => `homeCloseKPI();${expr}`;

    switch (tipo) {

      case 'otsAtraso':
        return { titulo: 'OTs com Atraso', cols: ['Nº', 'Título', 'Ativo / Unidade · Setor', 'Tipo', 'Prazo', 'Atraso'],
          rows: (k.otsAtrasoList || [])
            .sort((a, b) => (a.prazo || '').localeCompare(b.prazo || ''))
            .map(o => {
              const d = new Date(o.prazo + 'T00:00:00');
              const dias = Math.ceil((hoje - d) / 86400000);
              return {
                cells: [_esc(o.numero), _esc(o.titulo||'—'), _otivoInfo(o),
                        _otTipoLabel(o.tipo), _fmtDate(o.prazo),
                        `<span class="hkm-badge hkm-danger">${dias}d de atraso</span>`],
                fn: _fn(`otOpenView('${o.id}')`),
              };
            }),
        };

      case 'otsServico':
        return { titulo: 'OTs de Serviço Abertas', cols: ['Nº', 'Título', 'Ativo / Unidade · Setor', 'Tipo', 'Status', 'Abertura'],
          rows: (k.otsServicoList || [])
            .sort((a, b) => (['critica','alta','media','baixa'].indexOf(a.severidade)) - (['critica','alta','media','baixa'].indexOf(b.severidade)))
            .map(o => ({
              cells: [_esc(o.numero), _esc(o.titulo||'—'), _otivoInfo(o),
                      _otTipoLabel(o.tipo),
                      `<span class="hkm-badge hkm-st-${o.status}">${_otStLabel(o.status)}</span>`,
                      _fmtDate((o.criadoEm||'').split('T')[0])],
              fn: _fn(`otOpenView('${o.id}')`),
            })),
        };

      case 'otConcluidas':
        return { titulo: 'OTs Concluídas no Período', cols: ['Nº', 'Título', 'Ativo / Unidade · Setor', 'Tipo', 'Abertura', 'Conclusão', 'Duração'],
          rows: k.otConcluidasList
            .sort((a, b) => _otDataConclusao(b).localeCompare(_otDataConclusao(a)))
            .map(o => {
              const ab = (o.criadoEm || '').split('T')[0];
              const dur = o.dataConclusao && ab ? `${Math.max(0, _diasEntre(ab, o.dataConclusao))}d` : '—';
              return {
                cells: [_esc(o.numero), _esc(o.titulo||'—'), _otivoInfo(o),
                        _otTipoLabel(o.tipo), _fmtDate(ab), _fmtDate(_otDataConclusao(o)), dur],
                fn: _fn(`otOpenView('${o.id}')`),
              };
            }),
        };

      case 'otsAbertas':
        return { titulo: 'OTs em Aberto', cols: _colsAbertas, rows: _otsAbertasRows(k.otsAbertasList) };

      case 'otsRevisao':
        return { titulo: 'OTs Aguardando Revisão', cols: _colsAbertas, rows: _otsAbertasRows(k.otsRevisaoList) };

      case 'otsPrioritarias':
        return { titulo: 'OTs Críticas e Altas em Aberto', cols: _colsAbertas, rows: _otsAbertasRows(k.otsPrioritariasList) };

      case 'otsParada':
        return { titulo: 'OTs que Causaram Parada', cols: ['Nº', 'Título', 'Ativo / Unidade · Setor', 'Parada em', 'Status'],
          rows: k.otsParadaList.map(o => ({
            cells: [_esc(o.numero), _esc(o.titulo||'—'), _otivoInfo(o), o.dataParada ? _fmtDate(o.dataParada) : '—',
                    `<span class="hkm-badge hkm-st-${o.status}">${_otStLabel(o.status)}</span>`],
            fn: _fn(`otOpenView('${o.id}')`),
          })),
        };

      case 'otsFalha':
        return { titulo: 'OTs com Falha de Ativo', cols: ['Nº', 'Título', 'Ativo / Unidade · Setor', 'Tipo de Falha', 'Severidade', 'Status', 'Abertura'],
          rows: (k.otsFalhaList || []).map(o => ({
            cells: [_esc(o.numero), _esc(o.titulo||'—'), _otivoInfo(o),
                    _esc(o.tipoFalha||'—'),
                    `<span class="hkm-badge hkm-sev-${o.severidade}">${_sevLabel(o.severidade)}</span>`,
                    `<span class="hkm-badge hkm-st-${o.status}">${_otStLabel(o.status)}</span>`,
                    _fmtDate((o.criadoEm||'').split('T')[0])],
            fn: _fn(`otOpenView('${o.id}')`),
          })),
        };

      case 'otCorretivas':
        return { titulo: 'OTs Corretivas Abertas', cols: ['Nº', 'Título', 'Ativo / Unidade · Setor', 'Severidade', 'Status'],
          rows: k.ordensVis.filter(o => o.tipo === 'corretiva' && !['concluida','cancelada'].includes(o.status))
            .sort((a, b) => (['critica','alta','media','baixa'].indexOf(a.severidade)) - (['critica','alta','media','baixa'].indexOf(b.severidade)))
            .map(o => ({
              cells: [_esc(o.numero), _esc(o.titulo||'—'), _otivoInfo(o),
                      `<span class="hkm-badge hkm-sev-${o.severidade}">${_sevLabel(o.severidade)}</span>`,
                      `<span class="hkm-badge hkm-st-${o.status}">${_otStLabel(o.status)}</span>`],
              fn: _fn(`otOpenView('${o.id}')`),
            })),
        };

      case 'tarefasConcluidas':
        // Usa a lista já filtrada por setor+período do calcKPIs (mesmo conjunto que o contador do card)
        return { titulo: 'Tarefas Concluídas no Período', cols: ['Tarefa', 'Ativo / Unidade · Setor', 'Concluída em', 'Por'],
          rows: (k.execsPeriodoList || []).map(p => {
            const t = state?.tarefas?.find(x => x.id === p.tarefaId);
            const r = t ? state?.rotinas?.find(x => x.id === t.rotinaId) : null;
            return {
              cells: [_esc(t?.titulo || r?.nome || '—'), _tarefaAtivo(t || {}),
                      _fmtDateTime(p.dataPublicacao || ''), _esc(p.publicadoPorNome || '—')],
              fn: t ? _fn(`openTarefaDetalhe('${t.id}')`) : '',
            };
          }),
        };

      case 'tarefasAtrasadas':
        return { titulo: 'Tarefas com Atraso', cols: ['Tarefa', 'Ativo / Unidade · Setor', 'Vencimento', 'Atraso'],
          rows: k.tarefasAtrasadasList.map(t => {
            const due  = new Date(t.proximaData + 'T00:00:00');
            const dias = Math.ceil((hoje - due) / 86400000);
            return {
              cells: [_esc(t.titulo || state?.rotinas?.find(x => x.id === t.rotinaId)?.nome || '—'),
                      _tarefaAtivo(t),
                      _fmtDate(t.proximaData),
                      `<span class="hkm-badge hkm-danger">${dias}d de atraso</span>`],
              fn: _fn(`openTarefaDetalhe('${t.id}')`),
            };
          }),
        };

      case 'rotinasAtivas':
        return { titulo: 'Rotinas Ativas', cols: ['Nome', 'Ativo / Unidade · Setor', 'Tipo', 'Tarefas'],
          rows: (k.rotinasAtivasList || []).map(r => {
            const a = r.equipamentoIdx != null ? state?.ativos[r.equipamentoIdx] : null;
            const aInfo = a ? `${_esc(a.nome)}<small>${_esc(_orgRotuloAtivo(a))}</small>` : _esc(_rotuloSetorItem(null, r) || '—');
            const numTarefas = (k.tarefasVisList || []).filter(t => t.rotinaId === r.id).length;
            return {
              cells: [_esc(r.nome), aInfo, _esc(r.tipo), String(numTarefas)],
              fn: _fn(`viewRotina('${r.id}')`),
            };
          }),
        };

      case 'ativosEmUso':
        return {
          titulo: 'Ativos em Uso',
          cards: (k.ativosEmUsoList || []).map(a => {
            const idx = (state?.ativos || []).indexOf(a);
            const alertCounts = typeof getAtivoAlertCounts === 'function' ? getAtivoAlertCounts(idx) : { danger: 0, warning: 0, total: 0 };
            return { ativo: a, idx, tipo: 'em_uso', otsAssoc: [], alertCounts };
          }),
        };

      case 'ativosParados':
        return {
          titulo: 'Ativos Parados',
          cards: (k.ativosParadosList || []).map(a => {
            const idx = (state?.ativos || []).indexOf(a);
            const otsAssoc = (a.pausaOTs || []).map(id => {
              const ot = (typeof otState !== 'undefined' ? otState.ordens : []).find(o => o.id === id);
              return ot ? { numero: ot.numero || id, id: ot.id } : { numero: id, id };
            });
            return { ativo: a, idx, tipo: 'em_pausa', otsAssoc };
          }),
        };

      default: return { titulo: '', cols: [], rows: [] };
    }
  }

  // ── ÚLTIMAS PUBLICAÇÕES ──────────────────────────────────────
  function _renderUltimasPublicacoes() {
    const sessao = typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null;
    const userId = sessao?.userId;

    // Pool base: todas do setor filtrado, sem notificações
    const pool = (state?.publicacoes || [])
      .filter(p => {
        if (p.tipo === 'notificacao') return false;
        const t = state?.tarefas?.find(x => x.id === p.tarefaId);
        if (!t) return false;
        return _inSetor(_tarefaSetor(t));
      })
      .sort((a, b) => (b.dataPublicacao || '') > (a.dataPublicacao || '') ? 1 : -1);

    // Quando toggle ativo: filtra apenas do usuário logado
    const poolFiltrado = _hupMinhas && userId
      ? pool.filter(p => p.publicadoPorId === userId)
      : pool;

    const HUP_PER_PAGE  = 5;
    const HUP_MAX_PAGES = 10;
    const poolLimitado  = poolFiltrado.slice(0, HUP_PER_PAGE * HUP_MAX_PAGES);
    const totalPubs     = poolLimitado.length;
    const totalPages    = Math.max(1, Math.ceil(totalPubs / HUP_PER_PAGE));
    if (_hupPage >= totalPages) _hupPage = totalPages - 1;
    const pubs = poolLimitado.slice(_hupPage * HUP_PER_PAGE, (_hupPage + 1) * HUP_PER_PAGE);

    const btnLabel = _hupMinhas ? 'Todas' : 'Minhas Execuções';
    const btnIcon  = _hupMinhas
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    const header = `
      <div class="home-chart-header">
        <span class="home-chart-title">Últimas Publicações</span>
        <button class="hup-toggle-btn${_hupMinhas ? ' active' : ''}"
          onclick="homeToggleMinhas()" title="${_hupMinhas ? 'Ver todas' : 'Ver apenas minhas'}">
          ${btnIcon}
          ${btnLabel}
        </button>
      </div>`;

    if (pubs.length === 0) {
      return `<div class="home-chart-card">
        ${header}
        <div class="hup-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          <span>${_hupMinhas ? 'Você não tem execuções registradas' : 'Nenhuma execução registrada'}</span>
        </div>
      </div>`;
    }

    const items = pubs.map((p, idx) => {
      const t      = state?.tarefas?.find(x => x.id === p.tarefaId);
      const r      = t ? state?.rotinas?.find(x => x.id === t.rotinaId) : null;
      const a      = t?.equipamentoIdx != null ? state?.ativos[t.equipamentoIdx] : null;
      const nome   = _esc(t?.titulo || r?.nome || '—');
      const ativo  = a ? _esc(a.nome) : '—';
      const setor  = _esc(_rotuloSetorItem(a, r) || '—');
      const data   = _fmtDateTime(p.dataPublicacao || '');
      const por    = _esc(p.publicadoPorNome || '—');
      const fn     = `viewPublicacao('${p.id}')`;
      const iniciais = (p.publicadoPorNome || '?').split(' ')
        .filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
      const isMinha = userId && p.publicadoPorId === userId;
      const isLast  = idx === pubs.length - 1;

      return `<div class="hup-item${fn ? ' hup-item-click' : ''}${isLast ? ' hup-item-last' : ''}"
        ${fn ? `onclick="${fn}"` : ''}>
        <div class="hup-timeline">
          <div class="hup-dot${isMinha ? ' hup-dot-mine' : ''}"></div>
          ${isLast ? '' : '<div class="hup-line"></div>'}
        </div>
        <div class="hup-content">
          <div class="hup-row-top">
            <span class="hup-task-name">${nome}</span>
            <span class="hup-date">${data}</span>
          </div>
          <div class="hup-row-bot">
            <div class="hup-asset">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              ${ativo} <span class="hup-setor-tag">${setor}</span>
            </div>
            <div class="hup-author">
              <div class="hup-avatar${isMinha ? ' hup-avatar-mine' : ''}">${iniciais}</div>
              <span>${por}</span>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    const pageNums = totalPages > 1
      ? Array.from({ length: totalPages }, (_, i) =>
          `<button class="hup-page-btn${i === _hupPage ? ' hup-page-active' : ''}"
            onclick="homeHupPage(${i})" ${i === _hupPage ? 'disabled' : ''}>${i + 1}</button>`
        ).join('')
      : '';
    const pagination = totalPages > 1 ? `
      <div class="hup-pagination">
        <button class="hup-page-btn" onclick="homeHupPage(${_hupPage - 1})" ${_hupPage === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        ${pageNums}
        <button class="hup-page-btn" onclick="homeHupPage(${_hupPage + 1})" ${_hupPage >= totalPages - 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>` : '';

    return `<div class="home-chart-card">
      ${header}
      <div class="hup-feed">${items}</div>
      ${pagination}
    </div>`;
  }

  // ── MID CHARTS ───────────────────────────────────────────────
  function _renderFalhaAtivo(key, entry) {
    const tab = _falhaTabByAtivo[key] || 'falha';
    const tabs = [
      { id: 'falha',     label: 'Falha',     field: 'tipoFalha'   },
      { id: 'causa',     label: 'Causa',     field: 'causaRaiz'   },
      { id: 'deteccao',  label: 'Detecção',  field: 'metodoDetec' },
      { id: 'dano',      label: 'Dano',      field: 'tipoDano'    },
    ];
    const activeTab = tabs.find(t => t.id === tab) || tabs[0];

    // Contagem de valores para a aba ativa
    const counts = {};
    entry.ots.forEach(o => {
      const v = o[activeTab.field];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const items = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }));

    const colors = ['#e63946','#f4a261','#00a8cc','#2a9d8f','#7c3aed','#718096'];

    return `<div class="hfa-card">
      <div class="hfa-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px;flex-shrink:0;color:var(--cyan);"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <span class="hfa-ativo-nome">${_esc(entry.nome)}</span>
        <span class="hfa-count-badge">${entry.ots.length} OT${entry.ots.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="hfa-tabs">
        ${tabs.map(t => `<button class="hfa-tab${t.id === tab ? ' active' : ''}"
          onclick="homeFalhaSetTab('${key}','${t.id}')">${t.label}</button>`).join('')}
      </div>
      <div class="hfa-body">
        ${items.length === 0
          ? `<div class="hfa-empty">Sem dados para esta categoria</div>`
          : items.map((it, i) => `
          <div class="hfa-row">
            <div class="hfa-row-label" title="${it.label}">${it.label}</div>
            <div class="hfa-row-right">
              <div class="hfa-row-bar-wrap">
                <div class="hfa-row-bar" style="width:${it.pct}%;background:${colors[i % colors.length]};"></div>
              </div>
              <div class="hfa-row-stat"><span class="hfa-row-qty">${it.value}</span><span class="hfa-row-pct">${it.pct}%</span></div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }

  window.homeFalhaSetTab = function (key, tab) {
    _falhaTabByAtivo[key] = tab;
    renderHome();
  };

  window.homeFalhaPage = function (page) {
    _falhaPage = page;
    renderHome();
  };

  function _renderFalhaCard(k) {
    const entries = Object.entries(k.otsFalhaByAtivo).sort((a, b) => b[1].ots.length - a[1].ots.length);

    const HFA_PER_PAGE  = 3;
    const hfaTotalPages = Math.max(1, Math.ceil(entries.length / HFA_PER_PAGE));
    if (_falhaPage >= hfaTotalPages) _falhaPage = hfaTotalPages - 1;
    const entriesPage   = entries.slice(_falhaPage * HFA_PER_PAGE, (_falhaPage + 1) * HFA_PER_PAGE);

    const hfaPageNums = hfaTotalPages > 1
      ? Array.from({ length: hfaTotalPages }, (_, i) =>
          `<button class="hup-page-btn${i === _falhaPage ? ' hup-page-active' : ''}"
            onclick="homeFalhaPage(${i})" ${i === _falhaPage ? 'disabled' : ''}>${i + 1}</button>`
        ).join('')
      : '';
    const hfaPagination = hfaTotalPages > 1 ? `
      <div class="hup-pagination" style="border-top:1px solid var(--border);padding:8px 16px 14px;">
        <button class="hup-page-btn" onclick="homeFalhaPage(${_falhaPage - 1})" ${_falhaPage === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        ${hfaPageNums}
        <button class="hup-page-btn" onclick="homeFalhaPage(${_falhaPage + 1})" ${_falhaPage >= hfaTotalPages - 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>` : '';

    return `<div class="home-chart-card home-falha-card">
        <div class="home-chart-header">
          <span class="home-chart-title">Falhas por ativo</span>
          <span class="home-chart-badge" title="OTs corretivas em que o ativo falhou">${k.otsFalhaTotal}</span>
        </div>
        <div class="home-chart-body home-falha-body">
          ${entries.length === 0
            ? `<div class="home-chart-empty">${_ico.chart}<span>Nenhuma falha de ativo no período</span></div>`
            : `<div class="hfa-grid">${entriesPage.map(([key, entry]) => _renderFalhaAtivo(key, entry)).join('')}</div>`}
        </div>
        ${hfaPagination}
      </div>`;
  }

  // ── LISTAS DE PENDÊNCIAS (tarefas vencidas/próximas e OTs em aberto) ──
  function _listasPendentes(k) {
    const hoje = _hoje();

    // Lista de tarefas: vencidas primeiro, depois próximas
    const tarefaItems = [];

    k.tarefasAtrasadasList.forEach(t => {
      const rotina = state?.rotinas?.find(r => r.id === t.rotinaId);
      const ativo  = t.equipamentoIdx != null ? state?.ativos[t.equipamentoIdx] : null;
      const due    = new Date(t.proximaData + 'T00:00:00');
      const dias   = Math.ceil((hoje - due) / 86400000);
      tarefaItems.push({
        id:     t.id,
        titulo: t.titulo || rotina?.nome || 'Tarefa',
        meta:   ativo ? `${ativo.nome} · ${_orgRotuloAtivo(ativo)}` : (_rotuloSetorItem(null, rotina) || '—'),
        badge:  `${dias}d atraso`,
        bCls:   'notif-badge-red',
        dot:    '#e63946',
        dias,
        tipo:   'atraso',
      });
    });

    k.tarefasProximasList.forEach(t => {
      const rotina = state?.rotinas?.find(r => r.id === t.rotinaId);
      const ativo  = t.equipamentoIdx != null ? state?.ativos[t.equipamentoIdx] : null;
      const due    = new Date(t.proximaData + 'T00:00:00');
      const dias   = Math.ceil((due - hoje) / 86400000);
      tarefaItems.push({
        id:     t.id,
        titulo: t.titulo || rotina?.nome || 'Tarefa',
        meta:   ativo ? `${ativo.nome} · ${_orgRotuloAtivo(ativo)}` : (_rotuloSetorItem(null, rotina) || '—'),
        badge:  dias === 0 ? 'Hoje' : `${dias}d restante${dias !== 1 ? 's' : ''}`,
        bCls:   dias === 0 ? 'notif-badge-red' : 'notif-badge-amber',
        dot:    dias === 0 ? '#e63946' : '#f4a261',
        dias,
        tipo:   'proxima',
      });
    });

    // Lista de OTs abertas: vencidas primeiro, depois as que estão no aviso de prazo, depois severidade
    const sevOrd = { critica: 0, alta: 1, media: 2, baixa: 3 };
    const stCfg = {
      pendente:    { label: 'Pendente',    cls: 'notif-badge-gray'  },
      em_processo: { label: 'Em Processo', cls: 'notif-badge-blue'  },
      em_revisao:  { label: 'Em Revisão',  cls: 'notif-badge-amber' },
    };
    const sevDot = { critica: '#e63946', alta: '#f4a261', media: '#00a8cc', baixa: '#2a9d8f' };
    const otItems = k.otsAbertasList
      .map(ot => {
        const sc = stCfg[ot.status] || { label: ot.status, cls: 'notif-badge-gray' };

        // Flag de prazo (urg: 0 vencida/hoje, 1 dentro do aviso, 2 sem urgência)
        let prazoBadge = '', urg = 2, diffP = Infinity;
        if (ot.prazo) {
          diffP = Math.ceil((new Date(ot.prazo + 'T00:00:00') - hoje) / 86400000);
          let alertLimit = null;
          if (ot.prazoAlertaDias !== undefined && ot.prazoAlertaDias !== null) {
            const parsed = parseInt(ot.prazoAlertaDias, 10);
            if (!Number.isNaN(parsed) && parsed >= 0) alertLimit = parsed;
          }
          if (diffP < 0) {
            prazoBadge = `<span class="home-notif-badge notif-badge-red">Vencida ${Math.abs(diffP)}d</span>`; urg = 0;
          } else if (diffP === 0) {
            prazoBadge = `<span class="home-notif-badge notif-badge-red">Vence hoje</span>`; urg = 0;
          } else if (alertLimit !== null && diffP <= alertLimit) {
            prazoBadge = `<span class="home-notif-badge notif-badge-amber">${diffP}d restante${diffP !== 1 ? 's' : ''}</span>`; urg = 1;
          }
        }

        const m = _otAtivoMeta(ot);
        const resp = ot.responsavelNome || 'Sem responsável';
        return {
          id:     ot.id,
          num:    ot.numero || '',
          titulo: ot.titulo || ot.numero || 'OT',
          meta:   m.nome ? `${m.nome} · ${m.rotulo}` : m.rotulo,
          meta2:  ot.terceirizado && ot.empresa ? `${resp} · ${ot.empresa}` : resp,
          badge:  sc.label,
          bCls:   sc.cls,
          dot:    sevDot[ot.severidade] || '#718096',
          prazoBadge, urg, diffP,
          sev:    sevOrd[ot.severidade] ?? 9,
        };
      })
      .sort((a, b) => a.urg - b.urg || a.diffP - b.diffP || a.sev - b.sev);


    // Dados já chegam filtrados por _homeOnlyMine via calcKPIs
    const tarefaItemsVis = tarefaItems;
    const otItemsVis     = otItems;

    const cntT = tarefaItemsVis.length;
    const cntO = otItemsVis.length;

    const _tarefaList = cntT === 0
      ? `<div class="home-notif-empty">
           ${_ico.ok}
           <span>${_homeOnlyMine ? 'Nenhuma tarefa atribuída a você' : 'Sem tarefas pendentes'}</span>
         </div>`
      : tarefaItemsVis.map(it =>
          `<div class="home-notif-item"
            onclick="openPublicarModalDireto('${it.id}')">
            <div class="home-notif-dot" style="background:${it.dot}"></div>
            <div class="home-notif-content">
              <div class="home-notif-title">${_esc(it.titulo)}</div>
              <div class="home-notif-meta">${_esc(it.meta)}</div>
            </div>
            <span class="home-notif-badge ${it.bCls}">${it.badge}</span>
          </div>`).join('');

    const _otList = cntO === 0
      ? `<div class="home-notif-empty">
           ${_ico.ok}
           <span>${_homeOnlyMine ? 'Nenhuma OT atribuída a você' : 'Sem OTs em aberto'}</span>
         </div>`
      : otItemsVis.map(it =>
          `<div class="home-notif-item"
            onclick="otOpenView('${it.id}')">
            <div class="home-notif-dot" style="background:${it.dot}"></div>
            <div class="home-notif-content">
              <div class="home-notif-title">${_esc(it.num)} — ${_esc(it.titulo)}</div>
              <div class="home-notif-meta">${_esc(it.meta)}</div>
              <div class="home-notif-meta home-notif-resp">${_esc(it.meta2)}</div>
            </div>
            <div class="home-notif-badges">
              <span class="home-notif-badge ${it.bCls}">${it.badge}</span>
              ${it.prazoBadge}
            </div>
          </div>`).join('');

    return { tarefas: _tarefaList, ots: _otList, cntT, cntO };
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── DONUT OT STATUS ──────────────────────────────────────────
  function _renderDonutOT(k) {
    const segs = [
      { label: 'Pendentes',   value: k.otByStatus.pendente    || 0, color: '#718096' },
      { label: 'Em Processo', value: k.otByStatus.em_processo || 0, color: '#00a8cc' },
      { label: 'Em Revisão',  value: k.otByStatus.em_revisao  || 0, color: '#f4a261' },
      { label: 'Concluídas',  value: k.otByStatus.concluida   || 0, color: '#2a9d8f' },
      { label: 'Canceladas',  value: k.otByStatus.cancelada   || 0, color: '#e63946' },
    ];
    const total = segs.reduce((s, g) => s + g.value, 0);
    return `
      <div class="home-chart-card">
        <div class="home-chart-header">
          <span class="home-chart-title">Status das OTs</span>
          <span class="home-chart-sub">abertas no período</span>
        </div>
        <div class="home-donut-wrap">
          ${_donutChart(segs)}
          <div class="home-donut-center">${total}</div>
        </div>
        <div class="home-legend">
          ${segs.map(s => `
            <div class="home-legend-item">
              <span class="home-legend-dot" style="background:${s.color}"></span>
              <span class="home-legend-label">${s.label}</span>
              <span class="home-legend-num">${s.value}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── DONUT OT TIPOS ───────────────────────────────────────────
  function _renderDonutTipos(k) {
    const cfg = {
      corretiva:   { label: 'Corretiva',   color: '#e63946' },
      implantacao: { label: 'Implantação', color: '#7c3aed' },
      melhoria:    { label: 'Melhoria',    color: '#00a8cc' },
      alteracao:   { label: 'Alteração',   color: '#f4a261' },
    };
    const segs = Object.entries(k.otByTipo).map(([tp, v]) => ({
      label: cfg[tp]?.label || tp, value: v, color: cfg[tp]?.color || '#718096',
    }));
    const total = segs.reduce((s, g) => s + g.value, 0);
    return `
      <div class="home-chart-card">
        <div class="home-chart-header">
          <span class="home-chart-title">Tipos de OT</span>
          <span class="home-chart-sub">abertas no período</span>
        </div>
        <div class="home-donut-wrap">
          ${_donutChart(segs)}
          <div class="home-donut-center">${total}</div>
        </div>
        <div class="home-legend">
          ${segs.map(s => `
            <div class="home-legend-item">
              <span class="home-legend-dot" style="background:${s.color}"></span>
              <span class="home-legend-label">${s.label}</span>
              <span class="home-legend-num">${s.value}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── INICIALIZAÇÃO ─────────────────────────────────────────────
  function initHome() {
    _hf.per = { modo: 'geral' };
    _initPeriodo();
    renderHome();
  }

  // ── API PÚBLICA ───────────────────────────────────────────────
  window.initHome   = initHome;
  window.renderHome = renderHome;

  window.homeToggleMine = function () {
    _homeOnlyMine = !_homeOnlyMine;
    renderHome();
  };

  window.homeSetAba = function (aba) {
    _homeAba = aba;
    try { localStorage.setItem('home-aba', aba); } catch (e) { /* sem armazenamento: só não lembra */ }
    renderHome();
  };

  // ── MODAL KPI PÚBLICO ────────────────────────────────────────
  function _renderAtivoCard(card) {
    const { ativo: a, idx, tipo, otsAssoc, alertCounts } = card;
    const initials = (a.nome || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    const isParado = tipo === 'em_pausa';
    const stripeClass = isParado ? 'stripe-amber' : (alertCounts?.danger > 0 ? 'stripe-red' : alertCounts?.warning > 0 ? 'stripe-amber' : 'stripe-green');
    const avClass    = isParado ? 'av-amber'  : 'av-green';
    const sbClass    = isParado ? 'sb-amber'  : 'sb-green';
    const sbLabel    = isParado ? 'Parado'    : 'Em Uso';
    const sbIcon     = isParado
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const clickFn = idx >= 0 ? `homeCloseKPI();visualizarAtivo(${idx})` : '';

    // Ícones de alerta ao lado do badge "Em Uso"
    let alertIcons = '';
    if (!isParado && alertCounts && alertCounts.total > 0) {
      const _alertChip = (count, color, bg, border, hoverBg, svgPath, tipText) =>
        `<span title="${tipText}" onclick="event.stopPropagation();homeCloseKPI();visualizarAtivo(${idx})"
          onmouseenter="this.style.background='${hoverBg}';this.style.transform='scale(1.08)'"
          onmouseleave="this.style.background='${bg}';this.style.transform='scale(1)'"
          style="display:inline-flex;align-items:center;gap:4px;padding:3px 7px 3px 5px;background:${bg};border:1px solid ${border};border-radius:20px;color:${color};font-size:10px;font-weight:700;cursor:pointer;transition:all .15s;user-select:none;line-height:1;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;flex-shrink:0;">${svgPath}</svg>
          ${count}
        </span>`;
      if (alertCounts.danger > 0)
        alertIcons += _alertChip(
          alertCounts.danger,
          '#e63946', 'rgba(230,57,70,0.13)', 'rgba(230,57,70,0.35)', 'rgba(230,57,70,0.22)',
          `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
          `${alertCounts.danger} atividade${alertCounts.danger !== 1 ? 's' : ''} vencida${alertCounts.danger !== 1 ? 's' : ''}`
        );
      if (alertCounts.warning > 0)
        alertIcons += _alertChip(
          alertCounts.warning,
          '#f4a261', 'rgba(244,162,97,0.13)', 'rgba(244,162,97,0.35)', 'rgba(244,162,97,0.22)',
          `<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
          `${alertCounts.warning} atividade${alertCounts.warning !== 1 ? 's' : ''} no prazo`
        );
    }
    const alertBlock = '';

    const dv = (v) => v && v !== '-' && v !== '—'
      ? `<div class="hkm-ac-dv">${_esc(v)}</div>`
      : `<div class="hkm-ac-dv dv-muted">—</div>`;

    const otsBlock = isParado && otsAssoc.length > 0
      ? `<div class="hkm-ac-footer">
          <div class="hkm-ac-ots">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
            OTs: <strong>${otsAssoc.map(o => _esc(o.numero)).join(', ')}</strong>
          </div>
          ${clickFn ? `<div class="hkm-ac-open-btn">Ver ativo <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></div>` : ''}
        </div>`
      : clickFn
        ? `<div class="hkm-ac-footer">
            <div></div>
            <div class="hkm-ac-open-btn">Ver ativo <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></div>
          </div>`
        : '';

    return `<div class="hkm-asset-card" ${clickFn ? `onclick="${clickFn}"` : ''}>
      <div class="hkm-ac-stripe ${stripeClass}"></div>
      <div class="hkm-ac-top">
        <div class="hkm-ac-avatar ${avClass}">${initials}</div>
        <div class="hkm-ac-info">
          <div class="hkm-ac-name" title="${_esc(a.nome)}">${_esc(a.nome)}</div>
          ${a.codigo ? `<div class="hkm-ac-code">${_esc(a.codigo)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
          ${alertIcons}
          <div class="hkm-ac-status-badge ${sbClass}">${sbIcon}${sbLabel}</div>
        </div>
      </div>
      <div class="hkm-ac-meta">
        ${a.setor ? `<span class="hkm-ac-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>${_esc(_orgRotuloAtivo(a))}</span>` : ''}
        ${a.categoria ? `<span class="hkm-ac-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>${_esc(a.categoria)}</span>` : ''}
      </div>
      <div class="hkm-ac-details">
        <div class="hkm-ac-detail-item">
          <div class="hkm-ac-dl">Marca</div>
          ${dv(a.marca)}
        </div>
        <div class="hkm-ac-detail-item">
          <div class="hkm-ac-dl">Modelo</div>
          ${dv(a.modelo)}
        </div>
        <div class="hkm-ac-detail-item">
          <div class="hkm-ac-dl">Nº de Série</div>
          ${dv(a.serie)}
        </div>
      </div>
      ${alertBlock}
      ${otsBlock}
    </div>`;
  }

  function _renderKpiCards(cards) {
    const body = document.getElementById('hkm-body');
    const n = cards.length;
    document.getElementById('hkm-count').textContent = `${n} ativo${n !== 1 ? 's' : ''}`;
    if (n === 0) {
      body.innerHTML = `<div class="hkm-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>Nenhum ativo encontrado</span>
      </div>`;
      return;
    }
    const totalPages = Math.max(1, Math.ceil(n / KPI_CARDS_PER_PAGE));
    if (_kpiCardPage >= totalPages) _kpiCardPage = totalPages - 1;
    const page = cards.slice(_kpiCardPage * KPI_CARDS_PER_PAGE, (_kpiCardPage + 1) * KPI_CARDS_PER_PAGE);

    const pagination = totalPages > 1 ? `
      <div class="hkm-pagination">
        <button class="hkm-pg-btn" onclick="homeKpiPrevPage()" ${_kpiCardPage === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="hkm-pg-info">${_kpiCardPage + 1} / ${totalPages}</span>
        <button class="hkm-pg-btn" onclick="homeKpiNextPage()" ${_kpiCardPage >= totalPages - 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>` : '';

    body.innerHTML = `<div class="hkm-asset-grid">${page.map(_renderAtivoCard).join('')}</div>${pagination}`;
  }

  window.homeKpiPrevPage = function () {
    if (_kpiCardPage > 0) { _kpiCardPage--; _refreshKpiModal(); }
  };
  window.homeKpiNextPage = function () {
    _kpiCardPage++;
    _refreshKpiModal();
  };
  function _refreshKpiModal() {
    const k = calcKPIs();
    const data = _buildKPIData(_kpiCardTipo, k);
    if (data.cards) _renderKpiCards(data.cards);
  }

  window.homeOpenKPI = function (tipo) {
    _ensureKPIModal();
    _kpiCardTipo = tipo;
    _kpiCardPage = 0;
    const k = calcKPIs();
    const data = _buildKPIData(tipo, k);

    // Aplicar tema de cor ao box
    const box = document.querySelector('#home-kpi-modal .hkm-box');
    const t = _kpiTheme[tipo] || { theme: 'default', ico: ic => ic.chart };
    box.className = `hkm-box hkm-theme-${t.theme}`;
    document.getElementById('hkm-icon').innerHTML = t.ico(_ico);

    document.getElementById('hkm-title').textContent = data.titulo;

    // Botão "Tipo": só aparece para rotinasAtivas
    const tipoWrap = document.getElementById('hkm-tipo-wrap');
    if (tipoWrap) {
      tipoWrap.style.display = tipo === 'rotinasAtivas' ? '' : 'none';
      if (tipo === 'rotinasAtivas') {
        _kpiRotinasTipo = '';
        const lbl = document.getElementById('hkm-tipo-label');
        const btn = document.getElementById('hkm-tipo-btn');
        if (lbl) lbl.textContent = 'Tipo';
        if (btn) btn.classList.remove('active');
        _hkmPopularTipoPop();
      }
    }

    if (tipo === 'rotinasAtivas') {
      _hkmRenderRotinasAtivas();
      document.getElementById('home-kpi-modal').classList.add('open');
      return;
    }

    const body = document.getElementById('hkm-body');
    if (data.cards) {
      _renderKpiCards(data.cards);
    } else {
      const n = (data.rows || []).length;
      document.getElementById('hkm-count').textContent = `${n} item${n !== 1 ? 's' : ''}`;
      if (n === 0) {
        body.innerHTML = `<div class="hkm-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>Nenhum item encontrado</span>
        </div>`;
      } else {
        body.innerHTML = `<table class="hkm-table">
          <thead><tr>${data.cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody>
            ${data.rows.map(r =>
              `<tr ${r.fn ? `onclick="${r.fn}" class="hkm-clickable"` : ''}>
                ${r.cells.map(c => `<td>${c}</td>`).join('')}
              </tr>`
            ).join('')}
          </tbody>
        </table>`;
      }
    }

    document.getElementById('home-kpi-modal').classList.add('open');
  };

  window.homeCloseKPI = function () {
    document.getElementById('home-kpi-modal')?.classList.remove('open');
  };

  window.homeToggleMinhas = function () {
    _hupMinhas = !_hupMinhas;
    _hupPage = 0;
    renderHome();
  };

  window.homeHupPage = function (page) {
    _hupPage = page;
    renderHome();
  };

})();
