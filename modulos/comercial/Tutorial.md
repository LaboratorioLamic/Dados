# COMERCIAL LAMIC — Tutoriais

Revisão: 27/11/2026 · 30 tutoriais · fonte de verdade: [`script/tutoriais.js`](script/tutoriais.js)

> **Regra de manutenção (para pessoas e para o Claude)**
>
> Depois de qualquer mudança numa tela ou num fluxo coberto por um tutorial abaixo, **pergunte ao
> responsável se pode atualizar o tutorial** (`script/tutoriais.js` e este arquivo) antes de mexer.
> Não atualize por conta própria: o processo pode ainda estar em desenvolvimento e o tutorial
> ficaria descrevendo algo provisório.
>
> - Removeu, renomeou ou mudou um seletor usado como **Alvo** (id, `onclick`, `data-tut`, classe)?
>   Avise quais tutoriais quebram, mesmo sem atualizar.
> - Tela ou ação nova? Sugira um tutorial novo e pergunte se deve ser criado.
> - Ao atualizar, edite `script/tutoriais.js` e rode `node ferramentas/gerar-tutorial-md.js`: ele
>   refaz deste arquivo tudo a partir de "## Índice

| # | id | Módulo | Tutorial | Permissão | Passos |
|---|---|---|---|---|---|
| 1 | `geral-primeiros-passos` | Primeiros passos | Conhecendo o sistema | todos | 9 |
| 2 | `geral-telas` | Primeiros passos | Tour pelas telas | todos | 16 |
| 3 | `geral-notificacoes` | Primeiros passos | Notificações (sino) | tabelas:ver ou exames:ver | 15 |
| 4 | `inicio-painel` | Início | Lendo o painel inicial | todos | 8 |
| 5 | `exames-buscar` | Exames | Buscar e filtrar exames | exames:ver | 10 |
| 6 | `exames-ficha` | Exames | Ficha do exame | exames:ver | 15 |
| 7 | `exames-alterar-preco` | Exames | Alterar preço e enviar para aprovação | exames:editar | 10 |
| 8 | `exames-novo` | Exames | Cadastrar novo exame | exames:criar | 16 |
| 9 | `exames-rascunho` | Exames | Rascunho de exames | exames:ver ou tabelas:ver | 13 |
| 10 | `custos-fixos` | Custos | Custos fixos: linear ou rateado | custos:editar | 8 |
| 11 | `custos-reagente` | Custos | Cadastrar reagente | custos:criar | 12 |
| 12 | `custos-apoio` | Custos | Laboratórios de apoio | custos:ver | 5 |
| 13 | `tabelas-editar` | Tabelas de Preço | Editar preços na tabela | tabelas:editar | 13 |
| 14 | `tabelas-nova` | Tabelas de Preço | Criar nova tabela | tabelas:criar | 11 |
| 15 | `tabelas-aprovar` | Tabelas de Preço | Aprovar ou rejeitar proposta | tabelas:aprovar | 13 |
| 16 | `tabelas-historico` | Tabelas de Preço | Histórico de propostas | tabelas:ver | 8 |
| 17 | `tabelas-hierarquia` | Tabelas de Preço | Hierarquia de valor | tabelas:ver | 5 |
| 18 | `tabelas-labs-conv` | Tabelas de Preço | Laboratórios apoiados e conveniados | tabelas:criar | 10 |
| 19 | `simulador-reajuste` | Simulador | Reajuste de tabela | simulador:ver | 7 |
| 20 | `simulador-comparar` | Simulador | Comparar tabelas | simulador:ver | 13 |
| 21 | `simulador-lab` | Simulador | Proposta L2L (laboratório) | simulador:criar | 10 |
| 22 | `simulador-emp` | Simulador | Propostas Empresas | simulador:criar | 15 |
| 23 | `simulador-cli` | Simulador | Proposta para cliente | simulador:criar | 10 |
| 24 | `simulador-med` | Simulador | Proposta para médico | simulador:criar | 12 |
| 25 | `pendencias-resolver` | Pendências | Resolver pendências | pendencias:ver | 6 |
| 26 | `instrucoes-consultar` | Instruções | Consultar instruções | instrucoes:ver | 8 |
| 27 | `importar-exportar` | Importar / Exportar | Importar e exportar | importar:ver | 5 |
| 28 | `config-usuarios` | Configurações | Liberar acesso de usuário | usuarios:editar | 10 |
| 29 | `config-grupos` | Configurações | Grupos e permissões | usuarios:editar | 7 |
| 30 | `config-parametros` | Configurações | Parâmetros e setores | params:editar | 11 |

## Primeiros passos

### Conhecendo o sistema

- **id:** `geral-primeiros-passos` · **ícone:** `fa-compass` · **permissão:** todos
- **Objetivo:** Menu, barra do topo, notificações, treinamento, perfil e modo noturno.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | — (cartão central) | ver | **Bem-vindo ao COMERCIAL LAMIC** — Este é o ambiente comercial do LAMIC: custos dos exames, margens, tabelas de preço e propostas. Vamos conhecer a tela em poucos passos. |
| 2 | `#nav` | ver | **Menu lateral** — Aqui ficam as telas do sistema. Você só vê as telas que o seu grupo tem permissão para acessar. |
| 3 | `#user-box` | ver | **Seu perfil** — Seu nome e cargo. Clique aqui (fora do treinamento) para alterar seu nome ou sua senha. |
| 4 | `.toggle-row.escuro` | ver | **Modo noturno** — Liga o tema escuro, mais confortável à noite. A escolha fica salva neste navegador. |
| 5 | `.topbar .tb-title` | ver | **Onde você está** — O título e o caminho mostram a tela aberta no momento. |
| 6 | `[data-tut="tb-tutorial"]` | ver | **Central de treinamento** — Aqui ficam todos os tutoriais disponíveis para o seu acesso. Os concluídos ganham um selo verde. |
| 7 | `#sino .sino-btn` | ver · condicional | **Notificações** — O sino avisa o que precisa de atenção: propostas aguardando aprovação, exames a auditar e valores para atualizar no Unilab. Cada aba pode ser silenciada. |
| 8 | `.topbar [onclick="sair()"]` | ver | **Sair** — Encerra a sua sessão do Dados LAMIC (vale para todos os módulos) e volta para a página do Dados. |
| 9 | — (cartão central) | ver | **Pronto!** — Agora você conhece a estrutura da tela. Explore os outros tutoriais da Central de treinamento. |

### Tour pelas telas

- **id:** `geral-telas` · **ícone:** `fa-map` · **permissão:** todos
- **Objetivo:** Apresentação geral de cada tela do menu Principal que o seu grupo pode acessar.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | — (cartão central) | ver | **Tour pelas telas** — Vamos passar por cada tela do menu Principal e ver para que ela serve. Só aparecem as telas que o seu grupo pode acessar. |
| 2 | `#nav a[data-s="inicio"]` | clique · condicional | **Início** — Clique em Início. Painel do dia: indicadores de margem, situação dos exames, margem por setor, pendências e últimas alterações. |
| 3 | `#s-inicio .kpis` | ver · condicional | **Indicadores** — Cada indicador resume um ponto de atenção. Clique em um (fora do treinamento) para ver a lista de exames correspondente. |
| 4 | `#nav a[data-s="exames"]` | clique · condicional | **Exames** — Clique em Exames. Lista de todos os exames com custo, preço e margem. Clicando em um exame abre a ficha com a composição do preço. |
| 5 | `#s-exames .subnav` | ver · condicional | **Ativos e inativos** — Exames inativos saem das tabelas, do simulador e dos PDFs, mas continuam guardados aqui. |
| 6 | `#nav a[data-s="custos"]` | clique · condicional | **Custos** — Clique em Custos. Base do custo de cada exame. Uma alteração aqui vale para todos os exames que usam aquele custo. |
| 7 | `#s-custos .subnav` | ver · condicional | **Abas de Custos** — Custos fixos (linear ou rateado por atendimento), Reagentes e insumos e Laboratórios de apoio com seus vínculos. |
| 8 | `#nav a[data-s="tabelas"]` | clique · condicional | **Tabelas de Preço** — Clique em Tabelas de Preço. Preços de cada tabela. As edições ficam no seu rascunho até serem enviadas para aprovação. |
| 9 | `#s-tabelas .subnav` | ver · condicional | **Abas de Tabelas** — Tabelas, Laboratórios apoiados, Conveniados, Hierarquia de valor entre tabelas e Propostas (pendentes e histórico). |
| 10 | `#nav a[data-s="simulador"]` | clique · condicional | **Simulador** — Clique em Simulador. Mostra o impacto antes de aplicar. Nenhum preço muda até a proposta ser aprovada. |
| 11 | `#s-simulador .subnav` | ver · condicional | **Abas do Simulador** — Reajuste de tabela, Comparar tabelas, Proposta L2L para laboratórios, Propostas Empresas, Proposta cliente (orçamento) e Proposta médico, com PDF. |
| 12 | `#nav a[data-s="pendencias"]` | clique · condicional | **Pendências** — Clique em Pendências. Exames com algo que impede um preço confiável: sem custo, sem setor, abaixo do mínimo, divergência com o Unilab… |
| 13 | `#s-pendencias .tabs` | ver · condicional | **Categorias** — Cada aba é um tipo de pendência, com a quantidade de exames. Clique em um exame para abrir a ficha e resolver. |
| 14 | `#nav a[data-s="instrucoes"]` | clique · condicional | **Instruções** — Clique em Instruções. Instruções de coleta e preparo de cada exame, com anexos. É o que aparece para os laboratórios apoiados. |
| 15 | `#s-instrucoes .subnav` | ver · condicional | **Ativos e inativos** — Separa as instruções dos exames ativos e inativos, com a contagem de cada grupo. |
| 16 | — (cartão central) | ver | **Pronto!** — Essas são as telas do menu Principal. Cada uma tem tutoriais próprios aqui na Central de treinamento. |

### Notificações (sino)

- **id:** `geral-notificacoes` · **ícone:** `fa-bell` · **permissão:** tabelas:ver ou exames:ver
- **Objetivo:** Abas do sino, silenciar avisos, abrir um item e ir para a lista completa.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | — (cartão central) | ver | **Notificações** — O sino da barra do topo reúne o que precisa da sua atenção. As abas dependem do seu acesso: Propostas (Tabelas de Preço) e os controles dos Exames. |
| 2 | `#sino .sino-btn` | clique | **Abra o sino** — O número vermelho soma os itens pendentes das abas que não estão silenciadas. Clique no sino. |
| 3 | `#sino-pan .sino-h` | ver · espera `#sino.open` | **Resumo** — O cabeçalho mostra quantos itens há em cada aba, por exemplo "3 propostas · 5 a auditar". |
| 4 | `#sino-pan .sino-abas` | ver · espera `#sino.open` · condicional | **Abas** — Propostas: preços aguardando aprovação. A auditar: exames marcados para revisão. Atualizar no UniLab: valor alterado aqui e ainda não lançado no UniLab. Fora do catálogo: exames marcados como fora do sistema. |
| 5 | `#sino-pan .sino-abas button:not(.on)` | clique · espera `#sino.open` · condicional | **Troque de aba** — Clique em outra aba para ver os itens dela. |
| 6 | `#sino-pan .sino-l` | ver · espera `#sino.open` | **Itens** — Os mais recentes ficam no topo. Cada item mostra quem alterou, quando e um resumo: variação dos preços na proposta ou margem e preço do exame. |
| 7 | `#sino-pan .sino-mudo .switch` | clique · espera `#sino.open` | **Silencie a aba** — Desligue a chave: a aba silenciada continua no sino, mas deixa de somar no número vermelho. A preferência vale só para você, neste navegador. |
| 8 | `#sino-pan .sino-mudo .switch` | clique · espera `#sino.open` | **Ligue de novo** — Veja o ícone de sino cortado na aba. Clique na chave outra vez para voltar a ser avisado. |
| 9 | `#sino-pan .sino-l .sino-it` | clique · espera `#sino.open` · condicional · avança se deu certo | **Abra um item** — Clique no item: abre a proposta para revisar (e aprovar, se você tiver permissão) ou a ficha do exame. Em Atualizar no UniLab, quem pode editar vai direto à confirmação da tabela do sistema. |
| 10 | `#modal .modal-card` | ver · condicional | **Atualizar a tabela do sistema** — Confira os valores. Confirme só depois de lançar o novo valor no UniLab: a tabela do sistema no banco passa a ter o valor publicado e o item sai do sino. |
| 11 | `#modal [data-r="0"]` | clique · condicional | **Cancele por enquanto** — Clique em Cancelar: o item continua pendente no sino. |
| 12 | `#gaveta .dr-b` | ver · espera `#gaveta.open` · condicional | **Resolva por aqui** — Resolvido o motivo (proposta aprovada, auditoria feita, valor lançado no UniLab), o item sai do sino sozinho. |
| 13 | `#gaveta .dr-h .icon-btn` | clique · espera `#gaveta.open` · condicional | **Fechar** — Clique no X para fechar a gaveta e voltar à lista. |
| 14 | `#sino-pan .sino-f` | ver · espera `#sino.open` | **Lista completa** — Ver todas abre Tabelas de Preço › Propostas; Ver na lista abre Exames já filtrado pelo controle interno da aba. |
| 15 | — (cartão central) | ver | **Pronto!** — Confira o sino no começo do dia. Na simulação, a aba silenciada e o que foi aberto são descartados ao encerrar. |

## Início

### Lendo o painel inicial

- **id:** `inicio-painel` · **ícone:** `fa-gauge-high` · **permissão:** todos
- **Objetivo:** Indicadores, situação dos exames, margem por setor e últimas alterações.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#nav a[data-s="inicio"]` | clique | **Abra o Início** — Clique em Início no menu para abrir o painel. |
| 2 | `#s-inicio .kpis` | ver | **Indicadores** — Os oito indicadores resumem a saúde dos preços: margem média, abaixo do mínimo, sem custo, divergência com o Unilab, propostas, hierarquia, abaixo do alvo e a auditar. Clique em um indicador para ver a lista correspondente. |
| 3 | `#s-inicio .kpi` | ver | **Margem média** — Média da margem dos exames ativos que têm custo e preço. O texto abaixo do número mostra quantos exames entraram na conta. |
| 4 | `#s-inicio .dist` | ver · condicional | **Situação dos exames** — A barra divide os exames por status: abaixo do mínimo, abaixo do alvo, saudável e sem custo. |
| 5 | `#s-inicio .bars` | ver · condicional | **Margem por setor** — Margem média dos maiores setores. As linhas verticais marcam a margem mínima e a alvo. |
| 6 | `#s-inicio .ini-list` | ver | **Pendências** — Quantos exames há em cada tipo de pendência. Com acesso a Pendências, clique para abrir a categoria. |
| 7 | `#ini-hist` | ver | **Últimas alterações** — O que foi alterado no sistema, por quem e quando. |
| 8 | — (cartão central) | ver | **Pronto!** — Use o painel como ponto de partida do dia: ele mostra onde agir primeiro. |

## Exames

### Buscar e filtrar exames

- **id:** `exames-buscar` · **ícone:** `fa-magnifying-glass` · **permissão:** exames:ver
- **Objetivo:** Busca, filtros por setor, origem e controle interno, status e ordenação.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#nav a[data-s="exames"]` | clique | **Abra Exames** — Clique em Exames no menu. |
| 2 | `#q-ex` | digitar (sugestão: "GLI") | **Busca** — Digite parte do mnemônico ou da descrição. A lista filtra enquanto você digita, sem acentos nem maiúsculas. |
| 3 | `#pop-exsetor .pop-btn` | clique | **Filtro por setor** — Clique para escolher um setor. Cada opção mostra quantos exames tem. |
| 4 | `#pop-exsetor .pop` | ver · espera `#pop-exsetor.open` | **Escolha o setor** — Pesquise o setor, use as setas do teclado e Enter. O X ao lado do filtro limpa a escolha. |
| 5 | `#pop-exorigem .pop-btn` | ver | **Origem** — Separa exames internos (feitos no LAMIC) dos enviados a laboratórios de apoio. |
| 6 | `#pop-exctrl .pop-btn` | ver | **Controle interno** — Mostra só os exames marcados: valor não atualizado no sistema, fora do sistema, não efetua na Particular, apoio não negociado, sem custo (custo do teste não informado) e no meu rascunho. |
| 7 | `#ex-chips` | ver | **Status da margem** — Atalhos por status, com a contagem de cada um. Clique em um para filtrar. |
| 8 | `#ex-head` | ver | **Ordenar** — Clique no título de uma coluna para ordenar; clique de novo para inverter. |
| 9 | `#s-exames .subnav` | ver | **Ativos e inativos** — Exames inativos saem das tabelas, do simulador e dos PDFs, mas ficam guardados aqui. |
| 10 | — (cartão central) | ver | **Pronto!** — Clique em qualquer linha da lista para abrir a ficha do exame. Veja o tutorial Ficha do exame. |

### Ficha do exame

- **id:** `exames-ficha` · **ícone:** `fa-file-invoice-dollar` · **permissão:** exames:ver
- **Objetivo:** Composição do preço, margem, outras tabelas, custos, etapas e histórico.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#ex-body tr.row` | clique | **Abra um exame** — Clique em um exame da lista para abrir a ficha na gaveta lateral. |
| 2 | `#fx-abas` | ver · espera `#gaveta.open` | **Abas da ficha** — Valores, Custos, Controles, Instruções e Histórico. A aba Valores abre primeiro. |
| 3 | `#fx-sug` | ver | **Preço sugerido** — Preço que atinge a margem alvo do setor (ou a geral), a partir do custo total do exame. |
| 4 | `#fx-preco` → `closest('.pbox')` | ver | **Preço praticado** — Preço da tabela Particular. Abaixo aparecem a margem e o status: vermelho abaixo do mínimo, âmbar abaixo do alvo, verde saudável. |
| 5 | `#fx-comp` | ver | **Composição do preço** — Como o preço se divide entre custo do teste, custos fixos, imposto e margem. |
| 6 | `#fx-tabs` | ver · condicional | **Outras tabelas** — Preço do exame em cada tabela de preço, com a margem de cada uma. Quem pode editar tabelas altera, inclui ou retira daqui mesmo. |
| 7 | `#fx-abas button:nth-child(2)` | clique | **Aba Custos** — Clique em Custos para ver de onde vem o custo do exame. |
| 8 | `#fx-custo` | ver | **Custo do teste** — Manual, Reagente ou Tabela do apoio. Sair da tabela do apoio pede confirmação, pois o exame deixa de seguir o valor dela. Em Reagente, Novo reagente cadastra sem sair da ficha. |
| 9 | `#fx-casc` | ver | **Cascata de custos** — Custo do teste somado aos custos fixos e adicionais, até o custo total. |
| 10 | `#fx-casc .switch` → `closest('.casc-r')` | ver · condicional | **Ajuste neste exame** — O lápis define um valor próprio do custo fixo neste exame, a seta volta ao padrão e a chave ativa ou inativa. Em coleta e triagem, a chave acompanha a etapa do exame. Vale ao salvar a ficha. |
| 11 | `#fx-etapas` | ver | **Etapas do atendimento** — Coleta e triagem só entram no custo se o exame passa por elas. O padrão vem do setor e pode ser ajustado aqui. |
| 12 | `#fx-abas button:nth-child(5)` | clique | **Aba Histórico** — Clique em Histórico. |
| 13 | `#fx-hist` | ver | **Histórico** — Todas as alterações do exame, com usuário e data. |
| 14 | `#gaveta .dr-h .icon-btn` | clique · espera `#gaveta.open` | **Fechar** — Clique no X para fechar a gaveta e voltar à lista. |
| 15 | — (cartão central) | ver | **Pronto!** — Você já sabe ler a ficha. Para alterar o preço, veja Alterar preço e enviar para aprovação. |

### Alterar preço e enviar para aprovação

- **id:** `exames-alterar-preco` · **ícone:** `fa-pen-to-square` · **permissão:** exames:editar
- **Objetivo:** Novo preço praticado, justificativa e proposta para aprovação.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#ex-body tr.row` | clique | **Abra um exame** — Clique em um exame para abrir a ficha. |
| 2 | `#fx-preco` | digitar (sugestão: calculada) · espera `#gaveta.open` · condicional | **Novo preço praticado** — Digite só os números: a vírgula entra sozinha pelos centavos (5730 vira 57,30). A margem, o status e a composição são recalculados na hora. Os preços das outras tabelas, logo abaixo, funcionam igual. Se a Particular já tem valor aguardando aprovação, ele aparece em amarelo no lugar do praticado e é a base das sugestões das outras tabelas. |
| 3 | `#fx-arred .pp-arred` | ver · condicional | **Arredondar** — Arredonda ao múltiplo mais próximo de R$ 1, 5, 10 ou 100 os valores recomendados: Usar sugerido, margem alvo () e desconto de referência () das outras tabelas. Clique de novo no ativo para desligar. |
| 4 | `#fx-st` | ver | **Confira a margem** — Veja a nova margem e o status. Preço abaixo do mínimo fica em vermelho. |
| 5 | `#fx-just` | digitar (sugestão: "Reajuste anual (treinamento)") | **Justificativa** — Explique o motivo. Quem aprova vê este texto. |
| 6 | `#gaveta [onclick="salvarFicha('confirmar')"]` | clique · avança se deu certo | **Rascunho** — Clique em Rascunho. O preço vai para o seu rascunho e abre o Rascunho de exames, já neste exame, para conferir e enviar. |
| 7 | `#rx-lista` | ver · espera `#rx-lista` | **Confira o rascunho** — Um quadro por tabela alterada, como no envio da proposta: atual, proposto (editável aqui mesmo), desconto, margem e médias. A chave UniLab só aparece nos exames cujo valor difere do UniLab. A justificativa da ficha já vem preenchida abaixo. |
| 8 | `#rx-enviar` | clique · avança se deu certo | **Confirmar envio** — Clique em Enviar para aprovação. Se algum valor ficar diferente do UniLab, antes aparece a janela para marcar os já lançados lá (a marca vale quando a proposta for aprovada). Tudo vai num lote só: uma única aprovação. |
| 9 | `#sino .sino-btn` | ver · condicional | **Proposta criada** — A proposta (simulada) aparece no sino de quem aprova e em Tabelas de Preço › Propostas. O preço só muda depois da aprovação. |
| 10 | — (cartão central) | ver | **Pronto!** — Preço alterado e enviado para aprovação. Na simulação nada foi gravado de verdade. |

### Cadastrar novo exame

- **id:** `exames-novo` · **ícone:** `fa-plus` · **permissão:** exames:criar
- **Objetivo:** Mnemônico, preço, custo, arredondamento, setor, origem, material, prazo e anexos.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-exames [onclick="abrirDadosExame()"]` | clique | **Novo exame** — Clique em Novo exame. |
| 2 | `#dx-mn` | digitar (sugestão: "TREINO1") · espera `#gaveta.open` | **Mnemônico** — Use o mesmo mnemônico do sistema do laboratório. Ele não pode ser alterado depois. |
| 3 | `#dx-custo` | digitar (sugestão: "850") | **Custo do teste** — Custo manual do teste, também com a vírgula automática (850 vira 8,50). Depois você pode vincular um reagente ou a tabela do apoio na ficha. |
| 4 | `#dx-preco` | digitar (sugestão: "4500") | **Preço praticado** — Preço na tabela Particular. Digite só os números: a vírgula entra sozinha pelos centavos (4500 vira 45,00). |
| 5 | `#dx-calc` | ver · condicional | **Prévia** — Prévia da margem com o preço e o custo informados. Piso e Alvo preenchem o preço que atinge a margem mínima ou a alvo. |
| 6 | `#dx-calc .dp-arr` | ver · condicional | **Arredondar** — Arredonda os preços de Piso e Alvo ao múltiplo mais próximo de R$ 1, 5, 10 ou 100. Para baixo só quando a margem continua dentro da tolerância (alvo) ou no mínimo (piso); senão, para cima. A escolha fica lembrada neste navegador. |
| 7 | `#dx-desc` | digitar (sugestão: "Exame de treinamento") | **Nome do exame** — Nome que aparece nas listas, tabelas e PDFs. |
| 8 | `#pop-dxsetor` | ver | **Setor** — O setor define a margem alvo e as etapas padrão (coleta, triagem). |
| 9 | `#dx-origem` | ver | **Origem** — Interno é feito no LAMIC; Apoio é enviado a outro laboratório. |
| 10 | `#gaveta [onclick="copiarPromptInstrucao()"]` | ver · condicional | **Copiar prompt** — Copiar prompt copia o prompt de IA que organiza a instrução no padrão do catálogo (jejum, orientações, interações, conservação…). Cole numa IA junto com o texto técnico do exame e traga o resultado para o campo Instrução do exame. |
| 11 | `#dx-anexos` | ver · condicional | **Anexos** — Links (Drive, PDF, formulário) da instrução do exame. Vão para o catálogo de instruções e aparecem clicáveis para os apoiados no L2L. Os anexos que já estão no catálogo entram sozinhos. |
| 12 | `#gaveta [onclick="gravarDadosExame()"]` | clique · avança se deu certo | **Salvar** — Clique em Salvar. |
| 13 | `#modal .modal-card` | ver · condicional | **Proposta ou publicar** — Com preço praticado, uma janela pergunta como ele passa a valer. Enviar como proposta (já marcado): vale depois da aprovação, e o exame fica sem preço até lá. Publicar direto (só quem aprova): vale na hora, sem revisão. |
| 14 | `#dx-pbal` | ver · condicional | **Comentário** — O balão abre um campo opcional para o comentário da proposta. Já vem com "Exame recém criado"; edite se quiser explicar o preço a quem aprova. |
| 15 | `#modal [data-r="1"]` | clique · condicional · avança se deu certo | **Confirmar** — Clique em Enviar proposta. A janela do cadastro fecha sozinha (em Publicar direto, a ficha do exame abre). |
| 16 | — (cartão central) | ver | **Pronto!** — O exame foi criado na simulação e já aparece na lista. Ao encerrar o treinamento ele é descartado. |

### Rascunho de exames

- **id:** `exames-rascunho` · **ícone:** `fa-pen-to-square` · **permissão:** exames:ver ou tabelas:ver
- **Objetivo:** Preços alterados nas fichas: conferir, marcar e enviar como proposta.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#ex-body tr.row` | clique | **Abra um exame** — Primeiro, um preço no rascunho. Clique em um exame para abrir a ficha. |
| 2 | `#fx-preco` | digitar (sugestão: calculada) · espera `#gaveta.open` · condicional | **Novo preço** — Digite um novo preço praticado. |
| 3 | `#gaveta [onclick="salvarFicha('rascunho')"]` | clique · condicional · avança se deu certo | **Guardar no rascunho** — Clique em Rascunho: o preço fica guardado só para você, sem enviar. |
| 4 | `#ex-rasc` | clique · avança se deu certo | **Botão Rascunho** — O número mostra quantos exames têm preço no seu rascunho. No filtro Controle interno › No meu rascunho a lista mostra só eles. Clique em Rascunho. |
| 5 | `#rx-lista` | ver · espera `#rx-lista` | **Exames no rascunho** — Um quadro por tabela, como no envio da proposta: Particular, custo, atual, proposto, desconto e margem, com as médias e a tabela toda. Se o exame ainda está no rascunho da Particular, o desconto das outras tabelas já usa esse valor. A chave UniLab aparece só nos exames cujo valor difere do UniLab. Clique no exame para abrir a ficha (ao fechar, volta aqui); tira a linha do rascunho. |
| 6 | `#rx-lista .price-in input` | digitar (sugestão: calculada) · condicional | **Edite o valor** — O valor proposto pode ser alterado aqui mesmo, com a vírgula automática. Vale na hora para o envio, mesmo sem sair do campo; ao sair, margem e desconto são recalculados. Vazio retira o exame da tabela. |
| 7 | `#rx-arred .pp-arred` | ver · condicional | **Arredondar** — Arredonda todos os valores propostos ao múltiplo mais próximo de R$ 1, 5, 10 ou 100. Clique de novo no botão ativo para voltar aos centavos. |
| 8 | `#rx-arred .pp-vista` | ver · condicional | **Analítico ou sintético** — Analítico: um quadro completo por tabela. Sintético: uma linha por exame e uma coluna por tabela, com o valor editável e margem e desconto logo abaixo (+ sem custo abre a aba de custos do exame). A escolha fica lembrada neste navegador; a chave UniLab só existe no Analítico. |
| 9 | `.rx-ck` | ver · condicional | **Marque o que enviar** — A caixa à esquerda do mnemônico marca o exame (cinza = desmarcado): só os marcados são enviados ou descartados. Marcar todos e o filtro agilizam. |
| 10 | `#rx-just` | digitar (sugestão: "Reajuste de treinamento") | **Justificativa** — Explique o motivo. Quem aprova vê este texto. |
| 11 | `#gaveta .dr-f` | ver | **Enviar** — Enviar para aprovação manda tudo num lote só: uma única aprovação (uma linha no sino e nas pendentes). Aprovar e publicar (só para quem aprova) publica direto. Nos dois, se algum valor ficar diferente do UniLab, antes aparece a janela para marcar os já lançados lá. |
| 12 | `#rx-enviar` | clique · condicional · avança se deu certo | **Enviar para aprovação** — Clique em Enviar para aprovação. |
| 13 | — (cartão central) | ver | **Pronto!** — Rascunho enviado (na simulação). As propostas aparecem em Tabelas de Preço › Propostas e no sino de quem aprova. |

## Custos

### Custos fixos: linear ou rateado

- **id:** `custos-fixos` · **ícone:** `fa-hand-holding-medical` · **permissão:** custos:editar
- **Objetivo:** Como cada custo fixo entra no preço dos exames.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#nav a[data-s="custos"]` | clique | **Abra Custos** — Clique em Custos no menu. |
| 2 | `#custos-fixos .kpis` | ver | **Resumo** — Total dos custos lineares, rateados, dos que dependem de etapa e o total por exame. |
| 3 | `#custos-fixos tbody tr:first-child td:nth-child(2) .seg` | ver | **Cobrança** — Linear: o valor cheio entra em cada exame. Rateado: o valor é dividido pelos exames de um atendimento. |
| 4 | `#custos-fixos tbody tr:first-child td:nth-child(2) .seg button:not(.on)` | clique | **Troque a cobrança** — Clique na outra opção para trocar a forma de cobrança deste custo. |
| 5 | `#custos-fixos .kpis` | ver | **Efeito imediato** — Os totais mudaram e o custo de todos os exames foi recalculado. Na simulação, nada foi gravado. |
| 6 | `#custos-fixos tbody tr:first-child td:nth-child(3) .seg` | ver | **Aplica-se a** — Todos os exames, ou só os que passam por coleta ou triagem. |
| 7 | `#custos-fixos tbody tr:first-child .price-in` | ver | **Valor** — Altere o valor direto na tabela; ele é salvo ao sair do campo. |
| 8 | — (cartão central) | ver | **Pronto!** — Lembre-se: alterar um custo fixo muda o custo de todos os exames. |

### Cadastrar reagente

- **id:** `custos-reagente` · **ícone:** `fa-vials` · **permissão:** custos:criar
- **Objetivo:** Preço do kit, testes, perdas e o custo por teste calculado.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-custos .subnav button[data-p="reag"]` | clique | **Reagentes e insumos** — Clique em Reagentes e insumos. |
| 2 | `#reag-body` | ver | **Lista de reagentes** — Cada reagente mostra o custo por teste e quantos exames usam ele. |
| 3 | `#custos-reag .formula` | ver | **Como é calculado** — Custo por teste = (kit + calibrador + controle) ÷ testes úteis (descontadas perdas, calibração e controle de qualidade). |
| 4 | `#s-custos [onclick="abrirReagente()"]` | clique | **Novo reagente** — Clique em Novo reagente. |
| 5 | `#rg-nome` | digitar (sugestão: "Glicose HK (treino)") · espera `#gaveta.open` | **Nome** — Nome do reagente. |
| 6 | `#rg-kit` | digitar (sugestão: "850") | **Preço do kit** — Quanto custa o kit. |
| 7 | `#rg-testes` | digitar (sugestão: "500") | **Testes por kit** — Quantos testes o kit rende. |
| 8 | `#rg-perdas` | digitar (sugestão: "5") | **Perdas** — Repetição, volume morto e vencimento, em %. |
| 9 | `#gaveta [onclick^="novoInsumoReagente"]` | ver · condicional | **Calibrador e controle** — Não achou na lista? Novo calibrador e Novo controle abrem o cadastro e voltam para cá com o item escolhido, sem perder o que foi digitado. |
| 10 | `#rg-prev` | ver | **Resultado** — O custo por teste é calculado na hora. |
| 11 | `#gaveta [onclick="gravarReagente()"]` | clique · avança se deu certo | **Salvar** — Clique em Salvar e recalcular: os exames vinculados ao reagente são recalculados. |
| 12 | — (cartão central) | ver | **Pronto!** — Reagente cadastrado na simulação. Na ficha do exame você vincula o reagente ao custo do teste, e também pode cadastrar um novo por lá. |

### Laboratórios de apoio

- **id:** `custos-apoio` · **ícone:** `fa-truck-medical` · **permissão:** custos:ver
- **Objetivo:** Tabela do apoio, vínculos de mnemônicos e importação.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-custos .subnav button[data-p="apoio"]` | clique | **Laboratórios de apoio** — Clique em Laboratórios de apoio. |
| 2 | `#custos-apoio .cards` | ver · condicional | **Apoios** — Um cartão por laboratório de apoio: exames do LAMIC, quantos estão vinculados à tabela do apoio e quantos estão sem custo. |
| 3 | `#apoio-det` | ver · condicional | **Detalhe do apoio** — Tabela importada e vínculos entre o mnemônico do LAMIC e o código do apoio. O preço do apoio vira o custo do teste. |
| 4 | `#apoio-det .sec-card-h .btn.pri` | ver · condicional | **Importar tabela** — Importa a tabela do portal do apoio. Toda importação mostra o resultado para conferir antes de gravar. |
| 5 | — (cartão central) | ver | **Pronto!** — Mantenha a tabela do apoio atualizada para que o custo dos exames enviados fique correto. |

## Tabelas de Preço

### Editar preços na tabela

- **id:** `tabelas-editar` · **ícone:** `fa-table-cells` · **permissão:** tabelas:editar
- **Objetivo:** Rascunho, atalhos de preço e envio da proposta.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#nav a[data-s="tabelas"]` | clique | **Abra Tabelas de Preço** — Clique em Tabelas de Preço no menu. |
| 2 | `#tab-cards` | ver | **Tabelas** — Cada cartão é uma tabela: exames, margem média, abaixo do piso, propostas e rascunho. Clique num cartão para abrir a grade de preços. |
| 3 | `#tab-detalhe .sec-card-h` | ver | **Cabeçalho da tabela** — Regras da tabela (piso, desconto de referência) e as ações: importar do Unilab, exportar, PDF e configurar. |
| 4 | `#pop-grfiltro .pop-btn` | ver | **Filtros** — Veja só os exames na tabela, fora dela ou com alertas: abaixo do piso, divergentes do Unilab, sem custo… |
| 5 | `#gr-body tr[data-k] .price-in input:not([disabled])` | digitar (sugestão: calculada) | **Altere um preço** — Digite o novo preço. A linha fica marcada e vai para o seu rascunho: nada é publicado ainda. |
| 6 | `#gr-body tr.ed .acts, #gr-body tr[data-k] .acts` | ver | **Atalhos da linha** — Botões para usar o preço sugerido, levar ao piso, aplicar o desconto de referência, desfazer ou retirar da tabela. |
| 7 | `#gr-bar` | ver · espera `#gr-bar.on` | **Seu rascunho** — Resumo do rascunho: quantos sobem, descem e a margem média antes e depois. |
| 8 | `#gr-bar [onclick="abrirEnvioProposta()"]` | clique | **Revisar e enviar** — Clique em Revisar e enviar. |
| 9 | `#gaveta .pp-barra` | ver · espera `#gaveta.open` · condicional | **Vista e arredondamento** — Analítico mostra o quadro completo; Sintético, uma linha por exame com o essencial. Os botões R$ 1, 5, 10 e 100 arredondam ao múltiplo mais próximo todos os valores propostos (clique de novo para desligar). A chave UniLab aparece só nos exames cujo valor difere do UniLab. |
| 10 | `#pp-just` | digitar (sugestão: "Reajuste de treinamento") · espera `#gaveta.open` | **Justificativa** — Confira os preços e explique o motivo da proposta. |
| 11 | `#gaveta [onclick="enviarProposta(true)"]` | ver · condicional | **Aprovar e publicar** — Só para quem aprova: publica na hora, sem passar por outra pessoa. Se algum valor ficar diferente do UniLab, antes aparece a janela para marcar os já lançados lá; senão, publica direto. |
| 12 | `#gaveta [onclick="enviarProposta(false)"]` | clique · avança se deu certo | **Enviar para aprovação** — Clique em Enviar para aprovação. |
| 13 | — (cartão central) | ver | **Pronto!** — Proposta enviada (na simulação). Ela aparece em Propostas e no sino de quem aprova. |

### Criar nova tabela

- **id:** `tabelas-nova` · **ícone:** `fa-square-plus` · **permissão:** tabelas:criar
- **Objetivo:** Tipo, piso de margem, descontos, perfil de custo e preços iniciais.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-tabelas [onclick="abrirConfigTabela()"]` | clique | **Nova tabela** — Clique em Nova tabela. |
| 2 | `#tb-nome` | digitar (sugestão: "Cartão Treinamento") · espera `#gaveta.open` | **Nome** — Nome da tabela, como aparece nas listas e PDFs. |
| 3 | `#tb-ed .opt-cards` | ver | **Tipo** — Cartões e convênios ou Laboratórios apoiados (amostra chega coletada). |
| 4 | `#tb-ed .fgrid` | ver | **Regras de preço** — Piso de margem e desconto de referência sobre a Particular. Abaixo ficam o desconto máximo e a sugestão de margem. |
| 5 | `#tb-toldesc` | digitar (sugestão: "0.5") | **Tolerância de desconto** — Tolerância de desconto, em pontos percentuais: preços até esse tanto acima do desconto de referência ou do máximo (ex.: por arredondamento) não geram alerta. Vazio = alerta a partir de qualquer excesso. |
| 6 | `#tb-tolmarg` | digitar (sugestão: "1") | **Tolerância de margem** — Tolerância de margem, em pontos percentuais abaixo da sugestão de margem: o preço sugerido arredonda para baixo quando a margem ainda fica dentro dela. Vazio = sempre para cima. |
| 7 | `#tb-ed [onclick^="perfilTabela"]` → `closest('.casc')` | ver | **Perfil de custo** — Para cada custo fixo: cobrar o padrão, não cobrar ou usar outro valor. Ex.: apoiados não pagam atendimento nem coleta. |
| 8 | `#tb-ed [onclick^="_tbEd.inicial='desconto'"]` | clique | **Preços iniciais** — Escolha Particular com desconto para a tabela já nascer com todos os exames. |
| 9 | `#gaveta [onclick="gravarConfigTabela()"]` | clique · avança se deu certo | **Salvar** — Clique em Salvar. |
| 10 | `#tab-cards` | ver | **Tabela criada** — A nova tabela aparece entre os cartões (só nesta simulação). |
| 11 | — (cartão central) | ver | **Pronto!** — Depois de criar, inclua a tabela na Hierarquia para o sistema vigiar os preços. |

### Aprovar ou rejeitar proposta

- **id:** `tabelas-aprovar` · **ícone:** `fa-stamp` · **permissão:** tabelas:aprovar
- **Objetivo:** Revisar os preços propostos e publicar.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#tabelas-propostas` | ver | **Propostas** — Aqui ficam as propostas pendentes e o histórico das decididas. Envios do rascunho de exames com várias tabelas viram uma linha só (um lote). |
| 2 | — (cartão central) | ver · condicional | **Nenhuma proposta pendente** — Não há propostas aguardando agora. Faça antes o tutorial Editar preços na tabela e escolha Explorar livremente no final: a proposta simulada aparece aqui e você volta a este tutorial. |
| 3 | `#prop-corpo tbody tr.row[onclick^="abrirProposta"]` | clique · condicional | **Abra a proposta** — Clique em uma proposta pendente. |
| 4 | `#gaveta .dr-b` | ver · espera `#gaveta.open` · condicional | **Revise** — Preço de hoje → preço proposto, margem e alertas de piso de cada exame, com a justificativa do autor. O valor proposto pode ser revisado no campo, com a vírgula automática: vale o que estiver digitado, mesmo sem Enter. |
| 5 | `#gaveta [onclick^="aprovarLote"]` | ver · condicional | **Aprovar o lote** — Abriu um lote: as tabelas enviadas juntas. Os valores propostos podem ser revisados aqui mesmo, no Analítico ou no Sintético; ao aprovar, vale o revisado. Aprovar lote publica todas de uma vez; o link detalhe de cada tabela abre a proposta dela para editar ou rejeitar só ela. |
| 6 | `#pp-arred-w` | ver · condicional | **Arredondar** — Arredonda todos os valores propostos ao múltiplo mais próximo de R$ 1, 5, 10 ou 100: viram valores revisados. Clique de novo no ativo para voltar ao proposto. |
| 7 | `#pp-motivo` | digitar (sugestão: "Aprovado no treinamento") · condicional | **Observação** — Opcional para aprovar; obrigatória para rejeitar. |
| 8 | `#gaveta .dr-f` | ver · condicional | **Decida** — Rejeitar devolve ao autor com a observação. Aprovar e publicar aplica os preços na tabela: se nenhum valor ficar diferente do UniLab, publica direto. |
| 9 | `#pp-aprovar` | clique · condicional · avança se deu certo | **Aprovar e publicar** — Clique em Aprovar e publicar. |
| 10 | `#modal .modal-card` | ver · condicional | **Valor atualizado no UniLab?** — Aparece em qualquer publicação quando o valor publicado fica diferente do salvo no UniLab. Lista só os exames ainda não marcados (ou com valor alterado na aprovação): os já marcados no envio não aparecem. |
| 11 | `#modal .fx-conf` | ver · condicional | **Já lançado no UniLab?** — Ligue os exames cujo novo valor já foi lançado no sistema do laboratório: a tabela do sistema no banco recebe o valor publicado. Os desligados ficam pendentes no sino, em Atualizar no UniLab. Marcar todos e Inverter agilizam. |
| 12 | `#modal [data-r="1"]` | clique · condicional · avança se deu certo | **Publicar** — Clique em Aprovar e publicar. Voltar retorna à proposta sem publicar. |
| 13 | — (cartão central) | ver | **Pronto!** — Na vida real, os preços aprovados ficam publicados e o autor vê a decisão no histórico. Para desfazer uma aprovação, veja Histórico de propostas. |

### Histórico de propostas

- **id:** `tabelas-historico` · **ícone:** `fa-clock-rotate-left` · **permissão:** tabelas:ver
- **Objetivo:** Lotes decididos, vista analítica ou sintética, reverter e excluir.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#tabelas-propostas [onclick^="propFiltro='historico'"]` | clique | **Histórico** — Clique em Histórico: propostas aprovadas, rejeitadas e canceladas, agrupadas pelo envio (lote). |
| 2 | `#prop-corpo` | ver | **Lotes** — Cada linha é um envio: tabelas, autor, quantos preços, o que subiu ou desceu e a situação. Os filtros Tabela e Autor ficam à direita. |
| 3 | `#prop-corpo tbody tr.row` | clique · condicional · avança se deu certo | **Abra um lote** — Clique em uma linha. |
| 4 | `#gaveta .pp-vista` | ver · espera `#gaveta.open` · condicional | **Analítico ou sintético** — Analítico: um quadro por tabela, com indicadores. Sintético: uma linha por exame e uma coluna por tabela, com valor, de quanto era, margem e desconto. Clique no exame para abrir a ficha. |
| 5 | `#gaveta [onclick^="reverterPropostas"]` | ver · condicional | **Reverter** — Só para quem aprova, em proposta aprovada: volta cada preço ao valor de antes e a proposta passa a cancelada. Preço que mudou depois por outra proposta fica como está (a janela avisa). O UniLab não muda: a divergência aparece para atualizar lá. |
| 6 | `#gaveta [onclick^="excluirPropostas"]` | ver · condicional | **Excluir do histórico** — Proposta cancelada (pelo autor ou por quem aprova) pode sair do histórico. Não dá para desfazer. |
| 7 | `#gaveta .dr-h .icon-btn` | clique · espera `#gaveta.open` | **Fechar** — Clique no X para fechar o lote. |
| 8 | — (cartão central) | ver | **Pronto!** — O histórico guarda quem propôs, quem decidiu e quando, por tabela. |

### Hierarquia de valor

- **id:** `tabelas-hierarquia` · **ícone:** `fa-stairs` · **permissão:** tabelas:ver
- **Objetivo:** Ordem das tabelas e exames que quebram a hierarquia.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-tabelas .subnav button[data-p="hierarquia"]` | clique | **Hierarquia** — Clique em Hierarquia. |
| 2 | `#tabelas-hierarquia .hier-lista` | ver | **Ordem das tabelas** — A Particular fica no topo. Cada tabela não pode ter preço maior que as que estão acima dela. |
| 3 | `#tabelas-hierarquia .hier-i:not(.topo) .acts` | ver · condicional | **Reordenar** — Suba, desça ou tire uma tabela da hierarquia. |
| 4 | `#hier-res` | ver | **Quebras** — Exames com preço fora da ordem. Quem edita pode corrigir o valor direto nesta lista e preencher os campos com —, de exames ainda sem preço na tabela. |
| 5 | — (cartão central) | ver | **Pronto!** — A quebra de hierarquia também aparece no painel inicial e na ficha do exame. |

### Laboratórios apoiados e conveniados

- **id:** `tabelas-labs-conv` · **ícone:** `fa-building-user` · **permissão:** tabelas:criar
- **Objetivo:** Cadastro e valores diferenciados por cliente.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-tabelas .subnav button[data-p="labs"]` | clique | **Laboratórios apoiados** — Clique em Laboratórios apoiados: laboratórios que enviam amostras ao LAMIC. |
| 2 | `#lab-cards` | ver · condicional | **Laboratórios** — Cada laboratório tem uma tabela de referência e valores diferenciados por exame. |
| 3 | `#s-tabelas [onclick="abrirLaboratorio()"]` | clique | **Novo laboratório** — Clique em Novo laboratório. |
| 4 | `#lb-nome` | digitar (sugestão: "Lab. Treinamento") · espera `#gaveta.open` | **Nome** — Nome do laboratório. |
| 5 | `#lb-cnpj` | digitar (sugestão: "12.345.678/0001-99") | **CNPJ** — CNPJ (opcional), com 14 dígitos. |
| 6 | `#pop-lbtab` | ver | **Tabela de referência** — Define o valor padrão, o perfil de custo e o piso de margem do laboratório. |
| 7 | `#gaveta [onclick="gravarLaboratorio()"]` | clique · avança se deu certo | **Salvar** — Clique em Salvar. |
| 8 | `#s-tabelas .subnav button[data-p="conv"]` | clique | **Conveniados** — Clique em Conveniados: empresas e clientes com valores próprios sobre uma tabela base. |
| 9 | `#s-tabelas [onclick="abrirConveniado()"]` | ver | **Novo conveniado** — O cadastro do conveniado segue o mesmo modelo do laboratório. |
| 10 | — (cartão central) | ver | **Pronto!** — Laboratório criado na simulação. Na grade dele, use Adicionar para incluir valores diferenciados. |

## Simulador

### Reajuste de tabela

- **id:** `simulador-reajuste` · **ícone:** `fa-arrow-trend-up` · **permissão:** simulador:ver
- **Objetivo:** Simular o impacto de um reajuste antes de aplicar.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#pop-rjalvo` | ver | **Tabela** — Escolha a tabela a simular: Particular, outras tabelas, laboratórios ou conveniados. |
| 2 | `#rj-form .opt-cards` | ver | **Tipo de reajuste** — Percentual, levar ao piso, margem desejada, preço sugerido ou desconto sobre a referência. |
| 3 | `#rj-p` | digitar (sugestão: "8") · condicional | **Percentual** — Digite o percentual de reajuste. Negativo reduz. |
| 4 | `#rj-imp` | ver | **Impacto** — Quantos preços mudam, a variação média e o efeito na margem. |
| 5 | `#rj-body` | ver | **Resultado por exame** — Preço atual e novo de cada exame. Você pode digitar um valor diferente na coluna Novo. |
| 6 | `#rj-form .sim-acoes` | ver | **Levar adiante** — Leve o resultado ao seu rascunho ou envie direto como proposta. Nenhum preço muda até a aprovação. |
| 7 | — (cartão central) | ver | **Pronto!** — Simule à vontade: o simulador só altera preços depois de uma proposta aprovada. |

### Comparar tabelas

- **id:** `simulador-comparar` · **ícone:** `fa-code-compare` · **permissão:** simulador:ver
- **Objetivo:** Duas tabelas lado a lado: diferenças, ausentes, ajuste de cada lado e rascunho.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-simulador .subnav button[data-p="cmp"]` | clique | **Comparar tabelas** — Clique em Comparar tabelas. |
| 2 | `#cmp-lado-a .cmp-lado-h` | ver | **Tabela A** — Escolha a primeira tabela: Particular, outras tabelas, laboratórios ou conveniados. |
| 3 | `#cmp-lado-b .cmp-lado-h` | ver | **Tabela B** — Escolha a segunda. Se escolher num lado a tabela do outro, A e B trocam de lugar. |
| 4 | `#cmp-imp` | ver | **Resumo** — Quantos exames têm valor diferente (e em qual tabela é maior), a diferença média de B sobre A e quantos estão só em A ou só em B. |
| 5 | `#cmp-chips` | ver | **Filtros** — Diferentes, A maior, B maior, só em A, só em B, iguais e ajustados. Os filtros usam os preços de hoje, então a linha não some enquanto você ajusta. |
| 6 | `#cmp-body` | ver | **Lado a lado** — Preço atual e novo de cada tabela, a diferença de B sobre A e a comparação. Exame que falta numa tabela aparece como ausente. |
| 7 | `#cmp-lado-b [data-tipo="outra"]` | clique | **Tipo de ajuste** — Cada lado tem a sua regra. Clique em Pela outra tabela: o preço de B passa a seguir o de A. |
| 8 | `#cmp-pb` | digitar (sugestão: "-5") | **Percentual sobre a outra** — Digite quanto B fica acima ou abaixo de A. 0 iguala os valores; -5 deixa B 5% abaixo. |
| 9 | `#cmp-lado-b .cmp-escopo` | ver | **Aplicar em** — Escolha onde a regra mexe: só nos exames com valor diferente, nos mais caros, nos mais baratos ou em todos. Logo abaixo, Incluir ausentes traz os exames que só a outra tabela tem. |
| 10 | `#cmp-body input[data-l="a"]` | digitar (sugestão: calculada) · condicional | **Edite à mão** — Digite um valor na coluna Novo de qualquer lado. O valor manual vale sobre a regra; a seta ao lado desfaz. |
| 11 | `#cmp-lado-a .cmp-acoes` | ver · condicional | **Rascunho de cada tabela** — Gerar rascunho leva os ajustes deste lado ao seu rascunho da tabela; Abrir rascunho vai para a grade, de onde você envia a proposta. |
| 12 | `#cmp-ambos` | ver · condicional | **Os dois de uma vez** — Gerar os dois rascunhos leva os ajustes de A e de B, cada um para o rascunho da sua tabela. |
| 13 | — (cartão central) | ver | **Pronto!** — Compare à vontade: nenhum preço muda até a proposta de cada tabela ser aprovada. |

### Proposta L2L (laboratório)

- **id:** `simulador-lab` · **ícone:** `fa-handshake` · **permissão:** simulador:criar
- **Objetivo:** Preço proposto × volume mensal, margem e PDF.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#simulador-lab [onclick="novaSimLab()"]` | clique | **Nova proposta** — Clique em + para começar uma proposta nova. Se pedir para descartar a atual, confirme na janela. |
| 2 | `#pl-nome` | digitar (sugestão: "Lab. Vida — treinamento") | **Nome da proposta** — Dê um nome para encontrar depois. |
| 3 | `#pop-pllab` | ver | **Laboratório** — Laboratório já cadastrado ou um novo cliente. |
| 4 | `#pop-pltab` | ver | **Tabela de referência** — Base de preço e perfil de custo usados no cálculo da margem. |
| 5 | `#pop-plbase` | ver | **Preço inicial** — Comece pelo preço da tabela ou aplique um desconto. |
| 6 | `#pl-body` | ver | **Preço × volume** — Ajuste o preço proposto e o volume mensal de cada exame. |
| 7 | `#pl-imp` | ver | **Resultado** — Faturamento, custo e margem da proposta inteira. |
| 8 | `#simulador-lab [onclick="salvarSimLab()"]` | clique | **Salvar** — Clique em salvar para guardar a proposta. |
| 9 | `#simulador-lab [onclick="abrirPdfLab()"]` | ver | **PDF** — Gera a proposta em PDF com o texto de apresentação, pronta para enviar. |
| 10 | — (cartão central) | ver | **Pronto!** — Uma proposta salva pode virar tabela de preço ou laboratório apoiado pelo botão de converter. |

### Propostas Empresas

- **id:** `simulador-emp` · **ícone:** `fa-building` · **permissão:** simulador:criar
- **Objetivo:** Venda única: exames um a um ou a tabela toda, quantidade e custo sem o atendimento.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#simulador-emp [onclick="novaSimMed()"]` | clique | **Nova proposta** — Clique em + para começar. Se pedir para descartar a atual, confirme na janela. |
| 2 | `#pm-nome` | digitar (sugestão: "Empresa Exemplo — treinamento") | **Nome** — Nome da proposta. |
| 3 | `#pm-medico` | digitar (sugestão: "Empresa Exemplo Ltda") | **Empresa** — Razão social: aparece no PDF. |
| 4 | `#pm-crm` | digitar (sugestão: "00.000.000/0001-00 · RH") | **CNPJ / contato** — Opcional, aparece no PDF. |
| 5 | `#pop-pmtab` | ver | **Tabela de referência** — Base de preço, perfil de custo e piso de margem. |
| 6 | `#pop-pmbase` | ver | **Preço empresa** — Desconto sobre a tabela, valor da tabela ou sugestão de margem. Cada exame pode ter o preço digitado. |
| 7 | `#pm-add` | digitar (sugestão: "GLI") | **Adicione exames** — Digite o mnemônico ou o nome. |
| 8 | `#pm-sug.open button` | clique | **Escolha o exame** — Clique em uma sugestão. |
| 9 | `#pm-todos` | ver | **Ou a tabela toda** — Inclui de uma vez todos os exames da tabela (ou do setor filtrado). Depois é só tirar o que não entra. |
| 10 | `#pm-body` | ver | **Exames e quantidade** — Informe a quantidade de cada exame: é uma proposta de venda única, não um acordo mensal (como no orçamento de cliente). O custo total soma todos os custos menos o atendimento. |
| 11 | `#pm-imp` | ver | **Resultado** — Quantidade de exames, total e lucro da proposta, margem ponderada pela quantidade e viabilidade pelo piso. |
| 12 | `#pm-bulk` | ver · condicional | **Quantidade em lote** — Digite uma quantidade e clique em Qtd nos filtrados para aplicá-la a todos os exames da lista filtrada. Também dá para tirar os sem quantidade, os filtrados ou todos. |
| 13 | `#simulador-emp [onclick="salvarSimMed()"]` | clique | **Salvar** — Clique em salvar. |
| 14 | `#simulador-emp [onclick="abrirPdfMed()"]` | ver | **PDF da proposta** — Gera a proposta à empresa em PDF, com colunas Qtd e Total e o total da proposta (sem custo nem margem). O texto padrão fica em Configurar texto, nesta aba. |
| 15 | — (cartão central) | ver | **Pronto!** — Proposta à empresa montada na simulação: venda única, pela quantidade de cada exame. |

### Proposta para cliente

- **id:** `simulador-cli` · **ícone:** `fa-user` · **permissão:** simulador:criar
- **Objetivo:** Orçamento de exames com um só atendimento e PDF.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#simulador-cli [onclick="novaSimCli()"]` | clique | **Nova proposta** — Clique em + para começar. Se pedir para descartar a atual, confirme na janela. |
| 2 | `#pc-nome` | digitar (sugestão: "Check-up — treinamento") | **Nome** — Nome da proposta. |
| 3 | `#pc-cliente` | digitar (sugestão: "Paciente Exemplo") | **Cliente** — Paciente ou empresa. |
| 4 | `#pc-q` | digitar (sugestão: "GLI") | **Adicione exames** — Digite o mnemônico ou o nome do exame. |
| 5 | `#pc-sug.open button` | clique | **Escolha o exame** — Clique em uma sugestão para incluir o exame. |
| 6 | `#pc-body` | ver | **Exames da proposta** — Preço, desconto e volume de cada exame. O custo do atendimento é dividido entre todos. |
| 7 | `#pc-imp` | ver | **Resultado** — Total da proposta e margem. |
| 8 | `#simulador-cli [onclick="salvarSimCli()"]` | clique | **Salvar** — Clique em salvar. |
| 9 | `#simulador-cli [onclick="abrirPdfCli()"]` | ver | **Orçamento em PDF** — Gera o orçamento para entregar ao cliente. |
| 10 | — (cartão central) | ver | **Pronto!** — Orçamento montado na simulação. |

### Proposta para médico

- **id:** `simulador-med` · **ícone:** `fa-user-doctor` · **permissão:** simulador:criar
- **Objetivo:** Desconto aos pacientes de um médico, com expectativa mensal; custo sem a coleta.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#simulador-med [onclick="novaSimMed()"]` | clique | **Nova proposta** — Clique em + para começar. Se pedir para descartar a atual, confirme na janela. |
| 2 | `#pm-nome` | digitar (sugestão: "Dr. Exemplo — treinamento") | **Nome** — Nome da proposta. |
| 3 | `#pm-medico` | digitar (sugestão: "Dr. Exemplo") | **Médico** — Nome do médico. |
| 4 | `#pm-crm` | digitar (sugestão: "CRM-CE 00000 · Clínica") | **CRM / especialidade** — Aparece no PDF. |
| 5 | `#pop-pmbase` | ver | **Preço ao paciente** — Preço da tabela ou com desconto. |
| 6 | `#pm-add` | digitar (sugestão: "GLI") | **Adicione exames** — Digite o mnemônico ou o nome. |
| 7 | `#pm-sug.open button` | clique | **Escolha o exame** — Clique em uma sugestão. |
| 8 | `#pm-todos` | ver | **Incluir vários** — Inclui de uma vez todos os exames do setor filtrado. |
| 9 | `#pm-body` | ver | **Exames e expectativa** — Informe a expectativa mensal de envio de cada exame. O custo total não inclui a coleta: o paciente é atendido pelo médico. |
| 10 | `#pm-imp` | ver | **Resultado** — Pacientes esperados, receita e lucro mensais, margem ponderada pelo volume e viabilidade pelo piso. |
| 11 | `#simulador-med [onclick="salvarSimMed()"]` | clique | **Salvar** — Clique em salvar. |
| 12 | — (cartão central) | ver | **Pronto!** — Proposta ao médico montada na simulação. O PDF fica no botão ao lado de salvar. |

## Pendências

### Resolver pendências

- **id:** `pendencias-resolver` · **ícone:** `fa-list-check` · **permissão:** pendencias:ver
- **Objetivo:** O que impede um preço confiável e como corrigir.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#nav a[data-s="pendencias"]` | clique | **Abra Pendências** — Clique em Pendências no menu. O número vermelho conta os exames abaixo do mínimo. |
| 2 | `#s-pendencias .tabs` | ver | **Categorias** — Sem custo, sem setor, sem preço, divergência com o sistema, hierarquia, a auditar e abaixo do mínimo. |
| 3 | `#s-pendencias .pend-desc` | ver | **O que significa** — Explicação da categoria aberta. |
| 4 | `#s-pendencias tbody tr.row` | clique · condicional | **Corrija** — Clique em um exame para abrir a ficha e corrigir o que falta. |
| 5 | `#gaveta .dr-h .icon-btn` | clique · espera `#gaveta.open` | **Fechar** — Corrigido na ficha, o exame sai da lista. Clique no X para fechar. |
| 6 | — (cartão central) | ver | **Pronto!** — Zerar as pendências deixa todos os preços com base confiável. |

## Instruções

### Consultar instruções

- **id:** `instrucoes-consultar` · **ícone:** `fa-book-open` · **permissão:** instrucoes:ver
- **Objetivo:** Catálogo do exame, instruções de coleta e checklist de publicação.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#nav a[data-s="instrucoes"]` | clique | **Abra Instruções** — Clique em Instruções no menu. |
| 2 | `#s-instrucoes .progs` | ver · condicional | **Andamento** — Quantos exames têm instrução, foram revisados e publicados no site e no Unilab. |
| 3 | `#q-ins` | digitar (sugestão: "GLI") | **Busca** — Busque por mnemônico, nome ou material. |
| 4 | `#ins-chips` | ver | **Filtros** — Filtre pelo checklist: sem instrução, não revisado, não publicado… |
| 5 | `#ins-body tr.row` | clique | **Abra uma instrução** — Clique em um exame. |
| 6 | `#gaveta .dr-b` | ver · espera `#gaveta.open` | **Instrução do exame** — Nome, material, prazo, preparo e coleta. Quem edita também marca o checklist de publicação e os anexos. |
| 7 | `#gaveta .dr-h .icon-btn` | clique · espera `#gaveta.open` | **Fechar** — Clique no X para fechar a gaveta e voltar à lista. |
| 8 | — (cartão central) | ver | **Pronto!** — As instruções revisadas alimentam o site dos laboratórios apoiados (L2L). |

## Importar / Exportar

### Importar e exportar

- **id:** `importar-exportar` · **ícone:** `fa-file-import` · **permissão:** importar:ver
- **Objetivo:** Migração da planilha, sincronização com o Unilab e outros arquivos.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#nav a[data-s="importar"]` | clique | **Abra Importar / Exportar** — Clique em Importar / Exportar no menu. |
| 2 | `#mig-card` | ver | **Migração da planilha** — Importa a aba PARTICULAR da planilha comercial em etapas: arquivos, conferir, gravar. |
| 3 | `#sinc-card` | ver · condicional | **Sincronizar com o Unilab** — Compara os preços do Unilab com os do sistema e mostra as divergências antes de gravar. |
| 4 | `#s-importar .cards` | ver | **Outras importações** — Atalhos para apoio, catálogo de instruções, lista de exames, divergências, preços das tabelas, apoiados e PDF. |
| 5 | — (cartão central) | ver | **Pronto!** — Toda importação mostra o resultado para conferir antes de gravar. |

## Configurações

### Liberar acesso de usuário

- **id:** `config-usuarios` · **ícone:** `fa-user-check` · **permissão:** usuarios:editar
- **Objetivo:** Contas do Dados LAMIC: grupo de permissões, setores visíveis e situação.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-config .subnav` | ver | **Configurações** — Abas de configuração conforme o seu acesso. |
| 2 | `#users-body` | ver | **Usuários** — Todas as contas do Dados LAMIC. Aparecem só contas cujo grupo no Dados tem Acessar o Comercial; quem ainda não entrou aparece como Não configurado. |
| 3 | `#cfg-usuarios [onclick^="abrirLiberarAcesso"]` | clique · condicional | **Liberar acesso** — Clique em Liberar acesso para dar acesso ao Comercial a uma conta do Dados LAMIC que ainda não tem. |
| 4 | `#pop-liberar .pop` | clique · espera `#pop-liberar.open` · condicional · avança se deu certo | **Escolha a conta** — Digite para buscar pelo nome ou login e clique na conta. |
| 5 | `#users-body tr.row` | clique · condicional | **Abrir usuário** — Todas as contas já têm acesso. Clique em um usuário para ver ou ajustar grupo e setores. |
| 6 | `#u-nome` | ver · espera `#gaveta.open` | **Dados da conta** — Nome, login e cargo vêm do Dados LAMIC e são alterados só por lá. |
| 7 | `#u-grupo` | ver | **Grupo** — O grupo define o que o usuário pode ver e fazer em cada módulo. |
| 8 | `#u-setores` | ver | **Setores visíveis** — Limita os exames que o usuário enxerga a alguns setores. |
| 9 | `#gaveta [onclick="gravarUsuario()"]` | clique · avança se deu certo | **Salvar** — Clique em Salvar. |
| 10 | — (cartão central) | ver | **Pronto!** — Liberação feita só na simulação: o acesso real do usuário não mudou. Ao salvar de verdade, a conta passa a entrar no Comercial com o grupo e os setores escolhidos. |

### Grupos e permissões

- **id:** `config-grupos` · **ícone:** `fa-user-shield` · **permissão:** usuarios:editar
- **Objetivo:** Matriz de permissões por módulo e ação.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#s-config .subnav button[data-p="grupos"]` | clique | **Grupos e permissões** — Clique em Grupos e permissões. |
| 2 | `#cfg-grupos .glist` | ver | **Grupos** — Clique num grupo para ver as permissões. O grupo Admin tem acesso total e não muda. |
| 3 | `#gperm .pm-grid` | ver | **Matriz de permissões** — Um cartão por módulo, com as ações liberadas: ver, criar, editar, excluir, aprovar, importar e exportar. |
| 4 | `#gperm .pm-b:not([disabled])` | clique · condicional | **Ajuste um módulo** — Clique em um módulo para marcar as ações. |
| 5 | `#gperm .pop-wrap.open .pop` | ver · condicional | **Ações** — Marcar uma ação liga "Ver"; desmarcar "Ver" limpa o módulo. Cada clique é salvo na hora (aqui, só na simulação). |
| 6 | `#cfg-grupos [onclick="abrirGrupo()"]` | ver · condicional | **Novo grupo** — Cria um grupo novo, que nasce só com acesso de consulta. |
| 7 | — (cartão central) | ver | **Pronto!** — Os tutoriais também respeitam essas permissões: cada usuário vê só os do seu acesso. |

### Parâmetros e setores

- **id:** `config-parametros` · **ícone:** `fa-sliders` · **permissão:** params:editar
- **Objetivo:** Imposto, maquininha, exames por atendimento, prompt da instrução e setores.

| # | Alvo | Ação | Legenda |
|---|---|---|---|
| 1 | `#cfg-params .fgrid` | ver | **Parâmetros de cálculo** — Imposto sobre o faturamento, taxa da maquininha (só projeção) e média de exames por atendimento (divide os custos rateados). |
| 2 | `#pf-imposto` | digitar (sugestão: calculada) | **Altere um valor** — Mude o imposto e veja a prévia abaixo. |
| 3 | `#params-previa` | ver | **Prévia** — Efeito do parâmetro num exame de exemplo, antes de salvar. |
| 4 | `#cfg-params [onclick="salvarParametros()"]` | clique | **Salvar** — Clique em Salvar parâmetros: vale para todos os exames. |
| 5 | `#pf-prompt` | ver · condicional | **Prompt da instrução** — Texto copiado pelo botão Copiar prompt no cadastro do exame. Edite e clique em Salvar prompt; Restaurar padrão volta ao texto original. |
| 6 | `#s-config .subnav button[data-p="setores"]` | clique | **Setores** — Clique em Setores. |
| 7 | `#setores-body` | ver | **Setores** — Categoria, etapas padrão (coleta, triagem), quantidade de exames e margem alvo própria de cada setor. |
| 8 | `#setores-body tr.row` | clique | **Abra um setor** — Clique em um setor para editar. |
| 9 | `#gaveta .dr-b` | ver · espera `#gaveta.open` | **Editor do setor** — Nome, categoria, ícone, cor, etapas, margem alvo e os exames vinculados. |
| 10 | `#gaveta .dr-h .icon-btn` | clique · espera `#gaveta.open` | **Fechar** — Clique no X para fechar a gaveta e voltar à lista. |
| 11 | — (cartão central) | ver | **Pronto!** — Parâmetros e setores mudam o cálculo de todos os exames: altere com cuidado. |
