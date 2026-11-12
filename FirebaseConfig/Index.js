import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, GithubAuthProvider, FacebookAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAtJf7BFbbutpk53epAymX5bJCrF3_YxUA",
  authDomain: "gastos-a2c8e.firebaseapp.com",
  projectId: "gastos-a2c8e",
  storageBucket: "gastos-a2c8e.firebasestorage.app",
  messagingSenderId: "415272400924",
  appId: "1:415272400924:web:9a60adfbf852cd83fac7d9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const providers = {
  google: new GoogleAuthProvider(),
  github: new GithubAuthProvider(),
  facebook: new FacebookAuthProvider()
};