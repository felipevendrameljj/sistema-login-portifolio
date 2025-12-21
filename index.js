const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');
const bcrypt = require('bcrypt');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Servir dashboard.html
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html'));
});

/* ================== REGISTER ================== */
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Preencha todos os campos' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
    db.run(query, [name, email, hashedPassword], function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao cadastrar usuário' });
      res.json({ message: 'Usuário cadastrado com sucesso', user_id: this.lastID });
    });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao criptografar senha' });
  }
});

/* ================== LOGIN ================== */
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Preencha todos os campos' });

  const query = `SELECT * FROM users WHERE email = ?`;
  db.get(query, [email], async (err, user) => {
    if (err) return res.status(500).json({ message: 'Erro no servidor' });
    if (!user) return res.status(401).json({ message: 'Email ou senha inválidos' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Email ou senha inválidos' });

    res.json({ message: 'Login realizado com sucesso', user });
  });
});

/* ================== GASTOS ================== */
// Criar tabela se não existir
db.run(`CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  description TEXT,
  category TEXT,
  value REAL
)`);

// Adicionar gasto
app.post('/expenses', (req, res) => {
  const { user_id, description, category, value } = req.body;
  if (!user_id || !description || !category || !value) return res.status(400).json({ message: 'Preencha todos os campos' });

  const query = `INSERT INTO expenses (user_id, description, category, value) VALUES (?, ?, ?, ?)`;
  db.run(query, [user_id, description, category, value], function(err){
    if(err) return res.status(500).json({ message: 'Erro ao adicionar gasto' });
    res.json({ message: 'Gasto adicionado com sucesso', expense_id: this.lastID });
  });
});

// Listar gastos do usuário
app.get('/expenses/:user_id', (req, res) => {
  const user_id = req.params.user_id;
  const query = `SELECT * FROM expenses WHERE user_id = ?`;
  db.all(query, [user_id], (err, rows) => {
    if(err) return res.status(500).json({ message: 'Erro ao buscar gastos' });
    res.json(rows);
  });
});

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));
