// Alternar entre login e cadastro
function toggleForm() {
  document.getElementById('register-box').style.display = 
    document.getElementById('register-box').style.display === 'none' ? 'flex' : 'none';
  document.getElementById('login-box').style.display = 
    document.getElementById('login-box').style.display === 'none' ? 'flex' : 'none';
}

// Registro
function register() {
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  })
  .then(res => res.json())
  .then(data => {
    document.getElementById('msg').innerText = data.message;
  })
  .catch(() => document.getElementById('msg').innerText = 'Erro ao conectar ao servidor');
}

// Login
function login() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  .then(res => res.json())
  .then(data => {
    if(data.user) {
      // Salvar user_id no localStorage
      localStorage.setItem('userId', data.user.id);
      window.location.href = 'dashboard.html';
    } else {
      document.getElementById('loginMsg').innerText = data.message;
    }
  })
  .catch(() => document.getElementById('loginMsg').innerText = 'Erro ao conectar ao servidor');
}

// Adicionar gasto
function addExpense() {
  const user_id = localStorage.getItem('userId');
  const category = document.getElementById('category').value;
  const description = document.getElementById('description').value;
  const amount = parseFloat(document.getElementById('amount').value);

  fetch('/expense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, category, description, amount })
  })
  .then(res => res.json())
  .then(() => loadExpenses());
}

// Carregar gastos e atualizar tabela e gráfico
function loadExpenses() {
  const user_id = localStorage.getItem('userId');
  fetch(`/expenses/${user_id}`)
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#expensesTable tbody');
      tbody.innerHTML = '';
      const chartData = {};

      data.forEach(exp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${exp.category}</td><td>${exp.description || ''}</td><td>${exp.amount.toFixed(2)}</td><td>${exp.date}</td>`;
        tbody.appendChild(tr);

        chartData[exp.category] = (chartData[exp.category] || 0) + exp.amount;
      });

      // Atualizar gráfico
      const ctx = document.getElementById('expenseChart').getContext('2d');
      if(window.expenseChart) window.expenseChart.destroy();
      window.expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: Object.keys(chartData),
          datasets: [{ data: Object.values(chartData), backgroundColor: ['#1877f2','#42b72a','#f02849','#f7b928'] }]
        }
      });
    });
}

// Carregar gastos ao abrir o dashboard
if(document.querySelector('#expensesTable')) loadExpenses();
