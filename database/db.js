const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'users.db'), (err) => {
  if (err) return console.error(err.message);
  console.log('Banco de dados conectado com sucesso');
});

/* Criar tabela se não existir */
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT UNIQUE,
  password TEXT
)`);

module.exports = db;
