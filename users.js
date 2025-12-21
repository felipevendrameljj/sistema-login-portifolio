fetch('/users')
  .then(res => res.json())
  .then(users => {
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${u.id}</td><td>${u.name}</td><td>${u.email}</td>`;
      tbody.appendChild(tr);
    });
  })
  .catch(err => console.error('Erro ao carregar usuários:', err));
