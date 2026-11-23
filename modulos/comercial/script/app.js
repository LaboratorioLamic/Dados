// ═══════════════════════════════════════════════════════════════
// app.js — Inicialização — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

let _appIniciado = false, _renderAdiado = false;
const campoEmEdicao = () => !!document.activeElement?.matches?.('.page input:not([type=file]), .page textarea');

async function iniciar() {
  temaInicial();
  mostrarAuth('carregando');

  // O banco (applamic) só abre para quem está logado no Dados LAMIC (mesma origem → mesma sessão).
  const user = await new Promise(res => { const off = firebase.auth().onAuthStateChanged(u => { off(); res(u); }); });
  if (!user) return mostrarAuth('sem-dados');
  const negado = await verificarAcessoDados(user).catch(e => e.message || String(e));
  if (negado) return mostrarAuth('sem-acesso', negado);

  // Sem resposta do banco em 12 s → tela de erro
  const limite = setTimeout(() => mostrarAuth('erro-conexao'), 12000);
  try {
    await sincronizarEstado();
    clearTimeout(limite);
    await semearDados();
  } catch (e) {
    clearTimeout(limite);
    console.error(e);
    return mostrarAuth('erro-conexao');
  }

  // Reage a alterações feitas por outros usuários
  const semAcesso = await iniciarSessaoDados().catch(e => e.message || String(e));
  if (semAcesso) return mostrarAuth('sem-acesso', semAcesso);

  aoAtualizar(chave => {
    if (!sessao) return;
    const u = ESTADO.usuarios[sessao.usuarioId];
    // Só a lista de usuários decide se a sessão continua válida
    // no treinamento a alteração é só simulada: descarta a simulação em vez de encerrar a sessão de verdade
    if (chave === 'usuarios' && (!u || u.ativo === false) && SIM.ativo) return encerrarSimulacao({ msg: 'Simulação encerrada: a alteração simulada removeria o seu próprio acesso. Nada foi gravado.' });
    if (chave === 'usuarios' && (!u || u.ativo === false)) { encerrarSessao(); fecharGaveta(); return mostrarAuth('sem-acesso', 'Seu acesso ao Comercial foi desativado pelo administrador.'); }
    if (!u) return;
    // último acesso gravado pelo L2L: só interessa à aba de acessos
    if (chave === 'acessosL2L' && telaAtual !== 'config') return;
    aplicarPermissoes();
    if (!podeVerTela(telaAtual)) return irPara('inicio');
    // Gaveta aberta: redesenha quando ela fechar
    if (document.getElementById('gaveta').classList.contains('open')) { _renderAdiado = true; atualizarPropostaAberta(); return; }
    // Digitando em um campo da tela: redesenha só quando sair dele
    if (campoEmEdicao()) { _renderAdiado = true; return; }
    renderTela();
  });
  document.addEventListener('focusout', () => setTimeout(() => {
    if (_renderAdiado && !campoEmEdicao() && !document.getElementById('gaveta').classList.contains('open')) { _renderAdiado = false; renderTela(); }
  }, 400));

  entrarApp();
}

function entrarApp() {
  esconderAuth();
  aplicarPermissoes();
  if (!_appIniciado) {
    _appIniciado = true;
    document.querySelectorAll('#nav a').forEach(a => a.onclick = () => irPara(a.dataset.s));
  }
  let t = 'inicio';
  try { t = sessionStorage.getItem('prec-tela') || 'inicio'; } catch (e) {}
  irPara(t);
  avisoFimSimulacao();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !popAberto && document.getElementById('gaveta').classList.contains('open') && !document.getElementById('modal').classList.contains('open')) clicarForaGaveta();
});

document.addEventListener('DOMContentLoaded', iniciar);
