// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAtJf7BFbbutpk53epAymX5bJCrF3_YxUA",
  authDomain: "gastos-a2c8e.firebaseapp.com",
  projectId: "gastos-a2c8e",
  storageBucket: "gastos-a2c8e.firebasestorage.app",
  messagingSenderId: "415272400924",
  appId: "1:415272400924:web:9a60adfbf852cd83fac7d9",
  measurementId: "G-QMV7DGMLQG"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Exporta para usar em outros arquivos JS
export { app, analytics };
