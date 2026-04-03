const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'despesas.db');

let db = null;

async function initialize() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#6C63FF',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      color TEXT DEFAULT '#6C63FF'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      description TEXT,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fixed_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      due_day INTEGER,
      is_shared INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // Seed users if not exist
  const userCount = db.exec("SELECT COUNT(*) as count FROM users")[0]?.values[0][0] || 0;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('despesas', 10);
    db.run("INSERT INTO users (username, password_hash, avatar_color) VALUES (?, ?, ?)", ['Ivan', hash, '#6C63FF']);
    db.run("INSERT INTO users (username, password_hash, avatar_color) VALUES (?, ?, ?)", ['Rebeca', hash, '#FF6B9D']);
  }

  // Seed categories if not exist
  const catCount = db.exec("SELECT COUNT(*) as count FROM categories")[0]?.values[0][0] || 0;
  if (catCount === 0) {
    const cats = [
      // Expense categories
      ['Prestação Casa', '🏠', 'expense', '#FF6B6B'],
      ['Eletricidade', '⚡', 'expense', '#FFD93D'],
      ['Água', '💧', 'expense', '#4ECDC4'],
      ['Gás', '🔥', 'expense', '#FF8C42'],
      ['Internet/TV', '📡', 'expense', '#6C63FF'],
      ['Alimentação', '🛒', 'expense', '#95E1D3'],
      ['Transportes', '🚗', 'expense', '#F38181'],
      ['Seguros', '🛡️', 'expense', '#AA96DA'],
      ['Condomínio', '🏢', 'expense', '#A8D8EA'],
      ['Saúde', '💊', 'expense', '#FF6B9D'],
      ['Lazer', '🎮', 'expense', '#C9B1FF'],
      ['Roupa', '👕', 'expense', '#FFB7B2'],
      ['Educação', '📚', 'expense', '#B5EAD7'],
      ['Animais', '🐾', 'expense', '#E2C391'],
      ['Outros', '📦', 'expense', '#BDBDBD'],
      // Income categories
      ['Salário', '💰', 'income', '#4CAF50'],
      ['Subsídio Alimentação', '🍽️', 'income', '#8BC34A'],
      ['Freelance', '💻', 'income', '#00BCD4'],
      ['Outros Rendimentos', '💵', 'income', '#66BB6A'],
    ];

    for (const [name, icon, type, color] of cats) {
      db.run("INSERT INTO categories (name, icon, type, color) VALUES (?, ?, ?, ?)", [name, icon, type, color]);
    }
  }

  saveToFile();
  console.log('Base de dados inicializada com sucesso');
}

function saveToFile() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Erro ao guardar BD:', err);
  }
}

// Helper functions that mimic better-sqlite3 API
function getDb() {
  return {
    // Run a query that returns rows
    all(sql, params = []) {
      try {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);

        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      } catch (err) {
        console.error('SQL Error (all):', err.message, sql);
        return [];
      }
    },

    // Run a query that returns one row
    get(sql, params = []) {
      try {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);

        let result = null;
        if (stmt.step()) {
          result = stmt.getAsObject();
        }
        stmt.free();
        return result;
      } catch (err) {
        console.error('SQL Error (get):', err.message, sql);
        return null;
      }
    },

    // Run a query that modifies data
    run(sql, params = []) {
      try {
        db.run(sql, params);
        const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0][0];
        const changes = db.getRowsModified();
        saveToFile();
        return { lastInsertRowid: lastId, changes };
      } catch (err) {
        console.error('SQL Error (run):', err.message, sql);
        throw err;
      }
    }
  };
}

module.exports = { initialize, getDb };
