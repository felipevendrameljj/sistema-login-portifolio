import { auth, db } from "../../FirebaseConfig/Index.js";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const ERRORS = {
  "auth/invalid-credential": "E-mail ou senha inválidos.",
  "auth/user-not-found": "E-mail ou senha inválidos.",
  "auth/wrong-password": "E-mail ou senha inválidos.",
  "auth/email-already-in-use": "Este e-mail já está cadastrado.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/invalid-email": "Informe um e-mail válido.",
  "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
  "auth/network-request-failed": "Sem conexão com a internet. Verifique sua rede e tente novamente.",
  "auth/operation-not-allowed": "O acesso por e-mail ainda não está habilitado no Firebase."
};

let busy = false;
const explain = (error) => ERRORS[error.code] || "Não foi possível concluir. Tente novamente.";
const goDashboard = () => location.replace("../Dashboard/Dash.html");

function show(id, text, type = "") {
  const message = $(id);
  message.textContent = text;
  message.className = `form-message${type ? ` ${type}` : ""}`;
}

function setBusy(value, buttonId) {
  busy = value;
  $(buttonId).disabled = value;
}

function toggleRegister(register) {
  $("login-box").hidden = register;
  $("register-box").hidden = !register;
  $("authTitle").textContent = register ? "Crie sua conta" : "Acesse sua conta";
  $("authSubtitle").textContent = register
    ? "Comece a organizar suas entradas, saídas e cobranças."
    : "Entre com seu e-mail e senha para continuar.";
  show("loginMsg", "");
  show("msg", "");
}

async function sendVerification(user) {
  await sendEmailVerification(user, { url: location.origin });
}

onAuthStateChanged(auth, (user) => {
  if (!user || busy) return;
  if (user.emailVerified) {
    goDashboard();
  } else {
    signOut(auth).catch((error) => {
      console.error("Falha ao encerrar sessão não verificada:", error);
      show("loginMsg", "Confirme seu e-mail antes de continuar. Saia e entre novamente após verificar.", "error");
    });
  }
});

if (new URLSearchParams(location.search).has("verify")) {
  show("loginMsg", "Confirme seu e-mail pelo link enviado para acessar sua conta.", "success");
}
if (new URLSearchParams(location.search).has("deleted")) {
  show("loginMsg", "Sua conta e os dados ativos associados foram excluídos.", "success");
}

$("toRegister").addEventListener("click", () => toggleRegister(true));
$("toLogin").addEventListener("click", () => toggleRegister(false));

$("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const name = $("name").value.trim();
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!name || name.length > 80) {
    show("msg", "Informe seu nome com até 80 caracteres.", "error");
    return;
  }

  setBusy(true, "btnRegister");
  show("msg", "Criando sua conta...");
  let accountCreated = false;
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    accountCreated = true;
    await updateProfile(user, { displayName: name });
    await setDoc(doc(db, "users", user.uid), {
      name, email, createdAt: serverTimestamp()
    });
    await sendVerification(user);
    await signOut(auth);
    toggleRegister(false);
    show("loginMsg", "Conta criada! Enviamos um link de verificação para seu e-mail. Confirme-o antes de entrar.", "success");
    $("loginEmail").value = email;
  } catch (error) {
    console.error("Falha durante o cadastro:", error);
    if (accountCreated) {
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error("Falha ao encerrar sessão após cadastro incompleto:", signOutError);
      }
      show("msg", "A conta foi criada, mas não foi possível concluir a configuração ou enviar a verificação. Tente entrar e solicite um novo e-mail.", "error");
    } else {
      show("msg", explain(error), "error");
    }
  } finally {
    setBusy(false, "btnRegister");
  }
});

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  setBusy(true, "btnLogin");
  show("loginMsg", "Verificando seus dados...");
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    if (!user.emailVerified) {
      await sendVerification(user);
      await signOut(auth);
      show("loginMsg", "Seu e-mail ainda não foi confirmado. Enviamos um novo link de verificação.", "error");
      return;
    }
    goDashboard();
  } catch (error) {
    console.error("Falha no login:", error);
    show("loginMsg", explain(error), "error");
  } finally {
    setBusy(false, "btnLogin");
  }
});

$("btnReset").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  if (!email) {
    show("loginMsg", "Digite seu e-mail para receber o link de recuperação.", "error");
    $("loginEmail").focus();
    return;
  }
  $("btnReset").disabled = true;
  try {
    await sendPasswordResetEmail(auth, email, { url: location.origin });
    show("loginMsg", "Se houver uma conta com esse e-mail, você receberá um link para redefinir sua senha.", "success");
  } catch (error) {
    console.error("Falha ao solicitar redefinição de senha:", error);
    show("loginMsg", explain(error), "error");
  } finally {
    $("btnReset").disabled = false;
  }
});

$("btnResendVerification").addEventListener("click", async () => {
  if (busy) return;
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  if (!email || !password) {
    show("loginMsg", "Informe seu e-mail e senha para reenviar o link de verificação.", "error");
    return;
  }
  setBusy(true, "btnResendVerification");
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    if (user.emailVerified) {
      goDashboard();
      return;
    }
    await sendVerification(user);
    await signOut(auth);
    show("loginMsg", "Enviamos um novo link de verificação. Confira sua caixa de entrada e o spam.", "success");
  } catch (error) {
    console.error("Falha ao reenviar verificação:", error);
    show("loginMsg", explain(error), "error");
  } finally {
    setBusy(false, "btnResendVerification");
  }
});
