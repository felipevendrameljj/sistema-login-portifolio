import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, GithubAuthProvider, FacebookAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5PR7qR_3RoNLPsRjZ5rcNqOx5wjqZMjo",
  authDomain: "sistemadelogin-01.firebaseapp.com",
  projectId: "sistemadelogin-01",
  storageBucket: "sistemadelogin-01.firebasestorage.app",
  messagingSenderId: "253405926265",
  appId: "1:253405926265:web:27043e2e28ba51ddebd5a8"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const providers = {
  google: new GoogleAuthProvider(),
  github: new GithubAuthProvider(),
  facebook: new FacebookAuthProvider()
};