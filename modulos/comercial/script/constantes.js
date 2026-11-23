// ═══════════════════════════════════════════════════════════════
// constantes.js — Valores fixos e dados iniciais — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

// Módulos e ações usados na matriz de permissões dos grupos
const MODULOS = [
  { id: 'exames',     nome: 'Exames',            icone: 'fa-flask-vial',           acoes: ['ver', 'criar', 'editar', 'excluir', 'aprovar', 'exportar'] },
  { id: 'custos',     nome: 'Custos',            icone: 'fa-boxes-stacked',        acoes: ['ver', 'criar', 'editar', 'excluir', 'importar'] },
  { id: 'tabelas',    nome: 'Tabelas de Preço',  icone: 'fa-table-list',           acoes: ['ver', 'criar', 'editar', 'excluir', 'aprovar', 'exportar'] },
  { id: 'simulador',  nome: 'Simulador',         icone: 'fa-chart-line',           acoes: ['ver', 'criar', 'aprovar'] },
  { id: 'pendencias', nome: 'Pendências',        icone: 'fa-triangle-exclamation', acoes: ['ver', 'editar'] },
  { id: 'instrucoes', nome: 'Instruções',        icone: 'fa-book-medical',         acoes: ['ver', 'editar', 'aprovar', 'importar'] },
  { id: 'importar',   nome: 'Importar / Exportar', icone: 'fa-file-import',        acoes: ['ver', 'importar', 'exportar'] },
  { id: 'params',     nome: 'Parâmetros e setores', icone: 'fa-sliders',           acoes: ['ver', 'editar', 'aprovar'] },
  { id: 'usuarios',   nome: 'Usuários e grupos', icone: 'fa-users',                acoes: ['ver', 'criar', 'editar', 'excluir'] }
];

const ACOES = [
  { id: 'ver',      nome: 'Ver',      icone: 'fa-eye' },
  { id: 'criar',    nome: 'Criar',    icone: 'fa-plus' },
  { id: 'editar',   nome: 'Editar',   icone: 'fa-pen' },
  { id: 'excluir',  nome: 'Excluir',  icone: 'fa-trash' },
  { id: 'aprovar',  nome: 'Aprovar',  icone: 'fa-stamp' },
  { id: 'importar', nome: 'Importar', icone: 'fa-file-import' },
  { id: 'exportar', nome: 'Exportar', icone: 'fa-file-export' }
];

// Categorias de setor
const CATEGORIAS = {
  interno: { nome: 'Setor interno',        desc: 'Executado no LAMIC',       icone: 'fa-microscope',          cor: 'var(--green)' },
  servico: { nome: 'Serviço',              desc: 'Vacinas e procedimentos',  icone: 'fa-hand-holding-medical', cor: 'var(--amber)' },
  apoio:   { nome: 'Laboratório de apoio', desc: 'Enviado a terceiros',      icone: 'fa-truck-medical',        cor: 'var(--cyan)' }
};

// Modelos de importação de tabela de laboratório de apoio (escolhido no setor).
// Cada modelo novo nasce de um arquivo de exemplo do apoio; o leitor fica em apoio.js.
const MODELOS_APOIO = {
  pardini4114: {
    nome: 'Hermes Pardini · tabela 4114', icone: 'fa-file-excel', cor: '#1d7044', negociada: true,
    desc: 'Excel do portal · mnemônico (B), vigência (F) e preço (G)',
    arquivo: 'Tabela de preços do apoio (.xlsx)', exemplo: '4114_tabela_preços.xlsx', aceita: '.xlsx,.xls,.csv'
  },
  // O arquivo não traz material nem vigência: a vigência é a data da importação
  alvaro2656: {
    nome: 'Alvaro · tabela 2656', icone: 'fa-file-excel', cor: '#00a8cc', negociada: true, semVigencia: true,
    desc: 'Excel do portal · código (A), nome (B) e preço especial (F)',
    arquivo: 'Preços negociados do Alvaro (.xlsx)', exemplo: 'Alvaro - Tabela 2656.xlsx', aceita: '.xlsx,.xls,.csv'
  }
};

// Etapas do atendimento que condicionam custos fixos
const ETAPAS = {
  coleta:  { nome: 'Coleta',  icone: 'fa-syringe' },
  triagem: { nome: 'Triagem', icone: 'fa-filter' }
};

const PALETA = ['#00a8cc', '#0e7490', '#2a9d8f', '#16a34a', '#6366f1', '#8b5cf6', '#ec4899', '#e63946', '#e8913a', '#eab308', '#a16207', '#64748b'];

// Ícones disponíveis para setores: [classe, palavras de busca]
const ICONES = [
  ['fa-vial', 'tubo amostra'], ['fa-vials', 'tubos bioquímica'], ['fa-flask', 'frasco hormônio'], ['fa-flask-vial', 'frasco tubo'],
  ['fa-microscope', 'microscópio citologia'], ['fa-dna', 'dna molecular genética'], ['fa-droplet', 'sangue gota hematologia'],
  ['fa-hand-holding-droplet', 'líquido fluido'], ['fa-syringe', 'seringa vacina coleta'], ['fa-seedling', 'alergia planta'],
  ['fa-bacteria', 'bactéria bacteriologia'], ['fa-virus', 'vírus'], ['fa-viruses', 'vírus'], ['fa-disease', 'fungo micologia'],
  ['fa-shield-virus', 'imunologia defesa'], ['fa-lungs', 'pulmão baciloscopia'], ['fa-lungs-virus', 'pulmão vírus'],
  ['fa-heart-pulse', 'coração coagulação'], ['fa-brain', 'cérebro neuro'], ['fa-bone', 'osso'], ['fa-baby', 'bebê pezinho neonatal'],
  ['fa-person-pregnant', 'gestante gravidez'], ['fa-venus', 'feminino'], ['fa-mars', 'masculino espermograma'],
  ['fa-toilet', 'urina uroanálise'], ['fa-poop', 'fezes parasitologia'], ['fa-worm', 'parasita verme'], ['fa-bug', 'inseto parasita'],
  ['fa-tooth', 'dente'], ['fa-eye', 'olho'], ['fa-bolt', 'íons eletrólitos'], ['fa-cubes-stacked', 'glicose açúcar'],
  ['fa-temperature-half', 'temperatura'], ['fa-pills', 'medicamento droga'], ['fa-capsules', 'cápsula toxicologia'],
  ['fa-prescription-bottle-medical', 'frasco remédio'], ['fa-kit-medical', 'kit'], ['fa-stethoscope', 'estetoscópio'],
  ['fa-weight-scale', 'peso'], ['fa-biohazard', 'risco biológico'], ['fa-radiation', 'radiação'], ['fa-magnet', 'magnético'],
  ['fa-file-medical', 'laudo'], ['fa-notes-medical', 'prontuário'], ['fa-id-card', 'concurso admissional'],
  ['fa-briefcase-medical', 'ocupacional'], ['fa-user-doctor', 'médico'], ['fa-hand-holding-medical', 'procedimento serviço'],
  ['fa-building', 'laboratório apoio'], ['fa-hospital', 'hospital'], ['fa-truck-medical', 'transporte apoio'], ['fa-staff-snake', 'saúde']
];

// Ícones disponíveis para custos fixos
const ICONES_CUSTO = ['fa-headset', 'fa-server', 'fa-syringe', 'fa-filter', 'fa-user-doctor', 'fa-vial', 'fa-box', 'fa-truck', 'fa-bolt', 'fa-print', 'fa-barcode', 'fa-coins'];

// ── Dados iniciais (gravados na primeira execução) ───────────
const PADRAO_PARAMETROS = {
  imposto: 0.081,
  taxaMaquininha: 0.0229,
  margemMinima: 0.245,
  margemAlvo: 0.50,
  examesPorAtendimento: 3
};

// Prompt de IA copiado pelo botão da instrução do exame (editável em Configurações › Parâmetros)
const PADRAO_PROMPT_INSTRUCAO = 'Objetivo: Extrair informações de textos técnicos de exames laboratoriais e formatá-las em um padrão simplificado e organizado para o paciente e para o profissional de saúde.\nEstrutura do Modelo (Ordem Obrigatória):\n🍴 Jejum: (Sempre presente. Se não houver, escreva \'Não necessário\'. O texto deve ter quebra de linha).\n📑 Orientações: (Extrair preparo do paciente. Ocultar convênios, documentos ou pedidos médicos).\n📋 Questionário: (Extrair perguntas. Remover palavras afirmativas como \'Sim\' no início).\n⚠️ Interações: (Listar medicamentos/substâncias. Se houver itens, adicione ao final: \'Obs.: Nenhum medicamento deve ser interrompido sem orientação médica\').\n🧪 Criterio de rejeição: (Listar causas de rejeição da amostra).\n🌡️ Conservação: (Informações de temperatura e prazo).\n🏨 Coleta: (Instruções técnicas de coleta/manuseio).\n🔎 Sobre o exame: (Resumo direto e simples da utilidade do exame minimamente formal (Direcione a linguagem para o proprio exame). Não cite o nome do exame e sem mencionar a figura do médico. Texto resumido).\n💬 Cometários: (Explicação técnica e científica direcionada ao profissional de saúde. Texto resumido sem comentários longos).\n2. Regras de Exibição e Estética:\nCampos Vazios: Oculte totalmente os tópicos caso não haja informação no texto original (exceto Jejum, que é obrigatório).\nPontuação: Utilize o caractere \' • \' para cada item descritivo.\nQuebras de Linha: Adicione uma linha em branco entre cada tópico (título e corpo). O conteúdo descritivo deve estar sempre na linha abaixo do título do emoji.\nConcisão: Remova redundâncias. Não repita informações entre \'Orientações\' e \'Interações\'.\nBloco de Código: A saída deve ser entregue obrigatoriamente dentro de um bloco de código Markdown.\n3. Tom de Voz:\nSobre o exame: Linguagem acessível, acolhedora e explicativa para leigos.\nComentários: Linguagem técnica, precisa e científica.\n4. Exemplo de Comportamento:\nSe o texto mencionar "Não interromper o uso de anti-inflamatórios", coloque "Anti-inflamatórios" em Interações e a frase padrão "Obs.: Nenhum medicamento..." logo abaixo.';

// Colunas J, K, L, M e O da aba PARTICULAR
const PADRAO_CUSTOS_FIXOS = [
  { nome: 'Atendimento', valor: 6.50, cobranca: 'linear', etapa: null,      icone: 'fa-headset',     ordem: 1 },
  { nome: 'Sistemas',    valor: 0.50, cobranca: 'linear', etapa: null,      icone: 'fa-server',      ordem: 2 },
  { nome: 'Coleta',      valor: 2.50, cobranca: 'linear', etapa: 'coleta',  icone: 'fa-syringe',     ordem: 3 },
  { nome: 'Triagem',     valor: 0.12, cobranca: 'linear', etapa: 'triagem', icone: 'fa-filter',      ordem: 4 },
  { nome: 'Analista',    valor: 0.65, cobranca: 'linear', etapa: null,      icone: 'fa-user-doctor', ordem: 5 }
];

// Setores da planilha (etapas: false = não passa pela etapa)
const PADRAO_SETORES = [
  { nome: 'ALÉRGENOS - IGE', categoria: 'interno', icone: 'fa-seedling', cor: '#2a9d8f' },
  { nome: 'BACILOSCOPIA', categoria: 'interno', icone: 'fa-lungs', cor: '#64748b' },
  { nome: 'BACTERIOLOGIA', categoria: 'interno', icone: 'fa-bacteria', cor: '#16a34a' },
  { nome: 'BIOLOGIA MOLECULAR', categoria: 'interno', icone: 'fa-dna', cor: '#6366f1' },
  { nome: 'BIOQUÍMICA - GLI', categoria: 'interno', icone: 'fa-cubes-stacked', cor: '#0e7490' },
  { nome: 'BIOQUÍMICA - IONS', categoria: 'interno', icone: 'fa-bolt', cor: '#eab308' },
  { nome: 'BIOQUÍMICA - LIQ', categoria: 'interno', icone: 'fa-hand-holding-droplet', cor: '#00a8cc' },
  { nome: 'BIOQUÍMICA - S', categoria: 'interno', icone: 'fa-vials', cor: '#0e7490' },
  { nome: 'BIOQUÍMICA - U', categoria: 'interno', icone: 'fa-flask-vial', cor: '#eab308', etapas: { coleta: false, triagem: true } },
  { nome: 'CITOLOGIA', categoria: 'interno', icone: 'fa-microscope', cor: '#8b5cf6' },
  { nome: 'COAGULAÇÃO', categoria: 'interno', icone: 'fa-heart-pulse', cor: '#ec4899' },
  { nome: 'ESPERMOGRAMA', categoria: 'interno', icone: 'fa-mars', cor: '#0e7490', etapas: { coleta: false, triagem: true } },
  { nome: 'HEMATOLOGIA', categoria: 'interno', icone: 'fa-droplet', cor: '#e63946' },
  { nome: 'IMUNO-HORMÔNIOS', categoria: 'interno', icone: 'fa-flask', cor: '#8b5cf6' },
  { nome: 'IMUNOFLUORESCÊNCIA', categoria: 'interno', icone: 'fa-eye', cor: '#6366f1' },
  { nome: 'IMUNOTURBIDIMETRIA', categoria: 'interno', icone: 'fa-shield-virus', cor: '#00a8cc' },
  { nome: 'MICOLOGIA', categoria: 'interno', icone: 'fa-disease', cor: '#a16207' },
  { nome: 'PARASITOLOGIA', categoria: 'interno', icone: 'fa-worm', cor: '#a16207', etapas: { coleta: false, triagem: true } },
  { nome: 'TESTE DO PEZINHO', categoria: 'interno', icone: 'fa-baby', cor: '#ec4899' },
  { nome: 'UROANÁLISE', categoria: 'interno', icone: 'fa-toilet', cor: '#eab308', etapas: { coleta: false, triagem: true } },
  { nome: 'VACINAS', categoria: 'servico', icone: 'fa-syringe', cor: '#e8913a', etapas: { coleta: false, triagem: false }, margemAlvo: 0.30 },
  { nome: 'CONCURSO', categoria: 'servico', icone: 'fa-id-card', cor: '#64748b' },
  { nome: 'ALVARO', categoria: 'apoio', icone: 'fa-building', cor: '#00a8cc', modeloImportacao: 'alvaro2656' },
  { nome: 'DIAGNÓSTICO BRASIL', categoria: 'apoio', icone: 'fa-building', cor: '#6366f1' },
  { nome: 'HERMES PARDINI - NTO', categoria: 'apoio', icone: 'fa-building', cor: '#0e7490', modeloImportacao: 'pardini4114' },
  { nome: 'YATROS PATOLOGIA', categoria: 'apoio', icone: 'fa-building', cor: '#e8913a' }
];

// Grupos criados junto com o primeiro admin
const PADRAO_GRUPOS = [
  { chave: 'admin', nome: 'Admin', descricao: 'Acesso total', icone: 'fa-crown', cor: '#e8913a', travado: true, permissoes: {} },
  { chave: 'comercial', nome: 'Comercial', descricao: 'Preços, tabelas e simulações', icone: 'fa-briefcase', cor: '#00a8cc', permissoes: {
      exames: ['ver', 'criar', 'editar', 'exportar'], custos: ['ver'], tabelas: ['ver', 'criar', 'editar', 'exportar'],
      simulador: ['ver', 'criar'], pendencias: ['ver', 'editar'], importar: ['ver', 'exportar'], params: ['ver'], instrucoes: ['ver'] } },
  { chave: 'custos', nome: 'Custos / Financeiro', descricao: 'Custos, parâmetros e aprovação', icone: 'fa-coins', cor: '#2a9d8f', permissoes: {
      exames: ['ver', 'editar', 'aprovar'], custos: ['ver', 'criar', 'editar', 'excluir', 'importar'], tabelas: ['ver', 'aprovar'],
      simulador: ['ver', 'criar', 'aprovar'], pendencias: ['ver', 'editar'], importar: ['ver', 'importar', 'exportar'],
      params: ['ver', 'editar', 'aprovar'], instrucoes: ['ver'] } },
  { chave: 'tecnico', nome: 'Técnico de setor', descricao: 'Custos e instruções do próprio setor', icone: 'fa-microscope', cor: '#6366f1', permissoes: {
      exames: ['ver'], custos: ['ver', 'editar'], pendencias: ['ver'], instrucoes: ['ver', 'editar'] } },
  { chave: 'visual', nome: 'Visualizador', descricao: 'Somente consulta', icone: 'fa-eye', cor: '#94a3b8', padrao: true, permissoes: {
      exames: ['ver'], tabelas: ['ver'], simulador: ['ver'], pendencias: ['ver'], instrucoes: ['ver'] } }
];

// Hierarquia de valor padrão (até ser configurada): Particular ≥ … na ordem abaixo
const PADRAO_HIERARQUIA = ['Cartões de Desconto', 'Funerária Vida', 'AFAGU', 'LAMIC VIVA+'];

// Tabelas de preço (Particular é a base, calculada a partir dos exames)
// tipo: convenio = cartões, planos e convênios · lab = laboratórios apoiados (Lamic-to-Lab)
// perfil: custo fixo (pelo nome) → false (não cobra) ou valor próprio
const PADRAO_TABELAS = [
  { nome: 'Cartões de Desconto', tipo: 'convenio', icone: 'fa-id-card',        cor: '#6366f1', descontoRef: 0.20, piso: 0.20, ordem: 1 },
  { nome: 'Funerária Vida',      tipo: 'convenio', icone: 'fa-hands-holding',  cor: '#2a9d8f', descontoRef: 0.22, piso: 0.20, ordem: 2 },
  { nome: 'AFAGU',               tipo: 'convenio', icone: 'fa-people-group',   cor: '#e8913a', descontoRef: 0.22, piso: 0.18, ordem: 3 },
  { nome: 'LAMIC VIVA+',         tipo: 'convenio', icone: 'fa-heart-pulse',    cor: '#e63946', descontoRef: 0.25, piso: 0.18, ordem: 4 },
  { nome: 'Particular 02',       tipo: 'convenio', icone: 'fa-user-tag',       cor: '#0e7490', descontoRef: 0.34, piso: 0.16, ordem: 5 },
  { nome: 'Lamic-to-Lab',        tipo: 'lab',      icone: 'fa-building-user',  cor: '#8b5cf6', descontoRef: 0.06, piso: 0.15, ordem: 6,
    perfilPorNome: { Atendimento: false, Coleta: false, Analista: 0.52 } }
];

const TIPOS_TABELA = {
  convenio: { nome: 'Cartões e convênios', desc: 'Preço por exame, com piso de margem', icone: 'fa-id-card' },
  lab:      { nome: 'Laboratórios apoiados', desc: 'Lamic-to-Lab: amostra chega coletada', icone: 'fa-building-user' }
};

const ICONES_TABELA = ['fa-user', 'fa-id-card', 'fa-hands-holding', 'fa-people-group', 'fa-heart-pulse', 'fa-user-tag', 'fa-building-user',
  'fa-building', 'fa-hospital', 'fa-handshake', 'fa-credit-card', 'fa-wallet', 'fa-tags', 'fa-star', 'fa-briefcase-medical', 'fa-shield-heart'];

const ICONES_GRUPO = ['fa-crown', 'fa-briefcase', 'fa-coins', 'fa-microscope', 'fa-eye', 'fa-user-tie', 'fa-headset', 'fa-user-nurse', 'fa-calculator', 'fa-chart-pie', 'fa-user-gear', 'fa-users'];
