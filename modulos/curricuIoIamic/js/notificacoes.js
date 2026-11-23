// ===== Sino de notificações: equipe incompleta + cobertura reduzida =====
//
// Antes esses alertas eram cards fixos no topo do Dashboard — competiam por espaço
// com os KPIs e empurravam os gráficos para baixo quando havia várias unidades em
// alerta. Agora vivem no sino do topbar: contagem no badge, detalhe completo no clique.
// O cálculo (diagnosticoUnidade/diagnosticoCobertura) não mudou, só o container visual.

const notifState = { alertas: [], coberturas: [], asos: [], bancos: [], decimos: [], ferias: [], aprendizes: [], cargos: [] };

// Os atalhos do sino (transferir, lançar ASO, quitar 13º) abrem formulários que vivem na
// aba Lançamentos e leem de lancState. Fora dessa aba lancState pode estar vazio — carrega
// aqui, reaproveitando o que o sino já buscou quando possível.
async function ensureLancFuncBase() {
    if (!lancState.unidades.length) lancState.unidades = await DB.getAll(PATHS.unidades);
    if (!lancState.cargos.length) lancState.cargos = notifState.cargos.length ? notifState.cargos : await DB.getAll(PATHS.cargos);
    if (!lancState.funcionarios.length) lancState.funcionarios = await DB.getAll(PATHS.funcionarios);
}

// Chamado pelo Dashboard (reaproveita o payload já buscado) ou, na ausência de um,
// busca o mínimo necessário sozinho — assim o sino funciona mesmo antes de entrar no Dashboard.
async function refreshNotificacoes(dadosOpt) {
    const dados = dadosOpt || await (async () => {
        const [funcionarios, unidades, ausencias, cargos] = await Promise.all([
            DB.getAll(PATHS.funcionarios), DB.getAll(PATHS.unidades), DB.getAll(PATHS.ausencias), DB.getAll(PATHS.cargos)
        ]);
        return { funcionarios, unidades, ausencias, cargos };
    })();

    // ASOs e banco de horas não vêm no payload do Dashboard (que não usa esses dados) —
    // busca só o que faltar.
    const asos = dados.asos || await DB.getAll(PATHS.asos);
    const [banco, bhFechs, bhQuits] = dados.banco
        ? [dados.banco, dados.bhFechamentos || [], dados.bhQuitacoes || []]
        : await Promise.all([DB.getObj(PATHS.bancoHoras), DB.getAll(PATHS.bancoHorasFechamentos), DB.getAll(PATHS.bancoHorasQuitacoes)]);

    notifState.alertas = dados.unidades.map(u => diagnosticoUnidade(u, dados.funcionarios)).filter(Boolean);
    notifState.coberturas = dados.unidades.map(u => diagnosticoCobertura(u, dados.funcionarios, dados.ausencias)).filter(Boolean);
    notifState.asos = dados.unidades.map(u => diagnosticoAso(u, dados.funcionarios, asos, dados.cargos)).filter(Boolean);
    // `dados.cargos` entra no banco de horas por causa do aprendiz: sem os cargos, o diagnóstico
    // não sabe de quem a compensação é vedada (art. 432) e cobraria ciclo de quem não tem banco.
    notifState.bancos = dados.unidades.map(u => diagnosticoBh(u, dados.funcionarios, banco || {}, bhFechs, null, bhQuits, dados.cargos)).filter(Boolean);
    notifState.ferias = dados.unidades.map(u => diagnosticoFerias(u, dados.funcionarios, dados.ausencias)).filter(Boolean);
    notifState.aprendizes = dados.unidades.map(u => diagnosticoAprendiz(u, dados.funcionarios, dados.cargos)).filter(Boolean);

    // 13º: prazo legal com multa administrativa (Lei 4.749 art. 2º). O contexto lê as mesmas
    // fontes da aba — inclusive o adiantamento pago nas férias, senão quem já adiantou seria
    // cobrado de novo pelo sino.
    const [decimos, cargos13, params13] = await Promise.all([
        dados.decimos ? Promise.resolve(dados.decimos) : DB.getAll(PATHS.decimos),
        Promise.resolve(dados.cargos || []),
        dados.params ? Promise.resolve(dados.params) : DB.getObj(PATHS.parametros)
    ]);
    const ctx13 = {
        funcionarios: dados.funcionarios, cargos: cargos13, ausencias: dados.ausencias,
        demissoes: dados.demissoes || await DB.getAll(PATHS.demissoes),
        decimos, params: params13 || {},
        // Âncora do 13º (ver anoAncoraFolha, utils.js) — sem isto o sino alertaria sobre
        // competências de anos anteriores à empresa aderir ao sistema, para funcionários
        // cadastrados com admissão retroativa.
        folha: dados.folha || await DB.getObj(PATHS.folha),
        // A média de HE exige as fontes do banco; o sino não as tem sempre. Sem ela o valor
        // sai um pouco menor — aceitável aqui: o sino alerta sobre PRAZO, e o valor exato
        // está na aba. Nunca o contrário: um sino que não abre é pior que um valor redondo.
        mediaHe13: () => 0
    };
    notifState.decimos = dados.unidades.map(u => diagnosticoDecimo(u, dados.funcionarios, ctx13)).filter(Boolean);
    notifState.cargos = dados.cargos || [];
    renderBellIcon();
}

function renderBellIcon() {
    const box = document.getElementById('topbarActions');
    if (!box) return;
    const total = notifState.alertas.length + notifState.coberturas.length + notifState.asos.length
        + notifState.bancos.length + notifState.decimos.length + notifState.ferias.length
        + notifState.aprendizes.length;

    let btn = box.querySelector('#btnSino');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'bell-btn';
        btn.id = 'btnSino';
        btn.title = 'Notificações';
        btn.onclick = abrirNotificacoes;
        box.insertBefore(btn, box.firstChild);
    }
    btn.innerHTML = `${icon('bell')}${total ? `<span class="bell-badge">${total > 9 ? '9+' : total}</span>` : ''}`;
    btn.classList.toggle('has-alert', total > 0);
}

// Lista simples: uma linha por notificação (unidade + resumo curto). O detalhe completo
// só aparece no clique — a lista em si precisa ser lida de relance, não estudada.
function abrirNotificacoes() {
    closePopover();
    const { alertas, coberturas, asos, bancos, decimos, ferias, aprendizes } = notifState;
    const btn = document.getElementById('btnSino');
    if (!btn) return;

    // Ordem = custo de ignorar. ASO vencido é autuação e afastamento imediato; 13º e banco de
    // horas vencidos são dinheiro devido com data legal; quadro incompleto é problema de
    // operação. O 13º entra logo após o ASO nos meses de prazo: ao contrário do banco, a data
    // é a mesma para a empresa inteira, e perdê-la é multa administrativa de uma vez só.
    const linhas = [
        ...asos.map(a => ({ tipo: 'aso', item: a,
            resumo: [
                a.vencidos ? `${a.vencidos} vencido(s)` : '',
                a.semHistorico ? `${a.semHistorico} sem ASO` : '',
                a.criticos ? `${a.criticos} vencendo` : ''
            ].filter(Boolean).join(' · ') })),
        ...ferias.map(f => ({ tipo: 'ferias', item: f,
            resumo: [
                f.vencidas ? `${f.vencidas} vencida(s)` : '',
                f.criticas ? `${f.criticas} a vencer` : ''
            ].filter(Boolean).join(' · ') })),
        ...decimos.map(d => ({ tipo: 'decimo', item: d,
            resumo: [
                d.vencidos ? `${d.vencidos} parcela(s) vencida(s)` : '',
                d.rescisoes ? `${d.rescisoes} rescisão(ões) a pagar` : '',
                d.criticos ? `${d.criticos} a vencer` : ''
            ].filter(Boolean).join(' · ') })),
        // Aprendizagem vem logo depois do 13º: o termo do contrato é data legal como as outras,
        // e perdê-la converte o vínculo em prazo indeterminado — dano maior que um ciclo de
        // banco vencido, e irreversível sem acordo.
        ...aprendizes.map(a => ({ tipo: 'aprendiz', item: a,
            resumo: [
                a.vencidos ? `${a.vencidos} contrato(s) vencido(s)` : '',
                a.criticos ? `${a.criticos} terminando` : ''
            ].filter(Boolean).join(' · ') })),
        ...bancos.map(b => ({ tipo: 'banco', item: b,
            resumo: [
                b.vencidos ? `${b.vencidos} ciclo(s) vencido(s)` : '',
                b.criticos ? `${b.criticos} fechando` : '',
                b.atencao ? `${b.atencao} com saldo alto` : ''
            ].filter(Boolean).join(' · ') })),
        ...alertas.map(a => ({ tipo: 'alerta', item: a,
            resumo: a.modo === 'cargo' ? `${a.cargos.length} cargo(s) abaixo do quadro` : `Faltam ${a.faltam}` })),
        ...coberturas.map(c => ({ tipo: 'cobertura', item: c,
            resumo: `${c.retornos.length} em férias · ${c.cargos.reduce((s, x) => s + x.gap, 0)} vaga(s) descoberta(s)` }))
    ];

    // Rótulo da categoria: o nome da unidade se repete entre linhas (ASO, férias, 13º da
    // mesma unidade viram cards separados), então sem isto a lista fica ambígua — "Matriz —
    // Centro" sozinho não diz do que se trata.
    const NOTIF_TIPO_LABEL = {
        aso: 'ASO', ferias: 'Férias', decimo: '13º salário', banco: 'Banco de horas',
        aprendiz: 'Aprendizagem', alerta: 'Quadro', cobertura: 'Cobertura'
    };
    const tipoIco = tipo => tipo === 'cobertura' || tipo === 'ferias' ? 'sun'
        : tipo === 'aso' ? 'medical' : tipo === 'banco' ? 'clock' : tipo === 'decimo' ? 'gift'
        : tipo === 'aprendiz' ? 'briefcase' : 'alert';
    const tipoIcoCls = tipo => `alert-ico-sm${['cobertura', 'ferias'].includes(tipo) ? ' alert-ico-sm-ferias' : ''}${tipo === 'aso' ? ' alert-ico-sm-aso' : ''}${tipo === 'banco' ? ' alert-ico-sm-bh' : ''}${tipo === 'decimo' ? ' alert-ico-sm-decimo' : ''}${tipo === 'aprendiz' ? ' alert-ico-sm-aprendiz' : ''}`;

    // Agrupa por categoria — muitas unidades com ASO vencido antes viravam muitas linhas
    // idênticas na primeira leitura; agora é um card por categoria, e a lista de unidades
    // só aparece se o RH pedir (clique), igual ao motivo de o detalhe já ser sob demanda.
    // Quantidade "de pessoas/itens" por categoria — a unidade sozinha não diz o tamanho do
    // problema (1 unidade com 30 ASOs vencidos é bem diferente de 1 com 2). Cada diagnóstico
    // já lista os afetados em `pessoas`; alerta/cobertura não têm pessoa (são vaga de cargo),
    // usa o que tiverem de mais próximo.
    const QTD_LABEL = { aso: 'pendências', ferias: 'pendências', decimo: 'pendências', banco: 'pendências', aprendiz: 'pendências', alerta: 'pendências', cobertura: 'pendências' };
    const itemQtd = l => l.item.pessoas ? l.item.pessoas.length
        : l.tipo === 'alerta' ? (l.item.modo === 'cargo' ? l.item.cargos.reduce((s, x) => s + x.faltam, 0) : l.item.faltam)
        : l.tipo === 'cobertura' ? l.item.cargos.reduce((s, x) => s + x.gap, 0)
        : 0;

    const grupos = [];
    const porTipo = new Map();
    linhas.forEach((l, i) => {
        if (!porTipo.has(l.tipo)) { porTipo.set(l.tipo, grupos.length); grupos.push({ tipo: l.tipo, itens: [] }); }
        grupos[porTipo.get(l.tipo)].itens.push({ ...l, i });
    });

    const pop = document.createElement('div');
    pop.className = 'popover pop-notif';
    pop.innerHTML = !linhas.length
        ? `<div class="pop-notif-empty">${icon('check')}<span>Tudo em dia</span></div>`
        : `<div class="pop-list" data-pop-list>${grupos.map((g, gi) => `
            <div class="pop-notif-group" data-g="${gi}">
                <div class="pop-item pop-notif-row" data-gtoggle="${gi}">
                    <span class="${tipoIcoCls(g.tipo)}">${icon(tipoIco(g.tipo))}</span>
                    <div class="grow">
                        <div class="pop-notif-tipo">${escapeHtml(NOTIF_TIPO_LABEL[g.tipo] || '')}</div>
                        <strong>${g.itens.length} unidade${g.itens.length > 1 ? 's' : ''} <span class="pop-notif-qtd">(${g.itens.reduce((s, l) => s + itemQtd(l), 0)} ${QTD_LABEL[g.tipo] || ''})</span></strong>
                        <div class="muted">Clique para ver quais</div>
                    </div>
                    <span class="pop-notif-chevron">${icon('chevronDown')}</span>
                </div>
                <div class="pop-notif-sub" hidden>${g.itens.map(l => `
                    <div class="pop-item pop-notif-row pop-notif-subrow" data-i="${l.i}">
                        <span class="grow">
                            <strong>${escapeHtml(l.item.nome)}</strong>
                            <div class="muted">${escapeHtml(l.resumo)}</div>
                        </span>
                        ${icon('chevronRight')}
                    </div>`).join('')}</div>
            </div>`).join('')}</div>`;
    document.body.appendChild(pop);

    // Todo grupo começa fechado — mesmo quando é o único: o card já mostra unidades e
    // quantidade, a lista nominal é sob demanda como o resto do sino.
    pop.querySelectorAll('[data-gtoggle]').forEach(el => el.onclick = () => {
        const sub = el.closest('.pop-notif-group').querySelector('.pop-notif-sub');
        sub.hidden = !sub.hidden;
        el.querySelector('.pop-notif-chevron').classList.toggle('open', !sub.hidden);
    });
    pop.querySelectorAll('[data-i]').forEach(el => el.onclick = () => {
        closePopover();
        abrirDetalheNotificacao(linhas[Number(el.dataset.i)]);
    });

    const r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.right - pw, y = r.bottom + 6;
    if (x < 8) x = r.left;
    if (y + ph > window.innerHeight - 8) y = r.top - ph - 6;
    pop.style.left = `${Math.max(8, x)}px`;
    pop.style.top = `${Math.max(8, y)}px`;
    _popover = pop;
    setTimeout(() => {
        document.addEventListener('mousedown', function h(e) {
            if (_popover && !_popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                closePopover(); document.removeEventListener('mousedown', h);
            }
        });
    });
}

// Janela com todas as informações da notificação selecionada
function abrirDetalheNotificacao({ tipo, item }) {
    const cargoNome = id => notifState.cargos.find(c => c.id === id)?.nome || 'cargo';

    // ASO: lista por pessoa (o alerta é individual, não do quadro da unidade). Sem resultado
    // clínico — o sino é sobre prazo vencido, e prazo não é dado de saúde.
    if (tipo === 'aso') {
        const linhaPessoa = p => `
            <div class="aso-notif-row">
                <span class="prog-dot ${ASO_STATUS[p.status].dot}"></span>
                <span class="grow">${escapeHtml(p.nome)}</span>
                <span class="badge ${ASO_STATUS[p.status].cls}">${escapeHtml(p.label)}</span>
                ${can('editar_lancamentos') ? `<button class="btn btn-secondary btn-sm" data-lancar-aso="${p.funcionarioId}">${icon('plus')} Lançar ASO</button>` : ''}
            </div>`;
        const m = openModal({
            title: 'ASO — exames pendentes',
            size: '',
            body: `
                <div class="alert-card alert-aso">
                    <span class="alert-ico">${icon('medical')}</span>
                    <div class="grow">
                        <strong>Exame ocupacional vencido ou próximo do vencimento</strong>
                        <div class="alert-sub">Colaborador sem ASO válido não pode exercer a função (NR-7). Vencidos e "sem ASO" exigem ação imediata.</div>
                        <div class="alert-list">
                            <div class="alert-row">
                                <span class="alert-uni">${icon('building')} ${escapeHtml(item.nome)}</span>
                            </div>
                            <div class="aso-notif-lista">${item.pessoas.map(linhaPessoa).join('')}</div>
                        </div>
                    </div>
                </div>`,
            footer: ''
        });
        m.body.querySelectorAll('[data-lancar-aso]').forEach(btn => btn.onclick = async () => {
            const funcionarioId = btn.dataset.lancarAso;
            m.close();
            await ensureLancFuncBase();
            formAso({ funcionarioId }, null, () => refreshNotificacoes());
        });
        return m;
    }

    // Férias: individual e sobre o prazo LEGAL do concessivo (art. 137) — a mesma régua da
    // aba Férias, não a data prevista/planejada. Vencida = já virou dobra.
    if (tipo === 'ferias') {
        const linhaPessoa = p => `
            <div class="aso-notif-row">
                <span class="prog-dot ${FERIAS_STATUS[p.status].dot}"></span>
                <span class="grow">${escapeHtml(p.nome)}</span>
                <span class="badge ${FERIAS_STATUS[p.status].cls}">${escapeHtml(p.label)}</span>
                ${can('editar_lancamentos') && p.sugestao ? `<button class="btn btn-secondary btn-sm" data-lancar-ferias="${p.funcionarioId}">${icon('plus')} Programar férias</button>` : ''}
            </div>`;
        const m = openModal({
            title: 'Férias — vencidas ou a vencer',
            size: '',
            body: `
                <div class="alert-card alert-cobertura">
                    <span class="alert-ico">${icon('sun')}</span>
                    <div class="grow">
                        <strong>Prazo legal do concessivo vencido ou próximo do vencimento</strong>
                        <div class="alert-sub">Passado o concessivo sem conceder as férias, o pagamento vira em dobro (art. 137 CLT).</div>
                        <div class="alert-list">
                            <div class="alert-row">
                                <span class="alert-uni">${icon('building')} ${escapeHtml(item.nome)}</span>
                            </div>
                            <div class="aso-notif-lista">${item.pessoas.map(linhaPessoa).join('')}</div>
                        </div>
                    </div>
                </div>`,
            footer: ''
        });
        m.body.querySelectorAll('[data-lancar-ferias]').forEach(btn => btn.onclick = async () => {
            const funcionarioId = btn.dataset.lancarFerias;
            const p = item.pessoas.find(x => x.funcionarioId === funcionarioId);
            m.close();
            await ensureLancFuncBase();
            formAusencia({ funcionarioId, inicio: p.sugestao.inicio, retorno: p.sugestao.retorno, dias: p.sugestao.dias }, true,
                { status: p.status, desc: p.desc });
        });
        return m;
    }

    // Aprendizagem: individual e sobre o TERMO do contrato (art. 428 §3º). Não oferece atalho
    // de ação porque não há uma só — o RH decide entre efetivar (novo cargo, novo perfil) e
    // desligar (lançamento de demissão), e um botão teria que escolher por ele.
    if (tipo === 'aprendiz') {
        const linhaPessoa = p => `
            <div class="aso-notif-row">
                <span class="prog-dot ${APRENDIZ_STATUS[p.status].dot}"></span>
                <span class="grow">${escapeHtml(p.nome)}</span>
                <span class="text-2" style="margin-right:8px">${fmtDate(p.vencimento)}${p.derivado ? ' <em style="font-size:11px">(estimado)</em>' : ''}</span>
                <span class="badge ${APRENDIZ_STATUS[p.status].cls}">${escapeHtml(p.label)}</span>
            </div>`;
        return openModal({
            title: 'Aprendizagem — contratos a vencer',
            size: '',
            body: `
                <div class="alert-card alert-aso">
                    <span class="alert-ico">${icon('briefcase')}</span>
                    <div class="grow">
                        <strong>Contrato de aprendizagem vencido ou próximo do termo</strong>
                        <div class="alert-sub">O contrato de aprendizagem é por prazo determinado, no máximo ${APRENDIZ_CONTRATO_MESES_MAX} meses (art. 428 §3º da CLT). Passado o termo sem desligamento nem efetivação, o vínculo tende a ser tratado como prazo indeterminado. Datas marcadas como <em>estimadas</em> não têm termo gravado na ficha — projeção pelo teto legal.</div>
                        <div class="alert-list">
                            <div class="alert-row">
                                <span class="alert-uni">${icon('building')} ${escapeHtml(item.nome)}</span>
                            </div>
                            <div class="aso-notif-lista">${item.pessoas.map(linhaPessoa).join('')}</div>
                        </div>
                    </div>
                </div>`,
            footer: ''
        });
    }

    // 13º: individual e sobre prazo, como ASO e banco. Mostra o valor porque é ele que
    // dimensiona a urgência — e porque a multa por atraso não depende do valor devido.
    if (tipo === 'decimo') {
        const linhaPessoa = p => `
            <div class="aso-notif-row">
                <span class="prog-dot ${DECIMO_STATUS[p.status].dot}"></span>
                <span class="grow">${escapeHtml(p.nome)}</span>
                <span class="num" style="font-variant-numeric:tabular-nums;margin-right:8px">${fmtBRL(p.valor)}</span>
                <span class="badge ${DECIMO_STATUS[p.status].cls}">${escapeHtml(p.label)}</span>
                ${can('editar_lancamentos') ? `<button class="btn btn-secondary btn-sm" data-quitar-decimo="${p.funcionarioId}">${icon('gift')} Quitar 13º</button>` : ''}
            </div>`;
        const m = openModal({
            title: '13º salário — parcelas a pagar',
            size: '',
            body: `
                <div class="alert-card alert-decimo">
                    <span class="alert-ico">${icon('gift')}</span>
                    <div class="grow">
                        <strong>Parcelas do 13º vencidas ou próximas do prazo</strong>
                        <div class="alert-sub">A 1ª parcela vence em 30/11 e a 2ª em 20/12 (Lei 4.749 art. 2º). Atraso é multa administrativa por empregado. Quem já recebeu o adiantamento junto das férias não aparece aqui — ele já teve a 1ª parcela.</div>
                        <div class="alert-list">
                            <div class="alert-row">
                                <span class="alert-uni">${icon('building')} ${escapeHtml(item.nome)}</span>
                                <span class="alert-detail"><span class="alert-gap">total <b>${fmtBRL(item.total)}</b></span></span>
                            </div>
                            <div class="aso-notif-lista">${item.pessoas.map(linhaPessoa).join('')}</div>
                        </div>
                    </div>
                </div>`,
            footer: ''
        });
        m.body.querySelectorAll('[data-quitar-decimo]').forEach(btn => btn.onclick = async () => {
            const funcionarioId = btn.dataset.quitarDecimo;
            m.close();
            await loadDecimoBase();
            janelaDecimo(funcionarioId);
        });
        return m;
    }

    // Banco de horas: também individual, e também sobre prazo — mas aqui o prazo tem preço.
    // Mostra o saldo porque é ele que dimensiona o problema: 2 ciclos vencidos com 00:30
    // não é a mesma conversa que 2 vencidos com 40:00.
    if (tipo === 'banco') {
        const linhaPessoa = p => `
            <div class="aso-notif-row">
                <span class="prog-dot ${BH_STATUS[p.status].dot}"></span>
                <span class="grow">${escapeHtml(p.nome)}</span>
                <span class="num" style="font-variant-numeric:tabular-nums;margin-right:8px">${fmtHHMM(p.saldoMin)}</span>
                <span class="badge ${BH_STATUS[p.status].cls}">${escapeHtml(p.label)}</span>
            </div>`;
        return openModal({
            title: 'Banco de horas — ciclos a resolver',
            size: '',
            body: `
                <div class="alert-card alert-bh">
                    <span class="alert-ico">${icon('clock')}</span>
                    <div class="grow">
                        <strong>Ciclos de compensação vencidos ou próximos do fim</strong>
                        <div class="alert-sub">Saldo positivo não compensado dentro do ciclo é devido como hora extra com adicional (CLT art. 59, §2º). Depois do fechamento, deixa de ser folga e vira folha.</div>
                        <div class="alert-list">
                            <div class="alert-row">
                                <span class="alert-uni">${icon('building')} ${escapeHtml(item.nome)}</span>
                            </div>
                            <div class="aso-notif-lista">${item.pessoas.map(linhaPessoa).join('')}</div>
                        </div>
                    </div>
                </div>`,
            footer: ''
        });
    }

    const corpo = tipo === 'alerta' ? `
        <div class="alert-card">
            <span class="alert-ico">${icon('alert')}</span>
            <div class="grow">
                <strong>Equipe incompleta</strong>
                <div class="alert-list">
                    <div class="alert-row">
                        <span class="alert-uni">${icon('building')} ${escapeHtml(item.nome)}</span>
                        ${item.modo === 'cargo'
                            ? `<span class="alert-detail">${item.cargos.map(c => `<span class="alert-gap">${escapeHtml(cargoNome(c.cargoId))}: ${c.ativos}/${c.meta} <b>−${c.faltam}</b></span>`).join('')}</span>`
                            : `<span class="alert-detail"><span class="alert-gap">${item.ativos}/${item.meta} <b>faltam ${item.faltam}</b></span></span>`}
                    </div>
                </div>
            </div>
        </div>` : `
        <div class="alert-card alert-cobertura">
            <span class="alert-ico">${icon('sun')}</span>
            <div class="grow">
                <strong>Cobertura reduzida — férias em curso</strong>
                <div class="alert-sub">Quadro contratado está completo; a ausência é temporária. Avalie escala ou substituição, não contratação.</div>
                <div class="alert-list">
                    <div class="alert-row">
                        <span class="alert-uni">${icon('building')} ${escapeHtml(item.nome)}</span>
                        <span class="alert-detail">${item.cargos.map(x => `<span class="alert-gap">${escapeHtml(cargoNome(x.cargoId))}: ${x.presentes}/${x.meta} presentes <b>−${x.gap}</b></span>`).join('')}</span>
                    </div>
                    <div class="alert-retornos">${item.retornos.map(r => `<span>${escapeHtml(r.nome)} volta ${fmtDate(r.a.retorno)}</span>`).join('')}</div>
                </div>
            </div>
        </div>`;

    const podeTransferir = can('editar_lancamentos') && (tipo === 'alerta' || tipo === 'cobertura');
    const m = openModal({
        title: tipo === 'alerta' ? 'Equipe incompleta' : 'Cobertura reduzida',
        size: '',
        body: corpo,
        footer: podeTransferir ? `<button class="btn btn-primary" data-realizar-transf>${icon('refresh')} Realizar transferência</button>` : ''
    });
    const btnTransf = m.footer?.querySelector('[data-realizar-transf]');
    if (btnTransf) btnTransf.onclick = async () => {
        m.close();
        await ensureLancFuncBase();
        formTransferencia(item.unidadeId);
    };
    return m;
}
