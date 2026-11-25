// === SESSÃO DO DADOS LAMIC ===
// A Auditoria não tem login próprio: usa a sessão do Dados LAMIC (mesmo projeto applamic).
// Acesso = mesma regra do link "Auditoria" no Dados (admin, quem edita módulos ou grupo com o link).
// O usuário do Dados é ligado ao cadastro da Auditoria (/passwords) por login, CPF ou nome.
// Quem não existe aqui é criado no grupo padrão (Configurações › Grupo padrão de novos usuários).
(function () {
    const DADOS_URL = 'https://laboratoriolamic.github.io/Dados/';

    function telaDados(titulo, msg) {
        document.getElementById('tela-dados-titulo').textContent = titulo;
        document.getElementById('tela-dados-msg').textContent = msg;
        document.getElementById('tela-dados').style.display = 'flex';
        const ov = document.getElementById('loginOverlay');
        if (ov) ov.style.display = 'none';
        if (window.LamicCarregando) window.LamicCarregando.fim();
    }

    const soDig = v => String(v || '').replace(/\D/g, '');
    const normNome = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const novoId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    async function iniciar() {
        // Tela de login/senha antiga nunca aparece; senha da Auditoria não é mais usada.
        const ov = document.getElementById('loginOverlay');
        if (ov) ov.style.visibility = 'hidden';
        const css = document.createElement('style');
        css.textContent = '.um-section:has(#cfgPassword){display:none!important}';
        document.head.appendChild(css);

        while (!window.firebaseDatabase || !window.dadosUsuario) await new Promise(r => setTimeout(r, 100));
        try { window.firebaseGoOnline(); } catch (_) {}
        window._intentionalOffline = false;
        window._authBusy = true;

        const user = await window.dadosUsuario;
        if (!user) return telaDados('Sessão do Dados LAMIC', 'Entre pelo Dados LAMIC para usar a Auditoria.');
        const db = window.firebaseDatabase, R = window.firebaseRefRaiz;
        const val = async p => { const s = await window.firebaseGet(R(db, p)); return s.exists() ? s.val() : null; };

        const login = await val(`uids/${user.uid}`);
        const perfil = login && await val(`usuarios/${login}`);
        if (!perfil || perfil.ativo !== true) return telaDados('Sem acesso', 'Sua conta está desativada no Dados LAMIC.');
        const grupo = perfil.grupo;
        const adminDados = grupo === 'admin';
        const g = (grupo && !adminDados && await val(`grupos/${grupo}`)) || {};
        const gerente = adminDados || g.perms?.modulos_gerenciar === true;

        // id do link "Auditoria" no Dados: achado pela URL, gravado em acesso_links/auditoria (as regras leem dali)
        let ref = await val('acesso_links/auditoria');
        if (!ref?.link || gerente) {
            const mods = (await val('modulos')) || {};
            let achou = null;
            for (const [mod, m] of Object.entries(mods))
                for (const [link, l] of Object.entries(m?.links || {}))
                    if (String(l?.url || '').includes('auditoriaIamic')) achou = achou || { mod, link };
            if (achou && gerente && (achou.mod !== ref?.mod || achou.link !== ref?.link))
                await window.firebaseSet(R(db, 'acesso_links/auditoria'), achou).catch(e => console.warn(e));
            ref = achou || ref;
        }
        if (!gerente) {
            if (!ref) return telaDados('Sem acesso', 'O link "Auditoria" não foi achado no Dados LAMIC.');
            const ok = g.links ? g.links[ref.link] === true : (await val(`modulos/${ref.mod}/grupos/${grupo}`)) === true;
            if (!ok) return telaDados('Sem acesso', 'Seu grupo no Dados LAMIC não tem acesso à Auditoria. Peça a um administrador.');
        }

        let cpf = '';
        try { cpf = soDig(await val(`privado/${login}/cpf`)); } catch (_) {}
        if (cpf === '00000000000') cpf = '';

        // Contas do Dados (unidade do RH de cada um) antes dos usuários: define o setor padrão
        try { await carregarContasDados(); } catch (_) {}
        await Promise.all([loadusers(), loadAuthSettings()]);
        let eu = users.find(u => u.dadosLogin === login)
            || (cpf && users.find(u => soDig(u.cpf) === cpf))
            || users.find(u => String(u.user || '').trim().toLowerCase() === login)
            || users.find(u => normNome(u.name) && normNome(u.name) === normNome(perfil.nome));

        const grupoPadrao = getUserGroup(authSettings.defaultGroupId);
        if (!eu && !grupoPadrao && !adminDados)
            return telaDados('Primeiro acesso', 'Você ainda não tem cadastro na Auditoria e nenhum grupo padrão foi escolhido. Peça a um administrador (Auditoria › Configurações › Grupo padrão de novos usuários).');

        // Liga (ou cria) o cadastro de forma atômica. O nome antigo fica: cards usam o nome como responsável.
        const alvoId = eu?.id || novoId();
        const res = await window.firebaseRunTransaction(window.firebaseRef(db, 'passwords'), cur => {
            if (cur !== null && !Array.isArray(cur)) return; // formato inesperado: não toca
            const arr = cur || [];
            let u = arr.find(x => x && x.id === alvoId);
            if (!u) {
                u = {
                    id: alvoId, name: perfil.nome || login, user: login, password: '', cpf: cpf || '', cargo: perfil.cargo || '',
                    ..._groupPermsCopy(grupoPadrao),
                    grupoId: grupoPadrao?.id || null, grupo: grupoPadrao?.name || '',
                    active: true, isAdmin: adminDados, createdVia: 'dados', createdAt: Date.now()
                };
                arr.push(u);
            }
            u.dadosLogin = login;
            if (cpf && !soDig(u.cpf)) u.cpf = cpf;
            if (adminDados) u.isAdmin = true;
            // Grafia do APP LAMIC prevalece (maiúsculas/acentos). Só quando é o mesmo nome:
            // nome diferente de verdade fica, pois registros antigos podem citar o nome.
            if (perfil.nome && u.name !== perfil.nome && normNome(u.name) === normNome(perfil.nome)) u.name = perfil.nome;
            return arr;
        });
        if (!res.committed) return telaDados('Erro', 'Não foi possível ligar seu usuário. Recarregue a página.');

        await loadusers();
        eu = users.find(u => u.id === alvoId);
        if (!eu) return telaDados('Erro', 'Usuário não encontrado após o vínculo. Recarregue a página.');
        if (eu.active === false && !adminDados)
            return telaDados('Usuário inativo', 'Seu usuário está inativo na Auditoria. Fale com um administrador.');

        window._authBusy = false;
        if (ov) ov.style.visibility = '';
        window._entrarComo(eu);
        if (window.LamicCarregando) window.LamicCarregando.fim();
        if (eu.isAdmin) window.sincronizarUsuariosDados(true).catch(e => console.warn('sync usuários:', e));
        // Imagens Base64 antigas → Drive, 15 por sessão de admin, em segundo plano
        if (eu.isAdmin && typeof window.migrarImgBlobsAntigos === 'function')
            setTimeout(() => window.migrarImgBlobsAntigos()
                .then(r => { if (r.movidas) console.info(`[imgBlobs] ${r.movidas} imagens movidas para o Drive, faltam ${r.restantes}.`); })
                .catch(e => console.warn('[imgBlobs] migração:', e && e.message)), 30000);
    }

    // Todo usuário ativo do Dados LAMIC tem cadastro na Auditoria: liga quem já existe
    // (login do Dados, CPF, login, nome único) e cria o resto no grupo padrão. Só admin.
    window.sincronizarUsuariosDados = async function (silencioso) {
        if (!currentuser || !currentuser.isAdmin) return;
        contasDados = null;
        await carregarContasDados();
        await loadAuthSettings();
        const gp = getUserGroup(authSettings.defaultGroupId);
        const contas = Object.entries(contasDados || {}).filter(([l, d]) => d && d.ativo !== false && l);
        let ligados = 0, criados = 0, semGrupo = 0, ren = 0;
        const res = await window.firebaseRunTransaction(window.firebaseRef(window.firebaseDatabase, 'passwords'), cur => {
            if (cur !== null && !Array.isArray(cur)) return;
            const arr = cur || [];
            ligados = criados = semGrupo = ren = 0;
            const livres = () => arr.filter(x => x && !x.dadosLogin);
            contas.forEach(([login, d]) => {
                if (arr.some(x => x && x.dadosLogin === login)) return;
                const cpf = cpfsDados[login] || '';
                const nn = normNome(d.nome);
                const porNome = nn ? livres().filter(x => normNome(x.name) === nn) : [];
                const u = (cpf && livres().find(x => soDig(x.cpf) === cpf))
                    || livres().find(x => String(x.user || '').trim().toLowerCase() === login)
                    || (porNome.length === 1 ? porNome[0] : null);
                if (u) {
                    u.dadosLogin = login;
                    if (cpf && !soDig(u.cpf)) u.cpf = cpf;
                    ligados++;
                    return;
                }
                if (!gp) { semGrupo++; return; }
                arr.push({
                    id: novoId(), name: d.nome || login, user: login, password: '', cpf, cargo: d.cargo || '',
                    ..._groupPermsCopy(gp), grupoId: gp.id, grupo: gp.name,
                    active: true, isAdmin: false, dadosLogin: login, createdVia: 'dados-sync', createdAt: Date.now()
                });
                criados++;
            });
            // Grafia do APP LAMIC prevalece para todos os vinculados (mesmo nome, outra caixa/acento)
            arr.forEach(x => {
                const d = x && x.dadosLogin && contasDados[x.dadosLogin];
                if (d && d.nome && x.name !== d.nome && normNome(x.name) === normNome(d.nome)) { x.name = d.nome; ren++; }
            });
            if (!ligados && !criados && !ren) return; // nada a mudar: aborta sem escrever
            return arr;
        });
        if (res.committed && (ligados || criados || ren)) {
            await loadusers();
            if (typeof renderusersConfigTable === 'function') renderusersConfigTable();
        }
        const msg = `Dados LAMIC: ${ligados} vinculado(s), ${criados} criado(s) no grupo padrão` +
            (semGrupo ? `, ${semGrupo} sem cadastro (escolha o grupo padrão)` : '') + '.';
        if (!silencioso || ligados || criados || semGrupo) showToast && showToast(msg, semGrupo ? 'warning' : 'success');
    };

    // Sair: encerra só a Auditoria (a sessão do Dados continua)
    const sairOriginal = window.logout;
    window.logout = function () {
        try { sairOriginal(); } catch (e) { console.warn(e); }
        telaDados('Sessão encerrada', 'Você saiu da Auditoria. Abra de novo pelo Dados LAMIC.');
    };

    // ── Backup completo: o nó "auditoria" inteiro (usuários, grupos, cards, RNC, ocorrências,
    // mensagens, reuniões, imagens, snapshots...). Restaurar substitui tudo; antes baixa uma cópia.
    function baixarJson(obj, nome) {
        const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
    const carimbo = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const ehAdmin = () => { try { return !!currentuser && userIsAdmin(); } catch (_) { return false; } };
    async function lerTudo() {
        const s = await window.firebaseGet(window.firebaseRef(window.firebaseDatabase, ''));
        return s.exists() ? s.val() : null;
    }

    window.baixarBackupCompleto = async function () {
        if (!ehAdmin()) return alert('Só administradores fazem backup completo.');
        try {
            const dados = await lerTudo();
            if (!dados) return alert('O banco da Auditoria está vazio.');
            baixarJson({ _tipo: 'auditoria-completo', _versao: 1, _exportadoEm: new Date().toISOString(), dados }, `auditoria_backup_completo_${carimbo()}.json`);
        } catch (e) { alert('Falha ao ler o banco: ' + (e.code || e.message)); }
    };

    window.restaurarBackupCompleto = async function (input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        if (!ehAdmin()) return alert('Só administradores restauram backup completo.');
        let j;
        try { j = JSON.parse(await file.text()); } catch (_) { return alert('Arquivo JSON inválido.'); }
        // Aceita: este backup, o export do Firebase antigo (dados-lamic, chaves na raiz)
        // ou um export do applamic inteiro (pega só o nó auditoria).
        const dados = j && j._tipo === 'auditoria-completo' ? j.dados : (j && j.auditoria && typeof j.auditoria === 'object' ? j.auditoria : j);
        const chaves = Object.keys(dados || {});
        if (!chaves.includes('passwords') || !chaves.some(k => ['audits', 'activities', 'masterLists'].includes(k)))
            return alert('Este arquivo não parece um backup completo da Auditoria (precisa ter usuários e cards). Para o backup simples use "Importar".');
        if (!confirm(`Substituir TODOS os dados da Auditoria por ${chaves.length} nós do arquivo "${file.name}"?\nAntes, uma cópia do banco atual será baixada.`)) return;
        await aplicarCompleto(dados);
    };

    // Grava nó por nó (um erro não derruba os outros) e remove o que não veio no arquivo.
    async function aplicarCompleto(dados) {
        const db = window.firebaseDatabase;
        try {
            const atual = await lerTudo();
            if (atual) baixarJson({ _tipo: 'auditoria-completo', _versao: 1, _exportadoEm: new Date().toISOString(), dados: atual }, `auditoria_antes_restaurar_${carimbo()}.json`);
            const falhas = [];
            for (const [k, v] of Object.entries(dados)) {
                try { await window.firebaseSet(window.firebaseRef(db, k), v); }
                catch (e) { falhas.push(k + ': ' + (e.code || e.message)); }
            }
            for (const k of Object.keys(atual || {}))
                if (!(k in dados)) await window.firebaseSet(window.firebaseRef(db, k), null).catch(e => falhas.push(k + ': ' + (e.code || e.message)));
            if (falhas.length) return alert('Restaurado com falhas (o resto foi gravado):\n' + falhas.join('\n'));
            alert('Dados restaurados (' + Object.keys(dados).length + ' nós). A página será recarregada.');
            location.reload();
        } catch (e) { alert('Falha ao restaurar: ' + (e.code || e.message)); }
    }

    // Migração direta do banco antigo (dados-lamic, leitura pública): traz TUDO, inclusive
    // usuários (/passwords), grupos e vínculos. Baixa uma cópia do banco antigo antes.
    const BANCO_ANTIGO = 'https://dados-lamic-default-rtdb.firebaseio.com/.json';
    window.migrarBancoAntigo = async function () {
        if (!ehAdmin()) return alert('Só administradores migram o banco.');
        if (!confirm('Copiar TUDO do banco antigo da Auditoria (dados-lamic) para o Dados LAMIC?\nOs dados atuais da Auditoria aqui serão substituídos. Antes, serão baixadas uma cópia do banco antigo e uma do atual.')) return;
        let dados;
        try {
            const r = await fetch(BANCO_ANTIGO);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            dados = await r.json();
        } catch (e) { return alert('Não foi possível ler o banco antigo: ' + e.message); }
        if (!dados || !dados.passwords || !dados.audits) return alert('O banco antigo não tem os dados esperados (usuários e cards).');
        baixarJson({ _tipo: 'auditoria-completo', _versao: 1, _origem: 'dados-lamic', _exportadoEm: new Date().toISOString(), dados }, `auditoria_banco_antigo_${carimbo()}.json`);
        await aplicarCompleto(dados);
    };

    function botoesBackup() {
        const exp = document.querySelector('[onclick="exportLocalData()"]');
        if (!exp || document.getElementById('bkCompleto')) return;
        const box = document.createElement('div');
        box.id = 'bkCompleto';
        box.style.cssText = 'margin-top:16px;padding:14px;border:1px solid #cbd5e1;border-radius:12px;width:100%';
        box.innerHTML = '<b>Backup completo do banco</b> <small style="opacity:.7">(admin)</small><br>' +
            '<small style="opacity:.75">Tudo da Auditoria: usuários, grupos, cards, RNC, ocorrências, mensagens, reuniões e imagens. A restauração também aceita o export JSON do Firebase antigo.</small>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
            '<button type="button" class="btn-large" style="background:#162036;color:#fff;border:none" onclick="baixarBackupCompleto()">Baixar backup completo</button>' +
            '<button type="button" class="btn-large" onclick="document.getElementById(\'bkCompletoArq\').click()">Restaurar backup completo…</button>' +
            '<button type="button" class="btn-large" style="background:#2AA7BE;color:#fff;border:none" onclick="migrarBancoAntigo()">Migrar do banco antigo</button>' +
            '<input type="file" id="bkCompletoArq" accept=".json,application/json" style="display:none" onchange="restaurarBackupCompleto(this)"></div>';
        exp.parentElement.insertAdjacentElement('afterend', box);
    }

    // ── Usuários: vinculados ao Dados LAMIC são travados; não vinculados recebem sugestão de vínculo ──
    // Vinculado (dadosLogin): não pode ser excluído; nome, login e CPF vêm do Dados (só leitura).
    // Não vinculado: editável, com lista de contas do Dados (sugestão por CPF, login ou nome).
    // Os cards guardam o ID do usuário, então vincular/unificar não quebra responsável/revisor.
    const escH = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let contasDados = null, cpfsDados = {}, vinculoEscolhido = null;
    // Conta do Dados (nome, cargo, unidade do RH) por login — usado no chat para marcar por setor
    window._contaDados = (login) => (login && contasDados && contasDados[login]) || null;
    window._carregarContasDados = () => carregarContasDados();

    async function carregarContasDados() {
        if (contasDados) return;
        const db = window.firebaseDatabase, R = window.firebaseRefRaiz;
        const s = await window.firebaseGet(R(db, 'usuarios'));
        contasDados = s.exists() ? s.val() : {};
        try {
            const pv = await window.firebaseGet(R(db, 'privado'));
            Object.entries(pv.exists() ? pv.val() : {}).forEach(([l, v]) => { const c = soDig(v && v.cpf); if (c && c !== '00000000000') cpfsDados[l] = c; });
        } catch (_) { cpfsDados = {}; } // sem permissão de ler CPFs: sugere por login/nome
    }

    function sugestao(u) {
        const ativos = Object.entries(contasDados || {}).filter(([, d]) => d && d.ativo !== false);
        const cpf = soDig(u.cpf);
        if (cpf) { const m = ativos.filter(([l]) => cpfsDados[l] === cpf); if (m.length === 1) return [m[0][0], 'CPF']; }
        const lg = String(u.user || '').trim().toLowerCase();
        if (lg && contasDados[lg] && contasDados[lg].ativo !== false) return [lg, 'login'];
        const m = ativos.filter(([, d]) => normNome(d.nome) && normNome(d.nome) === normNome(u.name));
        return m.length === 1 ? [m[0][0], 'nome'] : [null, ''];
    }

    function desenharVinculo(u, q) {
        const box = document.getElementById('usrVinculoBox');
        if (!box) return;
        const [sug, porQue] = sugestao(u);
        const usados = new Map(users.filter(x => x.dadosLogin && x.id !== u.id).map(x => [x.dadosLogin, x]));
        const k = normNome(q);
        const lista = Object.entries(contasDados || {})
            .filter(([l, d]) => d && d.ativo !== false && (!k || normNome((d.nome || '') + ' ' + l).includes(k)))
            .sort(([la, a], [lb, b]) => la === sug ? -1 : lb === sug ? 1 : String(a.nome || la).localeCompare(String(b.nome || lb), 'pt-BR'))
            .slice(0, 8);
        box.innerHTML = `<div style="border:1px solid #fed7aa;background:#fff7ed;border-radius:14px;padding:12px;margin:8px 0 4px">
            <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#ea580c;margin-bottom:4px"><i class="fas fa-link"></i> Vincular à conta do Dados LAMIC</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:8px">Usuário antigo sem conta. Escolha a conta: ao salvar, nome, login e CPF passam a vir do Dados e ficam travados. Cards e histórico continuam ligados.</div>
            <input id="usrVinculoBusca" value="${escH(q)}" placeholder="Buscar conta por nome ou login…" autocomplete="off" style="width:100%;margin-bottom:8px">
            <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">${lista.map(([l, d]) => {
                const on = vinculoEscolhido === l, dup = usados.get(l);
                return `<button type="button" data-vl="${escH(l)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;text-align:left;cursor:pointer;background:${on ? '#fff' : 'transparent'};border:${on ? '2px solid #2AA7BE' : '1px solid transparent'}">
                    <span style="flex:1;min-width:0"><b style="display:block;font-size:13px;color:#162036">${escH(d.nome || l)}</b>
                    <small style="color:#94a3b8">@${escH(l)}${l === sug ? ` · <span style="color:#059669">sugerido pelo ${porQue}</span>` : ''}${dup ? ` · <span style="color:#ea580c">já tem registro (${escH(dup.name)}) — será unificado</span>` : ''}</small></span>
                    ${on ? '<i class="fas fa-check-circle" style="color:#2AA7BE"></i>' : ''}</button>`;
            }).join('') || '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:10px">Nenhuma conta encontrada.</div>'}</div>
            ${vinculoEscolhido ? `<div style="font-size:12px;color:#047857;font-weight:700;margin-top:8px"><i class="fas fa-check"></i> Será vinculado a @${escH(vinculoEscolhido)} ao salvar. <a href="#" id="usrVinculoLimpar">desfazer</a></div>` : ''}
        </div>`;
        const busca = document.getElementById('usrVinculoBusca');
        busca.oninput = () => { const p = busca.selectionStart; desenharVinculo(u, busca.value); const b = document.getElementById('usrVinculoBusca'); b.focus(); b.setSelectionRange(p, p); };
        box.querySelectorAll('[data-vl]').forEach(b => b.onclick = () => { vinculoEscolhido = b.dataset.vl; desenharVinculo(u, document.getElementById('usrVinculoBusca').value); });
        const lp = document.getElementById('usrVinculoLimpar');
        if (lp) lp.onclick = ev => { ev.preventDefault(); vinculoEscolhido = null; desenharVinculo(u, document.getElementById('usrVinculoBusca').value); };
    }

    const CAMPOS_TRAVADOS = ['cfgname', 'cfguser', 'cfgCpf'];
    function travarCampos(travar) {
        CAMPOS_TRAVADOS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.readOnly = travar;
            el.style.opacity = travar ? '.65' : '';
            el.title = travar ? 'Vem do Dados LAMIC (altere lá)' : '';
        });
    }

    // Setor do RH: unidade do usuário no Dados LAMIC (vem do vínculo com o funcionário do RH),
    // casada com a lista de setores pelo nome (ignora acento, número e "Unidade").
    const chaveSetor = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
        .replace(/^\s*\d+\s*[-–.]\s*/, '').replace(/\bUNIDADE\b/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
    window._setorRhDe = function (u) {
        const login = u && (u.dadosLogin || '');
        const un = login && contasDados && contasDados[login] && contasDados[login].unidade;
        if (!un) return '';
        const lista = (typeof masterLists !== 'undefined' && masterLists.setores) || [];
        if (lista.includes(un)) return un;
        const k = chaveSetor(un);
        const m = lista.filter(s => chaveSetor(s) === k);
        return m.length === 1 ? m[0] : un;
    };

    // No formulário do usuário, setores são sempre do próprio usuário (não do grupo) e editáveis.
    function setoresDoUsuarioNoForm(u) {
        if (!u || u.isAdmin) return;
        tempSelectedSetores = (u.allowedSetores || []).slice();
        if (typeof updateSetoresButtonText === 'function') updateSetoresButtonText();
        document.querySelectorAll('#modalUsuario .um-setores-btn').forEach(el => { el.disabled = false; });
    }

    // Campo só-leitura "Setor (RH)" ao lado do Cargo: unidade herdada do RH, base da seleção padrão
    async function mostrarSetorRh(u) {
        const cargo = document.getElementById('cfgCargo');
        const campoCargo = cargo && (cargo.closest('.field-group') || cargo.parentElement);
        if (!campoCargo) return;
        let campo = document.getElementById('usrSetorRhCampo');
        if (!campo) {
            campo = campoCargo.cloneNode(false);
            campo.id = 'usrSetorRhCampo';
            campo.innerHTML = '<label style="display:block">SETOR (RH)</label><input id="usrSetorRh" readonly style="background:#f1f5f9;cursor:not-allowed">';
            const lbl = campoCargo.querySelector('label');
            if (lbl) campo.querySelector('label').className = lbl.className;
            const inpCls = cargo.className;
            if (inpCls) campo.querySelector('input').className = inpCls;
            const depois = document.getElementById('cfgGrupoId')?.closest('.field-group') || campoCargo;
            depois.parentElement.insertBefore(campo, depois.nextSibling);
        }
        const inp = document.getElementById('usrSetorRh');
        cargo.readOnly = false; cargo.style.background = ''; cargo.style.cursor = ''; cargo.title = '';
        campo.style.display = u && u.isAdmin ? 'none' : '';
        if (!u) { inp.value = 'Definido pelo vínculo com o RH'; return; }
        if (!u.dadosLogin) { inp.value = 'Sem vínculo com o Dados LAMIC'; return; }
        try { await carregarContasDados(); } catch (e) { }
        // Cargo vem do RH (via conta do Dados LAMIC) e não é editável
        const cargoRh = contasDados && contasDados[u.dadosLogin] && contasDados[u.dadosLogin].cargo;
        if (cargoRh) cargo.value = cargoRh;
        cargo.readOnly = true;
        cargo.style.background = '#f1f5f9';
        cargo.style.cursor = 'not-allowed';
        cargo.title = 'Vem do RH (altere no Dados LAMIC)';
        const rh = window._setorRhDe(u);
        inp.value = rh || 'Sem unidade no RH';
        inp.title = rh ? 'Herdado do RH: marcado por padrão nos setores do usuário' : 'Vincule o funcionário ao RH no Dados LAMIC';
        if (rh && !u.isAdmin && Array.isArray(tempSelectedSetores) && !tempSelectedSetores.includes(rh)) {
            tempSelectedSetores.push(rh);
            if (typeof updateSetoresButtonText === 'function') updateSetoresButtonText();
        }
    }

    // "Setor padrão": zera seleção manual e deixa só o setor do RH em todo usuário aplicável
    window.aplicarSetorPadraoTodos = async function () {
        if (!currentuser || !currentuser.isAdmin) { showToast && showToast('Apenas administrador.', 'error'); return; }
        try { await carregarContasDados(); } catch (e) { }
        const alvos = users.filter(u => u && !u.isAdmin && !u.canManageLists);
        const semRh = alvos.filter(u => !window._setorRhDe(u)).length;
        if (!confirm(`Aplicar setor padrão (apenas a unidade do RH) a ${alvos.length} usuário(s)?\n` +
            `Seleções manuais serão removidas.${semRh ? `\n${semRh} sem unidade no RH ficarão sem setor.` : ''}\n` +
            'Administradores e quem tem "Todas as listas" não são alterados.')) return;
        alvos.forEach(u => {
            const rh = window._setorRhDe(u);
            delete u.setoresManuais; delete u.setoresManuaisEm;
            u.allowedSetores = rh ? [rh] : [];
        });
        try {
            await saveusers();
            showToast && showToast(`Setor padrão aplicado a ${alvos.length} usuário(s).`, 'success');
            if (typeof renderusersConfigTable === 'function') renderusersConfigTable();
        } catch (e) { showToast && showToast('Erro ao salvar: ' + e.message, 'error'); }
    };
    function botaoSetorPadrao() {
        const tabs = document.querySelector('.usr-filter-tabs');
        if (!tabs || document.getElementById('btnSetorPadrao')) return;
        const b = document.createElement('button');
        b.id = 'btnSetorPadrao';
        b.type = 'button';
        b.className = 'usr-ftab';
        b.style.marginLeft = 'auto';
        b.innerHTML = '<i class="fas fa-location-dot"></i> Setor padrão';
        b.title = 'Deixa marcado só o setor do RH em todos os usuários não-admin sem "Todas as listas"';
        b.onclick = () => window.aplicarSetorPadraoTodos();
        tabs.style.display = 'flex';
        tabs.appendChild(b);
        const s = document.createElement('button');
        s.type = 'button';
        s.className = 'usr-ftab';
        s.innerHTML = '<i class="fas fa-rotate"></i> Sincronizar com Dados';
        s.title = 'Vincula todos os usuários do Dados LAMIC; novos entram no grupo padrão';
        s.onclick = async () => { s.disabled = true; try { await window.sincronizarUsuariosDados(false); } catch (e) { showToast && showToast('Erro: ' + e.message, 'error'); } s.disabled = false; };
        tabs.appendChild(s);
    }

    let setoresConfirmados = false;   // setores mexidos e confirmados na janela nesta edição
    function instalarVinculos() {
        const confirmaSetores = window.saveSetoresPermissoes;
        if (typeof confirmaSetores === 'function') window.saveSetoresPermissoes = function () { setoresConfirmados = true; return confirmaSetores.apply(this, arguments); };
        // Trocar o grupo no formulário não traz os setores do grupo: mantém os do usuário
        const trocaGrupo = window._onUserGroupChange;
        if (typeof trocaGrupo === 'function') window._onUserGroupChange = function () {
            const manter = Array.isArray(tempSelectedSetores) ? tempSelectedSetores.slice() : [];
            const r = trocaGrupo.apply(this, arguments);
            const u = editinguserIndex !== null && editinguserIndex !== undefined ? users[editinguserIndex] : null;
            if (u && !u.isAdmin && document.getElementById('modalUsuario')?.style.display !== 'none') {
                tempSelectedSetores = manter;
                if (typeof updateSetoresButtonText === 'function') updateSetoresButtonText();
                document.querySelectorAll('#modalUsuario .um-setores-btn').forEach(el => { el.disabled = false; });
            }
            return r;
        };
        // Tabela: vinculado mostra @login e não tem lixeira; não vinculado ganha selo "sem vínculo"
        const renderOrig = window.renderusersConfigTable;
        window.renderusersConfigTable = function () {
            renderOrig.apply(this, arguments);
            const bsp = document.getElementById('btnSetorPadrao');
            if (currentuser && currentuser.isAdmin) botaoSetorPadrao(); else if (bsp) bsp.remove();
            document.querySelectorAll('#cfgusersTable tr').forEach(tr => {
                const del = tr.querySelector('[onclick^="deleteuserConfig("]');
                const idx = +((tr.querySelector('[onclick^="openUserModal("]')?.getAttribute('onclick') || '').match(/\d+/) || [-1])[0];
                const u = users[idx];
                if (!u) return;
                const login = tr.querySelector('.usr-cell-login');
                if (u.dadosLogin) {
                    if (del) del.remove();
                    if (login) login.innerHTML = `<span style="color:#059669" title="Vinculado ao Dados LAMIC"><i class="fas fa-link"></i> @${escH(u.dadosLogin)}</span>`;
                } else if (login) {
                    login.innerHTML += ' <span style="color:#ea580c;font-weight:700" title="Sem conta no Dados LAMIC: edite para vincular">· sem vínculo</span>';
                }
            });
        };

        const delOrig = window.deleteuserConfig;
        window.deleteuserConfig = function (idx) {
            if (users[idx]?.dadosLogin) {
                if (typeof showToast === 'function') showToast('Usuário vinculado ao Dados LAMIC não pode ser excluído. Use Status › Inativo.', 'error');
                return;
            }
            return delOrig.apply(this, arguments);
        };

        const abrirOrig = window.openUserModal;
        window.openUserModal = async function (idx) {
            const r = abrirOrig.apply(this, arguments);
            setoresConfirmados = false;
            setoresDoUsuarioNoForm(idx === null || idx === undefined ? null : users[idx]);
            vinculoEscolhido = null;
            let box = document.getElementById('usrVinculoBox');
            if (!box) {
                const ident = document.getElementById('cfgname')?.closest('.um-section');
                box = document.createElement('div');
                box.id = 'usrVinculoBox';
                if (ident) ident.appendChild(box);
            }
            box.innerHTML = '';
            const u = idx === null || idx === undefined ? null : users[idx];
            travarCampos(!!u?.dadosLogin);
            mostrarSetorRh(u);
            if (u && !u.dadosLogin) {
                box.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px 0"><i class="fas fa-circle-notch fa-spin"></i> Carregando contas do Dados LAMIC…</div>';
                try { await carregarContasDados(); desenharVinculo(u, ''); }
                catch (e) { box.innerHTML = '<div style="font-size:12px;color:#dc2626;padding:8px 0">Não foi possível ler as contas do Dados LAMIC.</div>'; }
            }
            return r;
        };

        const salvarOrig = window.saveuserConfig;
        window.saveuserConfig = async function () {
            const idx = editinguserIndex;
            const u = idx === null || idx === undefined ? null : users[idx];
            if (!u) { if (typeof showToast === 'function') showToast('Usuários vêm do Dados LAMIC: não é possível criar aqui.', 'error'); return; }
            const id = u.id;
            // Vinculado: dados cruciais voltam ao valor gravado, mesmo se mexidos no DOM
            if (u.dadosLogin) {
                document.getElementById('cfgname').value = u.name || '';
                document.getElementById('cfguser').value = u.user || '';
                document.getElementById('cfgCpf').value = u.cpf || '';
            }
            const vinc = !u.dadosLogin && vinculoEscolhido ? vinculoEscolhido : null;
            let dup = null;
            if (vinc) {
                dup = users.find(x => x.dadosLogin === vinc && x.id !== id) || null;
                if (dup && !confirm(`A conta @${vinc} já tem um registro na Auditoria (${dup.name}), criado no primeiro acesso.\n\nUnificar: cards, responsáveis e revisões de "${dup.name}" passam para "${u.name}", e o registro duplicado é removido.\n\nContinuar?`)) return;
                const d = contasDados[vinc] || {};
                document.getElementById('cfgname').value = d.nome || u.name || '';
                document.getElementById('cfguser').value = vinc;
                if (cpfsDados[vinc]) document.getElementById('cfgCpf').value = cpfsDados[vinc];
            }
            const marcados = Array.isArray(tempSelectedSetores) ? tempSelectedSetores.slice() : [];
            await salvarOrig.apply(this, arguments);
            // Setores marcados à mão ficam no usuário (o do RH entra sempre, não precisa gravar)
            const salvo = users.find(x => x.id === id);
            if (salvo && !salvo.isAdmin && setoresConfirmados) {
                const manuais = marcados.filter(s => s && s !== salvo.setorRh);
                const antes = JSON.stringify(salvo.setoresManuais || []);
                salvo.setoresManuais = manuais;
                salvo.setoresManuaisEm = Date.now();
                salvo.allowedSetores = [...new Set([...manuais, ...(salvo.setorRh ? [salvo.setorRh] : [])])];
                if (!vinc) {
                    try { await saveusers(); } catch (e) { if (typeof showToast === 'function') showToast('Erro ao gravar setores: ' + e.message, 'error'); }
                }
            }
            if (!vinc) return;
            const alvo = users.find(x => x.id === id);
            if (!alvo) return;
            alvo.dadosLogin = vinc;
            if (dup) {
                if (dup.isAdmin) alvo.isAdmin = true;
                const i = users.findIndex(x => x.id === dup.id);
                if (i > -1) users.splice(i, 1);
                trocarIdNosRegistros(dup.id, id);
            }
            vinculoEscolhido = null;
            try { await saveusers(); if (typeof showToast === 'function') showToast(`Vinculado a @${vinc} do Dados LAMIC.`, 'success'); }
            catch (e) { if (typeof showToast === 'function') showToast('Erro ao gravar vínculo: ' + e.message, 'error'); }
            window.renderusersConfigTable();
        };
    }

    // Unificação: onde o ID do registro duplicado aparece (texto ou lista JSON), passa a ser o ID mantido.
    function trocarIdNosRegistros(deId, paraId) {
        let mudou = false;
        const troca = v => {
            if (v === deId) { mudou = true; return paraId; }
            if (typeof v === 'string' && v.includes(deId) && v.startsWith('[')) {
                try { const a = JSON.parse(v); if (Array.isArray(a)) { mudou = true; return JSON.stringify([...new Set(a.map(x => x === deId ? paraId : x))]); } } catch (_) {}
            }
            if (Array.isArray(v)) return v.map(troca);
            if (v && typeof v === 'object') { Object.keys(v).forEach(k => { v[k] = troca(v[k]); }); return v; }
            return v;
        };
        [audits, activities, maintenances, documents, ocorrencias, rncItems].forEach(col => (col || []).forEach(troca));
        if (mudou && typeof saveAll === 'function') saveAll(false);
    }

    function boot() {
        botoesBackup();
        try { instalarVinculos(); } catch (e) { console.warn('[dados-sessao] vínculos:', e); }
        iniciar().catch(e => {
            console.error('[dados-sessao]', e);
            const perm = String(e && (e.code || e.message) || '').toLowerCase().includes('permission');
            telaDados('Erro ao conectar', perm
                ? 'Sem permissão no banco: publique as regras do Firebase (nó auditoria) e confira o link "Auditoria" do seu grupo.'
                : 'Não foi possível ler o banco de dados. Tente novamente.');
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
