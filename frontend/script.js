// script.js
import { auth, db, googleProvider, facebookProvider, githubProvider } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { collection, addDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Alternar login/cadastro
export function toggleForm() {
  document.getElementById('register-box').style.display = 
    document.getElementById('register-box').style.display === 'none' ? 'flex' : 'none';
  document.getElementById('login-box').style.display = 
    document.getElementById('login-box').style.display === 'none' ? 'flex' : 'none';
}

// Registro email/senha
export async function register() {
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await addDoc(collection(db, "users"), { uid: userCredential.user.uid, name, email });
    alert("Usuário cadastrado com sucesso!");
  } catch(e) { alert(e.message); }
}

// Login email/senha
export async function login() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem('uid', userCredential.user.uid);
    window.location.href = 'dashboard.html';
  } catch(e) { alert(e.message); }
}

// Login social
export async function socialLogin(providerName) {
  let provider;
  if(providerName==='google') provider = googleProvider;
  else if(providerName==='facebook') provider = facebookProvider;
  else if(providerName==='github') provider = githubProvider;

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("uid","==",user.uid));
    const docs = await getDocs(q);
    if(docs.empty) await addDoc(usersRef, { uid:user.uid, name:user.displayName, email:user.email });
    localStorage.setItem('uid', user.uid);
    window.location.href = 'dashboard.html';
  } catch(e) { alert(e.message); }
}

// Adicionar gasto
export async function addExpense() {
  const uid = localStorage.getItem('uid');
  const category = document.getElementById('category').value;
  const description = document.getElementById('description').value;
  const amount = parseFloat(document.getElementById('amount').value);

  await addDoc(collection(db, "expenses"), { uid, category, description, amount, date: serverTimestamp() });
  loadExpenses();
}

// Carregar gastos
export async function loadExpenses() {
  const uid = localStorage.getItem('uid');
  const expensesRef = collection(db, "expenses");
  const q = query(expensesRef, where("uid","==",uid));
  const snapshot = await getDocs(q);

  const tbody = document.querySelector('#expensesTable tbody');
  tbody.innerHTML = '';
  const chartData = {};

  snapshot.forEach(doc => {
    const exp = doc.data();
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${exp.category}</td><td>${exp.description||''}</td><td>${exp.amount}</td><td>${exp.date?.toDate ? exp.date.toDate().toLocaleString() : ''}</td>`;
    tbody.appendChild(tr);
    chartData[exp.category] = (chartData[exp.category] || 0) + exp.amount;
  });

  // Chart.js
  const ctx = document.getElementById('expenseChart').getContext('2d');
  if(window.expenseChart) window.expenseChart.destroy();
  window.expenseChart = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:Object.keys(chartData), datasets:[{ data:Object.values(chartData), backgroundColor:['#1877f2','#42b72a','#f02849','#f7b928'] }] }
  });
}

// Executar ao abrir dashboard
if(document.querySelector('#expensesTable')) loadExpenses();
