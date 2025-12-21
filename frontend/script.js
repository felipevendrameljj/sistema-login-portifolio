function toggleForms() {
  document.getElementById('registerForm').classList.toggle('hidden');
  document.getElementById('loginForm').classList.toggle('hidden');
}

function register() {
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  fetch('/register', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({name,email,password})
  })
  .then(res => res.json())
  .then(data => {
    const msgEl = document.getElementById('msg');
    msgEl.innerText = data.message;
    msgEl.style.color = data.message.includes('sucesso') ? 'green' : '#e74c3c';
  })
  .catch(()=>{document.getElementById('msg').innerText='Erro ao conectar ao servidor';});
}

function login() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  fetch('/login', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({email,password})
  })
  .then(res=>res.json())
  .then(data=>{
    const msgEl = document.getElementById('loginMsg');
    if(data.user){
      localStorage.setItem('loggedUser',JSON.stringify(data.user));
      window.location.href='dashboard.html';
    }else{
      msgEl.innerText=data.message;
      msgEl.style.color='#e74c3c';
    }
  })
  .catch(()=>{document.getElementById('loginMsg').innerText='Erro ao conectar ao servidor';});
}
