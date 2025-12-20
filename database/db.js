const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

async function initDB() {
  const db = await sqlite.open({
    filename: path.join(__dirname, 'users.db'),
    driver: sqlite3.Database
  });

  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT
  )`);

  return db;
}

module.exports = initDB;
