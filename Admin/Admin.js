import { auth, functions } from "../FirebaseConfig/Index.js";
import {
  EmailAuthProvider, multiFactor, onAuthStateChanged, reauthenticateWithCredential,
  signOut, TotpMultiFactorGenerator
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const $ = (id) => document.getElementById(id);
const KINDS = ["income", "expense", "charge"];
const CATEGORIES = [
  "Vendas", "Serviços", "Salário", "Alimentação", "Moradia", "Transporte",
  "Contas", "Saúde", "Educação", "Lazer", "Outros"
];
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const ADMIN_SESSION_LIMIT_MS = 5 * 60 * 1000;

let currentUser = null;
let adminSessionTimer = null;
let pendingTotpSecret = null;
let allowingSignOut = false;
let adminReady = false;
let transactions = [];
let users = [];
let usersPageToken = null;
let usersLoading = false;
let pageCursor = null;
let nextCursor = null;
let previousCursors = [];
let pageNumber = 1;
let editingEntry = null;

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function setAdminStatus(message, type = "") {
  const status = $("adminStatus");
  status.textContent = message;
  status.className = `status-message admin-status${type ? ` ${type}` : ""}`;
}

function setFormMessage(message, type = "") {
  const status = $("adminFormMessage");
  status.textContent = message;
  status.className = `form-message${type ? ` ${type}` : ""}`;
}

function setEnrollmentMessage(message, type = "") {
  setAdminStatus(message, type);
}

async function callAdminFunction(name, data = {}) {
  const response = await httpsCallable(functions, name)(data);
  return response.data;
}

function clearAdminData() {
  if (adminSessionTimer) clearTimeout(adminSessionTimer);
  adminSessionTimer = null;
  transactions = [];
  users = [];
  pendingTotpSecret = null;
  $("adminPanel").hidden = true;
  $("mfaEnrollmentPanel").hidden = true;
  $("adminEntriesBody").replaceChildren();
  $("entryOwner").replaceChildren();
}

async function handleAdminError(error) {
  console.error("Falha na operação administrativa:", error);
  if (error.code !== "functions/unauthenticated"
    && error.code !== "functions/permission-denied") return false;

  setAdminStatus("A sessão administrativa expirou ou não tem permissão. Entre novamente.", "error");
  clearAdminData();
  allowingSignOut = true;
  try {
    await signOut(auth);
  } catch (signOutError) {
    console.error("Falha ao encerrar a sessão administrativa:", signOutError);
  }
  location.replace("../Login/Index.html?admin=1");
  return true;
}

async function expireAdminSession() {
  clearAdminData();
  setAdminStatus("Sessão encerrada por segurança. Entre novamente para continuar.", "error");
  allowingSignOut = true;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Falha ao encerrar uma sessão administrativa expirada:", error);
  }
  location.replace("../Login/Index.html?admin=1");
}

function kindLabel(kind) {
  return { income: "Entrada", expense: "Saída", charge: "Cobrança" }[kind] || "Lançamento";
}

function makeCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value || "—";
  if (className) cell.className = className;
  return cell;
}

function renderTransactions() {
  const search = $("searchAdminEntries").value.trim().toLocaleLowerCase("pt-BR");
  const kindFilter = $("filterAdminKind").value;
  const filtered = transactions.filter((entry) => {
    const text = [
      entry.ownerName, entry.ownerEmail, entry.uid, entry.description, entry.category,
      entry.counterpartyName, entry.counterpartyEmail, entry.notes
    ].join(" ").toLocaleLowerCase("pt-BR");
    return text.includes(search) && (!kindFilter || entry.kind === kindFilter);
  });

  const body = $("adminEntriesBody");
  body.replaceChildren();
  for (const entry of filtered) {
    const row = document.createElement("tr");
    const owner = entry.ownerName && entry.ownerEmail
      ? `${entry.ownerName} · ${entry.ownerEmail}`
      : (entry.ownerEmail || entry.ownerName || entry.uid);
    row.appendChild(makeCell(owner, "admin-owner-cell"));
    row.appendChild(makeCell(formatDate(entry.date), "date-cell"));

    const kindCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `kind-badge kind-${entry.kind}`;
    badge.textContent = kindLabel(entry.kind);
    kindCell.appendChild(badge);
    row.appendChild(kindCell);

    const descriptionCell = document.createElement("td");
    const description = document.createElement("strong");
    description.className = "table-entry-name";
    description.textContent = entry.description || "—";
    descriptionCell.appendChild(description);
    const detail = document.createElement("span");
    detail.className = "table-entry-description";
    detail.textContent = entry.kind === "charge"
      ? `${entry.counterpartyName || "—"} · vence ${formatDate(entry.dueDate)}`
      : [entry.category, entry.counterpartyName].filter(Boolean).join(" · ");
    descriptionCell.appendChild(detail);
    row.appendChild(descriptionCell);

    row.appendChild(makeCell(
      currency.format((Number.isSafeInteger(entry.amountCents) ? entry.amountCents : 0) / 100),
      `amount-cell ${entry.kind === "expense" ? "amount-expense" : "amount-income"}`
    ));

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = `transaction-badge ${entry.status === "pending" ? "transaction-pending" : "transaction-paid"}`;
    status.textContent = entry.kind === "charge"
      ? (entry.status === "paid" ? "Paga" : "Em aberto")
      : "Concluído";
    statusCell.appendChild(status);
    if (entry.paymentEmailStatus) {
      const emailStatus = document.createElement("span");
      emailStatus.className = "email-state";
      emailStatus.textContent = {
        sent: "Confirmação enviada",
        failed: "Falha no envio",
        sending: "Enviando confirmação"
      }[entry.paymentEmailStatus] || "Aguardando confirmação";
      statusCell.appendChild(emailStatus);
    }
    row.appendChild(statusCell);

    const actions = document.createElement("td");
    actions.className = "actions-cell";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "text-button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => beginEdit(entry));
    actions.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "text-button text-button-danger";
    deleteButton.textContent = "Excluir";
    deleteButton.addEventListener("click", () => deleteTransaction(entry));
    actions.appendChild(deleteButton);
    row.appendChild(actions);
    body.appendChild(row);
  }

  $("adminEmptyState").hidden = filtered.length !== 0;
  $("adminPageInfo").textContent = `Página ${pageNumber} · ${filtered.length} exibidos`;
}

function renderOwnerOptions(selectedUid = $("entryOwner").value) {
  const search = $("ownerSearch").value.trim().toLocaleLowerCase("pt-BR");
  const selectableUsers = users.filter((user) => user.emailVerified && user.disabled === false);
  if (editingEntry && !selectableUsers.some((user) => user.uid === editingEntry.uid)) {
    selectableUsers.push({
      uid: editingEntry.uid,
      displayName: editingEntry.ownerName,
      email: editingEntry.ownerEmail,
      emailVerified: true,
      disabled: false
    });
  }

  const visibleUsers = selectableUsers.filter((user) => (
    `${user.displayName} ${user.email} ${user.uid}`.toLocaleLowerCase("pt-BR").includes(search)
  ));
  const select = $("entryOwner");
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione uma conta verificada";
  select.appendChild(placeholder);

  for (const user of visibleUsers) {
    const option = document.createElement("option");
    option.value = user.uid;
    option.textContent = user.displayName && user.email
      ? `${user.displayName} · ${user.email}`
      : (user.email || user.uid);
    select.appendChild(option);
  }
  if (visibleUsers.some((user) => user.uid === selectedUid)) select.value = selectedUid;
}

async function loadMoreUsers() {
  if (usersLoading || usersPageToken === false) return;
  usersLoading = true;
  $("btnLoadMoreUsers").disabled = true;
  $("btnLoadMoreUsers").textContent = "Carregando contas...";
  try {
    const request = usersPageToken ? { pageToken: usersPageToken } : {};
    const result = await callAdminFunction("adminListUsers", request);
    users = users.concat(result.users);
    usersPageToken = result.nextPageToken || false;
    renderOwnerOptions();
    $("ownerLoadStatus").textContent = `${users.filter((user) => user.emailVerified && user.disabled === false).length} contas verificadas carregadas.`;
    $("btnLoadMoreUsers").hidden = usersPageToken === false;
  } catch (error) {
    if (!(await handleAdminError(error))) {
      $("ownerLoadStatus").textContent = "Não foi possível carregar as contas.";
    }
  } finally {
    usersLoading = false;
    $("btnLoadMoreUsers").disabled = usersPageToken === false;
    $("btnLoadMoreUsers").textContent = "Carregar mais contas";
  }
}

async function loadTransactions(cursor = null) {
  $("btnReloadAdmin").disabled = true;
  $("btnNextPage").disabled = true;
  $("btnPreviousPage").disabled = true;
  setAdminStatus("Carregando lançamentos autorizados...");
  try {
    const result = await callAdminFunction("adminListTransactions", { cursor });
    transactions = result.transactions;
    nextCursor = result.nextCursor;
    $("btnNextPage").disabled = !result.hasMore;
    $("btnPreviousPage").disabled = previousCursors.length === 0;
    renderTransactions();
    setAdminStatus("Dados administrativos carregados. As alterações são registradas no servidor.", "success");
  } catch (error) {
    await handleAdminError(error);
    if (error.code !== "functions/unauthenticated"
      && error.code !== "functions/permission-denied") {
      setAdminStatus("Não foi possível carregar os lançamentos. Tente novamente.", "error");
    }
  } finally {
    $("btnReloadAdmin").disabled = false;
  }
}

function loadFirstTransactionPage() {
  pageCursor = null;
  nextCursor = null;
  previousCursors = [];
  pageNumber = 1;
  return loadTransactions(null);
}

function syncConditionalFields() {
  const isCharge = $("entryKind").value === "charge";
  const isPaid = isCharge && $("chargeStatus").value === "paid";
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
  if (isPaid && !$("paymentDate").value) $("paymentDate").value = today();
}

function resetAdminForm() {
  editingEntry = null;
  $("adminEntryForm").reset();
  $("entryOwner").disabled = false;
  $("entryKind").disabled = false;
  $("chargeStatus").disabled = false;
  $("entryDate").value = today();
  $("adminFormTitle").textContent = "Novo lançamento";
  $("btnSaveAdminEntry").textContent = "Criar lançamento";
  $("btnCancelAdminEdit").hidden = true;
  $("ownerSearch").value = "";
  renderOwnerOptions("");
  syncConditionalFields();
  setFormMessage("");
}

function beginEdit(entry) {
  editingEntry = entry;
  $("ownerSearch").value = "";
  renderOwnerOptions(entry.uid);
  $("entryOwner").value = entry.uid;
  $("entryOwner").disabled = true;
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
  $("adminFormTitle").textContent = "Editar lançamento";
  $("btnSaveAdminEntry").textContent = "Salvar alterações";
  $("btnCancelAdminEdit").hidden = false;
  syncConditionalFields();
  $("entryDescription").focus();
}

function getAdminEntryInput() {
  const kind = $("entryKind").value;
  const description = $("entryDescription").value.trim();
  const category = $("entryCategory").value;
  const amount = $("entryAmount").valueAsNumber;
  const amountCents = Math.round(amount * 100);
  const status = kind === "charge" ? $("chargeStatus").value : "paid";
  const entry = {
    uid: editingEntry ? editingEntry.uid : $("entryOwner").value,
    kind,
    description,
    category,
    amountCents,
    date: $("entryDate").value,
    dueDate: kind === "charge" ? $("dueDate").value : "",
    paymentDate: kind === "charge" && status === "paid" ? $("paymentDate").value : "",
    status,
    counterpartyName: $("counterpartyName").value.trim(),
    counterpartyEmail: $("counterpartyEmail").value.trim(),
    notes: $("entryNotes").value.trim()
  };

  if (!entry.uid) throw new Error("Selecione uma conta para o lançamento.");
  if (!KINDS.includes(kind)) throw new Error("Selecione um tipo válido.");
  if (!description || description.length > 140) throw new Error("Informe uma descrição com até 140 caracteres.");
  if (!CATEGORIES.includes(category)) throw new Error("Selecione uma categoria válida.");
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("Informe um valor válido, maior que zero.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error("Informe a data do lançamento.");
  if (kind === "charge") {
    if (!entry.counterpartyName || !entry.counterpartyEmail) {
      throw new Error("Informe o nome e o e-mail do devedor.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate)) throw new Error("Informe o vencimento.");
    if (status === "paid" && !/^\d{4}-\d{2}-\d{2}$/.test(entry.paymentDate)) {
      throw new Error("Informe a data do pagamento.");
    }
  }
  return entry;
}

async function saveAdminEntry(event) {
  event.preventDefault();
  let entry;
  try {
    entry = getAdminEntryInput();
  } catch (error) {
    setFormMessage(error.message, "error");
    return;
  }

  const sendsConfirmation = entry.kind === "charge"
    && entry.status === "paid"
    && (!editingEntry || editingEntry.status !== "paid");
  if (sendsConfirmation
    && !confirm("Esta ação enviará uma confirmação de pagamento ao e-mail do devedor. Continuar?")) return;

  const button = $("btnSaveAdminEntry");
  button.disabled = true;
  setFormMessage(editingEntry ? "Salvando alterações..." : "Criando lançamento...");
  try {
    if (editingEntry) {
      await callAdminFunction("adminUpdateTransaction", {
        transactionId: editingEntry.id,
        entry
      });
      setFormMessage("Lançamento atualizado.", "success");
    } else {
      await callAdminFunction("adminCreateTransaction", { entry });
      setFormMessage("Lançamento criado.", "success");
    }
    resetAdminForm();
    await loadFirstTransactionPage();
  } catch (error) {
    const redirected = await handleAdminError(error);
    if (!redirected) {
      setFormMessage(error.code === "functions/failed-precondition"
        ? "A conta selecionada precisa estar ativa e verificada, e um pagamento não pode voltar a pendente."
        : "Não foi possível salvar. Confira os dados e tente novamente.", "error");
    }
  } finally {
    button.disabled = false;
  }
}

async function deleteTransaction(entry) {
  const owner = entry.ownerEmail || entry.ownerUid || entry.uid;
  if (!confirm(`Excluir "${entry.description}" da conta ${owner}? Esta ação não pode ser desfeita.`)) return;
  setAdminStatus("Excluindo lançamento...");
  try {
    await callAdminFunction("adminDeleteTransaction", { transactionId: entry.id });
    if (editingEntry?.id === entry.id) resetAdminForm();
    await loadFirstTransactionPage();
  } catch (error) {
    const redirected = await handleAdminError(error);
    if (!redirected) setAdminStatus("Não foi possível excluir o lançamento.", "error");
  }
}

async function startTotpEnrollment(event) {
  event.preventDefault();
  if (!currentUser?.email) return;

  const button = $("btnStartMfaEnrollment");
  button.disabled = true;
  setEnrollmentMessage("Confirmando sua identidade...");
  try {
    const credential = EmailAuthProvider.credential(
      currentUser.email,
      $("mfaReauthPassword").value
    );
    await reauthenticateWithCredential(currentUser, credential);
    const session = await multiFactor(currentUser).getSession();
    pendingTotpSecret = await TotpMultiFactorGenerator.generateSecret(session);
    $("mfaSecret").textContent = pendingTotpSecret.secretKey;
    $("mfaReauthForm").hidden = true;
    $("mfaSetup").hidden = false;
    $("mfaEnrollmentCode").focus();
    setEnrollmentMessage("Chave gerada. Cadastre-a no aplicativo e confirme um código.", "success");
  } catch (error) {
    console.error("Falha ao iniciar a configuração TOTP:", error);
    const message = error.code === "auth/wrong-password" || error.code === "auth/invalid-credential"
      ? "Senha incorreta. Confira e tente novamente."
      : error.code === "auth/operation-not-allowed"
        ? "TOTP ainda não está habilitado no Firebase Authentication com Identity Platform."
        : "Não foi possível gerar a chave. Verifique a configuração do Identity Platform e tente novamente.";
    setEnrollmentMessage(message, "error");
  } finally {
    button.disabled = false;
  }
}

async function confirmTotpEnrollment(event) {
  event.preventDefault();
  if (!currentUser || !pendingTotpSecret) return;
  const code = $("mfaEnrollmentCode").value.trim();
  if (!/^\d{6}$/.test(code)) {
    setEnrollmentMessage("Digite o código de seis números do aplicativo.", "error");
    return;
  }

  const button = $("btnConfirmMfaEnrollment");
  button.disabled = true;
  setEnrollmentMessage("Ativando a verificação em duas etapas...");
  try {
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(pendingTotpSecret, code);
    await multiFactor(currentUser).enroll(assertion, "VD-Finanças Admin");
    pendingTotpSecret = null;
  } catch (error) {
    console.error("Falha ao ativar TOTP:", error);
    setEnrollmentMessage("Código inválido ou expirado. Confira o aplicativo e tente novamente.", "error");
    button.disabled = false;
    return;
  }

  allowingSignOut = true;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Falha ao encerrar a sessão após ativar TOTP:", error);
  } finally {
    button.disabled = false;
  }
  location.replace("../Login/Index.html?admin=1&mfa=enabled");
}

async function initializeAdminPanel() {
  if (adminReady) return;
  adminReady = true;
  $("mfaEnrollmentPanel").hidden = true;
  $("adminPanel").hidden = false;
  await loadMoreUsers();
  await loadFirstTransactionPage();
}

async function handleAuthenticatedUser(user) {
  currentUser = user;
  $("adminEmail").textContent = user.email || "Conta administrativa";
  if (!user.emailVerified) {
    setAdminStatus("A conta precisa ter o e-mail verificado.", "error");
    allowingSignOut = true;
    await signOut(auth);
    location.replace("../Login/Index.html?admin=1");
    return;
  }

  try {
    const token = await user.getIdTokenResult();
    if (token.claims.admin !== true) {
      setAdminStatus("Acesso administrativo não autorizado.", "error");
      allowingSignOut = true;
      await signOut(auth);
      location.replace("../Login/Index.html?admin=1");
      return;
    }

    const secondFactor = token.claims.firebase?.sign_in_second_factor;
    const hasTotp = multiFactor(user).enrolledFactors.some(
      (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID
    );
    if (secondFactor !== "totp") {
      if (hasTotp) {
        allowingSignOut = true;
        await signOut(auth);
        location.replace("../Login/Index.html?admin=1");
        return;
      }
      $("mfaEnrollmentPanel").hidden = false;
      $("adminPanel").hidden = true;
      setAdminStatus("Configure o autenticador para desbloquear o painel.", "error");
      return;
    }

    const authTimeMs = Number(token.claims.auth_time) * 1000;
    const remainingSessionMs = ADMIN_SESSION_LIMIT_MS - (Date.now() - authTimeMs);
    if (!Number.isFinite(authTimeMs) || remainingSessionMs <= 0) {
      await expireAdminSession();
      return;
    }
    if (adminSessionTimer) clearTimeout(adminSessionTimer);
    adminSessionTimer = setTimeout(expireAdminSession, remainingSessionMs);
    await initializeAdminPanel();
  } catch (error) {
    console.error("Falha ao verificar a sessão administrativa:", error);
    setAdminStatus("Não foi possível verificar a autorização. Entre novamente.", "error");
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    if (!allowingSignOut) location.replace("../Login/Index.html?admin=1");
    return;
  }
  handleAuthenticatedUser(user);
});

$("btnAdminLogout").addEventListener("click", async () => {
  clearAdminData();
  allowingSignOut = true;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Falha ao encerrar sessão administrativa:", error);
    setAdminStatus("Não foi possível sair agora. Tente novamente.", "error");
    allowingSignOut = false;
    return;
  }
  location.replace("../Login/Index.html?admin=1");
});

$("mfaReauthForm").addEventListener("submit", startTotpEnrollment);
$("mfaEnrollForm").addEventListener("submit", confirmTotpEnrollment);
$("adminEntryForm").addEventListener("submit", saveAdminEntry);
$("entryKind").addEventListener("change", syncConditionalFields);
$("chargeStatus").addEventListener("change", syncConditionalFields);
$("btnCancelAdminEdit").addEventListener("click", resetAdminForm);
$("ownerSearch").addEventListener("input", () => renderOwnerOptions());
$("btnLoadMoreUsers").addEventListener("click", loadMoreUsers);
$("searchAdminEntries").addEventListener("input", renderTransactions);
$("filterAdminKind").addEventListener("change", renderTransactions);
$("btnReloadAdmin").addEventListener("click", () => loadTransactions(pageCursor));
$("btnNextPage").addEventListener("click", () => {
  if (!nextCursor) return;
  previousCursors.push(pageCursor);
  pageCursor = nextCursor;
  pageNumber += 1;
  loadTransactions(pageCursor);
});
$("btnPreviousPage").addEventListener("click", () => {
  if (previousCursors.length === 0) return;
  pageCursor = previousCursors.pop();
  pageNumber = Math.max(1, pageNumber - 1);
  loadTransactions(pageCursor);
});

resetAdminForm();
