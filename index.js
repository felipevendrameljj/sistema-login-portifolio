const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db'); // seu SQLite
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

/* ================== REGISTER ================== */
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) return res.status(400).json({ message: 'Preencha todos os campos' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
    db.run(query, [name, email, hashedPassword], function(err){
      if(err) return res.status(500).json({ message: 'Erro ao cadastrar usuário' });
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
    if(err) return res.status(500).json({ message: 'Erro no servidor' });
    if(!user) return res.status(401).json({ message: 'Email ou senha inválidos' });

    const match = await bcrypt.compare(password, user.password);
    if(!match) return res.status(401).json({ message: 'Email ou senha inválidos' });

    // Login OK → retorna id do usuário para o frontend
    res.json({ message: 'Login realizado com sucesso', user: { id: user.id, name: user.name } });
  });
});

/* ================== ROTAS DE GASTOS ================== */
app.post('/expenses', (req, res) => {
  const { user_id, category, description, amount } = req.body;

  if(!user_id || !category || !amount) return res.status(400).json({ message: 'Preencha todos os campos obrigatórios' });

  const query = `INSERT INTO expenses (user_id, category, description, amount) VALUES (?, ?, ?, ?)`;
  db.run(query, [user_id, category, description, amount], function(err){
    if(err) return res.status(500).json({ message: 'Erro ao adicionar gasto' });
    res.json({ message: 'Gasto adicionado com sucesso' });
  });
});

app.get('/expenses/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const query = `SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC`;
  db.all(query, [userId], (err, rows) => {
    if(err) return res.status(500).json({ message: 'Erro ao buscar gastos' });
    res.json(rows);
  });
});

app.get('/expenses-summary/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const query = `SELECT category, SUM(amount) as total FROM expenses WHERE user_id = ? GROUP BY category`;
  db.all(query, [userId], (err, rows) => {
    if(err) return res.status(500).json({ message: 'Erro ao gerar resumo' });
    res.json(rows);
  });
});

/* ================== SERVIDOR ================== */
const PORT = 3000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`Servidor rodando em http://${HOST}:${PORT}`));
