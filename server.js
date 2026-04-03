const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { initialize, getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'despesas-app-secret-key-2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ============ AUTH ROUTES ============

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDb();

  const user = db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) return res.status(401).json({ error: 'Utilizador não encontrado' });

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Palavra-passe incorreta' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, avatar_color: user.avatar_color },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token, user: { id: user.id, username: user.username, avatar_color: user.avatar_color } });
});

app.get('/api/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.get('SELECT id, username, avatar_color FROM users WHERE id = ?', [req.user.id]);
  res.json(user);
});

// ============ CATEGORIES ROUTES ============

app.get('/api/categories', authenticate, (req, res) => {
  const db = getDb();
  const categories = db.all('SELECT * FROM categories ORDER BY type, name');
  res.json(categories);
});

// ============ TRANSACTIONS ROUTES ============

app.get('/api/transactions', authenticate, (req, res) => {
  const { month, year, type, user_id } = req.query;
  const db = getDb();

  let query = `
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
           u.username, u.avatar_color
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    JOIN users u ON t.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (month && year) {
    query += ` AND substr(t.date, 6, 2) = ? AND substr(t.date, 1, 4) = ?`;
    params.push(month.padStart(2, '0'), year);
  }
  if (type) {
    query += ` AND t.type = ?`;
    params.push(type);
  }
  if (user_id) {
    query += ` AND t.user_id = ?`;
    params.push(parseInt(user_id));
  }

  query += ` ORDER BY t.date DESC, t.created_at DESC`;

  const transactions = db.all(query, params);
  res.json(transactions);
});

app.post('/api/transactions', authenticate, (req, res) => {
  const { category_id, type, description, amount, date } = req.body;
  const db = getDb();

  const result = db.run(
    'INSERT INTO transactions (user_id, category_id, type, description, amount, date) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, category_id, type, description || '', amount, date]
  );

  const transaction = db.get(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
           u.username, u.avatar_color
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ?
  `, [result.lastInsertRowid]);

  res.json(transaction);
});

app.delete('/api/transactions/:id', authenticate, (req, res) => {
  const db = getDb();
  db.run('DELETE FROM transactions WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

app.put('/api/transactions/:id', authenticate, (req, res) => {
  const { category_id, type, description, amount, date } = req.body;
  const db = getDb();

  db.run(
    'UPDATE transactions SET category_id = ?, type = ?, description = ?, amount = ?, date = ? WHERE id = ?',
    [category_id, type, description || '', amount, date, parseInt(req.params.id)]
  );

  const transaction = db.get(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
           u.username, u.avatar_color
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ?
  `, [parseInt(req.params.id)]);

  res.json(transaction);
});

// ============ FIXED EXPENSES ROUTES ============

app.get('/api/fixed-expenses', authenticate, (req, res) => {
  const db = getDb();
  const expenses = db.all(`
    SELECT f.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM fixed_expenses f
    JOIN categories c ON f.category_id = c.id
    WHERE f.active = 1
    ORDER BY f.due_day
  `);
  res.json(expenses);
});

app.post('/api/fixed-expenses', authenticate, (req, res) => {
  const { category_id, description, amount, due_day, is_shared } = req.body;
  const db = getDb();

  const result = db.run(
    'INSERT INTO fixed_expenses (category_id, description, amount, due_day, is_shared) VALUES (?, ?, ?, ?, ?)',
    [category_id, description, amount, due_day || null, is_shared ? 1 : 0]
  );

  const expense = db.get(`
    SELECT f.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM fixed_expenses f
    JOIN categories c ON f.category_id = c.id
    WHERE f.id = ?
  `, [result.lastInsertRowid]);

  res.json(expense);
});

app.put('/api/fixed-expenses/:id', authenticate, (req, res) => {
  const { category_id, description, amount, due_day, is_shared } = req.body;
  const db = getDb();

  db.run(
    'UPDATE fixed_expenses SET category_id = ?, description = ?, amount = ?, due_day = ?, is_shared = ? WHERE id = ?',
    [category_id, description, amount, due_day || null, is_shared ? 1 : 0, parseInt(req.params.id)]
  );

  const expense = db.get(`
    SELECT f.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM fixed_expenses f
    JOIN categories c ON f.category_id = c.id
    WHERE f.id = ?
  `, [parseInt(req.params.id)]);

  res.json(expense);
});

app.delete('/api/fixed-expenses/:id', authenticate, (req, res) => {
  const db = getDb();
  db.run('UPDATE fixed_expenses SET active = 0 WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

// ============ SUMMARY/STATS ROUTES ============

app.get('/api/summary', authenticate, (req, res) => {
  const { month, year } = req.query;
  const db = getDb();
  const m = (month || (new Date().getMonth() + 1).toString()).padStart(2, '0');
  const y = year || new Date().getFullYear().toString();

  // Total income and expenses for the month
  const totals = db.all(`
    SELECT type, SUM(amount) as total
    FROM transactions
    WHERE substr(date, 6, 2) = ? AND substr(date, 1, 4) = ?
    GROUP BY type
  `, [m, y]);

  // Per user totals
  const perUser = db.all(`
    SELECT u.id, u.username, u.avatar_color, t.type, SUM(t.amount) as total
    FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE substr(t.date, 6, 2) = ? AND substr(t.date, 1, 4) = ?
    GROUP BY u.id, t.type
  `, [m, y]);

  // By category
  const byCategory = db.all(`
    SELECT c.id, c.name, c.icon, c.color, t.type, SUM(t.amount) as total
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE substr(t.date, 6, 2) = ? AND substr(t.date, 1, 4) = ?
    GROUP BY c.id, t.type
    ORDER BY total DESC
  `, [m, y]);

  // Fixed expenses total
  const fixedRow = db.get('SELECT SUM(amount) as total FROM fixed_expenses WHERE active = 1');

  res.json({
    month: m,
    year: y,
    totals: {
      income: totals.find(t => t.type === 'income')?.total || 0,
      expenses: totals.find(t => t.type === 'expense')?.total || 0
    },
    perUser,
    byCategory,
    fixedExpensesTotal: fixedRow?.total || 0
  });
});

// Serve main app for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server after DB init
initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor a correr em http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Erro ao inicializar BD:', err);
  process.exit(1);
});
