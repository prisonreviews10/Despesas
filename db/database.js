const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Convert SQLite ? placeholders to PostgreSQL $1, $2, ...
function convertParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#6C63FF',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      color TEXT DEFAULT '#6C63FF'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      description TEXT,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budgets (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL UNIQUE REFERENCES categories(id),
      monthly_limit REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_icon TEXT,
      entity_category TEXT,
      entity_description TEXT,
      amount REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fixed_expenses (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      due_day INTEGER,
      is_shared INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed users if not exist
  const { rows: [{ count: userCount }] } = await pool.query('SELECT COUNT(*) as count FROM users');
  if (parseInt(userCount) === 0) {
    const hash = bcrypt.hashSync('despesas', 10);
    await pool.query('INSERT INTO users (username, password_hash, avatar_color) VALUES ($1, $2, $3)', ['Ivan', hash, '#6C63FF']);
    await pool.query('INSERT INTO users (username, password_hash, avatar_color) VALUES ($1, $2, $3)', ['Becky', hash, '#FF6B9D']);
  }

  // Seed categories if not exist
  const { rows: [{ count: catCount }] } = await pool.query('SELECT COUNT(*) as count FROM categories');
  if (parseInt(catCount) === 0) {
    const cats = [
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
      ['Salário', '💰', 'income', '#4CAF50'],
      ['Subsídio Alimentação', '🍽️', 'income', '#8BC34A'],
      ['Freelance', '💻', 'income', '#00BCD4'],
      ['Outros Rendimentos', '💵', 'income', '#66BB6A'],
    ];
    for (const [name, icon, type, color] of cats) {
      await pool.query('INSERT INTO categories (name, icon, type, color) VALUES ($1, $2, $3, $4)', [name, icon, type, color]);
    }
  }

  console.log('Base de dados inicializada com sucesso');
}

function getDb() {
  return {
    async all(sql, params = []) {
      try {
        const result = await pool.query(convertParams(sql), params);
        return result.rows;
      } catch (err) {
        console.error('SQL Error (all):', err.message, sql);
        return [];
      }
    },

    async get(sql, params = []) {
      try {
        const result = await pool.query(convertParams(sql), params);
        return result.rows[0] || null;
      } catch (err) {
        console.error('SQL Error (get):', err.message, sql);
        return null;
      }
    },

    async run(sql, params = []) {
      try {
        let pgSql = convertParams(sql);
        if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
          pgSql += ' RETURNING id';
        }
        const result = await pool.query(pgSql, params);
        return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
      } catch (err) {
        console.error('SQL Error (run):', err.message, sql);
        throw err;
      }
    }
  };
}

module.exports = { initialize, getDb };
