# COMERCIAL LAMIC — instruções para o Claude

Plano e decisões do sistema: [PLANO.md](PLANO.md). Tutoriais: [Tutorial.md](Tutorial.md).

## Tutoriais (Central de treinamento)

- O catálogo fica em `script/tutoriais.js` (fonte de verdade) e é descrito em `Tutorial.md`.
  O motor do passo a passo está em `script/tutorial.js` e o modo simulação em `script/simulacao.js`.
- **Depois de alterar uma tela ou fluxo coberto por um tutorial, pergunte ao usuário se pode
  atualizar o tutorial. Não atualize sem a resposta**: o processo pode ainda estar em
  desenvolvimento.
- Se a mudança remove ou renomeia um seletor usado como alvo de passo (id, `onclick`, `data-tut`,
  classe), avise quais tutoriais quebram, mesmo que o usuário não queira atualizar agora.
- Tela ou ação nova: sugira um tutorial e pergunte se deve ser criado.
- Ao atualizar: edite `script/tutoriais.js`, rode `node ferramentas/gerar-tutorial-md.js` para
  refazer o `Tutorial.md` e troque a data de revisão no topo dele.
- Toda gravação no banco deve passar por `DB.gravar`, `DB.mesclar` ou `DB.remover`
  (`script/firebase.js`): é o que o modo simulação intercepta. Gravar direto com `_db.ref(...)`
  furaria a simulação dos tutoriais.
