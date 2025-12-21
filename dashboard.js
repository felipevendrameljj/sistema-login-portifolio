const userName = localStorage.getItem('userName');
document.getElementById('userName').innerText = userName || "Usuário";

// Lista de gastos
let expenses = [];

// Função para adicionar gasto
function addExpense() {
  const desc = document.getElementById('desc').value;
  const value = parseFloat(document.getElementById('value').value);
  const category = document.getElementById('category').value;

  if(!desc || !value || isNaN(value)) {
    alert('Preencha todos os campos corretamente!');
    return;
  }

  const expense = { desc, value, category };
  expenses.push(expense);

  document.getElementById('desc').value = '';
  document.getElementById('value').value = '';

  updateTable();
  updateChart();
}

// Atualiza tabela
function updateTable() {
  const tbody = document.getElementById('expenseTable');
  tbody.innerHTML = '';
  expenses.forEach(exp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${exp.desc}</td><td>${exp.category}</td><td>R$ ${exp.value.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
}

// Atualiza gráfico
function updateChart() {
  const ctx = document.getElementById('expenseChart').getContext('2d');

  const categories = {};
  expenses.forEach(exp => {
    categories[exp.category] = (categories[exp.category] || 0) + exp.value;
  });

  const data = {
    labels: Object.keys(categories),
    datasets: [{
      label: 'Gastos',
      data: Object.values(categories),
      backgroundColor: ['#1877f2','#f28b82','#fbbc04','#34a853'],
    }]
  };

  if(window.myChart) window.myChart.destroy();
  window.myChart = new Chart(ctx, {
    type: 'pie',
    data,
  });
}

// Inicializa gráficos vazios
updateChart();
