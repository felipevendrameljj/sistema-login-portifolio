const userId = localStorage.getItem('userId');

function fetchExpenses() {
  fetch(`/expenses/${userId}`)
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#expensesTable tbody');
      tbody.innerHTML = '';
      if(data.length === 0){
        tbody.innerHTML = '<tr><td colspan="4">Nenhum gasto registrado</td></tr>';
        return;
      }
      data.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${e.category}</td><td>${e.description || ''}</td><td>R$ ${e.amount.toFixed(2)}</td><td>${e.date}</td>`;
        tbody.appendChild(tr);
      });
    });
}

function addExpense() {
  const category = document.getElementById('category').value;
  const description = document.getElementById('description').value;
  const amount = parseFloat(document.getElementById('amount').value);

  if(!category || !amount){
    alert('Preencha categoria e valor');
    return;
  }

  fetch('/expenses', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ user_id: userId, category, description, amount })
  })
  .then(res => res.json())
  .then(data => {
    alert(data.message);
    fetchExpenses();
    fetchSummary();
  });
}

function fetchSummary() {
  fetch(`/expenses-summary/${userId}`)
    .then(res => res.json())
    .then(data => {
      const ctx = document.getElementById('expensesChart').getContext('2d');
      const chartData = {
        labels: data.map(d => d.category),
        datasets: [{
          label: 'Gastos por Categoria',
          data: data.map(d => d.total),
          backgroundColor: ['#1877f2','#42b72a','#f02849','#f7b928','#8e44ad']
        }]
      };
      new Chart(ctx, {
        type: 'pie',
        data: chartData
      });
    });
}

// Inicializa
fetchExpenses();
fetchSummary();
