import { auth, db, providers } from "../../FirebaseConfig/Index.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup,
  sendPasswordResetEmail, updateProfile, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const ERRORS = {
  "auth/invalid-credential": "Email ou senha inválidos.",
  "auth/user-not-found": "Email ou senha inválidos.",
  "auth/wrong-password": "Email ou senha inválidos.",
  "auth/email-already-in-use": "Este email já está cadastrado.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/invalid-email": "Email inválido.",
  "auth/popup-closed-by-user": "Login cancelado.",
  "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
  "auth/network-request-failed": "Sem conexão com a internet.",
  "auth/account-exists-with-different-credential": "Já existe uma conta com este email por outro método de login."
};

let busy = false; // evita redirecionar antes de salvar o perfil

const show = (id, text, ok = false) => {
  const el = $(id);
  el.textContent = text;
  el.className = "msg" + (ok ? " ok" : "");
};
const explain = (e) => ERRORS[e.code] || "Erro inesperado. Tente novamente.";
const goDashboard = () => location.replace("../Dashboard/Dash.html");

onAuthStateChanged(auth, (user) => { if (user && !busy) goDashboard(); });

// Alternar entre login e cadastro
function toggle(showRegister) {
  $("login-box").hidden = showRegister;
  $("register-box").hidden = !showRegister;
}
$("toRegister").onclick = () => toggle(true);
$("toLogin").onclick = () => toggle(false);

// Cadastro
$("btnRegister").onclick = async () => {
  const name = $("name").value.trim();
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!name || !email || !password) return show("msg", "Preencha todos os campos.");

  busy = true;
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(user, { displayName: name });
    await setDoc(doc(db, "users", user.uid), { name, email, createdAt: serverTimestamp() });
    goDashboard();
  } catch (e) {
    busy = false;
    show("msg", explain(e));
  }
};

// Login
$("btnLogin").onclick = async () => {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  if (!email || !password) return show("loginMsg", "Preencha email e senha.");
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    show("loginMsg", explain(e));
  }
};

// Recuperar senha por email
$("btnReset").onclick = async () => {
  const email = $("loginEmail").value.trim();
  if (!email) return show("loginMsg", "Digite seu email acima para recuperar a senha.");
  try {
    await sendPasswordResetEmail(auth, email);
    show("loginMsg", "Enviamos um link de recuperação para o seu email.", true);
  } catch (e) {
    show("loginMsg", explain(e));
  }
};

// Login social
async function social(name) {
  busy = true;
  try {
    const { user } = await signInWithPopup(auth, providers[name]);
    await setDoc(doc(db, "users", user.uid),
      { name: user.displayName || "", email: user.email || "", lastLogin: serverTimestamp() },
      { merge: true });
    goDashboard();
  } catch (e) {
    busy = false;
    show("loginMsg", explain(e));
  }
}
$("btnGoogle").onclick = () => social("google");
$("btnGithub").onclick = () => social("github");
$("btnFacebook").onclick = () => social("facebook");