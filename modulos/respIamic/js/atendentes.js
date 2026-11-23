// Atendentes e filtros dinâmicos da tabela

// FETCH ATENDENTES
async function loadAtendentes() {
    try {
        const response = await fetch("https://script.google.com/macros/s/AKfycbzUd6efhfzkCmYd88_eIIL6dGIQxIINsw-6Y_qM3PRemUbZ06obtF9xKY1S8WRfvXyq9Q/exec");
        atendentesList = await response.json();
        updateFilterDropdowns();
        populateRegAttendentesList();
    } catch (e) { console.error("Erro ao carregar atendentes", e); }
}

// Sugestões de paciente são lidas direto de `appointments` pelo popover (ver filtrarPacientes em utils.js)
function updateDatalists() {}

function updateFilterDropdowns() {
    const agenda = currentAgenda();
    // O 3º filtro é Substrato nas agendas com exame e Bairro nas domiciliares
    const porBairro = temCampo('endereco', agenda);
    const campoTerceiro = porBairro ? 'bairro' : 'substrato';
    const rotuloTerceiro = porBairro ? 'Filtrar por Bairro' : 'Filtrar por Substrato';

    const search = normalizeStr(document.getElementById('filter-search').value);
    const atendente = document.getElementById('filter-atendente').value;
    const substrato = document.getElementById('filter-substrato').value;
    const status = document.getElementById('filter-status').value;

    // Para cada filtro, calcular os dados base sem considerar o filtro atual
    // Filtro de atendente: considerar busca, substrato e status
    let filteredForAtendente = appointments.filter(a => {
        const matchSearch = !search || normalizeStr(a.paciente).includes(search) || normalizeStr(a.pedido).includes(search);
        const matchSubstrato = !substrato || a[campoTerceiro] === substrato;
        const matchStatus = !status || a.status === status;
        return matchSearch && matchSubstrato && matchStatus;
    });
    
    // Filtro de substrato: considerar busca, atendente e status
    let filteredForSubstrato = appointments.filter(a => {
        const matchSearch = !search || normalizeStr(a.paciente).includes(search) || normalizeStr(a.pedido).includes(search);
        const matchAtendente = !atendente || a.atendente === atendente;
        const matchStatus = !status || a.status === status;
        return matchSearch && matchAtendente && matchStatus;
    });
    
    // Filtro de status: considerar busca, atendente e substrato
    let filteredForStatus = appointments.filter(a => {
        const matchSearch = !search || normalizeStr(a.paciente).includes(search) || normalizeStr(a.pedido).includes(search);
        const matchAtendente = !atendente || a.atendente === atendente;
        const matchSubstrato = !substrato || a[campoTerceiro] === substrato;
        return matchSearch && matchAtendente && matchSubstrato;
    });
    
    // Atualizar filtro de atendente
    const atendenteFilter = document.getElementById('filter-atendente');
    const uniqueAtendentes = [...new Set(filteredForAtendente.map(a => a.atendente))];
    atendenteFilter.innerHTML = '<option value="">Filtrar por Atendente</option>' + 
        uniqueAtendentes.map(name => `<option value="${name}">${name}</option>`).join('');
    
    if (atendente && !uniqueAtendentes.includes(atendente)) {
        atendenteFilter.value = '';
    } else {
        atendenteFilter.value = atendente;
    }

    // Atualizar 3º filtro (substrato ou bairro)
    const substratoFilter = document.getElementById('filter-substrato');
    const uniqueSubstratos = [...new Set(filteredForSubstrato.map(a => a[campoTerceiro]).filter(Boolean))].sort();
    substratoFilter.innerHTML = `<option value="">${rotuloTerceiro}</option>` +
        uniqueSubstratos.map(sub => `<option value="${sub}">${sub}</option>`).join('');
    
    if (substrato && !uniqueSubstratos.includes(substrato)) {
        substratoFilter.value = '';
    } else {
        substratoFilter.value = substrato;
    }

    // Atualizar filtro de status
    const statusFilter = document.getElementById('filter-status');
    const uniqueStatuses = [...new Set(filteredForStatus.map(a => a.status))];
    statusFilter.innerHTML = '<option value="">Filtrar por Status</option>' + 
        uniqueStatuses.map(status => `<option value="${status}">${status}</option>`).join('');
    
    if (status && !uniqueStatuses.includes(status)) {
        statusFilter.value = '';
    } else {
        statusFilter.value = status;
    }
}
