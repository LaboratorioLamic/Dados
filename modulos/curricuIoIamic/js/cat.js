// ===== CAT — Comunicação de Acidente de Trabalho (Lei 8.213/91, art. 22 / eSocial S-2210) =====
//
// Arquivo próprio pelo mesmo motivo do ASO: lancamentos.js já passa de 2.900 linhas.
//
// A CAT é o FATO (o acidente) e o comprovante da comunicação. O AFASTAMENTO que ele possa
// gerar continua sendo lançado em Faltas e Licenças: aqui só se REFERENCIA a ausência
// (ausenciaId). Duas fontes para os mesmos dias fariam a ficha e a folha divergirem.
//
// LGPD: parte do corpo, CID, descrição da lesão e o próprio documento anexado são dado de
// saúde (categoria especial, art. 11) — ficam atrás de `ver_medico`, mesma régua do ASO.
// Sem a permissão a aba continua útil: datas, natureza, afastamento e pendência de anexo
// são gestão, não diagnóstico.

const CAT_TIPOS = ['Inicial', 'Reabertura', 'Comunicação de óbito'];
const CAT_TIPO_OBITO = 'Comunicação de óbito';

// Natureza do acidente na classificação da Previdência. Determina a leitura e a consequência
// (trajeto não se previne com a mesma medida que o típico).
const CAT_NATUREZAS = ['Típico', 'Trajeto', 'Doença ocupacional'];

// Parte do corpo atingida. Um acidente costuma atingir mais de um ponto (queda pega punho e
// joelho), então o campo é multisseleção e o dado é gravado como texto separado por vírgula —
// o que já estava gravado no formato antigo (uma parte só) continua válido sem migração.
// A lateralidade entra na própria opção porque é isso que o laudo e o CID pedem: "olho
// direito" e "olho esquerdo" são lesões diferentes, com consequências diferentes.
const CAT_PARTES_GRUPOS = [
    {
        grupo: 'Cabeça e face', itens: [
            'Cabeça', 'Couro cabeludo', 'Crânio', 'Testa', 'Face',
            'Olho direito', 'Olho esquerdo', 'Ambos os olhos',
            'Pálpebra direita', 'Pálpebra esquerda',
            'Cílios direitos', 'Cílios esquerdos',
            'Sobrancelha direita', 'Sobrancelha esquerda',
            'Orelha direita', 'Orelha esquerda',
            'Nariz', 'Narina direita', 'Narina esquerda',
            'Bochecha direita', 'Bochecha esquerda',
            'Boca / lábios', 'Língua', 'Dentes', 'Mandíbula', 'Queixo'
        ]
    },
    {
        grupo: 'Pescoço e tronco', itens: [
            'Pescoço', 'Garganta', 'Ombro direito', 'Ombro esquerdo',
            'Tórax', 'Costelas direitas', 'Costelas esquerdas',
            'Abdômen', 'Região lombar', 'Coluna cervical', 'Coluna torácica', 'Coluna lombar',
            'Quadril direito', 'Quadril esquerdo', 'Região pélvica', 'Região genital', 'Nádegas'
        ]
    },
    {
        grupo: 'Membro superior direito', itens: [
            'Braço direito', 'Cotovelo direito', 'Antebraço direito', 'Punho direito', 'Mão direita',
            'Palma da mão direita', 'Dorso da mão direita',
            'Polegar direito', 'Indicador direito', 'Dedo médio direito', 'Anelar direito', 'Mínimo direito',
            'Unha da mão direita'
        ]
    },
    {
        grupo: 'Membro superior esquerdo', itens: [
            'Braço esquerdo', 'Cotovelo esquerdo', 'Antebraço esquerdo', 'Punho esquerdo', 'Mão esquerda',
            'Palma da mão esquerda', 'Dorso da mão esquerda',
            'Polegar esquerdo', 'Indicador esquerdo', 'Dedo médio esquerdo', 'Anelar esquerdo', 'Mínimo esquerdo',
            'Unha da mão esquerda'
        ]
    },
    {
        grupo: 'Membro inferior direito', itens: [
            'Coxa direita', 'Joelho direito', 'Perna direita', 'Panturrilha direita',
            'Tornozelo direito', 'Pé direito', 'Calcanhar direito', 'Planta do pé direito',
            'Dedos do pé direito', 'Hálux direito', 'Unha do pé direito'
        ]
    },
    {
        grupo: 'Membro inferior esquerdo', itens: [
            'Coxa esquerda', 'Joelho esquerdo', 'Perna esquerda', 'Panturrilha esquerda',
            'Tornozelo esquerdo', 'Pé esquerdo', 'Calcanhar esquerdo', 'Planta do pé esquerdo',
            'Dedos do pé esquerdo', 'Hálux esquerdo', 'Unha do pé esquerdo'
        ]
    },
    {
        grupo: 'Interno e sistêmico', itens: [
            'Aparelho respiratório', 'Aparelho digestivo', 'Sistema circulatório', 'Sistema nervoso',
            'Audição', 'Visão', 'Pele (área extensa)', 'Múltiplas partes', 'Parte não especificada', 'Outra'
        ]
    }
];

// Genéricas mantidas para não invalidar CAT antiga que gravou "Olhos", "Mão", "Braço": a
// lista nova é lateralizada, mas o valor histórico continua aparecendo como chip.
const CAT_PARTES = CAT_PARTES_GRUPOS.flatMap(g => g.itens);

// Texto ↔ lista: o banco guarda "Punho direito, Joelho esquerdo".
const catPartesLista = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

// Na ficha as partes viram chips: lista longa em texto corrido vira parede de vírgula.
const catPartesChips = v => {
    const l = catPartesLista(v);
    return l.length
        ? `<span class="chip-wrap">${l.map(x => `<span class="chip">${escapeHtml(x)}</span>`).join('')}</span>`
        : '<span class="muted">—</span>';
};

const CAT_AGENTES = [
    'Máquina ou equipamento', 'Ferramenta manual', 'Queda de mesmo nível', 'Queda de altura',
    'Impacto por objeto', 'Veículo', 'Substância química', 'Fogo / calor', 'Eletricidade',
    'Animal / inseto', 'Esforço repetitivo', 'Agressão / violência', 'Outro'
];

const CAT_NATUREZA_CLS = {
    'Típico': 'badge-danger',
    'Trajeto': 'badge-warning',
    'Doença ocupacional': 'badge-accent'
};

const catState = { cats: [], ausencias: [] };
let catFiltroUnidade = '';
let catFiltroCargo = '';
let catFiltroNatureza = '';   // '' = todas

const catPassaFiltro = f =>
    (!catFiltroUnidade || f.unidadeId === catFiltroUnidade) &&
    (!catFiltroCargo || f.cargoId === catFiltroCargo);

const badgeNaturezaCat = n => n
    ? `<span class="badge ${CAT_NATUREZA_CLS[n] || 'badge-neutral'}">${escapeHtml(n)}</span>`
    : '<span class="muted">—</span>';

// Dias perdidos: o que está no afastamento vinculado manda, porque é ele que a ficha e a
// folha usam. O número digitado na CAT é a estimativa de quem preencheu o documento.
const catDiasAfastado = c => {
    if (!c.houveAfastamento) return 0;
    const aus = c.ausenciaId && catState.ausencias.find(a => a.id === c.ausenciaId);
    if (aus) return Number(aus.dias) || diasEntre(aus.inicio, aus.retorno) || 0;
    return Number(c.diasAfastamento) || 0;
};

// ---- Filtros de unidade/cargo (mesmo padrão de asoFiltrosHtml) ----
function catFiltrosHtml(idUni, idCargo) {
    const un = lancState.unidades.find(u => u.id === catFiltroUnidade);
    const cg = lancState.cargos.find(c => c.id === catFiltroCargo);
    return `
        <button class="btn btn-secondary btn-filter${catFiltroUnidade ? ' active' : ''}" id="${idUni}">${icon('building')} ${escapeHtml(un?.nome || 'Todas as unidades')}</button>
        <button class="btn btn-secondary btn-filter${catFiltroCargo ? ' active' : ''}" id="${idCargo}">${icon('briefcase')} ${escapeHtml(cg?.nome || 'Todos os cargos')}</button>`;
}

function catBindFiltros(idUni, idCargo, rerender) {
    const unis = lancState.unidades.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const cargos = lancState.cargos.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const bUni = document.getElementById(idUni);
    if (bUni) bUni.onclick = () => openFilterPopover(bUni, {
        allLabel: 'Todas as unidades',
        options: unis.map(u => ({ value: u.id, label: u.nome })),
        value: catFiltroUnidade,
        searchable: unis.length > 6,
        onPick: v => { catFiltroUnidade = v; rerender(); }
    });
    const bCargo = document.getElementById(idCargo);
    if (bCargo) bCargo.onclick = () => openFilterPopover(bCargo, {
        allLabel: 'Todos os cargos',
        options: cargoOpcoes(cargos),
        value: catFiltroCargo,
        searchable: cargos.length > 6,
        onPick: v => { catFiltroCargo = v; rerender(); }
    });
}

// ============ ABA ============
// Sem sub-abas de programação/agenda (ao contrário do ASO): acidente não tem vencimento a
// projetar — ou aconteceu, ou não. O que a tela precisa responder é: quantos, de que
// natureza, quanto tempo custaram e quais ainda estão sem o documento arquivado.
async function renderCat() {
    const [cats, ausencias] = await Promise.all([
        DB.getAll(PATHS.cats),
        DB.getAll(PATHS.ausencias)
    ]);
    catState.cats = cats.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    catState.ausencias = ausencias;
    catTabela();
}

function catTabela() {
    const cont = document.getElementById('lancContent');
    const podeEditar = can('editar_lancamentos');
    const medico = podeVerMedico();

    const lista = catState.cats.filter(c => {
        const f = lancFuncObj(c.funcionarioId);
        return f ? catPassaFiltro(f) : true;
    });

    // Janela de 12 meses: é a régua com que a acidentalidade é lida na prática.
    const corte = addMeses(hoje(), -12);
    const recentes = lista.filter(c => (c.data || '') >= corte);
    const comAfast = recentes.filter(c => c.houveAfastamento);
    const diasPerdidos = comAfast.reduce((s, c) => s + catDiasAfastado(c), 0);
    // Pendência real: a CAT foi registrada aqui mas o documento não foi arquivado. Só conta
    // para quem pode ver anexo — sem ver_medico seria um número que o usuário não consegue
    // conferir nem resolver.
    const semAnexo = medico ? lista.filter(c => !anexosDe(c).length).length : null;

    const kpis = [
        [fmtNum(recentes.length), 'Acidentes nos últimos 12 meses', 'vencida'],
        [fmtNum(comAfast.length), 'Com afastamento', 'critica'],
        [fmtNum(diasPerdidos), 'Dias perdidos (12 meses)', 'critica'],
        // Sem ver_medico o 4º KPI vira o complemento do 2º — a faixa é uma grade de quatro,
        // e um buraco no fim parece dado que falhou em carregar.
        semAnexo === null
            ? [fmtNum(recentes.length - comAfast.length), 'Sem afastamento', 'aquisitivo']
            : [fmtNum(semAnexo), 'CATs sem documento anexado', semAnexo ? 'vencida' : 'aquisitivo']
    ];

    const chipNat = n => `<button class="btn btn-sm ${catFiltroNatureza === n ? 'btn-primary' : 'btn-secondary'}" data-nat="${escapeHtml(n)}">${escapeHtml(n || 'Todas')}</button>`;

    cont.innerHTML = `
        <div class="flex-between" style="margin-bottom:14px;gap:10px">
            <div class="page-sub">Acidentes de trabalho, de trajeto e doenças ocupacionais — o documento comunicado ao INSS fica anexado ao registro.</div>
            ${!medico ? `<span class="badge badge-neutral" title="Você vê datas, natureza e afastamento, mas não o conteúdo clínico.">${icon('lock')} Dados médicos ocultos</span>` : ''}
        </div>
        <div class="prog-resumo">
            ${kpis.map(([n, txt, cls]) => `
                <div class="prog-kpi prog-${cls}">
                    <span class="prog-n">${n}</span>
                    <span class="prog-lbl">${txt}</span>
                </div>`).join('')}
        </div>
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="lancSearch" placeholder="Buscar por funcionário..."></div>
                ${catFiltrosHtml('catUni', 'catCargo')}
                <div class="grow"></div>
                ${podeEditar ? `<button class="btn btn-primary" id="lancNew">${icon('plus')} Registrar CAT</button>` : ''}
            </div>
            <div class="flex" style="gap:6px;padding:0 14px 12px;flex-wrap:wrap">
                ${['', ...CAT_NATUREZAS].map(chipNat).join('')}
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>
                        <th>Funcionário</th><th>Tipo</th><th>Natureza</th><th>Data</th>
                        <th title="Dias de afastamento — do lançamento vinculado em Faltas e Licenças, quando houver">Afastamento</th>
                        <th>CID</th><th title="CAT emitida, laudo, fotos">Documento</th>
                        <th style="width:48px"></th>
                    </tr></thead>
                    <tbody id="lancTbody">${lista.map(c => {
                        const dias = catDiasAfastado(c);
                        return `
                        <tr data-id="${c.id}" data-nat="${escapeHtml(c.natureza || '')}" data-search="${escapeHtml((lancFuncNome(c.funcionarioId) + ' ' + (c.natureza || '') + ' ' + (c.local || '')).toLowerCase())}">
                            <td>${lancFuncCellHtml(c.funcionarioId)}</td>
                            <td><span class="badge ${c.tipo === CAT_TIPO_OBITO ? 'badge-danger' : 'badge-neutral'}">${escapeHtml(c.tipo || '—')}</span></td>
                            <td>${badgeNaturezaCat(c.natureza)}</td>
                            <td>${fmtDate(c.data)}${c.hora ? `<div class="prog-aq">${escapeHtml(c.hora)}</div>` : ''}</td>
                            <td class="text-2">${c.houveAfastamento
                                ? `<strong>${fmtNum(dias)}</strong> dia(s)<div class="prog-aq">${c.ausenciaId ? 'vinculado' : 'sem lançamento'}</div>`
                                : '<span class="muted">não houve</span>'}</td>
                            <td class="text-2">${medico ? escapeHtml(c.cid || '—') : restritoHtml()}</td>
                            <td>${medico
                                ? (anexosDe(c).length ? anexoChip(anexosDe(c)) : `<span class="badge badge-warning" title="A CAT foi registrada, mas o documento não está arquivado aqui">${icon('alert')} pendente</span>`)
                                : restritoHtml()}</td>
                            <td>${podeEditar ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div>`;

    if (!lista.length) {
        document.getElementById('lancTbody').innerHTML =
            `<tr><td colspan="10"><div class="table-empty">${icon('check')}<span>Nenhuma CAT registrada${catFiltroUnidade || catFiltroCargo ? ' com os filtros aplicados' : ''}.</span></div></td></tr>`;
    }

    const aplicar = () => lancAplicaFiltros(tr => !catFiltroNatureza || tr.dataset.nat === catFiltroNatureza);
    const btnNew = document.getElementById('lancNew');
    if (btnNew) btnNew.onclick = () => formCat(null);
    document.getElementById('lancSearch').addEventListener('input', aplicar);
    cont.querySelectorAll('button[data-nat]').forEach(b => {
        b.onclick = () => { catFiltroNatureza = b.dataset.nat; catTabela(); };
    });
    catBindFiltros('catUni', 'catCargo', catTabela);
    bindLancFuncCells(document.getElementById('lancTbody'));
    if (medico) bindAnexoChips(document.getElementById('lancTbody'),
        el => anexosDe(catState.cats.find(x => x.id === el.closest('tr').dataset.id)));
    aplicar();

    cont.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const c = catState.cats.find(x => x.id === tr.dataset.id);
        lancRowClick(tr, () => detalheCat(c));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheCat(c) },
            { label: 'Editar', icon: 'edit', onClick: () => formCat(c) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirCat(c) }
        ]);
    });
}

// ============ DETALHE ============
function detalheCat(c, onClose) {
    const medico = podeVerMedico();
    // Aberto também pela ficha do funcionário, quando a página Lançamentos nunca renderizou:
    // ali catState.ausencias pode estar vazio e o vínculo simplesmente não é exibido como
    // link — o número de dias informado na CAT continua aparecendo.
    const aus = c.ausenciaId ? catState.ausencias.find(a => a.id === c.ausenciaId) : null;
    const dias = catDiasAfastado(c);

    const linhaAfast = c.houveAfastamento
        ? (aus
            ? `<strong>${fmtNum(dias)}</strong> dia(s) — <button type="button" class="link-inline" data-abrir-aus>${escapeHtml(aus.tipo || 'afastamento')} · ${fmtDate(aus.inicio)} → ${fmtDate(aus.retorno)}</button>`
            : `<strong>${fmtNum(dias)}</strong> dia(s) <span class="muted">(informado na CAT — sem lançamento vinculado em Faltas e Licenças)</span>`)
        : 'Não houve';

    const d = abrirDetalheLanc({
        titulo: lancFuncNome(c.funcionarioId),
        funcionarioId: c.funcionarioId,
        sub: 'CAT — Comunicação de Acidente de Trabalho',
        badgeHtml: `<span class="badge ${c.tipo === CAT_TIPO_OBITO ? 'badge-danger' : 'badge-neutral'}">${escapeHtml(c.tipo || '—')}</span> ${badgeNaturezaCat(c.natureza)}`
            + (c.obito ? ` <span class="badge badge-danger">${icon('alert')} Óbito</span>` : ''),
        linhas: [
            ['Data do acidente', `${fmtDate(c.data)}${c.hora ? ` <span class="muted">às ${escapeHtml(c.hora)}</span>` : ''}`],
            ['Natureza', escapeHtml(c.natureza || '—')],
            ['Local / setor', escapeHtml(c.local || '—')],
            ['Descrição', medico ? escapeHtml(c.descricao || '—') : restritoHtml()],
            ['Parte do corpo atingida', medico ? catPartesChips(c.parteCorpo) : restritoHtml()],
            ['Agente causador', escapeHtml(c.agente || '—')],
            ['CID', medico ? escapeHtml(c.cid || '—') : restritoHtml()],
            ['Afastamento', linhaAfast],
            ['Registro policial', c.registroPolicial ? 'Sim' : 'Não'],
            c.testemunhaNome
                ? ['Testemunha', `${escapeHtml(c.testemunhaNome)}${c.testemunhaContato ? ` <span class="muted">· ${escapeHtml(c.testemunhaContato)}</span>` : ''}`]
                : null,
            ['Recibo eSocial', escapeHtml(c.reciboESocial || '—')],
            ['Observação', escapeHtml(c.obs || '—')]
        ],
        anexo: medico ? anexosDe(c) : [],
        // Propaga o retorno: editar/excluir a partir da ficha deve voltar para a ficha
        onEdit: () => formCat(c, null, onClose),
        onDelete: () => excluirCat(c, onClose),
        onClose
    });

    // O afastamento vinculado abre o detalhe da ausência; fechar aquele traz de volta a esta
    // CAT, senão o usuário perde o contexto de onde clicou.
    const bAus = d.body.querySelector('[data-abrir-aus]');
    if (bAus) bAus.onclick = () => { d.close(); detalheAusencia(aus, null, () => detalheCat(c, onClose)); };
}

const excluirCat = async (c, onDone) => {
    if (await confirmDialog({
        title: 'Excluir CAT',
        message: `Excluir a CAT de <strong>${escapeHtml(lancFuncNome(c.funcionarioId))}</strong> (${fmtDate(c.data)})?<br><span class="muted">O afastamento lançado em Faltas e Licenças não é excluído.</span>`,
        confirmText: 'Excluir', danger: true
    })) {
        await excluirAnexoRemoto(anexosDe(c));
        await DB.remove(PATHS.cats, c.id);
        toast('CAT excluída.');
        (onDone || renderLancTab)();
    }
};

// ============ FORMULÁRIO ============
// `onDone`: para onde voltar depois de salvar. O form é usado tanto pela aba CAT quanto pela
// ficha do funcionário; sem isso, salvar a partir da ficha tentaria re-renderizar uma aba de
// Lançamentos que não está na tela.
function formCat(c, _sugerido, onDone) {
    const isEdit = !!c?.id;
    const selFunc = selectFuncionario('fcatFunc', c?.funcionarioId);
    if (!selFunc) return toast('Nenhum funcionário ativo cadastrado.', 'info');

    // Sem ver_medico não dá para editar o que não se pode ver: o save reescreveria descrição,
    // parte do corpo e CID com vazio. Bloqueia em vez de destruir dado em silêncio.
    if (isEdit && !podeVerMedico())
        return toast('Editar uma CAT exige a permissão "Ver dados médicos".', 'error');

    const opts = (lista, sel, vazio) =>
        (vazio ? `<option value="">${vazio}</option>` : '')
        + lista.map(t => `<option ${sel === t ? 'selected' : ''}>${t}</option>`).join('');

    const m = openModal({
        title: isEdit ? 'Editar CAT' : 'Registrar CAT',
        body: `
            <div class="field"><label>Funcionário <span class="req">*</span></label>${selFunc}</div>
            <div class="form-row">
                <div class="field"><label>Tipo de CAT <span class="req">*</span></label>
                    <select class="select" id="fcatTipo">${opts(CAT_TIPOS, c?.tipo || 'Inicial')}</select>
                    <div class="field-hint" id="fcatTipoHint"></div>
                </div>
                <div class="field"><label>Natureza <span class="req">*</span></label>
                    <select class="select" id="fcatNatureza">${opts(CAT_NATUREZAS, c?.natureza || 'Típico')}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>Data do acidente <span class="req">*</span></label>
                    <input class="input" id="fcatData" type="date" max="${hoje()}" value="${c?.data || ''}">
                    <div class="field-hint">A CAT deve ser comunicada até o 1º dia útil seguinte.</div>
                </div>
                <div class="field"><label>Hora</label>
                    <input class="input" id="fcatHora" type="time" value="${escapeHtml(c?.hora || '')}">
                </div>
            </div>
            <div class="field"><label>Local / setor</label>
                <input class="input" id="fcatLocal" value="${escapeHtml(c?.local || '')}" placeholder="Ex: Galpão 2 — linha de envase">
            </div>
            <div class="field"><label>Descrição do acidente <span class="req">*</span></label>
                <textarea class="input" id="fcatDescricao" rows="3" placeholder="O que aconteceu, como e em que circunstância">${escapeHtml(c?.descricao || '')}</textarea>
            </div>
            <div class="form-row">
                <div class="field"><label>Parte do corpo atingida</label>
                    <button type="button" class="input" id="fcatParte"></button>
                    <div class="field-hint">Pode marcar mais de uma — use a busca para achar o lado.</div>
                </div>
                <div class="field"><label>Agente causador</label>
                    <select class="select" id="fcatAgente">${opts(CAT_AGENTES, c?.agente, '—')}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>CID</label>
                    <input class="input" id="fcatCid" value="${escapeHtml(c?.cid || '')}" placeholder="Ex: S62.6">
                </div>
                <div class="field"><label>Nº do recibo eSocial</label>
                    <input class="input" id="fcatRecibo" value="${escapeHtml(c?.reciboESocial || '')}" placeholder="Recibo do evento S-2210">
                </div>
            </div>
            <div class="field">
                <label class="flex" style="gap:8px;align-items:center;cursor:pointer">
                    <span class="switch"><input type="checkbox" id="fcatAfast" ${c?.houveAfastamento ? 'checked' : ''}><span class="track"></span></span>
                    <span>Houve afastamento do trabalho</span>
                </label>
            </div>
            <div id="fcatAfastBox" style="display:none">
                <div class="form-row">
                    <div class="field"><label>Dias de afastamento <span class="req">*</span></label>
                        <input class="input" id="fcatDias" type="number" min="1" value="${c?.diasAfastamento || ''}">
                    </div>
                    <div class="field"><label>Lançamento relacionado</label>
                        <button type="button" class="input select-picker" id="fcatAusBtn">
                            <span class="select-picker-lbl muted" id="fcatAusLbl">Nenhum / lançar depois</span>
                            ${icon('chevronDown')}
                        </button>
                        <input type="hidden" id="fcatAusId" value="${c?.ausenciaId || ''}">
                    </div>
                </div>
                <div class="form-note form-note-info">${icon('info')}
                    <span>Os dias que contam na ficha e na folha são os do lançamento em <strong>Faltas e Licenças</strong> — vincule o afastamento existente ou
                    <button type="button" class="link-inline" id="fcatAusNovo">lance a licença agora</button>.</span>
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>Testemunha</label>
                    <input class="input" id="fcatTestNome" value="${escapeHtml(c?.testemunhaNome || '')}" placeholder="Nome">
                </div>
                <div class="field"><label>Contato da testemunha</label>
                    <input class="input" id="fcatTestContato" value="${escapeHtml(c?.testemunhaContato || '')}" placeholder="Telefone ou e-mail">
                </div>
            </div>
            <div class="toggle-cards" style="margin-bottom:14px">
                <label class="toggle-card">
                    <div class="grow"><strong>Óbito</strong><span>O acidente resultou em morte</span></div>
                    <span class="switch"><input type="checkbox" id="fcatObito" ${c?.obito ? 'checked' : ''}><span class="track"></span></span>
                </label>
                <label class="toggle-card">
                    <div class="grow"><strong>Registro policial</strong><span>Houve boletim de ocorrência</span></div>
                    <span class="switch"><input type="checkbox" id="fcatPolicia" ${c?.registroPolicial ? 'checked' : ''}><span class="track"></span></span>
                </label>
            </div>
            <div class="field"><label>Observação</label>
                <textarea class="input" id="fcatObs" rows="2" placeholder="Detalhes (opcional)">${escapeHtml(c?.obs || '')}</textarea>
            </div>
            <div class="field"><label>Documentos (CAT emitida, laudo médico, fotos)</label><div id="fcatAnexo"></div></div>`,
        footer: ''
    });

    bindSelectFuncionario(m.body, 'fcatFunc', c?.funcionarioId);
    const parteCtl = initMultiPickerField(m.body.querySelector('#fcatParte'), {
        groups: CAT_PARTES_GRUPOS,
        value: catPartesLista(c?.parteCorpo),
        placeholder: 'Selecione as partes atingidas'
    });
    const anexoCtl = initAnexoField(m.body.querySelector('#fcatAnexo'), anexosDe(c));

    const el = id => m.body.querySelector('#' + id);
    const funcEl = el('fcatFunc'), tipoEl = el('fcatTipo'), dataEl = el('fcatData');
    const afastEl = el('fcatAfast'), afastBox = el('fcatAfastBox'), diasEl = el('fcatDias');
    const obitoEl = el('fcatObito'), ausIdEl = el('fcatAusId'), ausLblEl = el('fcatAusLbl');

    const HINTS = {
        'Inicial': 'Primeira comunicação deste acidente.',
        'Reabertura': 'Agravamento ou novo afastamento por um acidente já comunicado.',
        'Comunicação de óbito': 'Óbito decorrente do acidente — comunicação imediata.'
    };
    // Óbito deixa de ser escolha numa CAT de óbito: é consequência do tipo. Sem isso dá para
    // gravar uma comunicação de óbito que se declara sem óbito.
    const applyTipo = () => {
        el('fcatTipoHint').textContent = HINTS[tipoEl.value] || '';
        const forcado = tipoEl.value === CAT_TIPO_OBITO;
        if (forcado) obitoEl.checked = true;
        obitoEl.disabled = forcado;
    };

    // Só afastamentos do funcionário escolhido — vincular a ausência de outra pessoa é sempre
    // erro, então nem entra na lista. Férias ficam de fora: não são afastamento por acidente.
    const ausenciasDoFunc = () => catState.ausencias
        .filter(a => a.funcionarioId === funcEl.value && a.tipo !== TIPO_FERIAS)
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));

    const ausLabel = a => `${a.tipo || 'Ausência'} · ${fmtDate(a.inicio)} → ${fmtDate(a.retorno)} (${fmtNum(a.dias ?? diasEntre(a.inicio, a.retorno))}d)`;

    const syncAusLbl = () => {
        const a = catState.ausencias.find(x => x.id === ausIdEl.value);
        ausLblEl.textContent = a ? ausLabel(a) : 'Nenhum / lançar depois';
        ausLblEl.classList.toggle('muted', !a);
        // Vinculado, os dias vêm do lançamento — digitar outro número aqui criaria uma segunda
        // verdade sobre o mesmo afastamento.
        if (a) {
            diasEl.value = a.dias ?? diasEntre(a.inicio, a.retorno) ?? '';
            diasEl.readOnly = true;
        } else {
            diasEl.readOnly = false;
        }
    };

    el('fcatAusBtn').onclick = e => {
        const lista = ausenciasDoFunc();
        openFilterPopover(e.currentTarget, {
            allLabel: 'Nenhum / lançar depois',
            options: lista.map(a => ({ value: a.id, label: ausLabel(a) })),
            value: ausIdEl.value,
            searchable: lista.length > 6,
            onPick: v => { ausIdEl.value = v; syncAusLbl(); }
        });
    };

    // Atalho para lançar a licença: o form de ausência é o mesmo de Faltas e Licenças. Nada é
    // gravado automaticamente daqui — quem decide o tipo e o período do afastamento é o RH.
    el('fcatAusNovo').onclick = () => {
        if (!can('editar_lancamentos')) return;
        if (!funcEl.value) return toast('Selecione o funcionário primeiro.', 'error');
        // O 3º argumento (`sugerido`) é o que diz a formAusencia que este objeto é um
        // pré-preenchimento, não um registro existente — sem ele o form se intitula "Editar".
        formAusencia(
            { funcionarioId: funcEl.value, tipo: 'Licença médica', inicio: dataEl.value || '' },
            false,
            { status: 'info', desc: 'Afastamento decorrente do acidente sendo registrado na CAT. Ajuste o motivo e o período; depois volte à CAT para vinculá-lo.' }
        );
    };

    const applyAfast = () => { afastBox.style.display = afastEl.checked ? '' : 'none'; };
    tipoEl.onchange = applyTipo;
    afastEl.onchange = applyAfast;
    // Trocar de funcionário invalida um vínculo escolhido para o anterior.
    funcEl.addEventListener('change', () => { ausIdEl.value = ''; syncAusLbl(); });
    applyTipo();
    applyAfast();
    syncAusLbl();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Registrar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const btnSave = m.footer.querySelector('[data-save]');
    btnSave.onclick = async () => {
        const fid = funcEl.value;
        if (!fid) return toast('Selecione o funcionário.', 'error');
        const data = dataEl.value;
        if (!data) return toast('Informe a data do acidente.', 'error');
        // Mesma regra do ASO: acidente que ainda não aconteceu não se comunica.
        if (data > hoje()) return toast('A data do acidente não pode ser futura.', 'error');
        const descricao = el('fcatDescricao').value.trim();
        if (!descricao) return toast('Descreva o acidente — é o que a CAT comunica.', 'error');
        const houveAfastamento = afastEl.checked;
        const diasAfastamento = houveAfastamento ? Number(diasEl.value) || 0 : 0;
        if (houveAfastamento && diasAfastamento < 1)
            return toast('Informe os dias de afastamento.', 'error');

        // Mesmo funcionário, mesma data, mesmo tipo é quase sempre clique duplo — reabertura
        // legítima do mesmo acidente vem em outra data.
        const dup = catState.cats.find(x => x.id !== c?.id && x.funcionarioId === fid
            && x.data === data && x.tipo === tipoEl.value);
        if (dup) return toast(`Já existe uma CAT ${tipoEl.value} para este funcionário em ${fmtDate(data)}.`, 'error');

        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos, removidos } = await anexoCtl.getAnexos();
            await DB.save(PATHS.cats, c?.id || null, {
                funcionarioId: fid,
                tipo: tipoEl.value,
                natureza: el('fcatNatureza').value,
                data,
                hora: el('fcatHora').value || '',
                local: el('fcatLocal').value.trim(),
                descricao,
                parteCorpo: parteCtl.get().join(', '),
                agente: el('fcatAgente').value,
                cid: el('fcatCid').value.trim(),
                obito: obitoEl.checked,
                registroPolicial: el('fcatPolicia').checked,
                houveAfastamento,
                diasAfastamento,
                ausenciaId: houveAfastamento ? (ausIdEl.value || null) : null,
                testemunhaNome: el('fcatTestNome').value.trim(),
                testemunhaContato: el('fcatTestContato').value.trim(),
                reciboESocial: el('fcatRecibo').value.trim(),
                obs: el('fcatObs').value.trim(),
                anexos
            });
            await excluirAnexoRemoto(removidos);
            toast(isEdit ? 'CAT atualizada.' : 'CAT registrada.');
            m.close();
            (onDone || renderLancTab)();
        } catch (e) {
            toast(e.message || 'Erro ao salvar.', 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = isEdit ? 'Salvar' : 'Registrar';
        }
    };
}
