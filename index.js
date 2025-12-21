const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./database/db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

/* ================== REGISTER ================== */
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Preencha todos os campos' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;

    db.run(query, [name, email, hashedPassword], function (err) {
      if (err) {
        return res.status(500).json({ message: 'Erro ao cadastrar usuário' });
      }
      res.json({ message: 'Usuário cadastrado com sucesso', userId: this.lastID });
    });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao criptografar senha' });
  }
});

/* ================== LOGIN ================== */
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Preencha todos os campos' });
  }

  const query = `SELECT * FROM users WHERE email = ?`;
  db.get(query, [email], async (err, user) => {
    if (err) return res.status(500).json({ message: 'Erro no servidor' });
    if (!user) return res.status(401).json({ message: 'Email ou senha inválidos' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Email ou senha inválidos' });

    res.json({ message: 'Login realizado com sucesso', user });
  });
});

/* ================== ADD EXPENSE ================== */
app.post('/expense', (req, res) => {
  const { user_id, category, description, amount } = req.body;
  if (!user_id || !category || !amount) {
    return res.status(400).json({ message: 'Preencha todos os campos obrigatórios' });
  }

  const query = `INSERT INTO expenses (user_id, category, description, amount) VALUES (?, ?, ?, ?)`;
  db.run(query, [user_id, category, description, amount], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao adicionar gasto' });
    res.json({ message: 'Gasto registrado com sucesso', expenseId: this.lastID });
  });
});

/* ================== GET EXPENSES ================== */
app.get('/expenses/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const query = `SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC`;
  db.all(query, [userId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar gastos' });
    res.json(rows);
  });
});

/* ================== GET USERS (apenas teste) ================== */
app.get('/users', (req, res) => {
  db.all('SELECT id, name, email FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar usuários' });
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});
