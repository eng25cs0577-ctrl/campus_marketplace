// Campus Marketplace API — Express + PostgreSQL
require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { query, setupDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CORS: only the deployed frontend + local testing ----------
function toOrigin(url) {
  try { return new URL(url).origin; } catch { return null; }
}
const allowedOrigins = new Set(
  [process.env.FRONTEND_URL, 'http://localhost:5500', 'http://127.0.0.1:5500']
    .map(toOrigin)
    .filter(Boolean)
);
app.use(cors({
  origin(origin, cb) {
    // Requests with no Origin (curl, Render health checks) are allowed.
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    return cb(null, false); // browser will block the response
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '100kb' }));

// ---------- Uploads: memory storage, images only, max 3 MB ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    const err = new Error('Only JPEG, PNG, WebP or GIF images are allowed');
    err.status = 400;
    cb(err);
  },
});

// ---------- Helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

function toId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Invalid ${label}`);
  return n;
}

const CONDITIONS = ['New', 'Like new', 'Good', 'Fair', 'Worn'];

// Columns returned for product lists/cards (never the raw image bytes).
const PRODUCT_COLUMNS = `
  p.id, p.title, p.description, p.price, p.item_condition, p.status, p.created_at,
  p.category_id, c.name AS category, p.seller_id, u.name AS seller_name,
  (p.image_data IS NOT NULL) AS has_image`;

// ---------- Auth ----------
async function loadUser(req) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1`,
    [match[1]]
  );
  return rows[0] || null;
}

async function optionalAuth(req, res, next) {
  req.user = await loadUser(req);
  next();
}
async function requireAuth(req, res, next) {
  req.user = await loadUser(req);
  if (!req.user) throw new HttpError(401, 'Please log in to continue');
  next();
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
  return token;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');

  if (name.length < 2 || name.length > 80) throw bad('Please enter your name (2–80 characters)');
  if (!EMAIL_RE.test(email)) throw bad('Please enter a valid email address');
  if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) throw bad('Phone number looks invalid');
  if (password.length < 6) throw bad('Password must be at least 6 characters');

  const hash = await bcrypt.hash(password, 10);
  let user;
  try {
    const { rows } = await query(
      `INSERT INTO users (name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, created_at`,
      [name, email, phone || null, hash]
    );
    user = rows[0];
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
  const token = await createSession(user.id);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) throw bad('Email and password are required');

  const { rows } = await query(
    'SELECT id, name, email, phone, created_at, password_hash FROM users WHERE email = $1',
    [email]
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new HttpError(401, 'Wrong email or password');
  }
  const { password_hash, ...user } = row;
  const token = await createSession(user.id);
  res.json({ token, user });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = req.get('Authorization').split(/\s+/)[1];
  await query('DELETE FROM sessions WHERE token = $1', [token]);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---------- Categories ----------
app.get('/api/categories', async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, COUNT(p.id)::int AS count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.status = 'available'
      GROUP BY c.id, c.name
      ORDER BY c.name`
  );
  res.json({ categories: rows });
});

// ---------- Products ----------
app.get('/api/products', async (req, res) => {
  const where = [];
  const params = [];
  const add = (value) => { params.push(value); return `$${params.length}`; };

  const q = String(req.query.q || '').trim();
  if (q) {
    const ph = add(`%${q}%`);
    where.push(`(p.title ILIKE ${ph} OR p.description ILIKE ${ph} OR c.name ILIKE ${ph})`);
  }
  if (req.query.category) where.push(`p.category_id = ${add(toId(req.query.category, 'category'))}`);

  for (const [key, op] of [['min', '>='], ['max', '<=']]) {
    if (req.query[key] !== undefined && req.query[key] !== '') {
      const n = Number(req.query[key]);
      if (!Number.isFinite(n) || n < 0) throw bad(`Invalid ${key} price`);
      where.push(`p.price ${op} ${add(Math.floor(n))}`);
    }
  }
  const includeSold = ['1', 'true', 'yes'].includes(String(req.query.include_sold || '').toLowerCase());
  if (!includeSold) where.push(`p.status = 'available'`);

  const SORTS = {
    newest: 'p.created_at DESC',
    price_asc: 'p.price ASC, p.created_at DESC',
    price_desc: 'p.price DESC, p.created_at DESC',
  };
  const orderBy = SORTS[req.query.sort] || SORTS.newest; // whitelisted, never user text

  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN users u      ON u.id = p.seller_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${orderBy}
      LIMIT 200`,
    params
  );
  res.json({ products: rows });
});

app.get('/api/products/:id', optionalAuth, async (req, res) => {
  const id = toId(req.params.id, 'product id');
  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS}, u.email AS seller_email, u.phone AS seller_phone,
            (SELECT COUNT(*)::int FROM wishlist w WHERE w.product_id = p.id) AS saves,
            EXISTS (SELECT 1 FROM wishlist w WHERE w.product_id = p.id AND w.user_id = $2) AS in_wishlist
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN users u      ON u.id = p.seller_id
      WHERE p.id = $1`,
    [id, req.user ? req.user.id : null]
  );
  const product = rows[0];
  if (!product) throw new HttpError(404, 'Item not found');
  // Contact details only for logged-in users.
  if (!req.user) { delete product.seller_email; delete product.seller_phone; }
  res.json({ product });
});

app.get('/api/products/:id/image', async (req, res) => {
  const id = toId(req.params.id, 'product id');
  const { rows } = await query(
    'SELECT image_data, image_type FROM products WHERE id = $1',
    [id]
  );
  if (!rows[0] || !rows[0].image_data) throw new HttpError(404, 'No photo for this item');
  res.set('Content-Type', rows[0].image_type || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=86400');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(rows[0].image_data);
});

app.post('/api/products', requireAuth, upload.single('image'), async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const condition = String(req.body.item_condition || 'Good').trim();
  const price = Number(req.body.price);
  const categoryId = toId(req.body.category_id, 'category');

  if (title.length < 3 || title.length > 120) throw bad('Title must be 3–120 characters');
  if (description.length > 2000) throw bad('Description is too long (max 2000 characters)');
  if (!Number.isInteger(price) || price < 0 || price > 10000000) throw bad('Price must be a whole number of rupees, 0 or more');
  if (!CONDITIONS.includes(condition)) throw bad(`Condition must be one of: ${CONDITIONS.join(', ')}`);

  const cat = await query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (!cat.rows[0]) throw bad('Unknown category');

  const { rows } = await query(
    `INSERT INTO products (seller_id, category_id, title, description, price, item_condition, image_data, image_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [req.user.id, categoryId, title, description, price, condition,
     req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null]
  );
  res.status(201).json({ id: rows[0].id });
});

async function loadOwnedProduct(productId, userId) {
  const { rows } = await query('SELECT id, seller_id FROM products WHERE id = $1', [productId]);
  if (!rows[0]) throw new HttpError(404, 'Item not found');
  if (rows[0].seller_id !== userId) throw new HttpError(403, 'Only the seller can change this item');
  return rows[0];
}

app.patch('/api/products/:id/status', requireAuth, async (req, res) => {
  const id = toId(req.params.id, 'product id');
  const status = String(req.body.status || '');
  if (!['available', 'sold'].includes(status)) throw bad("Status must be 'available' or 'sold'");
  await loadOwnedProduct(id, req.user.id);
  await query('UPDATE products SET status = $1 WHERE id = $2', [status, id]);
  res.json({ id, status });
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  const id = toId(req.params.id, 'product id');
  await loadOwnedProduct(id, req.user.id);
  await query('DELETE FROM products WHERE id = $1', [id]);
  res.json({ ok: true });
});

app.get('/api/me/products', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS}, COUNT(w.user_id)::int AS saves
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN users u      ON u.id = p.seller_id
       LEFT JOIN wishlist w ON w.product_id = p.id
      WHERE p.seller_id = $1
      GROUP BY p.id, c.name, u.name
      ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  res.json({ products: rows });
});

// ---------- Wishlist ----------
app.get('/api/wishlist', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS}
       FROM wishlist w
       JOIN products p   ON p.id = w.product_id
       JOIN categories c ON c.id = p.category_id
       JOIN users u      ON u.id = p.seller_id
      WHERE w.user_id = $1
      ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  res.json({ products: rows });
});

app.post('/api/wishlist/:productId', requireAuth, async (req, res) => {
  const productId = toId(req.params.productId, 'product id');
  const { rows } = await query('SELECT seller_id FROM products WHERE id = $1', [productId]);
  if (!rows[0]) throw new HttpError(404, 'Item not found');
  if (rows[0].seller_id === req.user.id) throw bad("You can't save your own listing");
  await query(
    'INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.user.id, productId]
  );
  res.status(201).json({ ok: true, in_wishlist: true });
});

app.delete('/api/wishlist/:productId', requireAuth, async (req, res) => {
  const productId = toId(req.params.productId, 'product id');
  await query('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
  res.json({ ok: true, in_wishlist: false });
});

// ---------- Messages ----------
app.get('/api/messages', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT m.id, m.product_id, m.sender_id, m.receiver_id, m.body, m.created_at,
            p.title AS product_title, p.seller_id, p.status AS product_status,
            s.name AS sender_name, r.name AS receiver_name
       FROM messages m
       JOIN products p ON p.id = m.product_id
       JOIN users s    ON s.id = m.sender_id
       JOIN users r    ON r.id = m.receiver_id
      WHERE m.sender_id = $1 OR m.receiver_id = $1
      ORDER BY m.created_at ASC`,
    [req.user.id]
  );
  res.json({ messages: rows });
});

app.post('/api/messages', requireAuth, async (req, res) => {
  const productId = toId(req.body.product_id, 'product id');
  const body = String(req.body.body || '').trim();
  if (!body) throw bad('Message cannot be empty');
  if (body.length > 1000) throw bad('Message is too long (max 1000 characters)');

  const { rows } = await query('SELECT seller_id FROM products WHERE id = $1', [productId]);
  if (!rows[0]) throw new HttpError(404, 'Item not found');
  const sellerId = rows[0].seller_id;

  let receiverId;
  if (req.user.id !== sellerId) {
    receiverId = sellerId; // buyers always write to the seller
  } else {
    // Sellers may only reply to someone who already messaged them about this item.
    receiverId = toId(req.body.to_user_id, 'recipient');
    const prior = await query(
      'SELECT 1 FROM messages WHERE product_id = $1 AND sender_id = $2 AND receiver_id = $3 LIMIT 1',
      [productId, receiverId, sellerId]
    );
    if (!prior.rows[0]) throw new HttpError(403, 'You can only reply to students who messaged you about this item');
  }

  const inserted = await query(
    `INSERT INTO messages (product_id, sender_id, receiver_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [productId, req.user.id, receiverId, body]
  );
  res.status(201).json({ message: inserted.rows[0] });
});

// ---------- Stats / Insights ----------
const STATS_QUERIES = {
  totals: `SELECT
  (SELECT COUNT(*) FROM users)::int                                AS students,
  (SELECT COUNT(*) FROM products)::int                             AS listings,
  (SELECT COUNT(*) FROM products WHERE status = 'available')::int  AS available,
  (SELECT COUNT(*) FROM products WHERE status = 'sold')::int       AS sold,
  (SELECT COALESCE(ROUND(AVG(price)), 0) FROM products)::int       AS avg_price,
  (SELECT COUNT(*) FROM messages)::int                             AS messages`,
  per_category: `SELECT c.name AS category,
       COUNT(p.id)::int AS listings,
       COUNT(p.id) FILTER (WHERE p.status = 'available')::int AS available,
       COALESCE(ROUND(AVG(p.price)), 0)::int AS avg_price
FROM categories c
LEFT JOIN products p ON p.category_id = c.id
GROUP BY c.id, c.name
ORDER BY listings DESC, c.name`,
  top_sellers: `SELECT u.name AS seller,
       COUNT(p.id)::int AS listings,
       COUNT(p.id) FILTER (WHERE p.status = 'sold')::int AS sold,
       COALESCE(SUM(p.price) FILTER (WHERE p.status = 'sold'), 0)::int AS earned
FROM users u
JOIN products p ON p.seller_id = u.id
GROUP BY u.id, u.name
ORDER BY sold DESC, listings DESC
LIMIT 5`,
  most_saved: `SELECT p.id, p.title, p.price, COUNT(w.user_id)::int AS saves
FROM products p
JOIN wishlist w ON w.product_id = p.id
GROUP BY p.id, p.title, p.price
ORDER BY saves DESC, p.title
LIMIT 5`,
};

app.get('/api/stats', async (req, res) => {
  const out = {};
  for (const [key, sql] of Object.entries(STATS_QUERIES)) {
    const { rows } = await query(sql);
    out[key] = { sql, rows };
  }
  res.json(out);
});

// ---------- Health ----------
app.get('/api/health', async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---------- 404 + error handler ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));
app.get('/', (req, res) => res.json({ name: 'Campus Marketplace API', health: '/api/health' }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large (max 3 MB)' : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
});

setupDatabase()
  .then(() => app.listen(PORT, () => console.log(`API listening on port ${PORT}`)))
  .catch((err) => {
    console.error('Could not set up the database:', err.message);
    process.exit(1);
  });
