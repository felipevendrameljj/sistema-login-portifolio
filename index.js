const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const initDB = require('./database/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Rota de teste
app.get('/test', (req, res) => {
  res.send('Servidor acessível 🚀');
});

// Inicializa banco e rotas
(async () => {
  const db = await initDB();

  /* ================== REGISTER ================== */
  app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Preencha todos os campos' });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.run(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword]
      );
      res.json({ message: 'Usuário cadastrado com sucesso' });
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ message: 'Email já cadastrado' });
      } else {
        res.status(500).json({ message: 'Erro ao cadastrar usuário' });
      }
    }
  });

  /* ================== LOGIN ================== */
  app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Preencha todos os campos' });

    try {
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) return res.status(401).json({ message: 'Email ou senha inválidos' });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: 'Email ou senha inválidos' });

      res.json({
        message: 'Login realizado com sucesso',
        user: { id: user.id, name: user.name, email: user.email }
      });
    } catch (err) {
      res.status(500).json({ message: 'Erro no servidor' });
    }
  });

  // Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
})();
