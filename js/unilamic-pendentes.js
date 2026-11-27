// UniLAMIC: cursos pendentes do usuário (visíveis para o cargo dele e ainda não concluídos).
// Compartilhado entre o portal (js/app.js: bolinha no menu) e o próprio UniLAMIC
// (modulos/Treinamentos: sino no cabeçalho e botão "Pendentes").
//
// Regras (espelham themeVisibleForSession/courseProgress de modulos/Treinamentos/js/main.js):
// - categorias com conta logada (Treinamentos e Educação Continuada; Estágios fica de fora);
// - tema e assunto ativos, com nome e com algum conteúdo (módulo ou questão);
// - assunto sem `roles` vale para todos; com `roles`, só para quem tem o cargo
//   (hierárquico: "Analista - Biomédico" casa com "Analista"). Gestor NÃO vê tudo aqui:
//   pendência é obrigação pelo cargo, não o que ele consegue abrir;
// - prazo ainda não iniciado não entra; prazo encerrado entra na lista, mas não no alerta (contaAlerta);
// - concluído = aprovado (progress/byUser, results/byUser ou histórico importado pelo nome)
//   ou, em curso sem avaliação, todos os módulos assistidos.
(function () {
  const ROOT = 'uniadmin';
  const CATS = [
    { slug: 'treinamentos', nome: 'Treinamentos' },
    { slug: 'educacao_continuada', nome: 'Educação Continuada' }
  ];

  const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  const base = (r) => { const k = norm(r), i = k.indexOf(' - '); return i === -1 ? k : k.slice(0, i).trim(); };
  const casaCargo = (cursoRole, cargo) => { const c = norm(cursoRole), u = norm(cargo); return !!c && !!u && (c === u || base(u) === c); };

  function statusPrazo(d, agora) {
    if (!d || d.mode !== 'prazo') return 'livre';
    if (d.startAt && agora < d.startAt) return 'not_started';
    if (!d.endAt || agora <= d.endAt) return 'on_time';
    if (!d.closeAt || agora <= d.closeAt) return 'late';
    return 'closed';
  }

  // dados = { training: {slug: trainingData}, quiz: {slug: quizData}, progress, results, imported }
  function calcular(dados, sess, agora = Date.now()) {
    const cargo = sess?.role || '';
    const nomeKey = norm(sess?.fullName);
    const lista = [];
    CATS.forEach(({ slug, nome: catNome }) => {
      const td = dados.training?.[slug] || {};
      const qd = dados.quiz?.[slug] || {};
      const aprovImp = new Set();
      Object.values(dados.imported?.[slug] || {}).forEach((r) => {
        if (r && r.approved && r.subjectId && r.themeId && nomeKey && norm(r.name) === nomeKey) aprovImp.add(`${r.subjectId}_${r.themeId}`);
      });
      Object.entries(td).forEach(([sid, sub]) => {
        if (!sub || !String(sub.name || '').trim() || sub.active === false) return;
        Object.entries(sub.themes || {}).forEach(([tid, t]) => {
          if (!t || !String(t.name || '').trim() || t.active === false) return;
          const roles = Array.isArray(t.roles) ? t.roles.filter(Boolean) : [];
          if (roles.length && !roles.some((r) => casaCargo(r, cargo))) return;
          const total = (t.modules || []).length;
          const nQuiz = (Array.isArray(qd[`${sid}_${tid}`]) ? qd[`${sid}_${tid}`] : Object.values(qd[`${sid}_${tid}`] || {})).length;
          if (!total && !nQuiz) return;
          const prazo = statusPrazo(t.deadline, agora);
          if (prazo === 'not_started') return;
          const p = dados.progress?.[slug]?.[sid]?.[tid] || {};
          const r = dados.results?.[slug]?.[sid]?.[tid] || {};
          const aprovado = (p.approved != null) || r.approved === true || aprovImp.has(`${sid}_${tid}`);
          const done = Math.min(p.done || 0, total);
          if (aprovado || (!nQuiz && total && done >= total)) return;
          lista.push({
            slug, catNome, subjectId: sid, temaNome: sub.name || '', themeId: tid, nome: t.name.trim(),
            total, done, pct: total ? Math.round(done / total * 100) : 0, temQuiz: nQuiz > 0,
            prazo, fim: t.deadline?.endAt || null,
            url: `portal.html?cat=${encodeURIComponent(catNome)}&tema=${encodeURIComponent(sid)}&curso=${encodeURIComponent(tid)}`
          });
        });
      });
    });
    const ord = { late: 0, on_time: 1, closed: 3, livre: 2 };
    return lista.sort((a, b) => (ord[a.prazo] - ord[b.prazo]) || ((a.fim || 9e15) - (b.fim || 9e15)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Observa as pendências de um login. sess = { login, role, fullName } (userId opcional).
  // Tudo ao vivo: catálogo (cursos, questões, histórico importado) e progresso/resultado do usuário.
  // cb(lista) a cada mudança, só depois que todas as leituras responderam uma vez.
  // Devolve a função que desliga tudo.
  function observar(db, sess, cb) {
    const dados = { training: {}, quiz: {}, progress: {}, results: {}, imported: {} };
    const offs = [];
    let vivo = true, t = null, faltam = 0;
    const emitir = () => { if (!vivo || faltam > 0) return; clearTimeout(t); t = setTimeout(() => { try { cb(calcular(dados, sess)); } catch (e) { console.warn('[unilamic-pendentes]', e); } }, 150); };
    const ouvir = (path, fn) => {
      faltam++;
      let primeiro = true;
      const pronto = () => { if (primeiro) { primeiro = false; faltam--; } };
      const r = db.ref(path);
      const h = r.on('value', (sn) => { fn(sn.val()); pronto(); emitir(); }, () => { fn(null); pronto(); emitir(); });
      offs.push(() => r.off('value', h));
    };
    (async () => {
      const uid = sess.userId || (sess.login ? await db.ref(`${ROOT}/porLogin/${sess.login}`).once('value').then((s) => s.val()).catch(() => null) : null);
      if (!vivo) return;
      CATS.forEach(({ slug }) => {
        ouvir(`${ROOT}/${slug}/trainingData`, (v) => { dados.training[slug] = v || {}; });
        ouvir(`${ROOT}/${slug}/quizData`, (v) => { dados.quiz[slug] = v || {}; });
        ouvir(`${ROOT}/results/imported/${slug}`, (v) => { dados.imported[slug] = v || {}; });
      });
      if (uid) {
        ouvir(`${ROOT}/progress/byUser/${uid}`, (v) => { dados.progress = v || {}; });
        ouvir(`${ROOT}/results/byUser/${uid}`, (v) => { dados.results = v || {}; });
      }
    })();
    return () => { vivo = false; clearTimeout(t); offs.forEach((f) => f()); };
  }

  // Quantos contam para o alerta (sino/bolinha): curso encerrado fica na lista, mas não acende nada.
  const contaAlerta = (lista) => (lista || []).filter((c) => c.prazo !== 'closed').length;

  window.UniPendentes = { calcular, observar, contaAlerta, CATS };
})();
