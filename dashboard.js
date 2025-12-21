const user = JSON.parse(localStorage.getItem('loggedUser'));
if(!user) window.location.href='/';
else document.getElementById('userName').innerText=user.name;

function addTransaction(){
  const desc=document.getElementById('desc').value;
  const amount=parseFloat(document.getElementById('amount').value);
  if(!desc || isNaN(amount)) return alert('Preencha os campos corretamente');

  let transactions=JSON.parse(localStorage.getItem(`transactions_${user.email}`))||[];
  transactions.push({desc,amount});
  localStorage.setItem(`transactions_${user.email}`,JSON.stringify(transactions));

  document.getElementById('desc').value='';
  document.getElementById('amount').value='';
  renderTransactions();
}

function renderTransactions(){
  const transactions=JSON.parse(localStorage.getItem(`transactions_${user.email}`))||[];
  const list=document.getElementById('transactionList');
  list.innerHTML='';
  let balance=0;
  transactions.forEach(t=>{
    const li=document.createElement('li');
    li.innerHTML=`<span>${t.desc}</span><span>R$ ${t.amount.toFixed(2)}</span>`;
    list.appendChild(li);
    balance+=t.amount;
  });
  document.getElementById('balance').innerText=balance.toFixed(2);
}

function logout(){
  localStorage.removeItem('loggedUser');
  window.location.href='/';
}

renderTransactions();
