fetch('/users')
  .then(res => res.json())
  .then(users => {
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '';

    if(users.length === 0){
      tbody.innerHTML = '<tr><td colspan="3">Nenhum usuário encontrado</td></tr>';
      return;
    }

    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${u.id}</td><td>${u.name}</td><td>${u.email}</td>`;
      tbody.appendChild(tr);
    });
  })
  .catch(err => {
    console.error('Erro ao carregar usuários:', err);
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '<tr><td colspan="3">Erro ao carregar usuários</td></tr>';
  });
