// ═══════════════════════════════════════════════════════════════
// faixas.js — Editor das regras de margem (valor único ou progressivo
// por faixa de custo total) e configuração própria da Particular
// ═══════════════════════════════════════════════════════════════
//
// Piso de margem, desconto de referência, desconto máximo e sugestão de margem aceitam um valor único
// ou faixas pelo custo total do exame (ver regraTab em calc.js):
//   faixas/{campo} = [{ ate: 100, v: .20 }, { ate: 500, v: .15 }, { v: .10 }]
// A primeira faixa começa em 0 e a última, sem limite, vale para todo custo acima.
// As tabelas guardam isso em tabelas/{id}; a Particular, em config/particular
// (piso e margemSugerida vazios = parâmetros gerais; tolerancia = pontos abaixo do alvo ainda aceitos).
let _ptTol = null;

const CAMPOS_REGRA = {
  piso:           { rotulo: 'Piso de margem',         icone: 'fa-shield-halved', dica: 'abaixo disso o preço é sinalizado' },
  descontoRef:    { rotulo: 'Desconto de referência', icone: 'fa-percent',       dica: 'sobre a Particular: atalho na edição' },
  descontoMax:    { rotulo: 'Desconto máximo',        icone: 'fa-ban',           ph: 'Sem limite', opcional: true,
    dica: 'maior desconto permitido sobre a Particular: acima disso o preço é sinalizado · vazio = sem limite' },
  margemSugerida: { rotulo: 'Sugestão de margem',     icone: 'fa-bullseye',      ph: 'Ex.: 40', opcional: true,
    dica: 'na edição, o botão "Sugestão de margem" calcula o preço que atinge esta margem (custo do perfil + imposto)' }
};

// Estado do editor aberto: campo → { v: fração | null, fx: null (valor único) | [{ ate, v }], …textos }
let _rg = {}, _rgRedesenhar = () => {};

// o: tabela ou configuração da Particular · padroes: { campo: valor quando não há nada gravado }
function iniciarRegras(o, padroes, textos = {}) {
  _rg = {};
  Object.entries(padroes).forEach(([campo, padrao]) => {
    const fx = faixasDe(o, campo).map(f => ({ ate: f.ate ?? null, v: f.v ?? 0 }));
    if (fx.length) fx[fx.length - 1].ate = null;
    _rg[campo] = { ...CAMPOS_REGRA[campo], ...textos[campo], v: o?.[campo] ?? padrao, fx: fx.length > 1 ? fx : null };
  });
}

function htmlRegra(campo) {
  const r = _rg[campo], p = v => v == null ? '' : +(v * 100).toFixed(2);
  const bt = `<button type="button" class="rg-bt ${r.fx ? 'on' : ''}" title="${r.fx ? 'Voltar ao valor único' : 'Configuração progressiva por faixa de custo total'}" onclick="alternarRegra('${campo}')"><i class="fa-solid fa-chart-line"></i></button>`;
  const corpo = !r.fx
    ? `<div class="inp"><input type="number" step="any" value="${p(r.v)}" placeholder="${esc(r.ph || '')}" oninput="_rg['${campo}'].v=this.value.trim()===''?null:(parseFloat(this.value)||0)/100"><span class="suf">%</span></div>`
    : `<div class="rg-fx">${r.fx.map((f, i) => {
        const de = i ? r.fx[i - 1].ate : 0, ult = i === r.fx.length - 1;
        return `<div class="rg-l">${ult ? `<span class="rg-de ult">acima de ${de != null ? fmt(de) : '…'}</span>`
            : `<span class="rg-de">de ${de != null ? fmt(de) : '…'} a</span>
              <div class="price-in"><span>R$</span><input type="number" step="0.01" min="0" value="${f.ate ?? ''}" oninput="_rg['${campo}'].fx[${i}].ate=this.value.trim()===''?null:parseFloat(this.value)" onchange="_rgRedesenhar()" onfocus="this.select()"></div>`}
          <span class="rg-eq">=</span>
          <div class="inp rg-p"><input type="number" step="any" value="${p(f.v)}" oninput="_rg['${campo}'].fx[${i}].v=(parseFloat(this.value)||0)/100" onfocus="this.select()"><span class="suf">%</span></div>
          ${ult ? '<span></span>' : `<button type="button" class="rg-x" title="Remover faixa" onclick="removerFaixa('${campo}',${i})"><i class="fa-solid fa-xmark"></i></button>`}</div>`;
      }).join('')}
      <button type="button" class="btn sm" onclick="adicionarFaixa('${campo}')"><i class="fa-solid fa-plus"></i>Adicionar faixa</button></div>`;
  return `<div class="field"><label><i class="fa-solid ${r.icone}"></i>${r.rotulo}${bt}</label>${corpo}
    <span class="hint">${r.fx ? 'Faixas pelo custo total do exame: começam em R$ 0 e a última vale para todo custo acima.' : r.dica}</span></div>`;
}

function alternarRegra(campo) {
  const r = _rg[campo];
  if (r.fx) { r.v = r.fx[0].v; r.fx = null; }
  else r.fx = [{ ate: 100, v: r.v ?? 0 }, { ate: null, v: r.v ?? 0 }];
  _rgRedesenhar();
}
// Nova faixa entra antes da última ("acima de")
function adicionarFaixa(campo) {
  const fx = _rg[campo].fx, ant = fx[fx.length - 2]?.ate;
  fx.splice(fx.length - 1, 0, { ate: ant ? ant * 2 : 100, v: fx[fx.length - 1].v });
  _rgRedesenhar();
}
function removerFaixa(campo, i) {
  const r = _rg[campo];
  r.fx.splice(i, 1);
  if (r.fx.length < 2) { r.v = r.fx[0].v; r.fx = null; }
  _rgRedesenhar();
}

// Mensagem do primeiro erro encontrado (null = tudo certo)
function validarRegras() {
  const teto = 1 - parametro('imposto');
  const limite = { piso: v => v >= 0 && v < teto, margemSugerida: v => v > 0 && v < teto, descontoRef: v => v >= 0 && v < 1, descontoMax: v => v > 0 && v < 1 };
  for (const [campo, r] of Object.entries(_rg)) {
    const ok = v => v != null && !isNaN(v) && limite[campo](v);
    if (!r.fx) {
      if (r.v == null && r.opcional) continue;
      if (!ok(r.v)) return `${r.rotulo} inválido`;
      continue;
    }
    let ant = 0;
    for (let i = 0; i < r.fx.length; i++) {
      const f = r.fx[i], ult = i === r.fx.length - 1;
      if (!ok(f.v)) return `${r.rotulo}: percentual inválido na faixa ${i + 1}`;
      if (ult) break;
      if (!(f.ate > ant)) return `${r.rotulo}: o limite da faixa ${i + 1} deve ser maior que ${fmt(ant)}`;
      ant = f.ate;
    }
  }
  const ref = _rg.descontoRef, max = _rg.descontoMax;
  if (ref && max && !ref.fx && !max.fx && max.v != null && max.v < ref.v) return 'Desconto máximo menor que o desconto de referência';
  return null;
}

// { campo: valor único (com faixas, o da primeira), …, faixas: { campo: [...] } | null }
function dadosRegras() {
  const arr = v => v == null ? null : Math.round(v * 10000) / 10000, dados = {}, faixas = {};
  Object.entries(_rg).forEach(([campo, r]) => {
    dados[campo] = arr(r.fx ? r.fx[0].v : r.v);
    if (r.fx) faixas[campo] = r.fx.map((f, i) => i === r.fx.length - 1 ? { v: arr(f.v) } : { ate: Math.round(f.ate * 100) / 100, v: arr(f.v) });
  });
  dados.faixas = Object.keys(faixas).length ? faixas : null;
  return dados;
}

// ── Particular: configuração própria ──────────────────────────
function abrirConfigParticular() {
  _ptTol = ESTADO.particular?.tolerancia || null;
  iniciarRegras(ESTADO.particular, { piso: null, margemSugerida: null }, {
    piso: { rotulo: 'Margem mínima', opcional: true, ph: String(+(parametro('margemMinima') * 100).toFixed(1)), dica: `abaixo disso o exame fica vermelho · vazio = padrão (${pct(parametro('margemMinima'))})` },
    margemSugerida: { rotulo: 'Margem alvo', ph: String(+(parametro('margemAlvo') * 100).toFixed(1)), dica: `base do preço sugerido · vazio = padrão (${pct(parametro('margemAlvo'))}) · setor com alvo próprio continua valendo` }
  });
  _rgRedesenhar = desenharConfigParticular;
  abrirGaveta({
    sobre: 'Tabela base', titulo: 'Configurar Particular', corpo: '<div id="pt-ed"></div>',
    rodape: `<span style="margin-right:auto"></span><button class="btn" onclick="fecharGaveta()">Cancelar</button>
      ${pode('tabelas', 'editar') ? `<button class="btn pri" onclick="gravarConfigParticular()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>` : ''}`
  });
  desenharConfigParticular();
}

function desenharConfigParticular() {
  const el = document.getElementById('pt-ed');
  if (!el) return;
  el.innerHTML = `<div class="form-col">
    <div class="alert x" style="margin:0"><i class="fa-solid fa-circle-info"></i><div>Vale só para a <b>Particular</b> (preço praticado dos exames) e para conveniados com base Particular. As outras tabelas têm a configuração delas em <b>Configurar</b>.</div></div>
    ${htmlRegra('piso')}${htmlRegra('margemSugerida')}
    <div class="field"><label><i class="fa-solid fa-arrows-left-right-to-line"></i>Tolerância de margem</label>
      <div class="inp"><input type="number" step="any" min="0" value="${_ptTol == null ? '' : +(_ptTol * 100).toFixed(2)}" placeholder="0" oninput="_ptTol=this.value.trim()===''?null:(parseFloat(this.value)||0)/100"><span class="suf">%</span></div>
      <span class="hint">margem até este tanto abaixo do alvo ainda conta como no alvo (ex.: alvo 50% e tolerância 2% = a partir de 48% não sinaliza) · o preço sugerido arredonda para baixo quando fica dentro dela · vazio = sem tolerância</span></div>
    <div class="hint"><i class="fa-solid fa-circle-info"></i> A Particular é a referência das outras tabelas, por isso não tem desconto de referência.</div>
  </div>`;
}

async function gravarConfigParticular() {
  const erro = validarRegras();
  if (erro) return toast(erro, 'erro');
  if (_ptTol != null && !(_ptTol >= 0 && _ptTol < 1)) return toast('Tolerância de margem inválida', 'erro');
  const dados = { ...dadosRegras(), tolerancia: _ptTol ? Math.round(_ptTol * 10000) / 10000 : null, atualizadoEm: DB.agora(), atualizadoPor: usuarioAtual().nome };
  await DB.gravar(CAMINHOS.particular, dados);
  ESTADO.particular = { ...dados, atualizadoEm: Date.now() };
  registrar('tabelas', 'Particular configurada (margem mínima, alvo e tolerância)', { depois: dados });
  fecharGaveta();
  renderTela();
  toast('Configuração da Particular salva');
}
