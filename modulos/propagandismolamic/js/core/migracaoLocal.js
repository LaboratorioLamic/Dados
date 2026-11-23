// ===== js/core/migracaoLocal.js =====
(function () {
'use strict';

/**
 * Ponte de mão única entre a base antiga (localStorage) e o Firebase.
 *
 * Antes da migração, cada navegador guardava a própria cópia em
 * `labruta.db`. Quem já usava o app tem esses dados presos aqui — se o
 * banco na nuvem estiver vazio, o boot oferece enviá-los uma única vez.
 *
 * Depois disso a chave é RENOMEADA, nunca apagada: o app não descarta
 * dado do usuário em silêncio, mesmo dado obsoleto.
 */

var storage = NS.core.storage;

const CHAVE = 'labruta.db';

function lerBruto() {
    try {
        return localStorage.getItem(CHAVE);
    } catch {
        return null;
    }
}

function arquivar(sufixo, bruto) {
    try {
        localStorage.setItem(`${CHAVE}.${sufixo}-${Date.now()}`, bruto);
        localStorage.removeItem(CHAVE);
    } catch { /* sem espaço: a chave fica, a oferta volta no próximo boot */ }
}

/** Base local já migrada para a versão atual, ou null. */
function lerBaseLocal() {
    const bruto = lerBruto();
    if (!bruto) return null;

    try {
        return storage.migrar(storage.normalizar(JSON.parse(bruto)));
    } catch {
        return null;
    }
}

/** true quando existe base local com conteúdo que valha a pena enviar. */
function temDadosLocais() {
    const base = lerBaseLocal();
    return !!base && (base.medicos.length > 0 || base.visitas.length > 0);
}

/**
 * Pergunta e, se autorizado, envia a base local para o servidor pelo mesmo
 * caminho da importação de backup.
 * @returns {Promise<boolean>} true se os dados foram enviados
 */
async function oferecerUpload() {
    const base = lerBaseLocal();
    const bruto = lerBruto();
    if (!base || !bruto) return false;

    const pluralizar = NS.core.dom.pluralizar;

    const confirmado = await NS.ui.modal.confirmar({
        titulo: 'Enviar seus dados para o servidor?',
        mensagem: `Este computador tem ${pluralizar(base.medicos.length, 'médico', 'médicos')} e ${pluralizar(base.visitas.length, 'visita', 'visitas')} salvos localmente, e o banco na nuvem está vazio.`,
        detalhe: 'Se recusar, os dados locais continuam guardados neste computador — mas o app passa a usar apenas o servidor e você não os verá mais aqui.',
        confirmarTexto: 'Enviar para o servidor',
        cancelarTexto: 'Agora não'
    });

    if (!confirmado) {
        arquivar('arquivado', bruto);
        return false;
    }

    const resultado = await NS.ui.carregando.acaoRemota(
        () => NS.core.db.substituirTudo(base),
        { mensagem: 'Enviando seus dados…' }
    );

    if (!resultado.ok) return false;

    arquivar('enviado', bruto);
    NS.ui.toast.sucesso('Dados enviados para o servidor.');
    return true;
}

NS.core = NS.core || {};
NS.core.migracaoLocal = { lerBaseLocal, oferecerUpload, temDadosLocais };
})();
