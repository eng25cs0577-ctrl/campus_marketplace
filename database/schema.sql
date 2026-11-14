-- Campus Marketplace — database schema (PostgreSQL / Neon)
-- Safe to run more than once: every object uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id             SERIAL PRIMARY KEY,
  seller_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id    INTEGER     NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT        NOT NULL DEFAULT '',
  price          INTEGER     NOT NULL CHECK (price >= 0),          -- whole rupees
  item_condition TEXT        NOT NULL DEFAULT 'Good',
  image_data     BYTEA,                                            -- photo bytes live in the DB
  image_type     TEXT,                                             -- e.g. image/jpeg
  image_updated_at TIMESTAMPTZ,                                    -- changes the photo URL so browsers refetch
  image_credit   TEXT,                                             -- attribution for licensed demo photos
  status         TEXT        NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available', 'sold')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlist (
  user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sender_id   INTEGER     NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  receiver_id INTEGER     NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade databases created before image_updated_at existed.
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_updated_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_credit TEXT;

CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_seller   ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user     ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id);
