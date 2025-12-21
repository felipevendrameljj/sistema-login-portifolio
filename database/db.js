const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho correto do banco de dados
const dbPath = path.join(__dirname, 'database.db');

// Conectar ao banco
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar no banco:', err);
  } else {
    console.log('Banco de dados conectado com sucesso ✅');
  }
});

// Criar tabela de usuários
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
`;
db.run(createUsersTable, (err) => {
  if (err) console.log('Erro ao criar tabela users', err);
  else console.log('Tabela users pronta ✅');
});

// Criar tabela de gastos
const createExpensesTable = `
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  date TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`;
db.run(createExpensesTable, (err) => {
  if (err) console.log('Erro ao criar tabela expenses', err);
  else console.log('Tabela expenses pronta ✅');
});

// Exportar a conexão
module.exports = db;
