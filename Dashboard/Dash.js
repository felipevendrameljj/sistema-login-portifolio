import { auth, db } from "../FirebaseConfig/Index.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = ["#58a6ff", "#238636", "#f85149", "#d29922", "#a371f7", "#8b949e"];

let currentUser = null;
let chart = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return location.replace("../Login/Index.html");
  currentUser = user;
  $("userName").textContent = user.displayName || user.email;

  const q = query(collection(db, "expenses"), where("uid", "==", user.uid));
  onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const time = (x) => x.date?.toMillis?.() ?? Date.now();
    items.sort((a, b) => time(b) - time(a));
    render(items);
  }, () => alert("Não foi possível carregar os gastos."));
});

$("btnLogout").onclick = () => signOut(auth);

$("btnAdd").onclick = async () => {
  const description = $("description").value.trim();
  const category = $("category").value;
  const amount = $("amount").valueAsNumber;

  if (!description || !Number.isFinite(amount) || amount <= 0) {
    return alert("Informe uma descrição e um valor maior que zero.");
  }
  try {
    await addDoc(collection(db, "expenses"), {
      uid: currentUser.uid, category, description, amount, date: serverTimestamp()
    });
    $("description").value = "";
    $("amount").value = "";
  } catch {
    alert("Erro ao salvar o gasto.");
  }
};

function render(items) {
  const tbody = $("expensesBody");
  tbody.replaceChildren();
  const totals = {};
  let sum = 0;

  items.forEach((e) => {
    const tr = document.createElement("tr");
    const cells = [
      e.category,
      e.description,
      brl.format(e.amount),
      e.date?.toDate ? e.date.toDate().toLocaleDateString("pt-BR") : "…"
    ];
    cells.forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text; // textContent evita XSS
      tr.appendChild(td);
    });

    const td = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Excluir";
    btn.className = "danger";
    btn.onclick = async () => {
      if (confirm("Excluir este gasto?")) await deleteDoc(doc(db, "expenses", e.id));
    };
    td.appendChild(btn);
    tr.appendChild(td);
    tbody.appendChild(tr);

    totals[e.category] = (totals[e.category] || 0) + e.amount;
    sum += e.amount;
  });

  $("total").textContent = brl.format(sum);
  $("empty").hidden = items.length > 0;
  drawChart(totals);
}

function drawChart(totals) {
  chart?.destroy();
  chart = new Chart($("expenseChart"), {
    type: "doughnut",
    data: {
      labels: Object.keys(totals),
      datasets: [{ data: Object.values(totals), backgroundColor: COLORS }]
    },
    options: { plugins: { legend: { labels: { color: "#fff" } } } }
  });
}