// Persistência de agendamentos no Firebase — um nó por agenda

// Normaliza registros vindos do Firebase (array antigo ou objeto novo)
function _toAppointmentList(data) {
    if (!data) return [];
    const lista = Array.isArray(data) ? data.filter(Boolean) : Object.values(data);
    return lista.map(app => {
        if (!app.status) app.status = app.chkConcluido ? 'Concluído' : 'Agendado';
        return app;
    });
}

function _appointmentsRef(agendaId) {
    return database.ref(`${getAgenda(agendaId).fbPath}/appointments`);
}

// MIGRAÇÃO ÚNICA DO NÓ LEGADO
// Copia `appointments` (estrutura antiga, agenda única) para o nó da agenda.
// O nó legado NUNCA é apagado — permite rollback.
function migrateLegacyAgenda(agendaId) {
    const agenda = getAgenda(agendaId);
    if (!agenda.legacyPath) return Promise.resolve(false);

    return _appointmentsRef(agendaId).once('value').then(snap => {
        if (snap.exists() && Object.keys(snap.val() || {}).length > 0) return false;

        return database.ref(agenda.legacyPath).once('value').then(legacySnap => {
            const legacy = _toAppointmentList(legacySnap.val());
            if (!legacy.length) return false;

            const obj = {};
            legacy.forEach(app => obj[app.id] = app);
            return _appointmentsRef(agendaId).set(obj)
                .then(() => database.ref('agendas/_migracao').update({
                    [agenda.id]: { em: new Date().toISOString(), registros: legacy.length, origem: agenda.legacyPath }
                }))
                .then(() => {
                    console.log(`Migração concluída: ${legacy.length} registros de '${agenda.legacyPath}' → '${agenda.fbPath}/appointments'. Nó legado preservado.`);
                    return true;
                });
        });
    }).catch(error => {
        console.error(`Erro na migração da agenda ${agendaId}:`, error);
        return false;
    });
}

// CARGA
function loadAgendaFromFirebase(agendaId) {
    const agenda = getAgenda(agendaId);
    return migrateLegacyAgenda(agendaId)
        .then(() => _appointmentsRef(agendaId).once('value'))
        .then(snapshot => {
            const lista = _toAppointmentList(snapshot.val());
            setAppointments(lista, agendaId);
            _gravarBackupLocal(agenda.lsKey, lista);
            console.log(`Agenda '${agendaId}': ${lista.length} registros carregados do Firebase.`);
        })
        .catch(error => {
            console.error(`Erro ao carregar agenda '${agendaId}' do Firebase:`, error);
            const localData = localStorage.getItem(agenda.lsKey);
            if (localData) {
                try {
                    setAppointments(_toAppointmentList(JSON.parse(localData)), agendaId);
                    console.warn(`Agenda '${agendaId}': usando backup local temporariamente.`);
                } catch (e) {
                    console.error('Backup local inválido:', e);
                }
            }
        });
}

// Carrega todas as agendas (os cards da tela inicial precisam dos dados de todas)
function loadAppointmentsFromFirebase() {
    return Promise.all(AGENDA_IDS.map(loadAgendaFromFirebase))
        .then(() => loadHolidaysFromFirebase())
        .then(() => {
            renderHomeCards();
            renderTable();
            renderCalendar();
            updateDatalists();
            updateFilterDropdowns();
        });
}

// GRAVAÇÃO
function saveAppointmentsToFirebase(agendaId) {
    const id = agendaId || currentAgendaId;
    const agenda = getAgenda(id);
    const lista = appointmentsDe(id);

    // O Realtime Database rejeita `undefined` em qualquer campo do objeto e
    // lança de forma síncrona no .set() — JSON.stringify/parse troca esses
    // campos por ausência total (equivalente a null no Firebase) em vez de
    // travar o salvamento inteiro.
    const obj = JSON.parse(JSON.stringify(lista.reduce((acc, app) => {
        acc[app.id] = app;
        return acc;
    }, {})));

    return _appointmentsRef(id).set(obj)
        .then(() => {
            console.log(`Agenda '${id}': agendamentos salvos no Firebase.`);
            _gravarBackupLocal(agenda.lsKey, lista);
        })
        .catch(error => {
            console.error(`Erro ao salvar agenda '${id}' no Firebase:`, error);
            if (!navigator.onLine) {
                _gravarBackupLocal(agenda.lsKey, lista);
                console.warn('Offline: dados salvos temporariamente no localStorage.');
            } else {
                showNotification("Erro ao sincronizar com Firebase. Verifique sua conexão.", "error");
            }
            throw error;
        });
}

// GRAVAÇÃO POR REGISTRO
// Escreve só o nó do próprio agendamento (`.../appointments/<id>`). A gravação
// da agenda inteira (saveAppointmentsToFirebase) continua existindo para
// importação de backup e renomeação em massa, mas NÃO deve ser usada no
// salvamento do dia a dia: com dois atendentes salvando ao mesmo tempo, o
// último `.set()` do nó inteiro apaga o que o outro acabou de criar — foi
// assim que registros sumiram da agenda sem nenhum log de exclusão.

// O Realtime Database rejeita `undefined` em qualquer campo e lança de forma
// síncrona no .set(); JSON.stringify/parse troca esses campos por ausência
// total (equivalente a null) em vez de travar o salvamento inteiro.
function _semUndefined(valor) {
    return JSON.parse(JSON.stringify(valor));
}

// Backup local é CONVENIÊNCIA, nunca condição de sucesso da gravação.
// `localStorage.setItem` lança em situações comuns — cota estourada
// (QuotaExceededError, agenda grande com muitos anexos) e navegação anônima /
// cookies bloqueados (SecurityError). Como essa escrita acontecia DENTRO da
// cadeia de promessas do salvamento, uma gravação já confirmada pelo servidor
// virava "FALHA AO SALVAR: a alteração NÃO foi gravada" e ainda disparava o
// recarregamento — o dado estava no banco e o usuário refazia a operação.
function _gravarBackupLocal(chave, valor) {
    try {
        localStorage.setItem(chave, JSON.stringify(valor));
        return true;
    } catch (error) {
        console.warn(`Backup local '${chave}' não pôde ser gravado (os dados no servidor estão íntegros):`, error);
        return false;
    }
}

function _atualizarBackupLocal(agendaId) {
    const agenda = getAgenda(agendaId);
    _gravarBackupLocal(agenda.lsKey, appointmentsDe(agendaId));
}

// CONTROLE DE CONCORRÊNCIA (campo `rev`)
// Cada gravação incrementa `rev`. Quem abre um registro para editar guarda a rev
// que viu; no salvamento, uma transação recusa a escrita se a rev no servidor já
// for outra — sinal de que alguém salvou o MESMO agendamento nesse meio-tempo.
// Sem isso, o segundo a salvar sobrescrevia em silêncio os campos que o primeiro
// tinha acabado de alterar (o registro sobrevive, os dados dele não).
//
// Registros anteriores a este campo não têm `rev`: valem como rev 0 e passam a
// ter rev na primeira gravação.
function revDe(record) {
    return Number(record && record.rev) || 0;
}

// Motivos de recusa que NÃO são falha de rede — cada um tem sua orientação ao
// usuário em _persistir.
const CONFLITO_EDICAO   = 'CONFLITO_DE_EDICAO';    // outra pessoa salvou antes
const CONFLITO_EXCLUSAO = 'CONFLITO_DE_EXCLUSAO';  // alterado durante a exclusão
const REGISTRO_EXCLUIDO = 'REGISTRO_EXCLUIDO';     // apagado durante a edição

function _erroDeConflito(tipo) {
    const erro = new Error(tipo);
    erro.conflito = tipo;
    return erro;
}

function _ehConflito(erro) {
    return !!(erro && erro.conflito);
}

// Põe na lista local o registro EXATAMENTE como o servidor o devolveu — é dele
// que vem a `rev` nova. Substituir o item na lista (em vez de mutar o objeto que
// o chamador passou) mantém a lista como fonte única: uma segunda alteração
// logo em seguida já parte da rev correta, sem depender de o chamador ter
// guardado a mesma referência de objeto.
// Roda DEPOIS de o servidor confirmar a gravação: nada aqui pode lançar, ou o
// salvamento bem-sucedido seria relatado como falha (ver _gravarBackupLocal).
function _aplicarRegistroLocal(agendaId, novo) {
    try {
        const lista = appointmentsDe(agendaId);
        const existe = lista.some(a => a.id == novo.id);
        setAppointments(existe ? lista.map(a => a.id == novo.id ? novo : a) : [...lista, novo], agendaId);
        _atualizarBackupLocal(agendaId);
    } catch (error) {
        // O listener em tempo real (app-init.js) reconcilia a lista logo em
        // seguida; o registro já está gravado no servidor.
        console.warn(`Registro ${novo && novo.id} gravado no servidor, mas a lista local não pôde ser atualizada:`, error);
    }
    return novo;
}

// Estado do registro no servidor, antes de gravar.
//
// O nó de cada agenda tem um listener `.on('value')` permanente (app-init.js),
// então esta leitura é servida pelo cache já sincronizado: é o valor do
// servidor, sem ida extra à rede. Ter o dado em mãos ANTES da transação é o que
// permite abortar em `atual === null` lá dentro sem ambiguidade — nulo passa a
// significar "excluído de verdade", nunca "cache ainda vazio".
function _estadoNoServidor(ref) {
    return ref.once('value').then(snap => snap.exists() ? snap.val() : null);
}

// `revEsperada` nula/ausente = grava sem checar (criação, importação).
function salvarAgendamentoNoFirebase(record, agendaId, revEsperada) {
    const id = agendaId || record.agendaId || currentAgendaId;
    const ref = _appointmentsRef(id).child(String(record.id));
    const comRev = rev => _semUndefined({ ...record, rev });

    const registrarFalha = error => {
        if (!_ehConflito(error)) {
            console.error(`Erro ao salvar agendamento ${record.id} da agenda '${id}':`, error);
        }
        throw error;
    };

    if (revEsperada == null) {
        const novo = comRev(revDe(record) + 1);
        return ref.set(novo)
            .then(() => _aplicarRegistroLocal(id, novo))
            .catch(registrarFalha);
    }

    return _estadoNoServidor(ref).then(atual => {
        if (atual === null) throw _erroDeConflito(REGISTRO_EXCLUIDO);
        if (revDe(atual) !== revEsperada) throw _erroDeConflito(CONFLITO_EDICAO);

        return ref.transaction(atualNaTransacao => {
            if (atualNaTransacao === null) return;                        // excluído no meio-tempo
            if (revDe(atualNaTransacao) !== revEsperada) return;          // outro salvou primeiro
            return comRev(revEsperada + 1);
        }).then(res => {
            if (!res.committed) throw _erroDeConflito(CONFLITO_EDICAO);
            return _aplicarRegistroLocal(id, res.snapshot.val());
        });
    }).catch(registrarFalha);
}

function removerAgendamentoNoFirebase(recordId, agendaId, revEsperada) {
    const id = agendaId || currentAgendaId;
    const ref = _appointmentsRef(id).child(String(recordId));
    const removido = () => { _atualizarBackupLocal(id); };

    const registrarFalha = error => {
        if (!_ehConflito(error)) {
            console.error(`Erro ao excluir agendamento ${recordId} da agenda '${id}':`, error);
        }
        throw error;
    };

    if (revEsperada == null) {
        return ref.remove().then(removido).catch(registrarFalha);
    }

    return _estadoNoServidor(ref).then(atual => {
        // Já não existe: o objetivo da operação está atingido, não é conflito.
        if (atual === null) return removido();
        if (revDe(atual) !== revEsperada) throw _erroDeConflito(CONFLITO_EXCLUSAO);

        return ref.transaction(atualNaTransacao => {
            if (atualNaTransacao === null) return null;                   // já removido
            if (revDe(atualNaTransacao) !== revEsperada) return;          // alterado por outro
            return null;                                                  // null remove o nó
        }).then(res => {
            if (!res.committed) throw _erroDeConflito(CONFLITO_EXCLUSAO);
            removido();
        });
    }).catch(registrarFalha);
}

// Tempo sem resposta do servidor a partir do qual o usuário é avisado. Offline,
// o SDK do Firebase enfileira a escrita e a promessa não resolve nem rejeita —
// sem esse aviso a tela ficaria muda, como se estivesse tudo salvo.
const PERSIST_AVISO_MS = 8000;

function _recarregarAgenda(agendaId) {
    return loadAgendaFromFirebase(agendaId).then(() => {
        renderHomeCards();
        if (agendaId === currentAgendaId) {
            renderTable(); renderCalendar(); updateDatalists(); updateFilterDropdowns();
        }
    });
}

// Persiste o agendamento e SÓ ENTÃO registra a auditoria e avisa "sucesso".
// A ordem importa: gravar o histórico antes da confirmação do servidor gerava
// entradas de "Criado" para registros que nunca chegaram ao banco — o registro
// aparecia no histórico e não aparecia na agenda.
function _persistir(operacao, alvo, opcoes) {
    const { audit, record, mensagem, aoFalhar } = opcoes;
    let respondeu = false;
    const avisoPendente = setTimeout(() => {
        if (respondeu) return;
        showNotification('SALVAMENTO PENDENTE: o servidor ainda não confirmou a gravação. Mantenha esta página aberta e verifique a conexão.', 'warning', 15000);
    }, PERSIST_AVISO_MS);

    // `.then(ok, erro)` em vez de `.then().catch()`: um erro dentro do ramo de
    // sucesso (auditoria, notificação) não pode ser confundido com falha de
    // gravação e disparar o recarregamento.
    return operacao.then(() => {
        respondeu = true; clearTimeout(avisoPendente);
        if (audit) addAuditLog(audit.action, audit.record || record, audit.oldRecord || null);
        if (mensagem) showNotification(mensagem, 'success');
        return true;
    }, erro => {
        respondeu = true; clearTimeout(avisoPendente);
        showNotification(_mensagemDeFalha(erro), 'error', 20000);
        // `aoFalhar` roda DEPOIS da recarga: quem reabre o registro na tela
        // precisa mostrar a versão atual, não a que acabou de ser recusada.
        return _recarregarAgenda(alvo).then(() => {
            if (aoFalhar) aoFalhar();
            return false;
        });
    });
}

// Falhas que NÃO são conflito de edição têm causas bem distintas e orientações
// opostas — sem essa distinção o usuário via sempre "refaça a operação", mesmo
// quando refazer não resolveria nada (permissão negada, sessão sem conexão).
function _causaTecnica(erro) {
    const codigo = String((erro && (erro.code || erro.message)) || '').toUpperCase();
    if (!navigator.onLine || codigo.includes('NETWORK') || codigo.includes('UNAVAILABLE') || codigo.includes('DISCONNECT')) {
        return 'SEM CONEXÃO com o servidor: a alteração NÃO foi gravada. Verifique a internet e refaça a operação.';
    }
    if (codigo.includes('PERMISSION_DENIED')) {
        return 'PERMISSÃO NEGADA pelo servidor: a alteração NÃO foi gravada. Avise o responsável pelo sistema (regras do banco de dados).';
    }
    if (codigo.includes('MAXRETRY')) {
        return 'FALHA AO SALVAR: o servidor está recebendo muitas alterações neste mesmo agendamento. Aguarde alguns segundos e refaça a operação.';
    }
    return null;
}

function _mensagemDeFalha(erro) {
    switch (erro && erro.conflito) {
        case CONFLITO_EDICAO:
            return 'ALTERAÇÃO NÃO SALVA: outra pessoa alterou este agendamento enquanto você editava. Nada foi sobrescrito. Os dados foram recarregados — confira o que mudou e refaça sua alteração.';
        case REGISTRO_EXCLUIDO:
            return 'ALTERAÇÃO NÃO SALVA: este agendamento foi excluído por outra pessoa enquanto você editava. O registro NÃO foi recriado — cadastre de novo se ele ainda for necessário.';
        case CONFLITO_EXCLUSAO:
            return 'EXCLUSÃO CANCELADA: outra pessoa alterou este agendamento agora há pouco. O registro foi reaberto com a versão atual — confira a alteração antes de excluir de novo.';
        default:
            return _causaTecnica(erro)
                || 'FALHA AO SALVAR: a alteração NÃO foi gravada no servidor. Os dados foram recarregados — refaça a operação.';
    }
}

// `opcoes.rev` — a rev que o usuário tinha em mãos quando começou a alterar
// (capturada ao abrir o formulário/modal). Ausente = grava sem checar conflito.
function persistirAgendamento(record, opcoes = {}) {
    const alvo = opcoes.agendaId || record.agendaId || currentAgendaId;
    return _persistir(salvarAgendamentoNoFirebase(record, alvo, opcoes.rev), alvo, { ...opcoes, record });
}

function removerAgendamento(record, opcoes = {}) {
    const alvo = opcoes.agendaId || record.agendaId || currentAgendaId;
    return _persistir(removerAgendamentoNoFirebase(record.id, alvo, opcoes.rev), alvo, { ...opcoes, record });
}

// Sobe o backup local caso o Firebase esteja vazio (ex.: primeiro acesso após falha)
function syncLocalStorageToFirebase() {
    AGENDA_IDS.forEach(id => {
        const agenda = getAgenda(id);
        const localData = localStorage.getItem(agenda.lsKey);
        if (!localData) return;
        try {
            const locais = JSON.parse(localData);
            if (!locais.length) return;
            _appointmentsRef(id).once('value').then(snapshot => {
                const remotos = _toAppointmentList(snapshot.val());
                if (remotos.length === 0) {
                    setAppointments(locais, id);
                    saveAppointmentsToFirebase(id);
                } else {
                    _gravarBackupLocal(agenda.lsKey, remotos);
                }
            });
        } catch (error) {
            console.error(`Erro ao sincronizar backup local da agenda '${id}':`, error);
        }
    });
}
