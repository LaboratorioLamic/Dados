// ===== js/services/backup.js =====
(function () {
'use strict';

/**
 * Export/import do banco em JSON.
 *
 * A importação substitui tudo — merge por id é ambíguo em conflito e fica
 * fora da Onda 1. Antes de gravar, o estado atual vai para um snapshot,
 * permitindo desfazer.
 *
 * O snapshot mora no servidor (`/snapshots/preImport`), não no navegador:
 * a base é compartilhada, então quem precisa desfazer pode não ser quem
 * importou. Por isso `importar`, `limparTudo` e `desfazerImportacao` são
 * assíncronas — quem chama já está dentro de `carregando.acaoRemota`.
 */

var db = NS.core.db;
var storage = NS.core.storage;
var STATUS = NS.domain.visita.STATUS;
var permissoes = NS.domain.permissoes;
var marcadores = NS.domain.marcador;
const APP_ID = 'labruta-propagandista';

function dataArquivo() {
    const agora = new Date();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${agora.getFullYear()}-${mes}-${dia}`;
}

function exportar() {
    const conteudo = {
        app: APP_ID,
        schemaVersion: storage.VERSAO_ATUAL,
        exportadoEm: new Date().toISOString(),
        dados: db.exportarDados()
    };

    const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `labruta-backup-${dataArquivo()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    const { medicos, visitas } = conteudo.dados;
    return {
        medicos: medicos.length,
        visitas: visitas.length,
        especialidades: (conteudo.dados.especialidades || []).length,
        objetivos: (conteudo.dados.objetivos || []).length,
        motivosAusencia: (conteudo.dados.motivosAusencia || []).length,
        marcadores: (conteudo.dados.marcadores || []).length,
        usuarios: (conteudo.dados.usuarios || []).length
    };
}

/**
 * Valida um arquivo de backup.
 * Erros são acumulados — não aborta no primeiro problema.
 *
 * @returns {{ok: boolean, erros: string[], avisos: string[], dados?: object, resumo?: object}}
 */
function validarBackup(texto) {
    const erros = [];
    const avisos = [];

    let conteudo;
    try {
        conteudo = JSON.parse(texto);
    } catch {
        return { ok: false, erros: ['O arquivo não é um JSON válido.'], avisos };
    }

    if (!conteudo || typeof conteudo !== 'object') {
        return { ok: false, erros: ['Conteúdo do arquivo inesperado.'], avisos };
    }

    if (conteudo.app !== APP_ID) {
        return { ok: false, erros: ['Este arquivo não é um backup do Propagandismo LAMIC.'], avisos };
    }

    const versao = Number(conteudo.schemaVersion) || 0;
    if (versao > storage.VERSAO_ATUAL) {
        return {
            ok: false,
            erros: [`O backup é de uma versão mais nova do app (v${versao}). Atualize antes de importar.`],
            avisos
        };
    }

    const dados = conteudo.dados || {};
    if (!Array.isArray(dados.medicos)) erros.push('A lista de médicos está ausente ou inválida.');
    if (!Array.isArray(dados.visitas)) erros.push('A lista de visitas está ausente ou inválida.');
    if (erros.length) return { ok: false, erros, avisos };

    // Especialidades: precisam de id e nome. Backups antigos (v1) não têm a lista — segue vazia.
    const especialidadesValidas = [];
    const idsEspecialidades = new Set();

    (Array.isArray(dados.especialidades) ? dados.especialidades : []).forEach((esp, indice) => {
        if (!esp?.id || !esp?.nome) {
            avisos.push(`Especialidade na posição ${indice + 1} ignorada: sem id ou nome.`);
            return;
        }
        idsEspecialidades.add(esp.id);
        especialidadesValidas.push(esp);
    });

    // Objetivos: idem. Sem nenhum no backup, cai nos padrões de fábrica.
    let objetivosValidosLista = (Array.isArray(dados.objetivos) ? dados.objetivos : [])
        .filter((obj, indice) => {
            if (!obj?.id || !obj?.nome) {
                avisos.push(`Objetivo na posição ${indice + 1} ignorado: sem id ou nome.`);
                return false;
            }
            return true;
        });
    if (!objetivosValidosLista.length) objetivosValidosLista = storage.dbVazio().objetivos;
    const idsObjetivos = new Set(objetivosValidosLista.map(o => o.id));

    // Motivos de ausência: catálogo a partir da v4. Backup mais antigo cai
    // nos motivos de fábrica — as visitas guardam o texto, então nada se perde.
    let motivosValidosLista = (Array.isArray(dados.motivosAusencia) ? dados.motivosAusencia : [])
        .filter((motivo, indice) => {
            if (!motivo?.id || !motivo?.nome) {
                avisos.push(`Motivo na posição ${indice + 1} ignorado: sem id ou nome.`);
                return false;
            }
            return true;
        });
    if (!motivosValidosLista.length) motivosValidosLista = storage.dbVazio().motivosAusencia;

    // Marcadores: catálogo a partir da v5. Precisam de id, nome e uma cor
    // HEX — cor inválida vira a padrão em vez de derrubar a entrada, senão
    // um backup editado à mão perderia a etiqueta inteira por um "#gg0000".
    const marcadoresValidos = [];
    const idsMarcadores = new Set();

    (Array.isArray(dados.marcadores) ? dados.marcadores : []).forEach((marcador, indice) => {
        if (!marcador?.id || !marcador?.nome) {
            avisos.push(`Marcador na posição ${indice + 1} ignorado: sem id ou nome.`);
            return;
        }
        idsMarcadores.add(marcador.id);
        marcadoresValidos.push({
            ...marcador,
            cor: marcadores.normalizarCor(marcador.cor) || marcadores.COR_PADRAO
        });
    });

    // Médicos: precisam de id e nome.
    const medicosValidos = [];
    const idsMedicos = new Set();

    dados.medicos.forEach((medico, indice) => {
        if (!medico?.id || !medico?.nome) {
            avisos.push(`Médico na posição ${indice + 1} ignorado: sem id ou nome.`);
            return;
        }
        if (idsMedicos.has(medico.id)) {
            avisos.push(`Médico duplicado ignorado: ${medico.nome}.`);
            return;
        }
        idsMedicos.add(medico.id);
        // Integridade referencial: especialidade órfã só perde o vínculo, o médico continua.
        if (medico.especialidadeId && !idsEspecialidades.has(medico.especialidadeId)) {
            medico = { ...medico, especialidadeId: '' };
        }
        medicosValidos.push(medico);
    });

    // Visitas: precisam de id, data, status válido e médico existente.
    const visitasValidas = [];
    const idsVisitas = new Set(dados.visitas.map(v => v?.id).filter(Boolean));
    const statusValidos = new Set(Object.values(STATUS));

    dados.visitas.forEach((visita, indice) => {
        if (!visita?.id || !visita?.data) {
            avisos.push(`Visita na posição ${indice + 1} ignorada: sem id ou data.`);
            return;
        }
        if (!statusValidos.has(visita.status)) {
            avisos.push(`Visita ${visita.id} ignorada: status "${visita.status}" desconhecido.`);
            return;
        }
        // Integridade referencial: órfã é relatada e descartada, nunca importada em silêncio.
        if (!idsMedicos.has(visita.medicoId)) {
            avisos.push(`Visita de ${visita.data} ignorada: o médico vinculado não existe no backup.`);
            return;
        }
        if (visita.visitaOrigemId && !idsVisitas.has(visita.visitaOrigemId)) {
            avisos.push(`Visita de ${visita.data}: o vínculo de reagendamento foi perdido.`);
            visita = { ...visita, visitaOrigemId: null };
        }
        if (visita.objetivo && !idsObjetivos.has(visita.objetivo)) {
            visita = { ...visita, objetivo: '' };
        }
        // Marcadores órfãos são silenciosamente descartados: a visita não
        // depende deles, e um aviso por etiqueta afogaria o relatório.
        if (Array.isArray(visita.marcadores)) {
            visita = { ...visita, marcadores: visita.marcadores.filter(id => idsMarcadores.has(id)) };
        } else {
            visita = { ...visita, marcadores: [] };
        }

        visitasValidas.push(visita);
    });

    // Grupos: precisam de id e nome. Permissões desconhecidas são descartadas.
    const gruposValidos = [];
    const idsGrupos = new Set();

    (Array.isArray(dados.grupos) ? dados.grupos : []).forEach((grupo, indice) => {
        if (!grupo?.id || !grupo?.nome) {
            avisos.push(`Grupo na posição ${indice + 1} ignorado: sem id ou nome.`);
            return;
        }
        idsGrupos.add(grupo.id);
        gruposValidos.push({ ...grupo, permissoes: permissoes.sanitizarPermissoes(grupo.permissoes) });
    });

    // Usuários: precisam de id, login e hash — sem hash a conta não autentica.
    const usuariosValidos = [];
    const logins = new Set();

    (Array.isArray(dados.usuarios) ? dados.usuarios : []).forEach((conta, indice) => {
        if (!conta?.id || !conta?.login || (!conta?.senhaHash && !conta?.dadosLogin)) {   // conta do Dados LAMIC não tem senha aqui
            avisos.push(`Usuário na posição ${indice + 1} ignorado: cadastro incompleto.`);
            return;
        }
        if (logins.has(conta.login.toLowerCase())) {
            avisos.push(`Usuário duplicado ignorado: ${conta.login}.`);
            return;
        }
        logins.add(conta.login.toLowerCase());

        // Grupo órfão só perde o vínculo — a conta continua, sem permissões.
        if (!conta.admin && conta.grupoId && !idsGrupos.has(conta.grupoId)) {
            avisos.push(`Usuário ${conta.login}: o grupo vinculado não existe no backup.`);
            conta = { ...conta, grupoId: '' };
        }

        usuariosValidos.push(conta);
    });

    /*
     * Regra crítica: um backup sem administrador ativo trancaria o usuário
     * para fora do próprio app. Nesse caso as contas do arquivo são
     * descartadas e as atuais permanecem. Backups v1/v2, que nem têm a
     * lista, caem naturalmente aqui.
     */
    const temAdmin = usuariosValidos.some(u => u.admin && u.ativo !== false);
    const importarContas = usuariosValidos.length > 0 && temAdmin;

    if (usuariosValidos.length && !temAdmin) {
        avisos.push('O backup não tem nenhum administrador ativo. As contas atuais foram mantidas.');
    }

    return {
        ok: true,
        erros,
        avisos,
        dados: {
            medicos: medicosValidos,
            visitas: visitasValidas,
            especialidades: especialidadesValidas,
            objetivos: objetivosValidosLista,
            motivosAusencia: motivosValidosLista,
            marcadores: marcadoresValidos,
            ...(importarContas ? { usuarios: usuariosValidos, grupos: gruposValidos } : {}),
            // Sem trazer as contas, também não faz sentido trazer as opções que
            // dependem delas: `grupoPadraoId` apontaria para um grupo ausente.
            config: importarContas
                ? (dados.config || {})
                : (({ autocadastro, grupoPadraoId, ...resto }) => resto)(dados.config || {})
        },
        resumo: {
            medicos: medicosValidos.length,
            visitas: visitasValidas.length,
            descartados: dados.medicos.length - medicosValidos.length
                + (dados.visitas.length - visitasValidas.length)
        }
    };
}

/** Aplica um backup já validado, guardando o estado anterior. */
function importar(dados) {
    db.salvarSnapshotPreImport();
    db.substituirTudo(dados);
    return true;
}

/**
 * Esvazia médicos e visitas, guardando o estado anterior (mesmo caminho de
 * "Desfazer"). Catálogos, usuários e grupos ficam intactos: omitir as chaves
 * faz `substituirTudo` preservá-las.
 */
function limparTudo() {
    db.salvarSnapshotPreImport();
    const atuais = db.exportarDados();
    db.substituirTudo({ medicos: [], visitas: [], especialidades: [], objetivos: atuais.objetivos, motivosAusencia: atuais.motivosAusencia, marcadores: atuais.marcadores });
    return true;
}

/** Desfaz a última importação, contas e grupos inclusive. */
async function desfazerImportacao() {
    const anterior = await db.lerSnapshotPreImport();
    if (!anterior) return false;

    // Mesma trava da importação: um snapshot sem administrador ativo (por
    // exemplo, um salvo antes desta versão) não pode apagar as contas atuais.
    const contas = Array.isArray(anterior.usuarios) ? anterior.usuarios : [];
    const restaurarContas = contas.some(u => u.admin && u.ativo !== false);

    db.substituirTudo({
        medicos: anterior.medicos,
        visitas: anterior.visitas,
        especialidades: anterior.especialidades,
        objetivos: anterior.objetivos,
        motivosAusencia: anterior.motivosAusencia,
        marcadores: anterior.marcadores,
        ...(restaurarContas ? { usuarios: contas, grupos: anterior.grupos } : {}),
        config: anterior.config
    });
    return true;
}

function resumoAtual() {
    const dados = db.exportarDados();
    return { medicos: dados.medicos.length, visitas: dados.visitas.length };
}

NS.services = NS.services || {};
NS.services.backup = { APP_ID, desfazerImportacao, exportar, importar, limparTudo, resumoAtual, validarBackup };
})();
