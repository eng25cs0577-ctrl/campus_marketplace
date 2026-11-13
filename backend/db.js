// Database connection + automatic first-run setup.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Neon requires SSL. Local Postgres (localhost) usually does not support it.
const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
});

const query = (text, params) => pool.query(text, params);

const SQL_DIR = path.join(__dirname, '..', 'database');

// Runs schema.sql (always safe: IF NOT EXISTS) and seed.sql when the database is empty.
async function setupDatabase() {
  const { rows } = await query(
    `SELECT to_regclass('public.products') IS NOT NULL AS has_products,
            to_regclass('public.users')    IS NOT NULL AS has_users`
  );
  const fresh = !rows[0].has_products || !rows[0].has_users;

  if (!fs.existsSync(path.join(SQL_DIR, 'schema.sql'))) {
    if (fresh) throw new Error(`Tables are missing and ${SQL_DIR}/schema.sql was not found — run database/schema.sql and seed.sql manually`);
    console.warn('database/ folder not found; skipping auto-setup (tables already exist)');
    return;
  }

  await pool.query(fs.readFileSync(path.join(SQL_DIR, 'schema.sql'), 'utf8'));

  if (fresh) {
    console.log('Fresh database detected — running seed.sql');
    await pool.query(fs.readFileSync(path.join(SQL_DIR, 'seed.sql'), 'utf8'));
  }
  console.log('Database ready');
}

module.exports = { pool, query, setupDatabase };
