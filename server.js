const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { initialize, getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'despesas-app-secret-key-2024';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Helper to write an activity log entry
function writeLog(db, userId, action, entityType, { icon, category, description, amount } = {}) {
  db.run(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_icon, entity_category, entity_description, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, action, entityType, icon || null, category || null, description || null, amount || null]
  );
}

// ============ AUTH ============

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  const user = db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) return res.status(401).json({ error: 'Utilizador não encontrado' });
  if (!bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Palavra-passe incorreta' });

  const token = jwt.sign(
    { id: user.id, username: user.username, avatar_color: user.avatar_color },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, username: user.username, avatar_color: user.avatar_color } });
});

app.get('/api/me', authenticate, (req, res) => {
  const db = getDb();
  res.json(db.get('SELECT id, username, avatar_color FROM users WHERE id = ?', [req.user.id]));
});

// ============ CATEGORIES ============

app.get('/api/categories', authenticate, (req, res) => {
  res.json(getDb().all('SELECT * FROM categories ORDER BY type, name'));
});

// ============ TRANSACTIONS ============

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
  if (type) { query += ` AND t.type = ?`; params.push(type); }
  if (user_id) { query += ` AND t.user_id = ?`; params.push(parseInt(user_id)); }
  query += ` ORDER BY t.date DESC, t.created_at DESC`;
  res.json(db.all(query, params));
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
    FROM transactions t JOIN categories c ON t.category_id = c.id
    JOIN users u ON t.user_id = u.id WHERE t.id = ?
  `, [result.lastInsertRowid]);

  writeLog(db, req.user.id, 'created', 'transaction', {
    icon: transaction.category_icon,
    category: transaction.category_name,
    description: description || transaction.category_name,
    amount
  });

  res.json(transaction);
});

app.put('/api/transactions/:id', authenticate, (req, res) => {
  const { category_id, type, description, amount, date } = req.body;
  const db = getDb();
  const id = parseInt(req.params.id);

  db.run(
    'UPDATE transactions SET category_id = ?, type = ?, description = ?, amount = ?, date = ? WHERE id = ?',
    [category_id, type, description || '', amount, date, id]
  );

  const transaction = db.get(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
           u.username, u.avatar_color
    FROM transactions t JOIN categories c ON t.category_id = c.id
    JOIN users u ON t.user_id = u.id WHERE t.id = ?
  `, [id]);

  writeLog(db, req.user.id, 'updated', 'transaction', {
    icon: transaction.category_icon,
    category: transaction.category_name,
    description: description || transaction.category_name,
    amount
  });

  res.json(transaction);
});

app.delete('/api/transactions/:id', authenticate, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);

  const transaction = db.get(`
    SELECT t.*, c.name as category_name, c.icon as category_icon
    FROM transactions t JOIN categories c ON t.category_id = c.id WHERE t.id = ?
  `, [id]);

  if (transaction) {
    writeLog(db, req.user.id, 'deleted', 'transaction', {
      icon: transaction.category_icon,
      category: transaction.category_name,
      description: transaction.description || transaction.category_name,
      amount: transaction.amount
    });
  }

  db.run('DELETE FROM transactions WHERE id = ?', [id]);
  res.json({ success: true });
});

// ============ FIXED EXPENSES ============

app.get('/api/fixed-expenses', authenticate, (req, res) => {
  res.json(getDb().all(`
    SELECT f.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM fixed_expenses f JOIN categories c ON f.category_id = c.id
    WHERE f.active = 1 ORDER BY f.due_day
  `));
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
    FROM fixed_expenses f JOIN categories c ON f.category_id = c.id WHERE f.id = ?
  `, [result.lastInsertRowid]);

  writeLog(db, req.user.id, 'created', 'fixed_expense', {
    icon: expense.category_icon,
    category: expense.category_name,
    description,
    amount
  });

  res.json(expense);
});

app.put('/api/fixed-expenses/:id', authenticate, (req, res) => {
  const { category_id, description, amount, due_day, is_shared } = req.body;
  const db = getDb();
  const id = parseInt(req.params.id);

  db.run(
    'UPDATE fixed_expenses SET category_id = ?, description = ?, amount = ?, due_day = ?, is_shared = ? WHERE id = ?',
    [category_id, description, amount, due_day || null, is_shared ? 1 : 0, id]
  );

  const expense = db.get(`
    SELECT f.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM fixed_expenses f JOIN categories c ON f.category_id = c.id WHERE f.id = ?
  `, [id]);

  writeLog(db, req.user.id, 'updated', 'fixed_expense', {
    icon: expense.category_icon,
    category: expense.category_name,
    description,
    amount
  });

  res.json(expense);
});

app.delete('/api/fixed-expenses/:id', authenticate, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);

  const expense = db.get(`
    SELECT f.*, c.name as category_name, c.icon as category_icon
    FROM fixed_expenses f JOIN categories c ON f.category_id = c.id WHERE f.id = ?
  `, [id]);

  if (expense) {
    writeLog(db, req.user.id, 'deleted', 'fixed_expense', {
      icon: expense.category_icon,
      category: expense.category_name,
      description: expense.description,
      amount: expense.amount
    });
  }

  db.run('UPDATE fixed_expenses SET active = 0 WHERE id = ?', [id]);
  res.json({ success: true });
});

// ============ LOGS ============

app.get('/api/logs', authenticate, (req, res) => {
  const db = getDb();
  const logs = db.all(`
    SELECT l.*, u.username, u.avatar_color
    FROM activity_logs l
    JOIN users u ON l.user_id = u.id
    ORDER BY l.created_at DESC
    LIMIT 200
  `);
  res.json(logs);
});

// ============ SUMMARY ============

app.get('/api/summary', authenticate, (req, res) => {
  const { month, year } = req.query;
  const db = getDb();
  const m = (month || (new Date().getMonth() + 1).toString()).padStart(2, '0');
  const y = year || new Date().getFullYear().toString();

  const totals = db.all(`
    SELECT type, SUM(amount) as total FROM transactions
    WHERE substr(date, 6, 2) = ? AND substr(date, 1, 4) = ? GROUP BY type
  `, [m, y]);

  const perUser = db.all(`
    SELECT u.id, u.username, u.avatar_color, t.type, SUM(t.amount) as total
    FROM transactions t JOIN users u ON t.user_id = u.id
    WHERE substr(t.date, 6, 2) = ? AND substr(t.date, 1, 4) = ?
    GROUP BY u.id, t.type
  `, [m, y]);

  const byCategory = db.all(`
    SELECT c.id, c.name, c.icon, c.color, t.type, SUM(t.amount) as total
    FROM transactions t JOIN categories c ON t.category_id = c.id
    WHERE substr(t.date, 6, 2) = ? AND substr(t.date, 1, 4) = ?
    GROUP BY c.id, t.type ORDER BY total DESC
  `, [m, y]);

  const fixedRow = db.get('SELECT SUM(amount) as total FROM fixed_expenses WHERE active = 1');

  res.json({
    month: m, year: y,
    totals: {
      income: totals.find(t => t.type === 'income')?.total || 0,
      expenses: totals.find(t => t.type === 'expense')?.total || 0
    },
    perUser, byCategory,
    fixedExpensesTotal: fixedRow?.total || 0
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initialize().then(() => {
  app.listen(PORT, () => console.log(`Servidor a correr em http://localhost:${PORT}`));
}).catch(err => { console.error(err); process.exit(1); });
