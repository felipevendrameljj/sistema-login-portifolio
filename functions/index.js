const { randomUUID } = require("node:crypto");
const nodemailer = require("nodemailer");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldPath, FieldValue, getFirestore } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

initializeApp();
const db = getFirestore();

const smtpHost = defineSecret("SMTP_HOST");
const smtpPort = defineSecret("SMTP_PORT");
const smtpUser = defineSecret("SMTP_USER");
const smtpPassword = defineSecret("SMTP_PASSWORD");
const smtpFrom = defineSecret("SMTP_FROM");
const leaseDuration = 5 * 60 * 1000;
const adminAuthAge = 5 * 60;
const adminPageSize = 50;
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const transactionKinds = ["income", "expense", "charge"];
const transactionCategories = [
  "Vendas", "Serviços", "Salário", "Alimentação", "Moradia", "Transporte",
  "Contas", "Saúde", "Educação", "Lazer", "Outros"
];

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function createTransporter() {
  const port = Number(smtpPort.value());
  if (port !== 465 && port !== 587) {
    throw new Error("SMTP_PORT deve ser 465 ou 587.");
  }

  const host = smtpHost.value().trim();
  const sender = smtpFrom.value().trim();
  const user = smtpUser.value();
  const password = smtpPassword.value();
  if (!host || !sender || !user || !password) {
    throw new Error("A configuração SMTP está incompleta.");
  }

  return {
    sender,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user, pass: password }
    })
  };
}

async function sendPaymentConfirmation(transactionId) {
  const transactionRef = db.doc(`transactions/${transactionId}`);
  const lockId = randomUUID();
  const now = Date.now();
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(transactionRef);
    if (!snapshot.exists) return false;
    const entry = snapshot.data();
    if (entry.kind !== "charge" || entry.status !== "paid") return false;
    if (entry.paymentEmailStatus === "sent") return false;
    if (entry.paymentEmailStatus === "sending"
      && now - entry.paymentEmailLockAt < leaseDuration) return false;

    transaction.update(transactionRef, {
      paymentEmailStatus: "sending",
      paymentEmailLockAt: now,
      paymentEmailLockId: lockId,
      paymentEmailError: FieldValue.delete()
    });
    return true;
  });
  if (!claimed) return { sent: false };

  try {
    const { sender, transporter } = createTransporter();
    const snapshot = await transactionRef.get();
    if (!snapshot.exists) return { sent: false };
    const entry = snapshot.data();
    const debtor = entry.counterpartyName;
    const description = entry.description;
    const amount = currency.format(entry.amountCents / 100);
    const paymentDate = formatDate(entry.paymentDate);

    await transporter.sendMail({
      from: { name: "VD-Finanças", address: sender },
      to: entry.counterpartyEmail,
      subject: "Confirmação de pagamento - VD-Finanças",
      text: `Olá, ${debtor}.\n\nConfirmamos o recebimento do pagamento de "${description}", no valor de ${amount}, em ${paymentDate}.\n\nObrigado,\nVD-Finanças`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;padding:32px;color:#17243b;border:1px solid #e7ebf2;border-radius:12px"><p style="color:#4263eb;font-weight:bold">VD-FINANÇAS</p><h1 style="font-size:22px">Pagamento confirmado</h1><p>Olá, ${escapeHtml(debtor)}.</p><p>Confirmamos o recebimento do pagamento de <strong>${escapeHtml(description)}</strong>, no valor de <strong>${amount}</strong>, em <strong>${paymentDate}</strong>.</p><p style="color:#78859b;font-size:13px">Em caso de dúvida, entre em contato com quem enviou esta confirmação.</p></div>`
    });

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(transactionRef);
      if (!current.exists || current.data().paymentEmailLockId !== lockId) return;
      transaction.update(transactionRef, {
        paymentEmailStatus: "sent",
        paymentEmailSentAt: FieldValue.serverTimestamp(),
        paymentEmailLockAt: FieldValue.delete(),
        paymentEmailLockId: FieldValue.delete(),
        paymentEmailError: FieldValue.delete()
      });
    });
    logger.info("Payment confirmation email sent.", { transactionId });
    return { sent: true };
  } catch (error) {
    logger.error("Payment confirmation email delivery failed.", {
      transactionId,
      error: error.message
    });
    try {
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(transactionRef);
        if (!current.exists || current.data().paymentEmailLockId !== lockId) return;
        transaction.update(transactionRef, {
          paymentEmailStatus: "failed",
          paymentEmailError: "Falha na entrega da mensagem.",
          paymentEmailLockAt: FieldValue.delete(),
          paymentEmailLockId: FieldValue.delete()
        });
      });
    } catch (updateError) {
      logger.error("Failed to record payment email failure.", {
        transactionId,
        error: updateError.message
      });
    }
    throw new Error("Não foi possível enviar a confirmação de pagamento.");
  }
}

exports.notifyPaidCharge = onDocumentWritten({
  document: "transactions/{transactionId}",
  secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
  timeoutSeconds: 60
}, async (event) => {
  if (!event.data?.after.exists) return;
  const current = event.data.after.data();
  const previous = event.data.before.exists ? event.data.before.data() : null;
  const becamePaid = current.kind === "charge"
    && current.status === "paid"
    && (!previous || previous.status !== "paid");
  if (!becamePaid) return;

  try {
    await sendPaymentConfirmation(event.params.transactionId);
  } catch (error) {
    logger.error("Automatic payment confirmation failed.", {
      transactionId: event.params.transactionId,
      error: error.message
    });
  }
});

exports.retryPaymentConfirmation = onCall({
  secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
  timeoutSeconds: 60
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Entre na sua conta para continuar.");
  }
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Confirme seu e-mail antes de continuar.");
  }

  const transactionId = request.data?.transactionId;
  if (typeof transactionId !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(transactionId)) {
    throw new HttpsError("invalid-argument", "Lançamento inválido.");
  }

  const snapshot = await db.doc(`transactions/${transactionId}`).get();
  if (!snapshot.exists || snapshot.data().uid !== request.auth.uid) {
    throw new HttpsError("not-found", "Cobrança não encontrada.");
  }
  const entry = snapshot.data();
  if (entry.kind !== "charge" || entry.status !== "paid") {
    throw new HttpsError("failed-precondition", "A cobrança ainda não foi paga.");
  }

  try {
    return await sendPaymentConfirmation(transactionId);
  } catch (error) {
    logger.error("Manual payment confirmation retry failed.", {
      transactionId,
      error: error.message
    });
    throw new HttpsError("internal", "Não foi possível reenviar a confirmação.");
  }
});

async function deleteUserDocuments(collectionName, uid) {
  while (true) {
    const snapshot = await db.collection(collectionName)
      .where("uid", "==", uid)
      .limit(400)
      .get();
    if (snapshot.empty) return;

    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

exports.deleteMyAccount = onCall({
  timeoutSeconds: 300
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Entre na sua conta para continuar.");
  }
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Confirme seu e-mail antes de excluir a conta.");
  }

  const authTime = request.auth.token.auth_time;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authTime) || authTime > now + 60 || now - authTime > 5 * 60) {
    throw new HttpsError("failed-precondition", "Confirme sua senha novamente antes de excluir a conta.");
  }

  const uid = request.auth.uid;
  try {
    for (const collectionName of ["transactions", "expenses", "products"]) {
      await deleteUserDocuments(collectionName, uid);
    }
    await db.doc(`users/${uid}`).delete();
    await getAuth().deleteUser(uid);
    logger.info("Account and associated financial records deleted.");
    return { deleted: true };
  } catch (error) {
    logger.error("Account deletion failed.", { code: error.code || "unknown" });
    throw new HttpsError(
      "internal",
      "Não foi possível concluir a exclusão. Entre novamente e tente mais uma vez."
    );
  }
});

function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Entre na sua conta para continuar.");
  }
  if (request.auth.token.email_verified !== true
    || request.auth.token.admin !== true
    || request.auth.token.firebase?.sign_in_second_factor !== "totp") {
    throw new HttpsError("permission-denied", "Acesso administrativo não autorizado.");
  }

  const authTime = request.auth.token.auth_time;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authTime) || authTime > now + 60 || now - authTime > adminAuthAge) {
    throw new HttpsError("unauthenticated", "A sessão administrativa expirou. Entre novamente.");
  }
  return request.auth.uid;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateAdminEntry(input, uid) {
  const allowedFields = [
    "uid", "kind", "description", "category", "amountCents", "date",
    "dueDate", "paymentDate", "status", "counterpartyName",
    "counterpartyEmail", "notes"
  ];
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !allowedFields.includes(key))) {
    throw new HttpsError("invalid-argument", "Lançamento inválido.");
  }

  const entry = {
    uid,
    kind: input.kind,
    description: input.description,
    category: input.category,
    amountCents: input.amountCents,
    date: input.date,
    dueDate: input.dueDate,
    paymentDate: input.paymentDate,
    status: input.status,
    counterpartyName: input.counterpartyName,
    counterpartyEmail: input.counterpartyEmail,
    notes: input.notes
  };
  if (!transactionKinds.includes(entry.kind)
    || typeof entry.description !== "string"
    || entry.description.trim().length === 0
    || entry.description.length > 140
    || !transactionCategories.includes(entry.category)
    || !Number.isSafeInteger(entry.amountCents)
    || entry.amountCents <= 0
    || !isValidDate(entry.date)
    || typeof entry.dueDate !== "string"
    || typeof entry.paymentDate !== "string"
    || !["pending", "paid"].includes(entry.status)
    || typeof entry.counterpartyName !== "string"
    || entry.counterpartyName.length > 100
    || typeof entry.counterpartyEmail !== "string"
    || entry.counterpartyEmail.length > 254
    || typeof entry.notes !== "string"
    || entry.notes.length > 1000) {
    throw new HttpsError("invalid-argument", "Confira os dados do lançamento.");
  }

  if (entry.kind === "charge") {
    if (!entry.counterpartyName.trim()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.counterpartyEmail)
      || !isValidDate(entry.dueDate)
      || (entry.status === "pending" && entry.paymentDate !== "")
      || (entry.status === "paid" && !isValidDate(entry.paymentDate))) {
      throw new HttpsError("invalid-argument", "Confira os dados da cobrança.");
    }
  } else if (entry.status !== "paid" || entry.dueDate !== "" || entry.paymentDate !== "") {
    throw new HttpsError("invalid-argument", "Confira o tipo e a situação do lançamento.");
  }

  return entry;
}

function validDocumentId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(value);
}

function validUserId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

exports.adminListUsers = onCall(async (request) => {
  const adminUid = requireAdmin(request);
  const pageToken = request.data?.pageToken;
  if (pageToken !== undefined && pageToken !== null
    && (typeof pageToken !== "string" || pageToken.length > 2048)) {
    throw new HttpsError("invalid-argument", "Página de usuários inválida.");
  }

  const result = await getAuth().listUsers(100, pageToken || undefined);
  logger.info("Admin user list accessed.", { adminUid, returned: result.users.length });
  return {
    users: result.users.map((user) => ({
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      emailVerified: user.emailVerified,
      disabled: user.disabled
    })),
    nextPageToken: result.pageToken || null
  };
});

exports.adminListTransactions = onCall(async (request) => {
  const adminUid = requireAdmin(request);
  const cursor = request.data?.cursor;
  if (cursor !== undefined && cursor !== null
    && (!cursor || !isValidDate(cursor.date) || !validDocumentId(cursor.id))) {
    throw new HttpsError("invalid-argument", "Página de lançamentos inválida.");
  }

  let pageQuery = db.collection("transactions")
    .orderBy("date", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .limit(adminPageSize + 1);
  if (cursor) pageQuery = pageQuery.startAfter(cursor.date, cursor.id);

  const snapshot = await pageQuery.get();
  const hasMore = snapshot.docs.length > adminPageSize;
  const documents = snapshot.docs.slice(0, adminPageSize);
  const ownerIds = [...new Set(documents.map((document) => document.data().uid).filter(Boolean))];
  const profiles = ownerIds.length
    ? await db.getAll(...ownerIds.map((uid) => db.doc(`users/${uid}`)))
    : [];
  const profileByUid = new Map(profiles.map((profile) => [profile.id, profile.data() || {}]));
  const transactions = documents.map((document) => {
    const entry = document.data();
    const owner = profileByUid.get(entry.uid) || {};
    return {
      id: document.id,
      uid: entry.uid || "",
      kind: entry.kind || "",
      description: entry.description || "",
      category: entry.category || "",
      amountCents: entry.amountCents || 0,
      date: entry.date || "",
      dueDate: entry.dueDate || "",
      paymentDate: entry.paymentDate || "",
      status: entry.status || "",
      counterpartyName: entry.counterpartyName || "",
      counterpartyEmail: entry.counterpartyEmail || "",
      notes: entry.notes || "",
      paymentEmailStatus: entry.paymentEmailStatus || "",
      ownerEmail: owner.email || "",
      ownerName: owner.name || ""
    };
  });
  const lastDocument = documents[documents.length - 1];
  logger.info("Admin transaction page accessed.", {
    adminUid,
    returned: transactions.length,
    hasMore
  });
  return {
    transactions,
    hasMore,
    nextCursor: hasMore && lastDocument
      ? { date: lastDocument.data().date, id: lastDocument.id }
      : null
  };
});

exports.adminCreateTransaction = onCall(async (request) => {
  const adminUid = requireAdmin(request);
  const input = request.data?.entry;
  if (!input || !validUserId(input.uid)) {
    throw new HttpsError("invalid-argument", "Selecione uma conta válida.");
  }
  const entry = validateAdminEntry(input, input.uid);
  const [profile, user] = await Promise.all([
    db.doc(`users/${entry.uid}`).get(),
    getAuth().getUser(entry.uid)
  ]);
  if (!profile.exists || !user.emailVerified || user.disabled) {
    throw new HttpsError("failed-precondition", "A conta selecionada não está ativa e verificada.");
  }

  const transactionRef = await db.collection("transactions").add({
    ...entry,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  logger.info("Admin transaction created.", {
    adminUid,
    transactionId: transactionRef.id,
    targetUid: entry.uid
  });
  return { transactionId: transactionRef.id };
});

exports.adminUpdateTransaction = onCall(async (request) => {
  const adminUid = requireAdmin(request);
  const transactionId = request.data?.transactionId;
  const input = request.data?.entry;
  if (!validDocumentId(transactionId) || !input || typeof input !== "object") {
    throw new HttpsError("invalid-argument", "Lançamento inválido.");
  }

  const transactionRef = db.doc(`transactions/${transactionId}`);
  const snapshot = await transactionRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Lançamento não encontrado.");
  const current = snapshot.data();
  if (input.uid !== current.uid || input.kind !== current.kind) {
    throw new HttpsError("failed-precondition", "O titular e o tipo do lançamento não podem ser alterados.");
  }
  const entry = validateAdminEntry(input, current.uid);
  if (current.status === "paid" && entry.status !== "paid") {
    throw new HttpsError("failed-precondition", "Um lançamento pago não pode voltar para pendente.");
  }

  await transactionRef.update({
    ...entry,
    updatedAt: FieldValue.serverTimestamp()
  });
  logger.info("Admin transaction updated.", {
    adminUid,
    transactionId,
    targetUid: current.uid
  });
  return { updated: true };
});

exports.adminDeleteTransaction = onCall(async (request) => {
  const adminUid = requireAdmin(request);
  const transactionId = request.data?.transactionId;
  if (!validDocumentId(transactionId)) {
    throw new HttpsError("invalid-argument", "Lançamento inválido.");
  }

  const transactionRef = db.doc(`transactions/${transactionId}`);
  const snapshot = await transactionRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Lançamento não encontrado.");
  await transactionRef.delete();
  logger.info("Admin transaction deleted.", {
    adminUid,
    transactionId,
    targetUid: snapshot.data().uid
  });
  return { deleted: true };
});
