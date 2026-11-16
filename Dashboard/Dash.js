import { auth, db, functions } from "../FirebaseConfig/Index.js";
import {
  EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const $ = (id) => document.getElementById(id);
const KINDS = ["income", "expense", "charge"];
const CATEGORIES = [
  "Vendas", "Serviços", "Salário", "Alimentação", "Moradia", "Transporte",
  "Contas", "Saúde", "Educação", "Lazer", "Outros"
];
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

let currentUser = null;
let entries = [];
let editingId = null;
let stopEntriesListener = null;

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function setStatus(message, type = "") {
  const status = $("statusMessage");
  status.textContent = message;
  status.className = `status-message${type ? ` ${type}` : ""}`;
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function makeCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  return cell;
}

function kindLabel(kind) {
  return { income: "Entrada", expense: "Saída", charge: "Cobrança" }[kind] || "Lançamento";
}

function emailStatusLabel(entry) {
  if (entry.paymentEmailStatus === "sent") return "Confirmação enviada";
  if (entry.paymentEmailStatus === "failed") return "Falha no envio";
  if (entry.paymentEmailStatus === "sending") {
    const lockIsStale = !Number.isFinite(entry.paymentEmailLockAt)
      || Date.now() - entry.paymentEmailLockAt >= 5 * 60 * 1000;
    return lockIsStale ? "Envio interrompido" : "Enviando confirmação";
  }
  return "Aguardando confirmação";
}

function canRetryPaymentEmail(entry) {
  if (entry.paymentEmailStatus === "failed") return true;
  return entry.paymentEmailStatus === "sending"
    && (!Number.isFinite(entry.paymentEmailLockAt)
      || Date.now() - entry.paymentEmailLockAt >= 5 * 60 * 1000);
}

function render() {
  const search = $("searchEntries").value.trim().toLocaleLowerCase("pt-BR");
  const kindFilter = $("filterKind").value;
  const statusFilter = $("filterStatus").value;
  const filtered = entries.filter((entry) => {
    const searchText = [
      entry.description, entry.category, entry.counterpartyName, entry.counterpartyEmail, entry.notes
    ].join(" ").toLocaleLowerCase("pt-BR");
    const matchesSearch = searchText.includes(search);
    const matchesKind = !kindFilter || entry.kind === kindFilter;
    const matchesStatus = !statusFilter
      || (statusFilter === "pending" && entry.kind === "charge" && entry.status === "pending")
      || (statusFilter === "paid" && entry.kind === "charge" && entry.status === "paid");
    return matchesSearch && matchesKind && matchesStatus;
  });

  const month = today().slice(0, 7);
  const incomeCents = entries.reduce((sum, entry) => {
    const isReceivedCharge = entry.kind === "charge" && entry.status === "paid" && entry.paymentDate?.startsWith(month);
    const isIncome = entry.kind === "income" && entry.date?.startsWith(month);
    return sum + (isReceivedCharge || isIncome ? entry.amountCents : 0);
  }, 0);
  const expenseCents = entries.reduce((sum, entry) => (
    sum + (entry.kind === "expense" && entry.date?.startsWith(month) ? entry.amountCents : 0)
  ), 0);
  const openCharges = entries.filter((entry) => entry.kind === "charge" && entry.status === "pending");
  const openChargeCents = openCharges.reduce((sum, entry) => sum + entry.amountCents, 0);
  $("monthlyIncome").textContent = currency.format(incomeCents / 100);
  $("monthlyExpenses").textContent = currency.format(expenseCents / 100);
  $("monthlyBalance").textContent = currency.format((incomeCents - expenseCents) / 100);
  $("monthlyBalance").classList.toggle("negative-balance", incomeCents < expenseCents);
  $("openCharges").textContent = currency.format(openChargeCents / 100);
  $("openChargeCount").textContent = `${openCharges.length} ${openCharges.length === 1 ? "cobrança" : "cobranças"}`;
  $("visibleCount").textContent = `${filtered.length} ${filtered.length === 1 ? "item" : "itens"}`;

  const body = $("entriesBody");
  body.replaceChildren();
  for (const entry of filtered) {
    const row = document.createElement("tr");
    const displayDate = entry.kind === "charge" && entry.status === "paid"
      ? entry.paymentDate
      : (entry.kind === "charge" ? entry.dueDate : entry.date);
    row.appendChild(makeCell(formatDate(displayDate), "date-cell"));

    const kindCell = document.createElement("td");
    const kindBadge = document.createElement("span");
    kindBadge.className = `kind-badge kind-${entry.kind}`;
    kindBadge.textContent = kindLabel(entry.kind);
    kindCell.appendChild(kindBadge);
    row.appendChild(kindCell);

    const descriptionCell = document.createElement("td");
    const description = document.createElement("strong");
    description.className = "table-entry-name";
    description.textContent = entry.description;
    descriptionCell.appendChild(description);
    const detailText = entry.kind === "charge"
      ? `${entry.counterpartyName} · vence ${formatDate(entry.dueDate)}`
      : [entry.category, entry.counterpartyName].filter(Boolean).join(" · ");
    const detail = document.createElement("span");
    detail.className = "table-entry-description";
    detail.textContent = detailText || entry.category;
    descriptionCell.appendChild(detail);
    row.appendChild(descriptionCell);

    const amountClass = entry.kind === "expense" ? "amount-expense" : "amount-income";
    row.appendChild(makeCell(
      `${entry.kind === "expense" ? "−" : "+"} ${currency.format(entry.amountCents / 100)}`,
      `amount-cell ${amountClass}`
    ));

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    const isOverdue = entry.kind === "charge" && entry.status === "pending" && entry.dueDate < today();
    statusBadge.className = `transaction-badge ${isOverdue ? "transaction-overdue" : (entry.status === "pending" ? "transaction-pending" : "transaction-paid")}`;
    statusBadge.textContent = isOverdue
      ? "Atrasada"
      : (entry.status === "pending" ? "Em aberto" : (entry.kind === "charge" ? "Paga" : "Concluído"));
    statusCell.appendChild(statusBadge);
    if (entry.kind === "charge" && entry.status === "paid") {
      const emailState = document.createElement("span");
      const canRetry = canRetryPaymentEmail(entry);
      emailState.className = `email-state${canRetry ? " email-state-error" : ""}`;
      emailState.textContent = emailStatusLabel(entry);
      statusCell.appendChild(emailState);
    }
    row.appendChild(statusCell);

    const actions = document.createElement("td");
    actions.className = "actions-cell";
    if (entry.kind === "charge" && entry.status === "pending") {
      const paidButton = document.createElement("button");
      paidButton.type = "button";
      paidButton.className = "text-button";
      paidButton.textContent = "Marcar paga";
      paidButton.setAttribute("aria-label", `Marcar cobrança ${entry.description} como paga`);
      paidButton.addEventListener("click", () => markChargePaid(entry));
      actions.appendChild(paidButton);
    } else if (entry.kind === "charge" && entry.status === "paid" && canRetryPaymentEmail(entry)) {
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "text-button";
      retryButton.textContent = "Reenviar e-mail";
      retryButton.setAttribute("aria-label", `Reenviar confirmação para ${entry.counterpartyName}`);
      retryButton.addEventListener("click", () => retryPaymentEmail(entry, retryButton));
      actions.appendChild(retryButton);
    }

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "text-button";
    editButton.textContent = "Editar";
    editButton.setAttribute("aria-label", `Editar ${entry.description}`);
    editButton.addEventListener("click", () => beginEdit(entry));
    actions.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "text-button text-button-danger";
    deleteButton.textContent = "Excluir";
    deleteButton.setAttribute("aria-label", `Excluir ${entry.description}`);
    deleteButton.addEventListener("click", () => removeEntry(entry));
    actions.appendChild(deleteButton);
    row.appendChild(actions);
    body.appendChild(row);
  }

  $("emptyState").hidden = filtered.length !== 0;
  if (filtered.length === 0 && entries.length > 0) {
    $("emptyTitle").textContent = "Nenhum resultado encontrado";
    $("emptyDescription").textContent = "Tente ajustar sua busca ou os filtros.";
  } else {
    $("emptyTitle").textContent = "Nenhum lançamento cadastrado";
    $("emptyDescription").textContent = "Registre sua primeira entrada, saída ou cobrança.";
  }
}

function syncConditionalFields() {
  const isCharge = $("entryKind").value === "charge";
  const isPaid = isCharge && $("chargeStatus").value === "paid";
  $("counterpartyFields").hidden = false;
  $("chargeFields").hidden = !isCharge;
  $("paymentDateField").hidden = !isPaid;
  $("counterpartyName").required = isCharge;
  $("counterpartyEmail").required = isCharge;
  $("dueDate").required = isCharge;
  $("paymentDate").required = isPaid;
  $("counterpartyNameLabel").textContent = isCharge
    ? "Nome do devedor"
    : ($("entryKind").value === "income" ? "Origem (opcional)" : "Beneficiário (opcional)");
  $("counterpartyEmailLabel").textContent = isCharge ? "E-mail do devedor" : "E-mail (opcional)";
  $("counterpartyName").placeholder = isCharge ? "Nome completo" : "Pessoa ou empresa";
  $("counterpartyEmail").placeholder = isCharge ? "devedor@exemplo.com" : "contato@exemplo.com";
  $("entryDateLabel").textContent = isCharge ? "Data da cobrança" : "Data do lançamento";
  if (isPaid && !$("paymentDate").value) $("paymentDate").value = today();
}

function beginEdit(entry) {
  editingId = entry.id;
  $("entryKind").value = entry.kind;
  $("entryKind").disabled = true;
  $("entryDescription").value = entry.description;
  $("entryCategory").value = entry.category;
  $("entryAmount").value = (entry.amountCents / 100).toFixed(2);
  $("entryDate").value = entry.date;
  $("counterpartyName").value = entry.counterpartyName || "";
  $("counterpartyEmail").value = entry.counterpartyEmail || "";
  $("dueDate").value = entry.dueDate || "";
  $("chargeStatus").value = entry.status;
  $("chargeStatus").disabled = entry.kind === "charge" && entry.status === "paid";
  $("paymentDate").value = entry.paymentDate || "";
  $("entryNotes").value = entry.notes || "";
  $("formTitle").textContent = "Editar lançamento";
  $("btnSave").textContent = "Salvar alterações";
  $("btnCancelEdit").hidden = false;
  syncConditionalFields();
  $("entryDescription").focus();
}

function resetForm() {
  editingId = null;
  $("entryForm").reset();
  $("entryKind").disabled = false;
  $("chargeStatus").disabled = false;
  $("entryDate").value = today();
  $("formTitle").textContent = "Novo lançamento";
  $("btnSave").textContent = "Salvar lançamento";
  $("btnCancelEdit").hidden = true;
  syncConditionalFields();
}

function getEntryInput() {
  const kind = $("entryKind").value;
  const description = $("entryDescription").value.trim();
  const category = $("entryCategory").value;
  const amount = $("entryAmount").valueAsNumber;
  const amountCents = Math.round(amount * 100);
  const date = $("entryDate").value;
  const isCharge = kind === "charge";
  const status = isCharge ? $("chargeStatus").value : "paid";
  const dueDate = isCharge ? $("dueDate").value : "";
  const paymentDate = isCharge && status === "paid" ? $("paymentDate").value : "";
  const counterpartyName = $("counterpartyName").value.trim();
  const counterpartyEmail = $("counterpartyEmail").value.trim();
  const notes = $("entryNotes").value.trim();

  if (!KINDS.includes(kind)) throw new Error("Selecione um tipo de lançamento válido.");
  if (!description || description.length > 140) throw new Error("Informe uma descrição com até 140 caracteres.");
  if (!CATEGORIES.includes(category)) throw new Error("Selecione uma categoria válida.");
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("Informe um valor válido, maior que zero.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Informe a data do lançamento.");
  if (isCharge) {
    if (!counterpartyName || !counterpartyEmail) throw new Error("Informe o nome e o e-mail do devedor.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Informe a data de vencimento.");
    if (status === "paid" && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      throw new Error("Informe a data em que o pagamento foi efetuado.");
    }
  }
  if (notes.length > 1000) throw new Error("As informações adicionais devem ter até 1.000 caracteres.");

  return {
    kind, description, category, amountCents, date,
    dueDate, paymentDate, status, counterpartyName, counterpartyEmail, notes
  };
}

async function saveEntry(event) {
  event.preventDefault();
  if (!currentUser) {
    setStatus("Sua sessão expirou. Entre novamente para continuar.", "error");
    return;
  }

  let entry;
  try {
    entry = getEntryInput();
  } catch (error) {
    setStatus(error.message, "error");
    return;
  }

  const button = $("btnSave");
  button.disabled = true;
  setStatus(editingId ? "Salvando alterações..." : "Salvando lançamento...");
  try {
    if (editingId) {
      await updateDoc(doc(db, "transactions", editingId), {
        ...entry,
        updatedAt: serverTimestamp()
      });
      setStatus("Lançamento atualizado com sucesso.", "success");
    } else {
      await addDoc(collection(db, "transactions"), {
        ...entry,
        uid: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setStatus(entry.kind === "charge" && entry.status === "paid"
        ? "Cobrança registrada como paga. A confirmação será enviada ao devedor."
        : "Lançamento cadastrado com sucesso.", "success");
    }
    resetForm();
  } catch (error) {
    console.error("Falha ao salvar lançamento no Firestore:", error);
    setStatus("Não foi possível salvar. Verifique sua conexão e as regras do Firestore e tente novamente.", "error");
  } finally {
    button.disabled = false;
  }
}

async function markChargePaid(entry) {
  if (!confirm(`Confirmar que "${entry.description}" foi paga por ${entry.counterpartyName}?`)) return;
  try {
    await updateDoc(doc(db, "transactions", entry.id), {
      status: "paid",
      paymentDate: today(),
      updatedAt: serverTimestamp()
    });
    setStatus("Pagamento registrado. A confirmação será enviada ao devedor.", "success");
  } catch (error) {
    console.error("Falha ao registrar pagamento:", error);
    setStatus("Não foi possível registrar o pagamento. Verifique sua conexão e as regras do Firestore.", "error");
  }
}

async function retryPaymentEmail(entry, button) {
  button.disabled = true;
  setStatus("Solicitando novo envio da confirmação...");
  try {
    await httpsCallable(functions, "retryPaymentConfirmation")({ transactionId: entry.id });
    setStatus("Solicitação registrada. O status do envio será atualizado em instantes.", "success");
  } catch (error) {
    console.error("Falha ao solicitar reenvio da confirmação:", error);
    setStatus("Não foi possível reenviar o e-mail. Verifique a configuração do Firebase e do SMTP.", "error");
  } finally {
    button.disabled = false;
  }
}

async function removeEntry(entry) {
  if (!confirm(`Excluir o lançamento "${entry.description}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await deleteDoc(doc(db, "transactions", entry.id));
    if (editingId === entry.id) resetForm();
    setStatus("Lançamento excluído.", "success");
  } catch (error) {
    console.error("Falha ao excluir lançamento no Firestore:", error);
    setStatus("Não foi possível excluir o lançamento. Tente novamente.", "error");
  }
}

$("entryForm").addEventListener("submit", saveEntry);
$("entryKind").addEventListener("change", syncConditionalFields);
$("chargeStatus").addEventListener("change", syncConditionalFields);
$("btnCancelEdit").addEventListener("click", resetForm);
$("searchEntries").addEventListener("input", render);
$("filterKind").addEventListener("change", render);
$("filterStatus").addEventListener("change", render);
$("btnLogout").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Falha ao encerrar sessão:", error);
    setStatus("Não foi possível sair agora. Tente novamente.", "error");
  }
});

const deleteAccountDialog = $("deleteAccountDialog");
const deleteAccountForm = $("deleteAccountForm");
const deleteAccountConfirmation = $("deleteAccountConfirmation");
const deleteAccountPassword = $("deleteAccountPassword");
const deleteAccountSubmit = $("btnConfirmDelete");

$("btnOpenDeleteAccount").addEventListener("click", () => {
  deleteAccountForm.reset();
  deleteAccountSubmit.disabled = true;
  $("deleteAccountMessage").textContent = "";
  deleteAccountDialog.showModal();
  deleteAccountPassword.focus();
});

$("btnCancelDelete").addEventListener("click", () => deleteAccountDialog.close());
deleteAccountDialog.addEventListener("close", () => deleteAccountForm.reset());
deleteAccountConfirmation.addEventListener("input", () => {
  deleteAccountSubmit.disabled = deleteAccountConfirmation.value !== "EXCLUIR";
});

deleteAccountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || deleteAccountConfirmation.value !== "EXCLUIR") return;
  if (!currentUser.email) {
    $("deleteAccountMessage").textContent = "Não foi possível confirmar o e-mail desta conta.";
    return;
  }

  deleteAccountSubmit.disabled = true;
  $("btnCancelDelete").disabled = true;
  $("deleteAccountMessage").textContent = "Confirmando sua identidade e excluindo os dados...";
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, deleteAccountPassword.value);
    await reauthenticateWithCredential(currentUser, credential);
    await httpsCallable(functions, "deleteMyAccount")();
  } catch (error) {
    console.error("Falha ao excluir a conta e os dados:", error);
    const message = error.code === "auth/wrong-password" || error.code === "auth/invalid-credential"
      ? "Senha incorreta. Confira sua senha e tente novamente."
      : error.code === "functions/failed-precondition"
        ? "Sua sessão expirou. Entre novamente e repita a exclusão."
        : "Não foi possível concluir a exclusão. Seus dados podem ter sido parcialmente removidos; entre novamente e tente de novo.";
    $("deleteAccountMessage").textContent = message;
    deleteAccountSubmit.disabled = deleteAccountConfirmation.value !== "EXCLUIR";
    $("btnCancelDelete").disabled = false;
    return;
  }

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Falha ao encerrar localmente a sessão após excluir a conta:", error);
  }
  location.replace("../Login/Index.html?deleted=1");
});

resetForm();
onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.replace("../Login/Index.html");
    return;
  }
  if (!user.emailVerified) {
    location.replace("../Login/Index.html?verify=1");
    return;
  }

  currentUser = user;
  $("userName").textContent = user.displayName || user.email || "Minha conta";
  $("btnOpenDeleteAccount").disabled = false;
  if (stopEntriesListener) stopEntriesListener();

  const userEntries = query(collection(db, "transactions"), where("uid", "==", user.uid));
  setStatus("Carregando lançamentos...");
  stopEntriesListener = onSnapshot(userEntries, (snapshot) => {
    entries = snapshot.docs
      .map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }))
      .sort((a, b) => b.date.localeCompare(a.date));
    render();
    if (snapshot.empty) setStatus("");
  }, (error) => {
    console.error("Falha ao carregar lançamentos do Firestore:", error);
    setStatus("Não foi possível carregar os lançamentos. Verifique sua conexão e as regras do Firestore.", "error");
  });
});
