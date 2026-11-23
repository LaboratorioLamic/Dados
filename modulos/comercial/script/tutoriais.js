// ═══════════════════════════════════════════════════════════════
// tutoriais.js — Catálogo de tutoriais da Central de treinamento
// ═══════════════════════════════════════════════════════════════
//
// Fonte de verdade dos tutoriais; Tutorial.md descreve cada um.
// Ao mudar uma tela ou fluxo coberto aqui, pergunte antes de atualizar
// este arquivo e o Tutorial.md (o processo pode estar em desenvolvimento).
//
// Tutorial: { id, modulo (chave de TUT_MODULOS), titulo, desc, icone, requer: [[módulo, ação]], permitido?: () => bool, passos }
// Formato do passo: veja o cabeçalho de tutorial.js.

const qsTut = s => document.querySelector(s);
const gavetaAbertaTut = () => document.getElementById('gaveta').classList.contains('open');
const gavetaFechadaTut = () => !gavetaAbertaTut();
const preparaTut = fn => () => { if (gavetaAbertaTut()) fecharGaveta(); fecharPop(); if (celularTut()) fecharMenu(); fn?.(); };
// Preço atual do exame da primeira linha + 10%, arredondado (lê campo com vírgula automática ou numérico)
const precoSugeridoTut = (sel, fator = 1.1) => () => {
  const v = lerMoeda(qsTut(sel)?.value);
  return v > 0 ? (Math.ceil(v * fator * 100) / 100).toFixed(2) : '50.00';
};
// Janelas de proposta sempre na vista analítica (indicadores e quadro completo existem só nela)
const vistaAnaliticaTut = () => { _ppVista = 'analitico'; };
// Lista de propostas: primeira pendente que abre uma proposta só (lote abre outro quadro)
const linhaPropostaTut = () => qsTut('#prop-corpo tbody tr.row[onclick^="abrirProposta"]') || qsTut('#prop-corpo tbody tr.row');
// Sino: o clique no Próximo fecha o painel (clique fora); reabre depois que o clique termina
const abrirSinoTut = () => setTimeout(() => { if (!_sinoAberto && qsTut('#sino')) alternarSino(); }, 0);
const semItemSinoTut = () => !(_sinoAba === 'prop' ? sinoPendentes().length : SINO_EXAMES[_sinoAba] ? sinoExames(_sinoAba).length : 0);
const fimTut = (texto, icone = 'fa-flag-checkered') => ({ titulo: 'Pronto!', icone, texto, acao: 'ver' });
// Fechar a gaveta pelo X (sem alteração pendente ela fecha direto)
const fecharGavetaTut = (texto = 'Clique no <b>X</b> para fechar a gaveta e voltar à lista.') =>
  ({ alvo: '#gaveta .dr-h .icon-btn', esperar: '#gaveta.open', titulo: 'Fechar', icone: 'fa-xmark', texto, acao: 'clique' });

const TUTORIAIS = [
  // ── Primeiros passos ────────────────────────────────────────
  {
    id: 'geral-primeiros-passos', modulo: 'geral', icone: 'fa-compass', requer: [],
    titulo: 'Conhecendo o sistema', desc: 'Menu, barra do topo, notificações, treinamento, perfil e modo noturno.',
    passos: [
      { titulo: 'Bem-vindo ao COMERCIAL LAMIC', icone: 'fa-hand-sparkles', antes: preparaTut(),
        texto: 'Este é o ambiente comercial do LAMIC: custos dos exames, margens, tabelas de preço e propostas. Vamos conhecer a tela em poucos passos.' },
      { alvo: '#nav', titulo: 'Menu lateral', icone: 'fa-bars', acao: 'ver', antes: () => { if (celularTut()) abrirMenu(); },
        texto: 'Aqui ficam as telas do sistema. Você só vê as telas que o <b>seu grupo</b> tem permissão para acessar.' },
      { alvo: '#user-box', titulo: 'Seu perfil', icone: 'fa-user', acao: 'ver', antes: () => { if (celularTut()) abrirMenu(); },
        texto: 'Seu nome e cargo. Clique aqui (fora do treinamento) para alterar seu nome ou sua senha.' },
      { alvo: '.toggle-row.escuro', titulo: 'Modo noturno', icone: 'fa-moon', acao: 'ver', antes: () => { if (celularTut()) abrirMenu(); },
        texto: 'Liga o tema escuro, mais confortável à noite. A escolha fica salva neste navegador.' },
      { alvo: '.topbar .tb-title', titulo: 'Onde você está', icone: 'fa-location-dot', acao: 'ver', antes: preparaTut(),
        texto: 'O título e o caminho mostram a tela aberta no momento.' },
      { alvo: '[data-tut="tb-tutorial"]', titulo: 'Central de treinamento', icone: 'fa-graduation-cap', acao: 'ver',
        texto: 'Aqui ficam todos os tutoriais disponíveis para o seu acesso. Os concluídos ganham um selo verde.' },
      { alvo: '#sino .sino-btn', titulo: 'Notificações', icone: 'fa-bell', acao: 'ver', pular: () => !qsTut('#sino'),
        texto: 'O sino avisa o que precisa de atenção: <b>propostas</b> aguardando aprovação, exames <b>a auditar</b> e valores para atualizar no Unilab. Cada aba pode ser silenciada.' },
      { alvo: '.topbar [onclick="sair()"]', titulo: 'Sair', icone: 'fa-arrow-right-from-bracket', acao: 'ver',
        texto: 'Encerra a sua sessão do Dados LAMIC (vale para todos os módulos) e volta para a página do Dados.' },
      fimTut('Agora você conhece a estrutura da tela. Explore os outros tutoriais da Central de treinamento.')
    ]
  },
  {
    // Uma parada por tela da seção "Principal" do menu; telas sem permissão são puladas
    id: 'geral-telas', modulo: 'geral', icone: 'fa-map', requer: [],
    titulo: 'Tour pelas telas', desc: 'Apresentação geral de cada tela do menu Principal que o seu grupo pode acessar.',
    passos: [
      { titulo: 'Tour pelas telas', icone: 'fa-map', antes: preparaTut(),
        texto: 'Vamos passar por cada tela do menu <b>Principal</b> e ver para que ela serve. Só aparecem as telas que o <b>seu grupo</b> pode acessar.' },
      ...[
        ['inicio', 'Início', 'fa-house', 'Painel do dia: indicadores de margem, situação dos exames, margem por setor, pendências e últimas alterações.', '#s-inicio .kpis', 'Indicadores',
          'Cada indicador resume um ponto de atenção. Clique em um (fora do treinamento) para ver a lista de exames correspondente.'],
        ['exames', 'Exames', 'fa-flask-vial', 'Lista de todos os exames com custo, preço e margem. Clicando em um exame abre a <b>ficha</b> com a composição do preço.', '#s-exames .subnav', 'Ativos e inativos',
          'Exames inativos saem das tabelas, do simulador e dos PDFs, mas continuam guardados aqui.'],
        ['custos', 'Custos', 'fa-boxes-stacked', 'Base do custo de cada exame. Uma alteração aqui vale para todos os exames que usam aquele custo.', '#s-custos .subnav', 'Abas de Custos',
          '<b>Custos fixos</b> (linear ou rateado por atendimento), <b>Reagentes e insumos</b> e <b>Laboratórios de apoio</b> com seus vínculos.'],
        ['tabelas', 'Tabelas de Preço', 'fa-table-list', 'Preços de cada tabela. As edições ficam no seu <b>rascunho</b> até serem enviadas para aprovação.', '#s-tabelas .subnav', 'Abas de Tabelas',
          '<b>Tabelas</b>, <b>Laboratórios apoiados</b>, <b>Conveniados</b>, <b>Hierarquia</b> de valor entre tabelas e <b>Propostas</b> (pendentes e histórico).'],
        ['simulador', 'Simulador', 'fa-chart-line', 'Mostra o impacto antes de aplicar. Nenhum preço muda até a proposta ser aprovada.', '#s-simulador .subnav', 'Abas do Simulador',
          '<b>Reajuste de tabela</b>, <b>Comparar tabelas</b>, <b>Proposta L2L</b> para laboratórios, <b>Propostas Empresas</b>, <b>Proposta cliente</b> (orçamento) e <b>Proposta médico</b>, com PDF.'],
        ['pendencias', 'Pendências', 'fa-triangle-exclamation', 'Exames com algo que impede um preço confiável: sem custo, sem setor, abaixo do mínimo, divergência com o Unilab…', '#s-pendencias .tabs', 'Categorias',
          'Cada aba é um tipo de pendência, com a quantidade de exames. Clique em um exame para abrir a ficha e resolver.'],
        ['instrucoes', 'Instruções', 'fa-book-medical', 'Instruções de coleta e preparo de cada exame, com anexos. É o que aparece para os laboratórios apoiados.', '#s-instrucoes .subnav', 'Ativos e inativos',
          'Separa as instruções dos exames ativos e inativos, com a contagem de cada grupo.']
      ].flatMap(([tela, nome, icone, texto, alvo, titulo2, texto2]) => [
        { ...passoMenuTut(tela, nome, `Clique em <b>${nome}</b>. ${texto}`, { icone }), pular: () => !podeVerTela(tela) },
        { alvo, titulo: titulo2, icone, acao: 'ver', pular: () => !podeVerTela(tela), antes: () => { if (celularTut()) fecharMenu(); }, texto: texto2 }
      ]),
      fimTut('Essas são as telas do menu Principal. Cada uma tem tutoriais próprios aqui na Central de treinamento.', 'fa-map-location-dot')
    ]
  },
  {
    // O sino aparece para quem acessa Tabelas (aba Propostas) ou Exames (abas de controle interno)
    id: 'geral-notificacoes', modulo: 'geral', icone: 'fa-bell', requer: [], permitido: () => pode('tabelas') || pode('exames'),
    titulo: 'Notificações (sino)', desc: 'Abas do sino, silenciar avisos, abrir um item e ir para a lista completa.',
    passos: [
      { titulo: 'Notificações', icone: 'fa-bell', antes: preparaTut(() => fecharSino()),
        texto: 'O sino da barra do topo reúne o que precisa da sua atenção. As abas dependem do seu acesso: <b>Propostas</b> (Tabelas de Preço) e os controles dos <b>Exames</b>.' },
      { alvo: '#sino .sino-btn', titulo: 'Abra o sino', icone: 'fa-hand-pointer', acao: 'clique', antes: () => setTimeout(fecharSino, 0),
        texto: 'O número vermelho soma os itens pendentes das abas que não estão silenciadas. Clique no sino.' },
      { alvo: '#sino-pan .sino-h', esperar: '#sino.open', titulo: 'Resumo', icone: 'fa-list-ul', acao: 'ver', antes: abrirSinoTut,
        texto: 'O cabeçalho mostra quantos itens há em cada aba, por exemplo "3 propostas · 5 a auditar".' },
      { alvo: '#sino-pan .sino-abas', esperar: '#sino.open', titulo: 'Abas', icone: 'fa-folder-tree', acao: 'ver', antes: abrirSinoTut, pular: () => sinoAbas().length < 2,
        texto: '<b>Propostas</b>: preços aguardando aprovação. <b>A auditar</b>: exames marcados para revisão. <b>Atualizar no UniLab</b>: valor alterado aqui e ainda não lançado no UniLab. <b>Fora do catálogo</b>: exames marcados como fora do sistema.' },
      { alvo: '#sino-pan .sino-abas button:not(.on)', esperar: '#sino.open', titulo: 'Troque de aba', icone: 'fa-hand-pointer', acao: 'clique', antes: abrirSinoTut, pular: () => sinoAbas().length < 2,
        texto: 'Clique em outra aba para ver os itens dela.' },
      { alvo: '#sino-pan .sino-l', esperar: '#sino.open', titulo: 'Itens', icone: 'fa-bars-staggered', acao: 'ver', antes: abrirSinoTut,
        texto: 'Os mais recentes ficam no topo. Cada item mostra quem alterou, quando e um resumo: variação dos preços na proposta ou margem e preço do exame.' },
      { alvo: '#sino-pan .sino-mudo .switch', esperar: '#sino.open', titulo: 'Silencie a aba', icone: 'fa-bell-slash', acao: 'clique', antes: abrirSinoTut,
        texto: 'Desligue a chave: a aba silenciada continua no sino, mas deixa de somar no número vermelho. A preferência vale só para você, neste navegador.' },
      { alvo: '#sino-pan .sino-mudo .switch', esperar: '#sino.open', titulo: 'Ligue de novo', icone: 'fa-bell', acao: 'clique', antes: abrirSinoTut,
        texto: 'Veja o ícone de sino cortado na aba. Clique na chave outra vez para voltar a ser avisado.' },
      { alvo: '#sino-pan .sino-l .sino-it', esperar: '#sino.open', titulo: 'Abra um item', icone: 'fa-hand-pointer', acao: 'clique', antes: abrirSinoTut, pular: semItemSinoTut,
        texto: 'Clique no item: abre a <b>proposta</b> para revisar (e aprovar, se você tiver permissão) ou a <b>ficha do exame</b>. Em <b>Atualizar no UniLab</b>, quem pode editar vai direto à confirmação da tabela do sistema.', avancaSe: () => gavetaAbertaTut() || modalAbertoTut() },
      { alvo: '#modal .modal-card', titulo: 'Atualizar a tabela do sistema', icone: 'fa-database', acao: 'ver', pular: () => !modalAbertoTut(),
        texto: 'Confira os valores. Confirme só depois de lançar o novo valor no UniLab: a tabela do sistema no banco passa a ter o valor publicado e o item sai do sino.' },
      { alvo: '#modal [data-r="0"]', titulo: 'Cancele por enquanto', icone: 'fa-xmark', acao: 'clique', pular: () => !modalAbertoTut(),
        texto: 'Clique em <b>Cancelar</b>: o item continua pendente no sino.' },
      { alvo: '#gaveta .dr-b', esperar: '#gaveta.open', titulo: 'Resolva por aqui', icone: 'fa-magnifying-glass', acao: 'ver', pular: () => semItemSinoTut() || !gavetaAbertaTut(),
        texto: 'Resolvido o motivo (proposta aprovada, auditoria feita, valor lançado no UniLab), o item sai do sino sozinho.' },
      { ...fecharGavetaTut(), pular: () => semItemSinoTut() || !gavetaAbertaTut() },
      { alvo: '#sino-pan .sino-f', esperar: '#sino.open', titulo: 'Lista completa', icone: 'fa-arrow-right', acao: 'ver', antes: abrirSinoTut,
        texto: '<b>Ver todas</b> abre Tabelas de Preço › Propostas; <b>Ver na lista</b> abre Exames já filtrado pelo controle interno da aba.' },
      fimTut('Confira o sino no começo do dia. Na simulação, a aba silenciada e o que foi aberto são descartados ao encerrar.', 'fa-bell')
    ]
  },

  // ── Início ──────────────────────────────────────────────────
  {
    id: 'inicio-painel', modulo: 'inicio', icone: 'fa-gauge-high', requer: [],
    titulo: 'Lendo o painel inicial', desc: 'Indicadores, situação dos exames, margem por setor e últimas alterações.',
    passos: [
      { ...passoMenuTut('inicio', 'Abra o Início', 'Clique em <b>Início</b> no menu para abrir o painel.'), antes: preparaTut(() => { if (celularTut()) abrirMenu(); }) },
      { alvo: '#s-inicio .kpis', titulo: 'Indicadores', icone: 'fa-chart-simple', acao: 'ver',
        texto: 'Os oito indicadores resumem a saúde dos preços: margem média, abaixo do mínimo, sem custo, divergência com o Unilab, propostas, hierarquia, abaixo do alvo e a auditar. <b>Clique em um indicador</b> para ver a lista correspondente.' },
      { alvo: '#s-inicio .kpi', titulo: 'Margem média', icone: 'fa-percent', acao: 'ver',
        texto: 'Média da margem dos exames ativos que têm custo e preço. O texto abaixo do número mostra quantos exames entraram na conta.' },
      { alvo: '#s-inicio .dist', titulo: 'Situação dos exames', icone: 'fa-chart-pie', acao: 'ver', pular: () => !qsTut('#s-inicio .dist'),
        texto: 'A barra divide os exames por status: <b style="color:var(--red)">abaixo do mínimo</b>, <b style="color:var(--amber)">abaixo do alvo</b>, <b style="color:var(--green)">saudável</b> e sem custo.' },
      { alvo: '#s-inicio .bars', titulo: 'Margem por setor', icone: 'fa-chart-bar', acao: 'ver', pular: () => !qsTut('#s-inicio .bars'),
        texto: 'Margem média dos maiores setores. As linhas verticais marcam a margem <b>mínima</b> e a <b>alvo</b>.' },
      { alvo: '#s-inicio .ini-list', titulo: 'Pendências', icone: 'fa-triangle-exclamation', acao: 'ver',
        texto: 'Quantos exames há em cada tipo de pendência. Com acesso a Pendências, clique para abrir a categoria.' },
      { alvo: '#ini-hist', titulo: 'Últimas alterações', icone: 'fa-clock-rotate-left', acao: 'ver',
        texto: 'O que foi alterado no sistema, por quem e quando.' },
      fimTut('Use o painel como ponto de partida do dia: ele mostra onde agir primeiro.')
    ]
  },

  // ── Exames ──────────────────────────────────────────────────
  {
    id: 'exames-buscar', modulo: 'exames', icone: 'fa-magnifying-glass', requer: [['exames', 'ver']],
    titulo: 'Buscar e filtrar exames', desc: 'Busca, filtros por setor, origem e controle interno, status e ordenação.',
    passos: [
      { ...passoMenuTut('exames', 'Abra Exames', 'Clique em <b>Exames</b> no menu.'),
        antes: preparaTut(() => { Object.assign(exF, { q: '', status: '', pag: 1, inativos: false }); if (celularTut()) abrirMenu(); }) },
      { alvo: '#q-ex', titulo: 'Busca', icone: 'fa-magnifying-glass', acao: 'digitar', valor: 'GLI',
        texto: 'Digite parte do <b>mnemônico</b> ou da <b>descrição</b>. A lista filtra enquanto você digita, sem acentos nem maiúsculas.' },
      { alvo: '#pop-exsetor .pop-btn', titulo: 'Filtro por setor', icone: 'fa-filter', acao: 'clique',
        texto: 'Clique para escolher um setor. Cada opção mostra quantos exames tem.' },
      { alvo: '#pop-exsetor .pop', esperar: '#pop-exsetor.open', titulo: 'Escolha o setor', icone: 'fa-list-check', acao: 'ver',
        texto: 'Pesquise o setor, use as setas do teclado e <b>Enter</b>. O X ao lado do filtro limpa a escolha.' },
      { alvo: '#pop-exorigem .pop-btn', titulo: 'Origem', icone: 'fa-route', acao: 'ver', antes: () => fecharPop(),
        texto: 'Separa exames <b>internos</b> (feitos no LAMIC) dos enviados a <b>laboratórios de apoio</b>.' },
      { alvo: '#pop-exctrl .pop-btn', titulo: 'Controle interno', icone: 'fa-clipboard-check', acao: 'ver',
        texto: 'Mostra só os exames marcados: valor não atualizado no sistema, fora do sistema, não efetua na Particular, apoio não negociado, <b>sem custo</b> (custo do teste não informado) e no meu rascunho.' },
      { alvo: '#ex-chips', titulo: 'Status da margem', icone: 'fa-circle-half-stroke', acao: 'ver',
        texto: 'Atalhos por status, com a contagem de cada um. Clique em um para filtrar.' },
      { alvo: '#ex-head', titulo: 'Ordenar', icone: 'fa-arrow-down-wide-short', acao: 'ver',
        texto: 'Clique no título de uma coluna para ordenar; clique de novo para inverter.' },
      { alvo: '#s-exames .subnav', titulo: 'Ativos e inativos', icone: 'fa-pause', acao: 'ver',
        texto: 'Exames inativos saem das tabelas, do simulador e dos PDFs, mas ficam guardados aqui.' },
      fimTut('Clique em qualquer linha da lista para abrir a ficha do exame. Veja o tutorial <b>Ficha do exame</b>.')
    ]
  },
  {
    id: 'exames-ficha', modulo: 'exames', icone: 'fa-file-invoice-dollar', requer: [['exames', 'ver']],
    titulo: 'Ficha do exame', desc: 'Composição do preço, margem, outras tabelas, custos, etapas e histórico.',
    passos: [
      { alvo: '#ex-body tr.row', titulo: 'Abra um exame', icone: 'fa-hand-pointer', acao: 'clique',
        antes: preparaTut(() => { Object.assign(exF, { q: '', status: '', pag: 1, inativos: false }); irTelaTut('exames')(); }),
        texto: 'Clique em um exame da lista para abrir a <b>ficha</b> na gaveta lateral.' },
      { alvo: '#fx-abas', esperar: '#gaveta.open', titulo: 'Abas da ficha', icone: 'fa-folder-open', acao: 'ver',
        texto: '<b>Valores</b>, <b>Custos</b>, <b>Controles</b>, <b>Instruções</b> e <b>Histórico</b>. A aba Valores abre primeiro.' },
      { alvo: '#fx-sug', titulo: 'Preço sugerido', icone: 'fa-wand-magic-sparkles', acao: 'ver',
        texto: 'Preço que atinge a margem alvo do setor (ou a geral), a partir do custo total do exame.' },
      { alvo: () => qsTut('#fx-preco')?.closest('.pbox'), titulo: 'Preço praticado', icone: 'fa-tag', acao: 'ver',
        texto: 'Preço da tabela Particular. Abaixo aparecem a <b>margem</b> e o status: vermelho abaixo do mínimo, âmbar abaixo do alvo, verde saudável.' },
      { alvo: '#fx-comp', titulo: 'Composição do preço', icone: 'fa-layer-group', acao: 'ver',
        texto: 'Como o preço se divide entre custo do teste, custos fixos, imposto e margem.' },
      { alvo: '#fx-tabs', titulo: 'Outras tabelas', icone: 'fa-table-list', acao: 'ver', pular: () => !qsTut('#fx-tabs'),
        texto: 'Preço do exame em cada tabela de preço, com a margem de cada uma. Quem pode editar tabelas altera, inclui ou retira daqui mesmo.' },
      { alvo: '#fx-abas button:nth-child(2)', titulo: 'Aba Custos', icone: 'fa-calculator', acao: 'clique',
        texto: 'Clique em <b>Custos</b> para ver de onde vem o custo do exame.' },
      { alvo: '#fx-custo', titulo: 'Custo do teste', icone: 'fa-vials', acao: 'ver',
        texto: '<b>Manual</b>, <b>Reagente</b> ou <b>Tabela do apoio</b>. Sair da tabela do apoio pede confirmação, pois o exame deixa de seguir o valor dela. Em Reagente, <b>Novo reagente</b> cadastra sem sair da ficha.' },
      { alvo: '#fx-casc', titulo: 'Cascata de custos', icone: 'fa-stairs', acao: 'ver',
        texto: 'Custo do teste somado aos custos fixos e adicionais, até o custo total.' },
      { alvo: () => qsTut('#fx-casc .switch')?.closest('.casc-r'), titulo: 'Ajuste neste exame', icone: 'fa-sliders', acao: 'ver', pular: () => !qsTut('#fx-casc .switch'),
        texto: 'O <b>lápis</b> define um valor próprio do custo fixo neste exame, a <b>seta</b> volta ao padrão e a <b>chave</b> ativa ou inativa. Em coleta e triagem, a chave acompanha a etapa do exame. Vale ao salvar a ficha.' },
      { alvo: '#fx-etapas', titulo: 'Etapas do atendimento', icone: 'fa-route', acao: 'ver',
        texto: 'Coleta e triagem só entram no custo se o exame passa por elas. O padrão vem do setor e pode ser ajustado aqui.' },
      { alvo: '#fx-abas button:nth-child(5)', titulo: 'Aba Histórico', icone: 'fa-clock-rotate-left', acao: 'clique',
        texto: 'Clique em <b>Histórico</b>.' },
      { alvo: '#fx-hist', titulo: 'Histórico', icone: 'fa-list-ul', acao: 'ver',
        texto: 'Todas as alterações do exame, com usuário e data.' },
      fecharGavetaTut(),
      fimTut('Você já sabe ler a ficha. Para alterar o preço, veja <b>Alterar preço e enviar para aprovação</b>.')
    ]
  },
  {
    id: 'exames-alterar-preco', modulo: 'exames', icone: 'fa-pen-to-square', requer: [['exames', 'editar']],
    titulo: 'Alterar preço e enviar para aprovação', desc: 'Novo preço praticado, justificativa e proposta para aprovação.',
    passos: [
      { alvo: '#ex-body tr.row', titulo: 'Abra um exame', icone: 'fa-hand-pointer', acao: 'clique',
        antes: preparaTut(() => { vistaAnaliticaTut(); Object.assign(exF, { q: '', status: '', pag: 1, inativos: false }); irTelaTut('exames')(); }),
        texto: 'Clique em um exame para abrir a ficha.' },
      { alvo: '#fx-preco', esperar: '#gaveta.open', titulo: 'Novo preço praticado', icone: 'fa-tag', acao: 'digitar', valor: precoSugeridoTut('#fx-preco'),
        pular: () => qsTut('#fx-preco')?.disabled,
        texto: 'Digite só os números: a vírgula entra sozinha pelos centavos (5730 vira 57,30). A margem, o status e a composição são recalculados na hora. Os preços das outras tabelas, logo abaixo, funcionam igual.' },
      { alvo: '#fx-st', titulo: 'Confira a margem', icone: 'fa-percent', acao: 'ver',
        texto: 'Veja a nova margem e o status. Preço abaixo do mínimo fica em vermelho.' },
      { alvo: '#fx-just', titulo: 'Justificativa', icone: 'fa-comment-dots', acao: 'digitar', valor: 'Reajuste anual (treinamento)',
        texto: 'Explique o motivo. Quem aprova vê este texto.' },
      { alvo: '#gaveta .dr-f', titulo: 'Opções de envio', icone: 'fa-paper-plane', acao: 'ver',
        texto: '<b>Rascunho</b> guarda para enviar depois · <b>Enviar proposta</b> abre o rascunho para conferir e confirmar · <b>Aprovar e publicar</b> (só para quem aprova) publica na hora e fecha a ficha. Se algum valor ficar diferente do UniLab, antes aparece a janela para marcar os já lançados lá.' },
      { alvo: '#gaveta [onclick="salvarFicha(\'confirmar\')"]', titulo: 'Enviar proposta', icone: 'fa-paper-plane', acao: 'clique', avancaSe: () => !!qsTut('#rx-lista'),
        texto: 'Clique em <b>Enviar proposta</b>. O preço vai para o seu rascunho e abre o <b>Rascunho de exames</b>, já neste exame.' },
      { alvo: '#rx-lista', esperar: '#rx-lista', titulo: 'Confira o rascunho', icone: 'fa-pen-to-square', acao: 'ver',
        texto: 'Um quadro por tabela alterada, como no envio da proposta: atual, proposto (editável aqui mesmo), desconto, margem e médias. A chave UniLab só aparece nos exames cujo valor difere do UniLab. A justificativa da ficha já vem preenchida abaixo.' },
      { alvo: '#rx-enviar', titulo: 'Confirmar envio', icone: 'fa-paper-plane', acao: 'clique', avancaSe: gavetaFechadaTut,
        texto: 'Clique em <b>Enviar para aprovação</b>. Uma proposta é criada para cada tabela alterada, todas num <b>lote</b> só.' },
      { alvo: '#sino .sino-btn', titulo: 'Proposta criada', icone: 'fa-bell', acao: 'ver', pular: () => !qsTut('#sino'),
        texto: 'A proposta (simulada) aparece no sino de quem aprova e em <b>Tabelas de Preço › Propostas</b>. O preço só muda depois da aprovação.' },
      fimTut('Preço alterado e enviado para aprovação. Na simulação nada foi gravado de verdade.')
    ]
  },
  {
    id: 'exames-novo', modulo: 'exames', icone: 'fa-plus', requer: [['exames', 'criar']],
    titulo: 'Cadastrar novo exame', desc: 'Mnemônico, preço, custo, arredondamento, setor, origem, material, prazo e anexos.',
    passos: [
      { alvo: '#s-exames [onclick="abrirDadosExame()"]', titulo: 'Novo exame', icone: 'fa-plus', acao: 'clique', antes: preparaTut(irTelaTut('exames')),
        texto: 'Clique em <b>Novo exame</b>.' },
      { alvo: '#dx-mn', esperar: '#gaveta.open', titulo: 'Mnemônico', icone: 'fa-hashtag', acao: 'digitar', valor: 'TREINO1',
        texto: 'Use o mesmo mnemônico do sistema do laboratório. Ele não pode ser alterado depois.',
        dica: 'É conferido ao teclar <b>Enter</b> ou <b>Tab</b> ou ao clicar fora. Se já existir, o campo fica vermelho e o <b>Salvar</b> é bloqueado. Se estiver no catálogo de instruções, nome, material, prazo, instrução e anexos são preenchidos; trocar o mnemônico troca o que veio do catálogo.' },
      { alvo: '#dx-custo', titulo: 'Custo do teste', icone: 'fa-vials', acao: 'digitar', valor: '850',
        texto: 'Custo manual do teste, também com a vírgula automática (850 vira 8,50). Depois você pode vincular um reagente ou a tabela do apoio na ficha.' },
      { alvo: '#dx-preco', titulo: 'Preço praticado', icone: 'fa-tag', acao: 'digitar', valor: '4500',
        texto: 'Preço na tabela Particular. Digite só os números: a vírgula entra sozinha pelos centavos (4500 vira 45,00).' },
      { alvo: '#dx-calc', titulo: 'Prévia', icone: 'fa-calculator', acao: 'ver', pular: () => !qsTut('#dx-calc .dp'),
        texto: 'Prévia da margem com o preço e o custo informados. <b>Piso</b> e <b>Alvo</b> preenchem o preço que atinge a margem mínima ou a alvo.' },
      { alvo: '#dx-calc .dp-arr', titulo: 'Arredondar', icone: 'fa-arrow-up-wide-short', acao: 'ver', pular: () => !qsTut('#dx-calc .dp-arr'),
        texto: 'Arredonda os preços de Piso e Alvo ao múltiplo mais próximo de <b>R$ 1, 5, 10 ou 100</b>. Para baixo só quando a margem continua dentro da tolerância (alvo) ou no mínimo (piso); senão, para cima. A escolha fica lembrada neste navegador.' },
      { alvo: '#dx-desc', titulo: 'Nome do exame', icone: 'fa-font', acao: 'digitar', valor: 'Exame de treinamento',
        texto: 'Nome que aparece nas listas, tabelas e PDFs.' },
      { alvo: '#pop-dxsetor', titulo: 'Setor', icone: 'fa-sitemap', acao: 'ver',
        texto: 'O setor define a margem alvo e as etapas padrão (coleta, triagem).' },
      { alvo: '#dx-origem', titulo: 'Origem', icone: 'fa-route', acao: 'ver',
        texto: '<b>Interno</b> é feito no LAMIC; <b>Apoio</b> é enviado a outro laboratório.' },
      { alvo: '#gaveta [onclick="copiarPromptInstrucao()"]', titulo: 'Copiar prompt', icone: 'fa-copy', acao: 'ver', pular: () => !qsTut('#gaveta [onclick="copiarPromptInstrucao()"]'),
        texto: '<b>Copiar prompt</b> copia o prompt de IA que organiza a instrução no padrão do catálogo (jejum, orientações, interações, conservação…). Cole numa IA junto com o texto técnico do exame e traga o resultado para o campo <b>Instrução do exame</b>.',
        dica: 'O texto do prompt é editado em Configurações › Parâmetros.' },
      { alvo: '#dx-anexos', titulo: 'Anexos', icone: 'fa-paperclip', acao: 'ver', pular: () => !qsTut('#dx-anexos'),
        texto: 'Links (Drive, PDF, formulário) da instrução do exame. Vão para o catálogo de instruções e aparecem clicáveis para os apoiados no L2L. Os anexos que já estão no catálogo entram sozinhos.' },
      { alvo: '#gaveta [onclick="gravarDadosExame()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', avancaSe: () => !qsTut('#dx-mn') || modalAbertoTut(),
        texto: 'Clique em <b>Salvar</b>.' },
      { alvo: '#modal .modal-card', titulo: 'Proposta ou publicar', icone: 'fa-stamp', acao: 'ver', pular: () => !modalAbertoTut(),
        texto: 'Com preço praticado, uma janela pergunta como ele passa a valer. <b>Enviar como proposta</b> (já marcado): vale depois da aprovação, e o exame fica sem preço até lá. <b>Publicar direto</b> (só quem aprova): vale na hora, sem revisão.' },
      { alvo: '#dx-pbal', titulo: 'Comentário', icone: 'fa-comment', acao: 'ver', pular: () => !qsTut('#dx-pbal') || qsTut('#dx-pbal').style.display === 'none',
        texto: 'O balão abre um campo opcional para o comentário da proposta. Já vem com "Exame recém criado"; edite se quiser explicar o preço a quem aprova.' },
      { alvo: '#modal [data-r="1"]', titulo: 'Confirmar', icone: 'fa-paper-plane', acao: 'clique', pular: () => !modalAbertoTut(), avancaSe: () => !qsTut('#dx-mn'),
        texto: 'Clique em <b>Enviar proposta</b>. A janela do cadastro fecha sozinha (em <b>Publicar direto</b>, a ficha do exame abre).' },
      fimTut('O exame foi criado na simulação e já aparece na lista. Ao encerrar o treinamento ele é descartado.')
    ]
  },
  {
    id: 'exames-rascunho', modulo: 'exames', icone: 'fa-pen-to-square', requer: [], permitido: () => pode('exames', 'editar') || pode('tabelas', 'editar'),
    titulo: 'Rascunho de exames', desc: 'Preços alterados nas fichas: conferir, marcar e enviar como proposta.',
    passos: [
      { alvo: '#ex-body tr.row', titulo: 'Abra um exame', icone: 'fa-hand-pointer', acao: 'clique',
        antes: preparaTut(() => { vistaAnaliticaTut(); Object.assign(exF, { q: '', status: '', pag: 1, inativos: false }); irTelaTut('exames')(); }),
        texto: 'Primeiro, um preço no rascunho. Clique em um exame para abrir a ficha.' },
      { alvo: '#fx-preco', esperar: '#gaveta.open', titulo: 'Novo preço', icone: 'fa-tag', acao: 'digitar', valor: precoSugeridoTut('#fx-preco'),
        pular: () => qsTut('#fx-preco')?.disabled,
        texto: 'Digite um novo preço praticado.' },
      { alvo: '#gaveta [onclick="salvarFicha(\'rascunho\')"]', titulo: 'Guardar no rascunho', icone: 'fa-pen-to-square', acao: 'clique', avancaSe: gavetaFechadaTut,
        pular: () => !qsTut('#gaveta [onclick="salvarFicha(\'rascunho\')"]'),
        texto: 'Clique em <b>Rascunho</b>: o preço fica guardado só para você, sem enviar.' },
      { alvo: '#ex-rasc', titulo: 'Botão Rascunho', icone: 'fa-pen-to-square', acao: 'clique', avancaSe: () => !!qsTut('#rx-lista'),
        antes: () => { if (gavetaAbertaTut()) fecharGaveta(); },
        texto: 'O número mostra quantos exames têm preço no seu rascunho. No filtro <b>Controle interno › No meu rascunho</b> a lista mostra só eles. Clique em <b>Rascunho</b>.' },
      { alvo: '#rx-lista', esperar: '#rx-lista', titulo: 'Exames no rascunho', icone: 'fa-list-check', acao: 'ver',
        texto: 'Um quadro por tabela, como no envio da proposta: Particular, custo, atual, proposto, desconto e margem, com as médias e a tabela toda. Se o exame ainda está no rascunho da Particular, o desconto das outras tabelas já usa esse valor. A chave <b>UniLab</b> aparece só nos exames cujo valor difere do UniLab. Clique no exame para abrir a ficha (ao fechar, volta aqui); <i class="fa-solid fa-rotate-left"></i> tira a linha do rascunho.' },
      { alvo: '#rx-lista .price-in input', titulo: 'Edite o valor', icone: 'fa-pen', acao: 'digitar', valor: precoSugeridoTut('#rx-lista .price-in input', 1.05), pular: () => !qsTut('#rx-lista .price-in input'),
        texto: 'O valor proposto pode ser alterado aqui mesmo, com a vírgula automática. Vale na hora para o envio, mesmo sem sair do campo; ao sair, margem e desconto são recalculados. Vazio retira o exame da tabela.' },
      { alvo: '#rx-arred .pp-arred', titulo: 'Arredondar', icone: 'fa-coins', acao: 'ver', pular: () => !qsTut('#rx-arred .pp-arred'),
        texto: 'Arredonda <b>para cima</b> todos os valores propostos no múltiplo de <b>R$ 1, 5, 10 ou 100</b>. Clique de novo no botão ativo para voltar aos centavos.' },
      { alvo: '#rx-arred .pp-vista', titulo: 'Analítico ou sintético', icone: 'fa-list', acao: 'ver', pular: () => !qsTut('#rx-arred .pp-vista'),
        texto: '<b>Analítico</b>: um quadro completo por tabela. <b>Sintético</b>: uma linha por exame e uma coluna por tabela, com o valor editável e margem e desconto logo abaixo (<b>+ sem custo</b> abre a aba de custos do exame). A escolha fica lembrada neste navegador; a chave UniLab só existe no Analítico.' },
      { alvo: '.rx-ck', titulo: 'Marque o que enviar', icone: 'fa-square-check', acao: 'ver', pular: () => !qsTut('.rx-ck'),
        texto: 'A caixa à esquerda do mnemônico marca o exame (cinza = desmarcado): só os <b>marcados</b> são enviados ou descartados. <b>Marcar todos</b> e o filtro agilizam.' },
      { alvo: '#rx-just', titulo: 'Justificativa', icone: 'fa-comment-dots', acao: 'digitar', valor: 'Reajuste de treinamento',
        texto: 'Explique o motivo. Quem aprova vê este texto.' },
      { alvo: '#gaveta .dr-f', titulo: 'Enviar', icone: 'fa-paper-plane', acao: 'ver',
        texto: '<b>Enviar para aprovação</b> cria uma proposta por tabela, todas num <b>lote</b> só (uma linha nas pendentes). <b>Aprovar e publicar</b> (só para quem aprova) publica direto; se algum valor ficar diferente do UniLab, antes aparece a janela para marcar os já lançados lá.' },
      { alvo: '#rx-enviar', titulo: 'Enviar para aprovação', icone: 'fa-paper-plane', acao: 'clique', avancaSe: gavetaFechadaTut, pular: () => !qsTut('#rx-enviar:not([disabled])'),
        texto: 'Clique em <b>Enviar para aprovação</b>.' },
      fimTut('Rascunho enviado (na simulação). As propostas aparecem em <b>Tabelas de Preço › Propostas</b> e no sino de quem aprova.')
    ]
  },

  // ── Custos ──────────────────────────────────────────────────
  {
    id: 'custos-fixos', modulo: 'custos', icone: 'fa-hand-holding-medical', requer: [['custos', 'editar']],
    titulo: 'Custos fixos: linear ou rateado', desc: 'Como cada custo fixo entra no preço dos exames.',
    passos: [
      { ...passoMenuTut('custos', 'Abra Custos', 'Clique em <b>Custos</b> no menu.'), antes: preparaTut(() => { custosAba = 'fixos'; if (celularTut()) abrirMenu(); }) },
      { alvo: '#custos-fixos .kpis', titulo: 'Resumo', icone: 'fa-chart-simple', acao: 'ver', antes: () => { if (custosAba !== 'fixos') abrirSubaba('custos', 'fixos'); },
        texto: 'Total dos custos <b>lineares</b>, <b>rateados</b>, dos que dependem de etapa e o total por exame.' },
      { alvo: '#custos-fixos tbody tr:first-child td:nth-child(2) .seg', titulo: 'Cobrança', icone: 'fa-equals', acao: 'ver',
        texto: '<b>Linear</b>: o valor cheio entra em cada exame. <b>Rateado</b>: o valor é dividido pelos exames de um atendimento.' },
      { alvo: () => qsTut('#custos-fixos tbody tr:first-child td:nth-child(2) .seg button:not(.on)'), titulo: 'Troque a cobrança', icone: 'fa-divide', acao: 'clique',
        texto: 'Clique na outra opção para trocar a forma de cobrança deste custo.' },
      { alvo: '#custos-fixos .kpis', titulo: 'Efeito imediato', icone: 'fa-bolt', acao: 'ver',
        texto: 'Os totais mudaram e o custo de <b>todos os exames</b> foi recalculado. Na simulação, nada foi gravado.' },
      { alvo: '#custos-fixos tbody tr:first-child td:nth-child(3) .seg', titulo: 'Aplica-se a', icone: 'fa-syringe', acao: 'ver',
        texto: 'Todos os exames, ou só os que passam por <b>coleta</b> ou <b>triagem</b>.' },
      { alvo: '#custos-fixos tbody tr:first-child .price-in', titulo: 'Valor', icone: 'fa-coins', acao: 'ver',
        texto: 'Altere o valor direto na tabela; ele é salvo ao sair do campo.' },
      fimTut('Lembre-se: alterar um custo fixo muda o custo de todos os exames.')
    ]
  },
  {
    id: 'custos-reagente', modulo: 'custos', icone: 'fa-vials', requer: [['custos', 'criar']],
    titulo: 'Cadastrar reagente', desc: 'Preço do kit, testes, perdas e o custo por teste calculado.',
    passos: [
      { alvo: '#s-custos .subnav button[data-p="reag"]', titulo: 'Reagentes e insumos', icone: 'fa-vials', acao: 'clique',
        antes: preparaTut(irTelaTut('custos', () => { custosAba = 'fixos'; reagVista = 'reag'; })),
        texto: 'Clique em <b>Reagentes e insumos</b>.' },
      { alvo: '#reag-body', titulo: 'Lista de reagentes', icone: 'fa-list', acao: 'ver',
        texto: 'Cada reagente mostra o custo por teste e quantos exames usam ele.' },
      { alvo: '#custos-reag .formula', titulo: 'Como é calculado', icone: 'fa-calculator', acao: 'ver',
        texto: 'Custo por teste = (kit + calibrador + controle) ÷ testes úteis (descontadas perdas, calibração e controle de qualidade).' },
      { alvo: '#s-custos [onclick="abrirReagente()"]', titulo: 'Novo reagente', icone: 'fa-plus', acao: 'clique',
        texto: 'Clique em <b>Novo reagente</b>.' },
      { alvo: '#rg-nome', esperar: '#gaveta.open', titulo: 'Nome', icone: 'fa-font', acao: 'digitar', valor: 'Glicose HK (treino)', texto: 'Nome do reagente.' },
      { alvo: '#rg-kit', titulo: 'Preço do kit', icone: 'fa-coins', acao: 'digitar', valor: '850', texto: 'Quanto custa o kit.' },
      { alvo: '#rg-testes', titulo: 'Testes por kit', icone: 'fa-hashtag', acao: 'digitar', valor: '500', texto: 'Quantos testes o kit rende.' },
      { alvo: '#rg-perdas', titulo: 'Perdas', icone: 'fa-percent', acao: 'digitar', valor: '5', texto: 'Repetição, volume morto e vencimento, em %.' },
      { alvo: '#gaveta [onclick^="novoInsumoReagente"]', titulo: 'Calibrador e controle', icone: 'fa-scale-balanced', acao: 'ver', pular: () => !qsTut('#gaveta [onclick^="novoInsumoReagente"]'),
        texto: 'Não achou na lista? <b>Novo calibrador</b> e <b>Novo controle</b> abrem o cadastro e voltam para cá com o item escolhido, sem perder o que foi digitado.' },
      { alvo: '#rg-prev', titulo: 'Resultado', icone: 'fa-square-check', acao: 'ver', texto: 'O custo por teste é calculado na hora.' },
      { alvo: '#gaveta [onclick="gravarReagente()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', avancaSe: gavetaFechadaTut,
        texto: 'Clique em <b>Salvar e recalcular</b>: os exames vinculados ao reagente são recalculados.' },
      fimTut('Reagente cadastrado na simulação. Na ficha do exame você vincula o reagente ao custo do teste, e também pode cadastrar um novo por lá.')
    ]
  },
  {
    id: 'custos-apoio', modulo: 'custos', icone: 'fa-truck-medical', requer: [['custos', 'ver']],
    titulo: 'Laboratórios de apoio', desc: 'Tabela do apoio, vínculos de mnemônicos e importação.',
    passos: [
      { alvo: '#s-custos .subnav button[data-p="apoio"]', titulo: 'Laboratórios de apoio', icone: 'fa-truck-medical', acao: 'clique',
        antes: preparaTut(irTelaTut('custos', () => { custosAba = 'fixos'; })),
        texto: 'Clique em <b>Laboratórios de apoio</b>.' },
      { alvo: '#custos-apoio .cards', titulo: 'Apoios', icone: 'fa-building', acao: 'ver', pular: () => !qsTut('#custos-apoio .cards'),
        texto: 'Um cartão por laboratório de apoio: exames do LAMIC, quantos estão vinculados à tabela do apoio e quantos estão sem custo.' },
      { alvo: '#apoio-det', titulo: 'Detalhe do apoio', icone: 'fa-link', acao: 'ver', pular: () => !qsTut('#apoio-det'),
        texto: 'Tabela importada e vínculos entre o mnemônico do LAMIC e o código do apoio. O preço do apoio vira o custo do teste.' },
      { alvo: '#apoio-det .sec-card-h .btn.pri', titulo: 'Importar tabela', icone: 'fa-file-import', acao: 'ver', pular: () => !qsTut('#apoio-det .sec-card-h .btn.pri'),
        texto: 'Importa a tabela do portal do apoio. Toda importação mostra o resultado para conferir antes de gravar.' },
      fimTut('Mantenha a tabela do apoio atualizada para que o custo dos exames enviados fique correto.')
    ]
  },

  // ── Tabelas de preço ────────────────────────────────────────
  {
    id: 'tabelas-editar', modulo: 'tabelas', icone: 'fa-table-cells', requer: [['tabelas', 'editar']],
    titulo: 'Editar preços na tabela', desc: 'Rascunho, atalhos de preço e envio da proposta.',
    passos: [
      { ...passoMenuTut('tabelas', 'Abra Tabelas de Preço', 'Clique em <b>Tabelas de Preço</b> no menu.'),
        antes: preparaTut(() => { vistaAnaliticaTut(); tabAba = 'tabelas'; tabSel = 'particular'; if (celularTut()) abrirMenu(); }) },
      { alvo: '#tab-cards', titulo: 'Tabelas', icone: 'fa-table-list', acao: 'ver',
        texto: 'Cada cartão é uma tabela: exames, margem média, abaixo do piso, propostas e rascunho. Clique num cartão para abrir a grade de preços.' },
      { alvo: '#tab-detalhe .sec-card-h', titulo: 'Cabeçalho da tabela', icone: 'fa-sliders', acao: 'ver',
        texto: 'Regras da tabela (piso, desconto de referência) e as ações: importar do Unilab, exportar, PDF e configurar.' },
      { alvo: '#pop-grfiltro .pop-btn', titulo: 'Filtros', icone: 'fa-filter', acao: 'ver',
        texto: 'Veja só os exames na tabela, fora dela ou com alertas: abaixo do piso, divergentes do Unilab, sem custo…' },
      { alvo: '#gr-body tr[data-k] .price-in input:not([disabled])', titulo: 'Altere um preço', icone: 'fa-pen', acao: 'digitar',
        valor: precoSugeridoTut('#gr-body tr[data-k] .price-in input:not([disabled])', 1.05),
        texto: 'Digite o novo preço. A linha fica marcada e vai para o seu <b>rascunho</b>: nada é publicado ainda.',
        dica: '<b>Enter</b> e as setas ↑ ↓ passam para o próximo preço.' },
      { alvo: '#gr-body tr.ed .acts, #gr-body tr[data-k] .acts', titulo: 'Atalhos da linha', icone: 'fa-wand-magic-sparkles', acao: 'ver',
        texto: 'Botões para usar o preço sugerido, levar ao piso, aplicar o desconto de referência, desfazer ou retirar da tabela.' },
      { alvo: '#gr-bar', esperar: '#gr-bar.on', titulo: 'Seu rascunho', icone: 'fa-pen-to-square', acao: 'ver',
        texto: 'Resumo do rascunho: quantos sobem, descem e a margem média antes e depois.' },
      { alvo: '#gr-bar [onclick="abrirEnvioProposta()"]', titulo: 'Revisar e enviar', icone: 'fa-paper-plane', acao: 'clique',
        texto: 'Clique em <b>Revisar e enviar</b>.' },
      { alvo: '#gaveta .pp-barra', esperar: '#gaveta.open', titulo: 'Vista e arredondamento', icone: 'fa-coins', acao: 'ver', pular: () => !qsTut('#gaveta .pp-barra'),
        texto: '<b>Analítico</b> mostra o quadro completo; <b>Sintético</b>, uma linha por exame com o essencial. Os botões <b>R$ 1, 5, 10 e 100</b> arredondam para cima todos os valores propostos (clique de novo para desligar). A chave UniLab aparece só nos exames cujo valor difere do UniLab.' },
      { alvo: '#pp-just', esperar: '#gaveta.open', titulo: 'Justificativa', icone: 'fa-comment-dots', acao: 'digitar', valor: 'Reajuste de treinamento',
        texto: 'Confira os preços e explique o motivo da proposta.' },
      { alvo: '#gaveta [onclick="enviarProposta(true)"]', titulo: 'Aprovar e publicar', icone: 'fa-stamp', acao: 'ver', pular: () => !qsTut('#gaveta [onclick="enviarProposta(true)"]'),
        texto: 'Só para quem aprova: publica na hora, sem passar por outra pessoa. Se algum valor ficar diferente do UniLab, antes aparece a janela para marcar os já lançados lá; senão, publica direto.' },
      { alvo: '#gaveta [onclick="enviarProposta(false)"]', titulo: 'Enviar para aprovação', icone: 'fa-paper-plane', acao: 'clique', avancaSe: gavetaFechadaTut,
        texto: 'Clique em <b>Enviar para aprovação</b>.' },
      fimTut('Proposta enviada (na simulação). Ela aparece em <b>Propostas</b> e no sino de quem aprova.')
    ]
  },
  {
    id: 'tabelas-nova', modulo: 'tabelas', icone: 'fa-square-plus', requer: [['tabelas', 'criar']],
    titulo: 'Criar nova tabela', desc: 'Tipo, piso de margem, descontos, perfil de custo e preços iniciais.',
    passos: [
      { alvo: '#s-tabelas [onclick="abrirConfigTabela()"]', titulo: 'Nova tabela', icone: 'fa-plus', acao: 'clique',
        antes: preparaTut(irTelaTut('tabelas', () => { tabAba = 'tabelas'; })),
        texto: 'Clique em <b>Nova tabela</b>.' },
      { alvo: '#tb-nome', esperar: '#gaveta.open', titulo: 'Nome', icone: 'fa-font', acao: 'digitar', valor: 'Cartão Treinamento',
        texto: 'Nome da tabela, como aparece nas listas e PDFs.' },
      { alvo: '#tb-ed .opt-cards', titulo: 'Tipo', icone: 'fa-shapes', acao: 'ver',
        texto: '<b>Cartões e convênios</b> ou <b>Laboratórios apoiados</b> (amostra chega coletada).' },
      { alvo: '#tb-ed .fgrid', titulo: 'Regras de preço', icone: 'fa-scale-balanced', acao: 'ver',
        texto: '<b>Piso</b> de margem e <b>desconto de referência</b> sobre a Particular. Abaixo ficam o desconto máximo e a sugestão de margem.' },
      { alvo: '#tb-toldesc', titulo: 'Tolerância de desconto', icone: 'fa-sliders', acao: 'digitar', valor: '0.5',
        texto: '<b>Tolerância de desconto</b>, em pontos percentuais: preços até esse tanto acima do desconto de referência ou do máximo (ex.: por arredondamento) <b>não geram alerta</b>. Vazio = alerta a partir de qualquer excesso.' },
      { alvo: '#tb-tolmarg', titulo: 'Tolerância de margem', icone: 'fa-sliders', acao: 'digitar', valor: '1',
        texto: '<b>Tolerância de margem</b>, em pontos percentuais abaixo da <b>sugestão de margem</b>: o preço sugerido arredonda para baixo quando a margem ainda fica dentro dela. Vazio = sempre para cima.' },
      { alvo: () => qsTut('#tb-ed [onclick^="perfilTabela"]')?.closest('.casc'), titulo: 'Perfil de custo', icone: 'fa-calculator', acao: 'ver',
        texto: 'Para cada custo fixo: cobrar o padrão, não cobrar ou usar outro valor. Ex.: apoiados não pagam atendimento nem coleta.' },
      { alvo: '#tb-ed [onclick^="_tbEd.inicial=\'desconto\'"]', titulo: 'Preços iniciais', icone: 'fa-percent', acao: 'clique',
        texto: 'Escolha <b>Particular com desconto</b> para a tabela já nascer com todos os exames.' },
      { alvo: '#gaveta [onclick="gravarConfigTabela()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', avancaSe: gavetaFechadaTut,
        texto: 'Clique em <b>Salvar</b>.' },
      { alvo: '#tab-cards', titulo: 'Tabela criada', icone: 'fa-circle-check', acao: 'ver',
        texto: 'A nova tabela aparece entre os cartões (só nesta simulação).' },
      fimTut('Depois de criar, inclua a tabela na <b>Hierarquia</b> para o sistema vigiar os preços.')
    ]
  },
  {
    id: 'tabelas-aprovar', modulo: 'tabelas', icone: 'fa-stamp', requer: [['tabelas', 'aprovar']],
    titulo: 'Aprovar ou rejeitar proposta', desc: 'Revisar os preços propostos e publicar.',
    passos: [
      { alvo: '#tabelas-propostas', titulo: 'Propostas', icone: 'fa-stamp', acao: 'ver',
        antes: preparaTut(irTelaTut('tabelas', () => { vistaAnaliticaTut(); tabAba = 'propostas'; propFiltro = 'pendente'; })),
        texto: 'Aqui ficam as propostas <b>pendentes</b> e o <b>histórico</b> das decididas. Envios do rascunho de exames com várias tabelas viram uma linha só (um <b>lote</b>).' },
      { titulo: 'Nenhuma proposta pendente', icone: 'fa-circle-info', acao: 'ver', pular: () => sinoPendentes().length > 0,
        texto: 'Não há propostas aguardando agora. Faça antes o tutorial <b>Editar preços na tabela</b> e escolha <b>Explorar livremente</b> no final: a proposta simulada aparece aqui e você volta a este tutorial.' },
      { alvo: linhaPropostaTut, titulo: 'Abra a proposta', icone: 'fa-hand-pointer', acao: 'clique', pular: () => !sinoPendentes().length,
        texto: 'Clique em uma proposta pendente.' },
      { alvo: '#gaveta .dr-b', esperar: '#gaveta.open', titulo: 'Revise', icone: 'fa-magnifying-glass', acao: 'ver', pular: () => !sinoPendentes().length,
        texto: 'Preço de hoje → preço proposto, margem e alertas de piso de cada exame, com a justificativa do autor. O valor proposto pode ser revisado no campo, com a vírgula automática: vale o que estiver digitado, mesmo sem Enter.' },
      { alvo: '#gaveta [onclick^="aprovarLote"]', titulo: 'Aprovar o lote', icone: 'fa-layer-group', acao: 'ver', pular: () => !qsTut('#gaveta [onclick^="aprovarLote"]'),
        texto: 'Abriu um <b>lote</b>: as tabelas enviadas juntas. <b>Aprovar lote</b> publica todas de uma vez; o link <b>detalhe</b> de cada tabela abre a proposta dela para revisar, editar ou rejeitar só ela.' },
      { alvo: '#pp-arred-w', titulo: 'Arredondar', icone: 'fa-coins', acao: 'ver', pular: () => !qsTut('#pp-arred-w'),
        texto: 'Arredonda para cima todos os valores propostos no múltiplo de <b>R$ 1, 5, 10 ou 100</b>: viram valores revisados. Clique de novo no ativo para voltar ao proposto.' },
      { alvo: '#pp-motivo', titulo: 'Observação', icone: 'fa-comment', acao: 'digitar', valor: 'Aprovado no treinamento', pular: () => !qsTut('#pp-motivo'),
        texto: 'Opcional para aprovar; <b>obrigatória para rejeitar</b>.' },
      { alvo: '#gaveta .dr-f', titulo: 'Decida', icone: 'fa-scale-balanced', acao: 'ver', pular: () => !qsTut('#pp-aprovar'),
        texto: '<b>Rejeitar</b> devolve ao autor com a observação. <b>Aprovar e publicar</b> aplica os preços na tabela: se nenhum valor ficar diferente do UniLab, publica direto.' },
      { alvo: '#pp-aprovar', titulo: 'Aprovar e publicar', icone: 'fa-stamp', acao: 'clique', pular: () => !qsTut('#pp-aprovar'), avancaSe: () => gavetaFechadaTut() || modalAbertoTut(),
        texto: 'Clique em <b>Aprovar e publicar</b>.' },
      { alvo: '#modal .modal-card', titulo: 'Valor atualizado no UniLab?', icone: 'fa-clock-rotate-left', acao: 'ver', pular: () => !modalAbertoTut(),
        texto: 'Aparece em qualquer publicação quando o valor publicado fica diferente do salvo no UniLab. Lista só os exames <b>ainda não marcados</b> (ou com valor alterado na aprovação): os já marcados no envio não aparecem.' },
      { alvo: '#modal .fx-conf', titulo: 'Já lançado no UniLab?', icone: 'fa-toggle-on', acao: 'ver', pular: () => !qsTut('#modal.open .fx-conf'),
        texto: '<b>Ligue</b> os exames cujo novo valor já foi lançado no sistema do laboratório: a tabela do sistema no banco recebe o valor publicado. Os <b>desligados</b> ficam pendentes no sino, em <b>Atualizar no UniLab</b>. <b>Marcar todos</b> e <b>Inverter</b> agilizam.' },
      { alvo: '#modal [data-r="1"]', titulo: 'Publicar', icone: 'fa-stamp', acao: 'clique', pular: () => !modalAbertoTut(), avancaSe: gavetaFechadaTut,
        texto: 'Clique em <b>Aprovar e publicar</b>. <b>Voltar</b> retorna à proposta sem publicar.' },
      fimTut('Na vida real, os preços aprovados ficam publicados e o autor vê a decisão no histórico. Para desfazer uma aprovação, veja <b>Histórico de propostas</b>.')
    ]
  },
  {
    id: 'tabelas-historico', modulo: 'tabelas', icone: 'fa-clock-rotate-left', requer: [['tabelas', 'ver']],
    titulo: 'Histórico de propostas', desc: 'Lotes decididos, vista analítica ou sintética, reverter e excluir.',
    passos: [
      { alvo: '#tabelas-propostas [onclick^="propFiltro=\'historico\'"]', titulo: 'Histórico', icone: 'fa-clock-rotate-left', acao: 'clique',
        antes: preparaTut(irTelaTut('tabelas', () => { vistaAnaliticaTut(); tabAba = 'propostas'; propFiltro = 'pendente'; })),
        texto: 'Clique em <b>Histórico</b>: propostas aprovadas, rejeitadas e canceladas, agrupadas pelo envio (lote).' },
      { alvo: '#prop-corpo', titulo: 'Lotes', icone: 'fa-layer-group', acao: 'ver',
        texto: 'Cada linha é um envio: tabelas, autor, quantos preços, o que subiu ou desceu e a situação. Os filtros <b>Tabela</b> e <b>Autor</b> ficam à direita.' },
      { alvo: '#prop-corpo tbody tr.row', titulo: 'Abra um lote', icone: 'fa-hand-pointer', acao: 'clique', pular: () => !qsTut('#prop-corpo tbody tr.row'), avancaSe: gavetaAbertaTut,
        texto: 'Clique em uma linha.' },
      { alvo: '#gaveta .pp-vista', esperar: '#gaveta.open', titulo: 'Analítico ou sintético', icone: 'fa-list', acao: 'ver', pular: () => !qsTut('#gaveta .pp-vista'),
        texto: '<b>Analítico</b>: um quadro por tabela, com indicadores. <b>Sintético</b>: uma linha por exame e uma coluna por tabela, com valor, de quanto era, margem e desconto. Clique no exame para abrir a ficha.' },
      { alvo: '#gaveta [onclick^="reverterPropostas"]', titulo: 'Reverter', icone: 'fa-clock-rotate-left', acao: 'ver', pular: () => !qsTut('#gaveta [onclick^="reverterPropostas"]'),
        texto: 'Só para quem aprova, em proposta <b>aprovada</b>: volta cada preço ao valor de antes e a proposta passa a <b>cancelada</b>. Preço que mudou depois por outra proposta fica como está (a janela avisa). O UniLab não muda: a divergência aparece para atualizar lá.' },
      { alvo: '#gaveta [onclick^="excluirPropostas"]', titulo: 'Excluir do histórico', icone: 'fa-trash', acao: 'ver', pular: () => !qsTut('#gaveta [onclick^="excluirPropostas"]'),
        texto: 'Proposta <b>cancelada</b> (pelo autor ou por quem aprova) pode sair do histórico. Não dá para desfazer.' },
      fecharGavetaTut('Clique no <b>X</b> para fechar o lote.'),
      fimTut('O histórico guarda quem propôs, quem decidiu e quando, por tabela.', 'fa-clock-rotate-left')
    ]
  },
  {
    id: 'tabelas-hierarquia', modulo: 'tabelas', icone: 'fa-stairs', requer: [['tabelas', 'ver']],
    titulo: 'Hierarquia de valor', desc: 'Ordem das tabelas e exames que quebram a hierarquia.',
    passos: [
      { alvo: '#s-tabelas .subnav button[data-p="hierarquia"]', titulo: 'Hierarquia', icone: 'fa-stairs', acao: 'clique',
        antes: preparaTut(irTelaTut('tabelas', () => { tabAba = 'tabelas'; })),
        texto: 'Clique em <b>Hierarquia</b>.' },
      { alvo: '#tabelas-hierarquia .hier-lista', titulo: 'Ordem das tabelas', icone: 'fa-arrow-down-short-wide', acao: 'ver',
        texto: 'A Particular fica no topo. Cada tabela não pode ter preço maior que as que estão acima dela.' },
      { alvo: '#tabelas-hierarquia .hier-i:not(.topo) .acts', titulo: 'Reordenar', icone: 'fa-up-down', acao: 'ver', pular: () => !qsTut('#tabelas-hierarquia .hier-i:not(.topo) .acts'),
        texto: 'Suba, desça ou tire uma tabela da hierarquia.' },
      { alvo: '#hier-res', titulo: 'Quebras', icone: 'fa-triangle-exclamation', acao: 'ver',
        texto: 'Exames com preço fora da ordem. Quem edita pode corrigir o valor direto nesta lista e preencher os campos com <b>—</b>, de exames ainda sem preço na tabela.' },
      fimTut('A quebra de hierarquia também aparece no painel inicial e na ficha do exame.')
    ]
  },
  {
    id: 'tabelas-labs-conv', modulo: 'tabelas', icone: 'fa-building-user', requer: [['tabelas', 'criar']],
    titulo: 'Laboratórios apoiados e conveniados', desc: 'Cadastro e valores diferenciados por cliente.',
    passos: [
      { alvo: '#s-tabelas .subnav button[data-p="labs"]', titulo: 'Laboratórios apoiados', icone: 'fa-building-user', acao: 'clique',
        antes: preparaTut(irTelaTut('tabelas', () => { tabAba = 'tabelas'; })),
        texto: 'Clique em <b>Laboratórios apoiados</b>: laboratórios que enviam amostras ao LAMIC.' },
      { alvo: '#lab-cards', titulo: 'Laboratórios', icone: 'fa-building', acao: 'ver', pular: () => !qsTut('#lab-cards'),
        texto: 'Cada laboratório tem uma tabela de referência e valores diferenciados por exame.' },
      { alvo: '#s-tabelas [onclick="abrirLaboratorio()"]', titulo: 'Novo laboratório', icone: 'fa-plus', acao: 'clique',
        texto: 'Clique em <b>Novo laboratório</b>.' },
      { alvo: '#lb-nome', esperar: '#gaveta.open', titulo: 'Nome', icone: 'fa-font', acao: 'digitar', valor: 'Lab. Treinamento', texto: 'Nome do laboratório.' },
      { alvo: '#lb-cnpj', titulo: 'CNPJ', icone: 'fa-id-card', acao: 'digitar', valor: '12.345.678/0001-99', texto: 'CNPJ (opcional), com 14 dígitos.' },
      { alvo: '#pop-lbtab', titulo: 'Tabela de referência', icone: 'fa-table-list', acao: 'ver',
        texto: 'Define o valor padrão, o perfil de custo e o piso de margem do laboratório.' },
      { alvo: '#gaveta [onclick="gravarLaboratorio()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', avancaSe: gavetaFechadaTut,
        texto: 'Clique em <b>Salvar</b>.' },
      { alvo: '#s-tabelas .subnav button[data-p="conv"]', titulo: 'Conveniados', icone: 'fa-handshake', acao: 'clique',
        texto: 'Clique em <b>Conveniados</b>: empresas e clientes com valores próprios sobre uma tabela base.' },
      { alvo: '#s-tabelas [onclick="abrirConveniado()"]', titulo: 'Novo conveniado', icone: 'fa-plus', acao: 'ver',
        texto: 'O cadastro do conveniado segue o mesmo modelo do laboratório.' },
      fimTut('Laboratório criado na simulação. Na grade dele, use <b>Adicionar</b> para incluir valores diferenciados.')
    ]
  },

  // ── Simulador ───────────────────────────────────────────────
  {
    id: 'simulador-reajuste', modulo: 'simulador', icone: 'fa-arrow-trend-up', requer: [['simulador', 'ver']],
    titulo: 'Reajuste de tabela', desc: 'Simular o impacto de um reajuste antes de aplicar.',
    passos: [
      { alvo: '#pop-rjalvo', titulo: 'Tabela', icone: 'fa-table-list', acao: 'ver',
        antes: preparaTut(irTelaTut('simulador', () => { simAba = 'reajuste'; rj.tipo = 'pct'; })),
        texto: 'Escolha a tabela a simular: Particular, outras tabelas, laboratórios ou conveniados.' },
      { alvo: '#rj-form .opt-cards', titulo: 'Tipo de reajuste', icone: 'fa-shapes', acao: 'ver',
        texto: 'Percentual, levar ao piso, margem desejada, preço sugerido ou desconto sobre a referência.' },
      { alvo: '#rj-p', titulo: 'Percentual', icone: 'fa-percent', acao: 'digitar', valor: '8', pular: () => !qsTut('#rj-p'),
        texto: 'Digite o percentual de reajuste. Negativo reduz.' },
      { alvo: '#rj-imp', titulo: 'Impacto', icone: 'fa-chart-line', acao: 'ver',
        texto: 'Quantos preços mudam, a variação média e o efeito na margem.' },
      { alvo: '#rj-body', titulo: 'Resultado por exame', icone: 'fa-table', acao: 'ver',
        texto: 'Preço atual e novo de cada exame. Você pode digitar um valor diferente na coluna <b>Novo</b>.' },
      { alvo: '#rj-form .sim-acoes', titulo: 'Levar adiante', icone: 'fa-paper-plane', acao: 'ver',
        texto: 'Leve o resultado ao seu <b>rascunho</b> ou envie direto como <b>proposta</b>. Nenhum preço muda até a aprovação.' },
      fimTut('Simule à vontade: o simulador só altera preços depois de uma proposta aprovada.')
    ]
  },
  {
    id: 'simulador-comparar', modulo: 'simulador', icone: 'fa-code-compare', requer: [['simulador', 'ver']],
    titulo: 'Comparar tabelas', desc: 'Duas tabelas lado a lado: diferenças, ausentes, ajuste de cada lado e rascunho.',
    passos: [
      { alvo: '#s-simulador .subnav button[data-p="cmp"]', titulo: 'Comparar tabelas', icone: 'fa-code-compare', acao: 'clique',
        antes: preparaTut(irTelaTut('simulador', () => { simAba = 'reajuste'; cmp.a.tipo = cmp.b.tipo = 'nada'; cmp.filtro = 'dif'; })),
        texto: 'Clique em <b>Comparar tabelas</b>.' },
      { alvo: '#cmp-lado-a .cmp-lado-h', titulo: 'Tabela A', icone: 'fa-table-list', acao: 'ver',
        texto: 'Escolha a primeira tabela: Particular, outras tabelas, laboratórios ou conveniados.' },
      { alvo: '#cmp-lado-b .cmp-lado-h', titulo: 'Tabela B', icone: 'fa-table-list', acao: 'ver',
        texto: 'Escolha a segunda. Se escolher num lado a tabela do outro, A e B trocam de lugar.' },
      { alvo: '#cmp-imp', titulo: 'Resumo', icone: 'fa-chart-simple', acao: 'ver',
        texto: 'Quantos exames têm <b>valor diferente</b> (e em qual tabela é maior), a diferença média de B sobre A e quantos estão <b>só em A</b> ou <b>só em B</b>.' },
      { alvo: '#cmp-chips', titulo: 'Filtros', icone: 'fa-filter', acao: 'ver',
        texto: 'Diferentes, A maior, B maior, só em A, só em B, iguais e ajustados. Os filtros usam os preços de hoje, então a linha não some enquanto você ajusta.' },
      { alvo: '#cmp-body', titulo: 'Lado a lado', icone: 'fa-table-columns', acao: 'ver',
        texto: 'Preço atual e novo de cada tabela, a diferença de B sobre A e a comparação. Exame que falta numa tabela aparece como <b>ausente</b>.' },
      { alvo: '#cmp-lado-b [data-tipo="outra"]', titulo: 'Tipo de ajuste', icone: 'fa-right-left', acao: 'clique',
        texto: 'Cada lado tem a sua regra. Clique em <b>Pela outra tabela</b>: o preço de B passa a seguir o de A.' },
      { alvo: '#cmp-pb', titulo: 'Percentual sobre a outra', icone: 'fa-percent', acao: 'digitar', valor: '-5',
        texto: 'Digite quanto B fica acima ou abaixo de A. <b>0</b> iguala os valores; <b>-5</b> deixa B 5% abaixo.' },
      { alvo: '#cmp-lado-b .cmp-escopo', titulo: 'Aplicar em', icone: 'fa-bullseye', acao: 'ver',
        texto: 'Escolha onde a regra mexe: só nos exames com valor diferente, nos mais caros, nos mais baratos ou em todos. Logo abaixo, <b>Incluir ausentes</b> traz os exames que só a outra tabela tem.' },
      { alvo: '#cmp-body input[data-l="a"]', titulo: 'Edite à mão', icone: 'fa-pen', acao: 'digitar', valor: precoSugeridoTut('#cmp-body input[data-l="a"]', 1.05),
        pular: () => !qsTut('#cmp-body input[data-l="a"]'),
        texto: 'Digite um valor na coluna <b>Novo</b> de qualquer lado. O valor manual vale sobre a regra; a seta ao lado desfaz.',
        dica: '<b>Enter</b> e as setas ↑ ↓ passam para o próximo preço da mesma coluna.' },
      { alvo: '#cmp-lado-a .cmp-acoes', titulo: 'Rascunho de cada tabela', icone: 'fa-pen-to-square', acao: 'ver', pular: () => !qsTut('#cmp-lado-a .cmp-acoes'),
        texto: '<b>Gerar rascunho</b> leva os ajustes deste lado ao seu rascunho da tabela; <b>Abrir rascunho</b> vai para a grade, de onde você envia a proposta.' },
      { alvo: '#cmp-ambos', titulo: 'Os dois de uma vez', icone: 'fa-layer-group', acao: 'ver', pular: () => !qsTut('#cmp-ambos'),
        texto: '<b>Gerar os dois rascunhos</b> leva os ajustes de A e de B, cada um para o rascunho da sua tabela.' },
      fimTut('Compare à vontade: nenhum preço muda até a proposta de cada tabela ser aprovada.')
    ]
  },
  {
    id: 'simulador-lab', modulo: 'simulador', icone: 'fa-handshake', requer: [['simulador', 'criar']],
    titulo: 'Proposta L2L (laboratório)', desc: 'Preço proposto × volume mensal, margem e PDF.',
    passos: [
      { alvo: '#simulador-lab [onclick="novaSimLab()"]', titulo: 'Nova proposta', icone: 'fa-plus', acao: 'clique',
        antes: preparaTut(irTelaTut('simulador', () => { simAba = 'lab'; })),
        texto: 'Clique em <b>+</b> para começar uma proposta nova. Se pedir para descartar a atual, confirme na janela.' },
      { alvo: '#pl-nome', titulo: 'Nome da proposta', icone: 'fa-font', acao: 'digitar', valor: 'Lab. Vida — treinamento', texto: 'Dê um nome para encontrar depois.' },
      { alvo: '#pop-pllab', titulo: 'Laboratório', icone: 'fa-building-user', acao: 'ver', texto: 'Laboratório já cadastrado ou um novo cliente.' },
      { alvo: '#pop-pltab', titulo: 'Tabela de referência', icone: 'fa-table-list', acao: 'ver', texto: 'Base de preço e perfil de custo usados no cálculo da margem.' },
      { alvo: '#pop-plbase', titulo: 'Preço inicial', icone: 'fa-tag', acao: 'ver', texto: 'Comece pelo preço da tabela ou aplique um desconto.' },
      { alvo: '#pl-body', titulo: 'Preço × volume', icone: 'fa-table', acao: 'ver', texto: 'Ajuste o preço proposto e o volume mensal de cada exame.' },
      { alvo: '#pl-imp', titulo: 'Resultado', icone: 'fa-chart-line', acao: 'ver', texto: 'Faturamento, custo e margem da proposta inteira.' },
      { alvo: '#simulador-lab [onclick="salvarSimLab()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', texto: 'Clique em <b>salvar</b> para guardar a proposta.' },
      { alvo: '#simulador-lab [onclick="abrirPdfLab()"]', titulo: 'PDF', icone: 'fa-file-pdf', acao: 'ver', texto: 'Gera a proposta em PDF com o texto de apresentação, pronta para enviar.' },
      fimTut('Uma proposta salva pode virar tabela de preço ou laboratório apoiado pelo botão de converter.')
    ]
  },
  {
    id: 'simulador-emp', modulo: 'simulador', icone: 'fa-building', requer: [['simulador', 'criar']],
    titulo: 'Propostas Empresas', desc: 'Venda única: exames um a um ou a tabela toda, quantidade e custo sem o atendimento.',
    passos: [
      { alvo: '#simulador-emp [onclick="novaSimMed()"]', titulo: 'Nova proposta', icone: 'fa-plus', acao: 'clique',
        antes: preparaTut(irTelaTut('simulador', () => { simAba = 'emp'; })),
        texto: 'Clique em <b>+</b> para começar. Se pedir para descartar a atual, confirme na janela.' },
      { alvo: '#pm-nome', titulo: 'Nome', icone: 'fa-font', acao: 'digitar', valor: 'Empresa Exemplo — treinamento', texto: 'Nome da proposta.' },
      { alvo: '#pm-medico', titulo: 'Empresa', icone: 'fa-building', acao: 'digitar', valor: 'Empresa Exemplo Ltda', texto: 'Razão social: aparece no PDF.' },
      { alvo: '#pm-crm', titulo: 'CNPJ / contato', icone: 'fa-id-card', acao: 'digitar', valor: '00.000.000/0001-00 · RH', texto: 'Opcional, aparece no PDF.' },
      { alvo: '#pop-pmtab', titulo: 'Tabela de referência', icone: 'fa-table-list', acao: 'ver', texto: 'Base de preço, perfil de custo e piso de margem.' },
      { alvo: '#pop-pmbase', titulo: 'Preço empresa', icone: 'fa-tag', acao: 'ver', texto: 'Desconto sobre a tabela, valor da tabela ou sugestão de margem. Cada exame pode ter o preço digitado.' },
      { alvo: '#pm-add', titulo: 'Adicione exames', icone: 'fa-magnifying-glass-plus', acao: 'digitar', valor: 'GLI', texto: 'Digite o mnemônico ou o nome.' },
      { alvo: '#pm-sug.open button', titulo: 'Escolha o exame', icone: 'fa-hand-pointer', acao: 'clique',
        antes: () => { const i = qsTut('#pm-add'); if (i) { i.focus(); buscarMed(i.value); } },
        texto: 'Clique em uma sugestão.' },
      { alvo: '#pm-todos', titulo: 'Ou a tabela toda', icone: 'fa-list-check', acao: 'ver', texto: 'Inclui de uma vez todos os exames da tabela (ou do setor filtrado). Depois é só tirar o que não entra.' },
      { alvo: '#pm-body', titulo: 'Exames e quantidade', icone: 'fa-table', acao: 'ver', texto: 'Informe a <b>quantidade</b> de cada exame: é uma proposta de venda única, não um acordo mensal (como no orçamento de cliente). O custo total soma todos os custos <b>menos o atendimento</b>.' },
      { alvo: '#pm-imp', titulo: 'Resultado', icone: 'fa-chart-line', acao: 'ver', texto: 'Quantidade de exames, total e lucro da proposta, margem ponderada pela quantidade e viabilidade pelo piso.' },
      { alvo: '#pm-bulk', titulo: 'Quantidade em lote', icone: 'fa-cart-plus', acao: 'ver', pular: () => !qsTut('#pm-vlote'),
        texto: 'Digite uma quantidade e clique em <b>Qtd nos filtrados</b> para aplicá-la a todos os exames da lista filtrada. Também dá para tirar os sem quantidade, os filtrados ou todos.' },
      { alvo: '#simulador-emp [onclick="salvarSimMed()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', texto: 'Clique em <b>salvar</b>.' },
      { alvo: '#simulador-emp [onclick="abrirPdfMed()"]', titulo: 'PDF da proposta', icone: 'fa-file-pdf', acao: 'ver',
        texto: 'Gera a proposta à empresa em PDF, com colunas <b>Qtd</b> e <b>Total</b> e o total da proposta (sem custo nem margem). O texto padrão fica em <b>Configurar texto</b>, nesta aba.' },
      fimTut('Proposta à empresa montada na simulação: venda única, pela quantidade de cada exame.')
    ]
  },

  {
    id: 'simulador-cli', modulo: 'simulador', icone: 'fa-user', requer: [['simulador', 'criar']],
    titulo: 'Proposta para cliente', desc: 'Orçamento de exames com um só atendimento e PDF.',
    passos: [
      { alvo: '#simulador-cli [onclick="novaSimCli()"]', titulo: 'Nova proposta', icone: 'fa-plus', acao: 'clique',
        antes: preparaTut(irTelaTut('simulador', () => { simAba = 'cli'; })),
        texto: 'Clique em <b>+</b> para começar. Se pedir para descartar a atual, confirme na janela.' },
      { alvo: '#pc-nome', titulo: 'Nome', icone: 'fa-font', acao: 'digitar', valor: 'Check-up — treinamento', texto: 'Nome da proposta.' },
      { alvo: '#pc-cliente', titulo: 'Cliente', icone: 'fa-user', acao: 'digitar', valor: 'Paciente Exemplo', texto: 'Paciente ou empresa.' },
      { alvo: '#pc-q', titulo: 'Adicione exames', icone: 'fa-magnifying-glass-plus', acao: 'digitar', valor: 'GLI',
        texto: 'Digite o mnemônico ou o nome do exame.' },
      { alvo: '#pc-sug.open button', titulo: 'Escolha o exame', icone: 'fa-hand-pointer', acao: 'clique',
        antes: () => { const i = qsTut('#pc-q'); if (i) { i.focus(); buscarCli(i.value); } },
        texto: 'Clique em uma sugestão para incluir o exame.' },
      { alvo: '#pc-body', titulo: 'Exames da proposta', icone: 'fa-table', acao: 'ver',
        texto: 'Preço, desconto e volume de cada exame. O custo do atendimento é dividido entre todos.' },
      { alvo: '#pc-imp', titulo: 'Resultado', icone: 'fa-chart-line', acao: 'ver', texto: 'Total da proposta e margem.' },
      { alvo: '#simulador-cli [onclick="salvarSimCli()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', texto: 'Clique em <b>salvar</b>.' },
      { alvo: '#simulador-cli [onclick="abrirPdfCli()"]', titulo: 'Orçamento em PDF', icone: 'fa-file-pdf', acao: 'ver', texto: 'Gera o orçamento para entregar ao cliente.' },
      fimTut('Orçamento montado na simulação.')
    ]
  },
  {
    id: 'simulador-med', modulo: 'simulador', icone: 'fa-user-doctor', requer: [['simulador', 'criar']],
    titulo: 'Proposta para médico', desc: 'Desconto aos pacientes de um médico, com expectativa mensal; custo sem a coleta.',
    passos: [
      { alvo: '#simulador-med [onclick="novaSimMed()"]', titulo: 'Nova proposta', icone: 'fa-plus', acao: 'clique',
        antes: preparaTut(irTelaTut('simulador', () => { simAba = 'med'; })),
        texto: 'Clique em <b>+</b> para começar. Se pedir para descartar a atual, confirme na janela.' },
      { alvo: '#pm-nome', titulo: 'Nome', icone: 'fa-font', acao: 'digitar', valor: 'Dr. Exemplo — treinamento', texto: 'Nome da proposta.' },
      { alvo: '#pm-medico', titulo: 'Médico', icone: 'fa-user-doctor', acao: 'digitar', valor: 'Dr. Exemplo', texto: 'Nome do médico.' },
      { alvo: '#pm-crm', titulo: 'CRM / especialidade', icone: 'fa-id-badge', acao: 'digitar', valor: 'CRM-CE 00000 · Clínica', texto: 'Aparece no PDF.' },
      { alvo: '#pop-pmbase', titulo: 'Preço ao paciente', icone: 'fa-tag', acao: 'ver', texto: 'Preço da tabela ou com desconto.' },
      { alvo: '#pm-add', titulo: 'Adicione exames', icone: 'fa-magnifying-glass-plus', acao: 'digitar', valor: 'GLI', texto: 'Digite o mnemônico ou o nome.' },
      { alvo: '#pm-sug.open button', titulo: 'Escolha o exame', icone: 'fa-hand-pointer', acao: 'clique',
        antes: () => { const i = qsTut('#pm-add'); if (i) { i.focus(); buscarMed(i.value); } },
        texto: 'Clique em uma sugestão.' },
      { alvo: '#pm-todos', titulo: 'Incluir vários', icone: 'fa-list-check', acao: 'ver', texto: 'Inclui de uma vez todos os exames do setor filtrado.' },
      { alvo: '#pm-body', titulo: 'Exames e expectativa', icone: 'fa-table', acao: 'ver', texto: 'Informe a expectativa mensal de envio de cada exame. O custo total <b>não inclui a coleta</b>: o paciente é atendido pelo médico.' },
      { alvo: '#pm-imp', titulo: 'Resultado', icone: 'fa-chart-line', acao: 'ver', texto: 'Pacientes esperados, receita e lucro mensais, margem ponderada pelo volume e viabilidade pelo piso.' },
      { alvo: '#simulador-med [onclick="salvarSimMed()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', texto: 'Clique em <b>salvar</b>.' },
      fimTut('Proposta ao médico montada na simulação. O PDF fica no botão ao lado de salvar.')
    ]
  },
  // ── Pendências ──────────────────────────────────────────────
  {
    id: 'pendencias-resolver', modulo: 'pendencias', icone: 'fa-list-check', requer: [['pendencias', 'ver']],
    titulo: 'Resolver pendências', desc: 'O que impede um preço confiável e como corrigir.',
    passos: [
      { ...passoMenuTut('pendencias', 'Abra Pendências', 'Clique em <b>Pendências</b> no menu. O número vermelho conta os exames abaixo do mínimo.'),
        antes: preparaTut(() => { if (celularTut()) abrirMenu(); }) },
      { alvo: '#s-pendencias .tabs', titulo: 'Categorias', icone: 'fa-layer-group', acao: 'ver',
        texto: 'Sem custo, sem setor, sem preço, divergência com o sistema, hierarquia, a auditar e abaixo do mínimo.' },
      { alvo: '#s-pendencias .pend-desc', titulo: 'O que significa', icone: 'fa-circle-info', acao: 'ver', texto: 'Explicação da categoria aberta.' },
      { alvo: '#s-pendencias tbody tr.row', titulo: 'Corrija', icone: 'fa-hand-pointer', acao: 'clique', pular: () => !qsTut('#s-pendencias tbody tr.row'),
        texto: 'Clique em um exame para abrir a ficha e corrigir o que falta.' },
      fecharGavetaTut('Corrigido na ficha, o exame sai da lista. Clique no <b>X</b> para fechar.'),
      fimTut('Zerar as pendências deixa todos os preços com base confiável.')
    ]
  },

  // ── Instruções ──────────────────────────────────────────────
  {
    id: 'instrucoes-consultar', modulo: 'instrucoes', icone: 'fa-book-open', requer: [['instrucoes', 'ver']],
    titulo: 'Consultar instruções', desc: 'Catálogo do exame, instruções de coleta e checklist de publicação.',
    passos: [
      { ...passoMenuTut('instrucoes', 'Abra Instruções', 'Clique em <b>Instruções</b> no menu.'), antes: preparaTut(() => { if (celularTut()) abrirMenu(); }) },
      { alvo: '#s-instrucoes .progs', titulo: 'Andamento', icone: 'fa-bars-progress', acao: 'ver', pular: () => !qsTut('#s-instrucoes .progs') && !!ESTADO.catalogo,
        texto: 'Quantos exames têm instrução, foram revisados e publicados no site e no Unilab.' },
      { alvo: '#q-ins', titulo: 'Busca', icone: 'fa-magnifying-glass', acao: 'digitar', valor: 'GLI', texto: 'Busque por mnemônico, nome ou material.' },
      { alvo: '#ins-chips', titulo: 'Filtros', icone: 'fa-filter', acao: 'ver', texto: 'Filtre pelo checklist: sem instrução, não revisado, não publicado…' },
      { alvo: '#ins-body tr.row', titulo: 'Abra uma instrução', icone: 'fa-hand-pointer', acao: 'clique', texto: 'Clique em um exame.' },
      { alvo: '#gaveta .dr-b', esperar: '#gaveta.open', titulo: 'Instrução do exame', icone: 'fa-file-lines', acao: 'ver',
        texto: 'Nome, material, prazo, preparo e coleta. Quem edita também marca o checklist de publicação e os anexos.' },
      fecharGavetaTut(),
      fimTut('As instruções revisadas alimentam o site dos laboratórios apoiados (L2L).')
    ]
  },

  // ── Importar / Exportar ─────────────────────────────────────
  {
    id: 'importar-exportar', modulo: 'importar', icone: 'fa-file-import', requer: [['importar', 'ver']],
    titulo: 'Importar e exportar', desc: 'Migração da planilha, sincronização com o Unilab e outros arquivos.',
    passos: [
      { ...passoMenuTut('importar', 'Abra Importar / Exportar', 'Clique em <b>Importar / Exportar</b> no menu.'), antes: preparaTut(() => { if (celularTut()) abrirMenu(); }) },
      { alvo: '#mig-card', titulo: 'Migração da planilha', icone: 'fa-file-excel', acao: 'ver',
        texto: 'Importa a aba PARTICULAR da planilha comercial em etapas: arquivos, conferir, gravar.' },
      { alvo: '#sinc-card', titulo: 'Sincronizar com o Unilab', icone: 'fa-rotate', acao: 'ver', pular: () => !qsTut('#sinc-card'),
        texto: 'Compara os preços do Unilab com os do sistema e mostra as divergências antes de gravar.' },
      { alvo: '#s-importar .cards', titulo: 'Outras importações', icone: 'fa-layer-group', acao: 'ver',
        texto: 'Atalhos para apoio, catálogo de instruções, lista de exames, divergências, preços das tabelas, apoiados e PDF.' },
      fimTut('Toda importação mostra o resultado para conferir antes de gravar.')
    ]
  },

  // ── Configurações ───────────────────────────────────────────
  {
    id: 'config-usuarios', modulo: 'config', icone: 'fa-user-check', requer: [['usuarios', 'editar']],
    titulo: 'Liberar acesso de usuário', desc: 'Contas do Dados LAMIC: grupo de permissões, setores visíveis e situação.',
    passos: [
      { alvo: '#s-config .subnav', titulo: 'Configurações', icone: 'fa-gear', acao: 'ver',
        antes: preparaTut(irTelaTut('config', () => { configAba = 'usuarios'; })),
        texto: 'Abas de configuração conforme o seu acesso.' },
      { alvo: '#users-body', titulo: 'Usuários', icone: 'fa-users', acao: 'ver', texto: 'Todas as contas do <b>Dados LAMIC</b>. Aparecem só contas cujo grupo no Dados tem <b>Acessar o Comercial</b>; quem ainda não entrou aparece como <b>Não configurado</b>.' },
      { alvo: '#cfg-usuarios [onclick^="abrirLiberarAcesso"]', titulo: 'Liberar acesso', icone: 'fa-user-check', acao: 'clique',
        pular: () => !candidatosAcesso().length,
        texto: 'Clique em <b>Liberar acesso</b> para dar acesso ao Comercial a uma conta do Dados LAMIC que ainda não tem.' },
      { alvo: '#pop-liberar .pop', esperar: '#pop-liberar.open', titulo: 'Escolha a conta', icone: 'fa-magnifying-glass', acao: 'clique',
        pular: () => !candidatosAcesso().length, avancaSe: () => !!document.querySelector('#gaveta.open'),
        texto: 'Digite para buscar pelo nome ou login e clique na conta.' },
      { alvo: '#users-body tr.row', titulo: 'Abrir usuário', icone: 'fa-user', acao: 'clique',
        pular: () => !!candidatosAcesso().length || !!document.querySelector('#gaveta.open'),
        texto: 'Todas as contas já têm acesso. Clique em um usuário para ver ou ajustar grupo e setores.' },
      { alvo: '#u-nome', esperar: '#gaveta.open', titulo: 'Dados da conta', icone: 'fa-id-card', acao: 'ver', texto: 'Nome, login e cargo vêm do Dados LAMIC e são alterados só por lá.' },
      { alvo: '#u-grupo', titulo: 'Grupo', icone: 'fa-user-shield', acao: 'ver', texto: 'O grupo define o que o usuário pode ver e fazer em cada módulo.' },
      { alvo: '#u-setores', titulo: 'Setores visíveis', icone: 'fa-sitemap', acao: 'ver', texto: 'Limita os exames que o usuário enxerga a alguns setores.' },
      { alvo: '#gaveta [onclick="gravarUsuario()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', avancaSe: gavetaFechadaTut, texto: 'Clique em <b>Salvar</b>.' },
      fimTut('Liberação feita só na simulação: o acesso real do usuário não mudou. Ao salvar de verdade, a conta passa a entrar no Comercial com o grupo e os setores escolhidos.')
    ]
  },
  {
    id: 'config-grupos', modulo: 'config', icone: 'fa-user-shield', requer: [['usuarios', 'editar']],
    titulo: 'Grupos e permissões', desc: 'Matriz de permissões por módulo e ação.',
    passos: [
      { alvo: '#s-config .subnav button[data-p="grupos"]', titulo: 'Grupos e permissões', icone: 'fa-user-shield', acao: 'clique',
        antes: preparaTut(irTelaTut('config', () => { configAba = 'usuarios'; })),
        texto: 'Clique em <b>Grupos e permissões</b>.' },
      { alvo: '#cfg-grupos .glist', titulo: 'Grupos', icone: 'fa-users', acao: 'ver', texto: 'Clique num grupo para ver as permissões. O grupo Admin tem acesso total e não muda.' },
      { alvo: '#gperm .pm-grid', titulo: 'Matriz de permissões', icone: 'fa-table-cells', acao: 'ver',
        texto: 'Um cartão por módulo, com as ações liberadas: ver, criar, editar, excluir, aprovar, importar e exportar.' },
      { alvo: '#gperm .pm-b:not([disabled])', titulo: 'Ajuste um módulo', icone: 'fa-hand-pointer', acao: 'clique', pular: () => !qsTut('#gperm .pm-b:not([disabled])'),
        texto: 'Clique em um módulo para marcar as ações.' },
      { alvo: '#gperm .pop-wrap.open .pop', titulo: 'Ações', icone: 'fa-list-check', acao: 'ver', pular: () => !qsTut('#gperm .pm-b:not([disabled])'),
        texto: 'Marcar uma ação liga "Ver"; desmarcar "Ver" limpa o módulo. Cada clique é salvo na hora (aqui, só na simulação).' },
      { alvo: '#cfg-grupos [onclick="abrirGrupo()"]', titulo: 'Novo grupo', icone: 'fa-plus', acao: 'ver', antes: () => fecharPop(), pular: () => !pode('usuarios', 'criar'),
        texto: 'Cria um grupo novo, que nasce só com acesso de consulta.' },
      fimTut('Os tutoriais também respeitam essas permissões: cada usuário vê só os do seu acesso.')
    ]
  },
  {
    id: 'config-parametros', modulo: 'config', icone: 'fa-sliders', requer: [['params', 'editar']],
    titulo: 'Parâmetros e setores', desc: 'Imposto, maquininha, exames por atendimento, prompt da instrução e setores.',
    passos: [
      { alvo: '#cfg-params .fgrid', titulo: 'Parâmetros de cálculo', icone: 'fa-sliders', acao: 'ver',
        antes: preparaTut(irTelaTut('config', () => { configAba = 'params'; })),
        texto: 'Imposto sobre o faturamento, taxa da maquininha (só projeção) e média de exames por atendimento (divide os custos rateados).' },
      { alvo: '#pf-imposto', titulo: 'Altere um valor', icone: 'fa-landmark', acao: 'digitar', valor: () => String((parametro('imposto') * 100 + 1).toFixed(2)),
        texto: 'Mude o imposto e veja a prévia abaixo.' },
      { alvo: '#params-previa', titulo: 'Prévia', icone: 'fa-eye', acao: 'ver', texto: 'Efeito do parâmetro num exame de exemplo, antes de salvar.' },
      { alvo: '#cfg-params [onclick="salvarParametros()"]', titulo: 'Salvar', icone: 'fa-floppy-disk', acao: 'clique', texto: 'Clique em <b>Salvar parâmetros</b>: vale para todos os exames.' },
      { alvo: '#pf-prompt', titulo: 'Prompt da instrução', icone: 'fa-wand-magic-sparkles', acao: 'ver', pular: () => !qsTut('#pf-prompt'),
        texto: 'Texto copiado pelo botão <b>Copiar prompt</b> no cadastro do exame. Edite e clique em <b>Salvar prompt</b>; <b>Restaurar padrão</b> volta ao texto original.' },
      { alvo: '#s-config .subnav button[data-p="setores"]', titulo: 'Setores', icone: 'fa-sitemap', acao: 'clique', texto: 'Clique em <b>Setores</b>.' },
      { alvo: '#setores-body', titulo: 'Setores', icone: 'fa-list', acao: 'ver',
        texto: 'Categoria, etapas padrão (coleta, triagem), quantidade de exames e margem alvo própria de cada setor.' },
      { alvo: '#setores-body tr.row', titulo: 'Abra um setor', icone: 'fa-hand-pointer', acao: 'clique', texto: 'Clique em um setor para editar.' },
      { alvo: '#gaveta .dr-b', esperar: '#gaveta.open', titulo: 'Editor do setor', icone: 'fa-pen', acao: 'ver',
        texto: 'Nome, categoria, ícone, cor, etapas, margem alvo e os exames vinculados.' },
      fecharGavetaTut(),
      fimTut('Parâmetros e setores mudam o cálculo de todos os exames: altere com cuidado.')
    ]
  }
];
