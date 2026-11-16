const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const projectId = "sistemadelogin-01";
const action = process.argv[2];
const adminEmail = process.env.VD_ADMIN_EMAIL?.trim().toLowerCase();

async function main() {
  if (!["grant", "revoke", "reset-mfa"].includes(action)) {
    throw new Error("Use grant, revoke ou reset-mfa.");
  }
  if (!adminEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    throw new Error("Defina VD_ADMIN_EMAIL com o e-mail da conta administrativa.");
  }

  initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth();
  const user = await auth.getUserByEmail(adminEmail);
  if (action === "grant" && (!user.emailVerified || user.disabled)) {
    throw new Error("A conta precisa estar ativa e com o e-mail verificado.");
  }

  if (action === "reset-mfa") {
    await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: [] } });
    console.log("Fatores multifator removidos. O próximo acesso administrativo exigirá novo cadastro TOTP.");
    return;
  }

  const claims = { ...(user.customClaims || {}) };
  if (action === "grant") {
    claims.admin = true;
  } else {
    delete claims.admin;
  }
  await auth.setCustomUserClaims(user.uid, Object.keys(claims).length ? claims : null);
  console.log(action === "grant"
    ? "Acesso administrativo concedido. Encerre as sessões e entre novamente."
    : "Acesso administrativo revogado.");
}

main().catch((error) => {
  console.error("Não foi possível atualizar o acesso administrativo:", error.message);
  process.exitCode = 1;
});
