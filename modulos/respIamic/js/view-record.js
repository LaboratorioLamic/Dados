// Janela de visualização do agendamento — somente leitura.
//
// É a porta de entrada padrão ao clicar num agendamento (tabela, calendário ou
// modal do dia). O formulário de edição só abre a partir do botão "Editar" daqui.
// Os blocos exibidos são montados a partir da configuração da agenda ativa, então
// cada agenda mostra apenas os campos que realmente usa.

function _vwEscape(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Tema visual do status — reaproveita a semântica de cores já usada no sistema
const VIEW_STATUS_TEMA = {
    'Agendado':     { bg: 'bg-blue-50',   texto: 'text-blue-700',   ponto: 'bg-blue-500',   icon: 'fa-calendar-check' },
    'Em andamento': { bg: 'bg-purple-50', texto: 'text-purple-700', ponto: 'bg-purple-500', icon: 'fa-spinner' },
    'Concluído':    { bg: 'bg-green-50',  texto: 'text-green-700',  ponto: 'bg-green-500',  icon: 'fa-circle-check' },
    'Ausente':      { bg: 'bg-amber-50',  texto: 'text-amber-800',  ponto: 'bg-amber-500',  icon: 'fa-user-xmark' },
    'Cancelado':    { bg: 'bg-slate-100', texto: 'text-slate-500',  ponto: 'bg-slate-400',  icon: 'fa-ban' }
};

// Um agendamento não concluído/cancelado cuja data já passou aparece como atrasado
function _vwAtrasado(app) {
    if (pacienteEncerrado(app.status)) return false;
    if (!app.data) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [y, m, d] = app.data.split('-').map(Number);
    const dataApp = new Date(y, m - 1, d);
    dataApp.setHours(0, 0, 0, 0);
    return dataApp < hoje;
}

// ── BLOCOS DE CONTEÚDO ──────────────────────────────────────
// Campo simples: rótulo + valor. Retorna '' quando não há valor, para que o
// bloco inteiro possa sumir se nenhum campo tiver conteúdo.
function _vwCampo(rotulo, valor, opts) {
    const o = opts || {};
    if (valor === null || valor === undefined || valor === '') return '';
    return `
        <div class="view-campo ${o.largo ? 'view-campo-largo' : ''}">
            <span class="view-campo-rotulo">${_vwEscape(rotulo)}</span>
            <span class="view-campo-valor ${o.classe || ''}">${o.html ? valor : _vwEscape(valor)}</span>
        </div>`;
}

// Situação de pagamento da coleta domiciliar, normalizada: registros antigos
// só têm o flag geral (taxaColetaPaga), que então vale para as duas parcelas.
function _vwTaxaResumo(app) {
    const taxa   = app.taxaColetaTaxa || 0;
    const pedido = app.taxaColetaPedido != null ? app.taxaColetaPedido : (app.taxaColeta || 0) - taxa;
    const pedidoPago = app.taxaColetaPedidoPago != null ? !!app.taxaColetaPedidoPago : !!app.taxaColetaPaga;
    const taxaPaga   = app.taxaColetaTaxaPago   != null ? !!app.taxaColetaTaxaPago   : !!app.taxaColetaPaga;
    const total = app.taxaColeta || 0;
    const tudoPago = (!pedido && !taxa)
        ? (pedidoPago || taxaPaga)
        : (!pedido || pedidoPago) && (!taxa || taxaPaga);
    const parcial = !tudoPago && (pedidoPago || taxaPaga);
    return { pedido, taxa, pedidoPago, taxaPaga, total, tudoPago, parcial };
}

// Bloco financeiro da coleta domiciliar: Pedido + Taxa somando o Valor total.
// Pedido e taxa são quitados separadamente, cada um com seu próprio selo.
function _vwFinanceiro(app) {
    if (!(app.taxaColeta > 0) && !app.taxaColetaPaga) return '';

    const brl = v => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
    const r = _vwTaxaResumo(app);

    const selo = pago => `
        <span class="view-fin-selo ${pago ? 'view-fin-selo-pago' : 'view-fin-selo-apagar'}">
            <i class="fas ${pago ? 'fa-circle-check' : 'fa-circle-notch'}"></i>
            ${pago ? 'Pago' : 'A pagar'}
        </span>`;

    const parcela = (rotulo, valor, pago, tema, icone) => `
        <div class="view-fin-card view-fin-${tema} ${pago ? 'view-fin-quitado' : ''}">
            <span class="view-fin-rotulo"><i class="fas ${icone}"></i> ${_vwEscape(rotulo)}</span>
            <span class="view-fin-valor">${_vwEscape(brl(valor))}</span>
            ${selo(pago)}
        </div>`;

    const totalTema = r.tudoPago ? 'view-fin-pago' : (r.parcial ? 'view-fin-parcial' : 'view-fin-apagar');
    const totalIcone = r.tudoPago ? 'fa-circle-check' : (r.parcial ? 'fa-circle-half-stroke' : 'fa-circle-notch');
    const totalTexto = r.tudoPago ? 'Pago' : (r.parcial ? 'Pago em parte' : 'A pagar');

    // Tipo de cobrança: pode ser Particular, Convênio ou os dois juntos.
    const tipos = Array.isArray(app.taxaColetaTipos) ? app.taxaColetaTipos.filter(Boolean) : [];
    const tiposHtml = tipos.length
        ? `<div class="view-fin-tipos">${tipos.map(t => `
            <span class="view-fin-tipo view-fin-tipo-${t === 'Convênio' ? 'convenio' : 'particular'}">
                <i class="fas ${t === 'Convênio' ? 'fa-id-card-clip' : 'fa-user'}"></i>
                ${_vwEscape(t === 'Convênio' && Array.isArray(app.taxaColetaConvenios) && app.taxaColetaConvenios.length
                    ? `Convênio: ${app.taxaColetaConvenios.join(', ')}` : t)}
            </span>`).join('')}</div>`
        : '';

    return `
        <section class="view-bloco view-fin-bloco">
            <h4 class="view-bloco-titulo"><i class="fas fa-sack-dollar"></i> Valores da coleta</h4>
            ${tiposHtml}
            <div class="view-fin-grid">
                ${parcela('Pedido', r.pedido, r.pedidoPago, 'pedido', 'fa-file-invoice-dollar')}
                <span class="view-fin-op">+</span>
                ${parcela('Taxa', r.taxa, r.taxaPaga, 'taxa', 'fa-route')}
                <span class="view-fin-op">=</span>
                <div class="view-fin-card view-fin-total ${totalTema}">
                    <span class="view-fin-rotulo"><i class="fas fa-coins"></i> Valor total</span>
                    <span class="view-fin-valor">${_vwEscape(brl(r.total))}</span>
                    <span class="view-fin-selo">
                        <i class="fas ${totalIcone}"></i>
                        ${totalTexto}
                    </span>
                </div>
            </div>
        </section>`;
}

function _vwBloco(titulo, icone, conteudo) {
    if (!conteudo || !conteudo.trim()) return '';
    return `
        <section class="view-bloco">
            <h4 class="view-bloco-titulo"><i class="fas ${icone}"></i> ${_vwEscape(titulo)}</h4>
            <div class="view-bloco-grid">${conteudo}</div>
        </section>`;
}

// Cartão neutro de um paciente da visita: nome e dados em cinza, com o
// status isolado num balão próprio na cor que o representa.
function _vwPacienteCard(a, ordem) {
    const st = statusPaciente(a);
    const tema = VIEW_STATUS_TEMA[st] || VIEW_STATUS_TEMA['Agendado'];

    const meta = [];
    if (a.idade != null) meta.push(idadeLabel(a.idade));
    if (a.pedido) meta.push(`Pedido ${a.pedido}`);

    return `
        <div class="view-paciente-card">
            <div class="view-paciente-info">
                <span class="view-paciente-ordem">Paciente ${ordem}</span>
                <span class="view-paciente-nome">${_vwEscape(a.nome || '—')}</span>
                ${meta.length ? `<span class="view-paciente-meta">${_vwEscape(meta.join(' · '))}</span>` : ''}
            </div>
            <span class="view-paciente-status ${tema.bg} ${tema.texto}">
                <i class="fas ${tema.icon}"></i> ${_vwEscape(st)}
            </span>
        </div>`;
}

// Contato com atalho direto para o WhatsApp e cópia do número
function _vwContato(contato) {
    if (!contato) return '';
    const digitos = String(contato).replace(/\D/g, '');
    if (!digitos) return _vwCampo('Contato', contato);

    // Números locais (10/11 dígitos) recebem o DDI do Brasil
    const numero = digitos.length <= 11 ? `55${digitos}` : digitos;
    const link = `https://wa.me/${numero}`;

    const valor = `
        <span class="view-contato">
            <a href="${link}" target="_blank" rel="noopener noreferrer" class="view-whatsapp" title="Conversar no WhatsApp">
                <i class="fab fa-whatsapp"></i>
                <span>${_vwEscape(contato)}</span>
            </a>
            <button type="button" class="view-copiar" title="Copiar número"
                onclick="copiarContatoView(this, '${_vwEscape(contato)}')">
                <i class="fas fa-copy"></i>
            </button>
        </span>`;
    return _vwCampo('Contato', valor, { html: true });
}

// Copia o contato exibido. document.execCommand cobre navegadores/contextos em
// que a Clipboard API não está disponível (ex.: página aberta sem HTTPS).
function copiarContatoView(botao, contato) {
    const marcarOk = () => {
        botao.classList.add('view-copiado');
        botao.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            botao.classList.remove('view-copiado');
            botao.innerHTML = '<i class="fas fa-copy"></i>';
        }, 1500);
        showNotification('Número copiado para a área de transferência.', 'success', 3000);
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(contato).then(marcarOk).catch(() => {
            showNotification('Não foi possível copiar o número.', 'error');
        });
        return;
    }

    const area = document.createElement('textarea');
    area.value = contato;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
        document.execCommand('copy');
        marcarOk();
    } catch (e) {
        showNotification('Não foi possível copiar o número.', 'error');
    }
    document.body.removeChild(area);
}

// Anexos — reaproveita o modelo salvo pelo sistema de upload, com o mesmo
// ícone/cor por família de arquivo usado na tela de edição (_iconeAnexo).
function _vwAnexos(app) {
    const anexos = (app.anexos || []).filter(a => a && (a.url || (a.tipo === 'imagem' && a.fileId)));
    if (!anexos.length) return '';

    const itens = anexos.map((a, i) => {
        const nome = _vwEscape(a.titulo || 'Anexo');
        const familia = a.tipo === 'link' ? 'link' : (a.tipo === 'imagem' ? 'imagem' : _familiaDaExt(a.fileExt));
        const icone = typeof _iconeAnexo === 'function' ? _iconeAnexo(a.fileExt, a.tipo) : '';
        const estilo = `--anexo-cor: ${_ICON_CORES[familia] || _ICON_CORES.generico}; --anexo-delay: ${i * 40}ms;`;

        if (a.tipo === 'imagem') {
            // O título vai escapado também para aspas simples, senão um nome com
            // apóstrofo quebraria o argumento do onclick.
            const tituloJs = _vwEscape(a.titulo || '').replace(/'/g, '&#39;');
            return `<button type="button" class="view-anexo-card" style="${estilo}" onclick="abrirImagemAnexo('${_vwEscape(a.fileId)}','${tituloJs}')">
                <span class="view-anexo-icone">${icone}</span>
                <span class="view-anexo-nome" title="${nome}">${nome}</span>
                <i class="fas fa-eye view-anexo-seta"></i>
            </button>`;
        }
        return `<a class="view-anexo-card" style="${estilo}" href="${_vwEscape(a.url)}" target="_blank" rel="noopener noreferrer">
            <span class="view-anexo-icone">${icone}</span>
            <span class="view-anexo-nome" title="${nome}">${nome}</span>
            <i class="fas ${a.tipo === 'link' ? 'fa-arrow-up-right-from-square' : 'fa-download'} view-anexo-seta"></i>
        </a>`;
    }).join('');

    return `<section class="view-bloco">
        <h4 class="view-bloco-titulo"><i class="fas fa-paperclip"></i> Anexos</h4>
        <div class="view-anexos">${itens}</div>
    </section>`;
}

// Checklist — só os itens que a agenda ativa realmente usa
function _vwChecklist(app, agenda) {
    const itens = agenda.checklist;
    if (!itens.length) return '';

    const linhas = itens.map(item => {
        const cfg = CHECKLIST_ITENS[item];
        const ok = !!app[cfg.chave];
        return `<div class="view-chk ${ok ? 'view-chk-ok' : 'view-chk-off'}">
            <i class="fas ${ok ? 'fa-circle-check' : 'fa-circle'}"></i>
            <span>${_vwEscape(cfg.rotulo)}</span>
        </div>`;
    }).join('');

    return `<section class="view-bloco">
        <h4 class="view-bloco-titulo"><i class="fas fa-clipboard-check"></i> Checklist</h4>
        <div class="view-chk-lista">${linhas}</div>
    </section>`;
}

// Endereço montado em uma linha legível
function _vwEndereco(app) {
    const rua = [app.logradouro, app.numero].filter(Boolean).join(', ');
    const linha = [rua, app.complemento, app.bairro].filter(Boolean).join(' · ');
    const cidade = [app.cidade, app.estado].filter(Boolean).join(' / ');

    return _vwCampo('Endereço', linha, { largo: true })
        + _vwCampo('Cidade', cidade)
        + _vwCampo('CEP', app.cep)
        + (app.distante ? _vwCampo('Localidade', 'Distante', { classe: DISTANTE_TEMA.text }) : '');
}

// Texto de busca do mapa — mesma montagem usada no formulário, porém a partir
// do registro salvo em vez dos inputs
function _vwEnderecoBusca(app) {
    return [
        [app.logradouro, app.numero].filter(Boolean).join(', '),
        app.bairro, app.cidade, app.estado, app.cep
    ].filter(Boolean).join(', ');
}

// Botão que abre o mapa do Google embutido, sem sair da visualização
function _vwMapa(app) {
    if (!_vwEnderecoBusca(app)) return '';
    return `
        <div class="view-campo-largo view-mapa-bloco">
            <button type="button" id="view-btn-mapa" class="view-mapa-btn" onclick="toggleMapaView()">
                <i class="fas fa-map-location-dot"></i>
                <span id="view-mapa-label">Ver no mapa</span>
                <i class="fas fa-chevron-down view-mapa-chevron"></i>
            </button>
            <div id="view-mapa-container" class="view-mapa-container hidden">
                <iframe id="view-mapa-iframe" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
            </div>
        </div>`;
}

// Abre/fecha o mapa do registro em exibição. O src só é preenchido na abertura
// para não carregar o embed do Google enquanto o mapa estiver oculto.
function toggleMapaView() {
    const container = document.getElementById('view-mapa-container');
    const iframe = document.getElementById('view-mapa-iframe');
    const label = document.getElementById('view-mapa-label');
    const chevron = document.querySelector('#view-btn-mapa .view-mapa-chevron');
    if (!container || !iframe) return;

    if (!container.classList.contains('hidden')) {
        container.classList.add('hidden');
        iframe.src = '';
        label.textContent = 'Ver no mapa';
        if (chevron) chevron.style.transform = '';
        return;
    }

    const app = appointments.find(a => a.id == _viewRecordId);
    const endereco = app ? _vwEnderecoBusca(app) : '';
    if (!endereco) {
        showNotification('Endereço incompleto para localizar no mapa.', 'error');
        return;
    }

    iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(endereco)}&output=embed`;
    container.classList.remove('hidden');
    label.textContent = 'Ocultar mapa';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
}

// ── ABERTURA ────────────────────────────────────────────────
let _viewRecordId = null;

function viewRecord(id) {
    const app = appointments.find(a => a.id == id);
    if (!app) return;

    const agenda = currentAgenda();
    const cores = agendaCores(agenda);
    _viewRecordId = app.id;

    const atrasado = _vwAtrasado(app);
    const tema = VIEW_STATUS_TEMA[app.status] || VIEW_STATUS_TEMA['Agendado'];
    const faixa = temaFaixaEtaria(app, agenda);

    // ── Cabeçalho
    document.getElementById('view-agenda-nome').textContent = agenda.nome;
    document.getElementById('view-paciente').textContent = app.paciente || '—';

    const dataFmt = app.data ? app.data.split('-').reverse().join('/') : '—';
    document.getElementById('view-quando').textContent =
        `${dataFmt} · ${app.horaInicio || '--:--'} às ${app.horaFim || '--:--'}`;

    // Selo de status (+ atraso e faixa etária, quando se aplicam)
    const selos = document.getElementById('view-selos');
    let selosHtml = `<span class="view-selo ${tema.bg} ${tema.texto}">
        <i class="fas ${tema.icon}"></i> ${_vwEscape(app.status || 'Agendado')}</span>`;
    if (atrasado) {
        selosHtml += `<span class="view-selo bg-red-50 text-red-700"><i class="fas fa-triangle-exclamation"></i> Atrasado</span>`;
    }
    if (faixa) {
        selosHtml += `<span class="view-selo ${faixa.bg} ${faixa.text}"><i class="fas fa-child"></i> ${faixa.rotulo}</span>`;
    }
    if (temCampo('endereco', agenda) && app.distante) {
        selosHtml += `<span class="view-selo ${DISTANTE_TEMA.bg} ${DISTANTE_TEMA.text}"><i class="fas ${DISTANTE_TEMA.icon}"></i> ${DISTANTE_TEMA.rotulo}</span>`;
    }
    if (temCampo('multiPaciente', agenda) && (app.acompanhantes || []).length) {
        const r = resumoPacientes(app);
        selosHtml += `<span class="view-selo bg-slate-100 text-slate-700"><i class="fas fa-users"></i> ${r.concluidos}/${r.total} concluídos</span>`;
    }
    if (temCampo('endereco', agenda) && app.coletaAtiva && resumoPacientes(app).pendentes > 0) {
        selosHtml += `<span class="view-selo view-selo-coleta-ativa"><span class="coleta-play-selo"><i class="fas fa-play"></i></span> Coletando</span>`;
    }
    selos.innerHTML = selosHtml;

    // ── Corpo — cada bloco existe só se a agenda usar aqueles campos
    let html = '';

    html += _vwBloco('Agendamento', 'fa-calendar-days',
        _vwCampo('Data', dataFmt)
        + _vwCampo('Início', app.horaInicio)
        + _vwCampo('Término', app.horaFim)
        + _vwCampo('Duração', app.duracao)
    );

    let paciente = _vwCampo('Nome', app.paciente)
        + _vwCampo('Idade', idadeLabel(app.idade))
        + _vwContato(app.contato);
    if (temCampo('pedido', agenda)) paciente += _vwCampo('Nº do Pedido', app.pedido);
    if (app.responsavelNome) paciente += _vwCampo('Responsável', app.responsavelNome);
    if (app.responsavelParentesco) paciente += _vwCampo('Grau de parentesco', app.responsavelParentesco);
    html += _vwBloco('Paciente', 'fa-user', paciente);

    // Demais pessoas atendidas na mesma visita
    if (temCampo('multiPaciente', agenda) && (app.acompanhantes || []).length) {
        const linhas = app.acompanhantes.map((a, i) => _vwPacienteCard(a, i + 2)).join('');
        html += _vwBloco(`Outros pacientes na visita (${app.acompanhantes.length})`, 'fa-users',
            `<div class="view-pacientes">${linhas}</div>`);
    }

    // Bloco do exame — só nas agendas que têm exame/substrato/abstinência
    let exame = '';
    if (temCampo('exame', agenda))     exame += _vwCampo('Exame', app.exame);
    if (temCampo('substrato', agenda)) exame += _vwCampo('Substrato', app.substrato);
    if (temCampo('metano', agenda) && app.exame === 'TSBAC') exame += _vwCampo('Metano', app.metano);
    if (temCampo('abstinencia', agenda) && app.abstinencia != null) {
        exame += _vwCampo('Abstinência', `${app.abstinencia} dia(s)`);
    }
    html += _vwBloco('Exame', 'fa-flask', exame);

    // Bloco de endereço — exclusivo das agendas domiciliares
    if (temCampo('endereco', agenda)) {
        let end = _vwEndereco(app);
        if (temCampo('pontoReferencia', agenda)) {
            end += _vwCampo('Ponto de referência', app.pontoReferencia);
        }
        end += _vwMapa(app);
        html += _vwBloco('Endereço', 'fa-location-dot', end);
        html += _vwFinanceiro(app);
    }

    let equipe = _vwCampo('Atendente', app.atendente);
    if (temCampo('coletador', agenda)) {
        equipe += _vwCampo('Coletador', app.coletador);
        if (app.coletadorAuxiliar) equipe += _vwCampo('Coletador auxiliar', app.coletadorAuxiliar);
    }
    html += _vwBloco('Atendimento', 'fa-user-nurse', equipe);

    html += _vwChecklist(app, agenda);
    html += _vwAnexos(app);

    // Cancelamento e observações
    let obs = '';
    if (app.status === 'Cancelado' && app.motivoPerda) {
        obs += _vwCampo('Motivo da perda', app.motivoPerda, { largo: true, classe: 'text-red-600' });
    }
    if (app.comentarios) obs += _vwCampo('Comentários', app.comentarios, { largo: true });
    html += _vwBloco('Observações', 'fa-comment-dots', obs);

    document.getElementById('view-corpo').innerHTML = html;

    // Barra superior na cor da agenda ativa
    const barra = document.getElementById('view-barra-agenda');
    if (barra) barra.className = `view-barra ${cores.accent}`;

    // Conclusão e ausência só fazem sentido enquanto houver paciente pendente.
    // Numa visita totalmente encerrada os dois botões somem.
    const pendentes = resumoPacientes(app).pendentes;
    const btnConcluir = document.getElementById('view-btn-concluir');
    if (btnConcluir) btnConcluir.style.display = pendentes ? '' : 'none';

    const btnAusente = document.getElementById('view-btn-ausente');
    if (btnAusente) btnAusente.style.display = pendentes ? '' : 'none';

    // Sinalização de coleta em andamento — só nas agendas domiciliares
    if (typeof _vwAplicarColetaAtiva === 'function') _vwAplicarColetaAtiva(app, agenda);

    // Excluir só para administradores, como no restante do sistema
    const btnExcluir = document.getElementById('view-btn-excluir');
    if (btnExcluir) btnExcluir.style.display = isAdmin() ? '' : 'none';

    if (temCampo('endereco', agenda) && app.coletaAtiva) {
        try { toggleMapaView(); } catch (e) { console.error('Abrir mapa padrão falhou', e); }
    }

    document.getElementById('modal-view-record').classList.add('active');
}

// Fecha a visualização e abre o formulário de edição do mesmo registro
function editFromView() {
    const id = _viewRecordId;
    document.getElementById('modal-view-record').classList.remove('active');
    if (id != null) editRecord(id);
}

function closeViewRecord() {
    _viewRecordId = null;
    document.getElementById('modal-view-record').classList.remove('active');
}

// Rastreabilidade do agendamento aberto — atalho do ícone de relógio no
// cabeçalho. Diferente de openAppointmentHistory(), que lê o id do formulário
// de edição, aqui o id vem da própria visualização.
function openViewRecordHistory() {
    if (_viewRecordId == null) return;
    openHistoryModal({ type: 'appointment', id: _viewRecordId });
}

// Excluir direto da visualização (mantém a confirmação padrão do sistema)
function deleteFromView() {
    const id = _viewRecordId;
    document.getElementById('modal-view-record').classList.remove('active');
    if (id != null) deleteRecord(id);
}
