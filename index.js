const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

/* ================== REGISTER ================== */
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Preencha todos os campos' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
    db.run(query, [name, email, hashedPassword], function(err) {
      if (err) return res.status(500).json({ message: 'Erro ao cadastrar usuário' });
      res.json({ message: 'Usuário cadastrado com sucesso' });
    });
  } catch {
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

    res.json({ message: 'Login realizado com sucesso', user: { name: user.name, email: user.email } });
  });
});

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));
