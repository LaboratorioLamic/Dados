// ===== js/services/viacep.js =====
(function () {
'use strict';

/**
 * Consulta de CEP no ViaCEP.
 *
 * Isolado num arquivo só para poder ser trocado ou removido sem tocar
 * no formulário. Falha de rede nunca bloqueia o cadastro — o form
 * continua 100% editável na mão.
 */

var apenasDigitos = NS.domain.telefone.apenasDigitos;
var formatarCep = NS.domain.enderecoUtils.formatarCep;
const ENDPOINT = 'https://viacep.com.br/ws';
const TIMEOUT = 8000;

/**
 * @returns {Promise<{ok: boolean, dados?: object, motivo?: string}>}
 */
async function buscarCep(cepBruto) {
    const cep = apenasDigitos(cepBruto);
    if (cep.length !== 8) return { ok: false, motivo: 'incompleto' };

    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TIMEOUT);

    try {
        const resposta = await fetch(`${ENDPOINT}/${cep}/json/`, { signal: controle.signal });
        if (!resposta.ok) return { ok: false, motivo: 'rede' };

        const dados = await resposta.json();

        // O ViaCEP devolve HTTP 200 mesmo para CEP inexistente,
        // sinalizando com { erro: true } no corpo.
        if (dados?.erro) return { ok: false, motivo: 'inexistente' };

        return {
            ok: true,
            dados: {
                cep: formatarCep(dados.cep || cep),
                rua: dados.logradouro || '',
                bairro: dados.bairro || '',
                cidade: dados.localidade || '',
                estado: (dados.uf || '').toUpperCase()
            }
        };
    } catch (erro) {
        return { ok: false, motivo: erro.name === 'AbortError' ? 'timeout' : 'rede' };
    } finally {
        clearTimeout(timer);
    }
}

const MENSAGENS = {
    inexistente: 'CEP não encontrado. Preencha o endereço manualmente.',
    rede: 'Não foi possível consultar o CEP. Preencha manualmente.',
    timeout: 'A consulta de CEP demorou demais. Preencha manualmente.'
};

/** Máscara: dígitos, corte em 8, hífen após o 5º. Sem rede. */
function aplicarMascaraCep(input) {
    if (!input) return;
    input.addEventListener('input', () => {
        const fim = input.selectionStart === input.value.length;
        input.value = formatarCep(input.value);
        if (fim) input.setSelectionRange(input.value.length, input.value.length);
    });
}

/**
 * Liga a busca automática ao formulário.
 *
 * Regras que evitam bug de campo:
 *  - dispara no blur, não a cada tecla;
 *  - guard silencioso enquanto o CEP está parcial;
 *  - `|| valorAtual` nunca destrói o que o usuário já digitou
 *    (CEP de cidade inteira vem sem logradouro);
 *  - o foco pousa no próximo campo que ainda precisa de humano.
 */
function ligarBuscaAutomatica(form, { aoFalhar, aoBuscar } = {}) {
    const cepInput = form.querySelector('[name="cep"]');
    if (!cepInput) return;

    aplicarMascaraCep(cepInput);

    const campo = nome => form.querySelector(`[name="${nome}"]`);
    const afetados = ['rua', 'bairro', 'cidade', 'estado'];

    const ocupado = estado => {
        [cepInput, ...afetados.map(campo)].forEach(el => {
            if (!el) return;
            el.readOnly = estado;
            el.style.opacity = estado ? '.6' : '';
        });
    };

    cepInput.addEventListener('blur', async () => {
        const cep = apenasDigitos(cepInput.value);
        if (cep.length !== 8) return;

        ocupado(true);
        aoBuscar?.(true);

        const resultado = await buscarCep(cep);

        ocupado(false);
        aoBuscar?.(false);

        if (!resultado.ok) {
            if (resultado.motivo !== 'incompleto') {
                aoFalhar?.(MENSAGENS[resultado.motivo] || MENSAGENS.rede, resultado.motivo);
            }
            return;
        }

        const { dados } = resultado;

        // Fallback em cada campo: a API não apaga digitação humana.
        const rua = campo('rua');
        const bairro = campo('bairro');
        const cidade = campo('cidade');
        const estado = campo('estado');

        if (rua) rua.value = dados.rua || rua.value;
        if (bairro) bairro.value = dados.bairro || bairro.value;
        if (cidade) cidade.value = dados.cidade || cidade.value;
        if (estado) estado.value = dados.estado || estado.value;

        // Cursor no próximo campo que ainda precisa de humano.
        if (dados.rua) campo('numero')?.focus();
        else rua?.focus();
    });
}

NS.services = NS.services || {};
NS.services.viacep = { MENSAGENS, aplicarMascaraCep, buscarCep, ligarBuscaAutomatica };
})();
