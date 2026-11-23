// ===== Firebase =====
// Banco unificado: o RH vive no projeto do Dados LAMIC (applamic), nos nós rh_*.
// O login é o do Dados LAMIC (mesma origem laboratoriolamic.github.io): o Firebase Auth guarda a
// sessão no IndexedDB do domínio, então quem entrou no Dados já chega logado aqui.
const firebaseConfig = {
    apiKey: "AIzaSyD38STN_vG08tlYJBXFtRUWtlcyRexw7Mc",
    authDomain: "applamic.firebaseapp.com",
    databaseURL: "https://applamic-default-rtdb.firebaseio.com",
    projectId: "applamic",
    storageBucket: "applamic.firebasestorage.app",
    messagingSenderId: "1038898074287",
    appId: "1:1038898074287:web:ec9fa6ce997d415e48fa5a"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const fbAuth = firebase.auth();
const DADOS_URL = 'https://laboratoriolamic.github.io/Dados/';
// E-mail interno do Firebase Auth usado pelo Dados LAMIC para cada login (ver js/app.js do Dados).
const dadosEmail = (login, v) => `${login}.${v || 0}@dados-lamic.app`;

// Upload de arquivos via Google Apps Script → Google Drive
const DRIVE_API = "https://script.google.com/macros/s/AKfycbzzqR-O-ViBpkcNtNccer2O-8PlWuFVgKd1MdJEEs94nYEfL25mMyt-fmfpmnNHXurURA/exec";

// Paths do sistema de RH
const PATHS = {
    usuarios: 'rh_usuarios',
    // Quem pode abrir o RH: rh_acesso/{loginDados} = true. Mantido pela tela de usuários; as regras
    // do banco liberam os nós rh_* só para essas contas (e para administradores do Dados).
    acesso: 'rh_acesso',
    // Grupos de acesso: as permissões vivem no GRUPO, não no usuário. Cada usuário aponta para
    // um grupo (grupoId) e herda o conjunto de permissões dele — mudou o grupo, mudam todos os
    // usuários de uma vez. Usuários legados com `perms` próprio continuam funcionando (fallback).
    grupos: 'rh_grupos',
    funcionarios: 'rh_funcionarios',
    cargos: 'rh_cargos',
    unidades: 'rh_unidades',
    beneficios: 'rh_beneficios',
    ausencias: 'rh_ausencias',
    // Ausência parcial — o funcionário sai no meio do turno (12h às 14h) ou mais cedo, com
    // declaração, e o dia continua trabalhado. Path próprio porque a unidade é HORA, não dia:
    // rh_ausencias trabalha em [inicio, retorno) com retorno exclusivo, e uma ausência no
    // mesmo dia daria `dias = 0` — número que os gráficos de dias perdidos leriam como
    // "ninguém faltou". Falta é ausência do dia; isto é ausência de horas do dia.
    ausenciasParciais: 'rh_ausencias_parciais',
    asos: 'rh_asos',
    // CAT — Comunicação de Acidente de Trabalho. Registro próprio, não é "documento" nem
    // "ausência": o acidente é o fato; o afastamento que ele possa gerar continua sendo
    // lançado em Faltas e Licenças e é só REFERENCIADO aqui (ausenciaId). Assim os dias
    // perdidos têm uma fonte só — senão a ficha e a folha contariam coisas diferentes.
    cats: 'rh_cats',
    demissoes: 'rh_demissoes',
    treinamentos: 'rh_treinamentos',
    promocoes: 'rh_promocoes',
    transferencias: 'rh_transferencias',
    // Medidas disciplinares — notificação, advertência e suspensão. Path próprio porque é a
    // aplicação do poder disciplinar (CLT art. 474), com ciência do colaborador e documento
    // assinado: não é ausência nem documento solto. A SUSPENSÃO gera dias parados, mas eles
    // continuam sendo lançados em Faltas e Licenças e aqui só se REFERENCIA a ausência
    // (ausenciaId), mesmo padrão da CAT — duas fontes para os mesmos dias fariam a ficha e a
    // folha divergirem.
    disciplinares: 'rh_disciplinares',
    folha: 'rh_folha',
    bancoHoras: 'rh_banco_horas',
    // Quitação: pagamento de meses específicos DURANTE o ciclo (o ciclo segue correndo com
    // o restante). Fechamento: encerramento do ciclo, só no fim dele ou por desligamento.
    bancoHorasQuitacoes: 'rh_banco_horas_quitacoes',
    bancoHorasFechamentos: 'rh_banco_horas_fechamentos',
    // Hora extra paga direto, fora do banco (feriado a 100%, etc.) — não entra no ciclo,
    // mas soma na folha do mês de referência.
    extraBanco: 'rh_extra_banco',
    // Liberação coletiva: a empresa dispensa uma unidade (ou todo o laboratório) mais cedo ou
    // o dia todo, por acordo, pagando o salário integral e creditando as horas como saldo
    // negativo a compensar em trabalho futuro. Registro do EVENTO — o rateio por pessoa fica
    // congelado em `itens`, porque o quadro muda (admissão, transferência, desligamento) e o
    // acordo é um fato datado: recalcular a lista depois reescreveria quem estava lá naquele dia.
    liberacoes: 'rh_liberacoes',
    // Parcelas PAGAS do 13º. Grava-se o pagamento, nunca o direito: os avos são derivados da
    // admissão/afastamentos/demissão e se autocorrigem (ver avos13 em utils.js).
    decimos: 'rh_decimos',
    parametros: 'rh_parametros',
    imagens: 'rh_imagens'
};

// Helpers de acesso
const DB = {
    async getAll(path) {
        const snap = await db.ref(path).once('value');
        const val = snap.val() || {};
        return Object.entries(val).map(([id, v]) => ({ id, ...v }));
    },
    async getObj(path) {
        const snap = await db.ref(path).once('value');
        return snap.val();
    },
    async save(path, id, data) {
        let key = id;
        if (id) await db.ref(`${path}/${id}`).update(data);
        else { const ref = db.ref(path).push(); await ref.set(data); key = ref.key; }
        // O RH é a fonte de cargo e unidade dos usuários do Dados LAMIC vinculados (rh_funcionarios/{id}/login).
        if (path === PATHS.funcionarios) sincronizarDados([key]);
        else if ((path === PATHS.cargos || path === PATHS.unidades) && id && 'nome' in (data || {})) sincronizarDados(null);
        return key;
    },
    async set(path, data) { await db.ref(path).set(data); },
    async remove(path, id) { await db.ref(`${path}/${id}`).remove(); },
    watch(path, cb) { db.ref(path).on('value', snap => cb(snap.val())); }
};

// Copia cargo e unidade (nomes) do funcionário vinculado para usuarios/{login} no Dados LAMIC.
// ids = lista de funcionários alterados; null = todos os vinculados (renomeou cargo/unidade).
// Falha aqui não pode travar o salvamento do RH: só registra no console.
async function sincronizarDados(ids) {
    try {
        const [funcs, cargos, unidades, usuarios] = await Promise.all([
            ids ? Promise.all(ids.map(i => db.ref(`${PATHS.funcionarios}/${i}`).once('value').then(s => [i, s.val()])))
                : db.ref(PATHS.funcionarios).once('value').then(s => Object.entries(s.val() || {})),
            db.ref(PATHS.cargos).once('value').then(s => s.val() || {}),
            db.ref(PATHS.unidades).once('value').then(s => s.val() || {}),
            db.ref('usuarios').once('value').then(s => s.val() || {})
        ]);
        const up = {};
        funcs.forEach(([, f]) => {
            if (!f || !f.login || !usuarios[f.login]) return;   // conta inexistente no Dados: não cria registro parcial
            const u = usuarios[f.login];
            if (u.cargo === (cargos[f.cargoId]?.nome || '') && u.unidade === (unidades[f.unidadeId]?.nome || '')) return;
            up[`usuarios/${f.login}/cargo`] = cargos[f.cargoId]?.nome || '';
            up[`usuarios/${f.login}/unidade`] = unidades[f.unidadeId]?.nome || '';
        });
        if (Object.keys(up).length) await db.ref().update(up);
    } catch (e) { console.warn('Sincronização com o Dados LAMIC falhou:', e); }
}
