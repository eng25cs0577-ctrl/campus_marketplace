# Campus Marketplace

A website where college students buy and sell used items: textbooks, calculators, lab gear, hostel essentials, stationery, clothing and electronics.

**Live links**

| Part | URL |
|---|---|
| Website (GitHub Pages) | https://YOUR-USERNAME.github.io/campus-marketplace/ |
| API (Render) | https://campus-marketplace-api.onrender.com/api/health |
| Database | Neon PostgreSQL (private) |

Demo logins: `aarav@campus.edu` / `password123` and `priya@campus.edu` / `password123`

> The API runs on Render's free tier, which sleeps after 15 minutes without traffic. The first request after that can take up to a minute, and the site shows a "Waking up the server" notice while it waits.

---

## How the parts connect

```
Browser ──► GitHub Pages (frontend/)      static HTML, CSS, JS
               │  fetch() + "Authorization: Bearer <token>"
               ▼
            Render (backend/)             Node.js + Express REST API
               │  SQL over SSL (pg driver, parameterised queries)
               ▼
            Neon (database/)              PostgreSQL: tables, item photos stored as BYTEA
```

| Folder | What it does | Where it runs |
|---|---|---|
| `frontend/` | Plain HTML, CSS and vanilla JavaScript, with no framework or build step. `js/config.js` holds `API_BASE_URL`; every `fetch()` goes through `api()` in `js/common.js`. The login token is kept in `localStorage`. | GitHub Pages, deployed by `.github/workflows/deploy-frontend.yml` |
| `backend/` | Express API covering auth, listings, photo uploads, wishlist, messages and stats. It reads `DATABASE_URL`, `PORT` and `FRONTEND_URL` from the environment, and CORS allows only `FRONTEND_URL` plus `http://localhost:5500`. | Render, configured by `render.yaml` |
| `database/` | `schema.sql` creates the tables and `seed.sql` adds the demo data. The backend runs both automatically at startup if the tables don't exist yet. | Neon PostgreSQL |

Photos are stored inside the database (`products.image_data BYTEA`) and served by `GET /api/products/:id/image`. Render's disk is wiped on every restart, so nothing on it would survive.

---

## Run it locally

You need Node.js 18 or newer and PostgreSQL (a local install, or a Neon database).

```bash
git clone https://github.com/YOUR-USERNAME/campus-marketplace.git
```

```bash
cd campus-marketplace/backend
```

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL=postgresql://postgres@localhost:5432/campus     # or your Neon string
PORT=3000
FRONTEND_URL=http://localhost:5500
```

If you're using a local Postgres, create the database first with `createdb campus`. Then start the API. It creates the tables and demo data on its first run.

```bash
npm start
```

Serve the frontend on port 5500 from a second terminal. You can use VS Code's Live Server, or:

```bash
cd frontend && python3 -m http.server 5500
```

Open http://localhost:5500. When the page is served from `localhost`, `config.js` points it at `http://localhost:3000` automatically.

---

## Table design

```
users ─┬─< sessions                 one user, many login sessions
       ├─< products >── categories  a product has one seller and one category
       ├─< wishlist >── products    many-to-many: users ⇄ saved products
       └─< messages >── products    sender_id and receiver_id both → users
```

| Table | Columns | Notes |
|---|---|---|
| `users` | id SERIAL PK, name, email UNIQUE, phone, password_hash, created_at | Passwords are bcrypt-hashed and never stored in plain text |
| `sessions` | token PK, user_id FK → users, created_at | A random 64-character hex token is created at login and deleted at logout |
| `categories` | id SERIAL PK, name UNIQUE | 8 seeded categories |
| `products` | id, seller_id FK, category_id FK, title, description, price INTEGER CHECK (price >= 0), item_condition, image_data BYTEA, image_type, status CHECK IN ('available','sold'), created_at | Prices are whole rupees. Indexed on `status`, `category_id` and `seller_id` |
| `wishlist` | user_id FK, product_id FK, **PRIMARY KEY (user_id, product_id)** | The composite key stops anyone saving the same item twice |
| `messages` | id, product_id FK, sender_id FK, receiver_id FK, body, created_at | Each conversation is the set of messages about one product between two users |

Every foreign key uses `ON DELETE CASCADE`. Deleting a product also removes its wishlist rows and messages, and deleting a user removes their sessions, listings and messages.

---

## API routes

Send `Authorization: Bearer <token>` on the routes marked 🔒. Errors always come back as `{ "error": "message" }` with a matching status code (400, 401, 403, 404, 409 or 500).

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create an account `{name, email, phone?, password}` → `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` → `{token, user}` |
| POST | `/api/auth/logout` 🔒 | Delete the current session |
| GET | `/api/auth/me` 🔒 | The logged-in user |
| GET | `/api/categories` | Categories with counts of available items |
| GET | `/api/products` | List with filters: `q`, `category`, `min`, `max`, `sort=newest\|price_asc\|price_desc`, `include_sold=1` |
| GET | `/api/products/:id` | One item. Seller contact details are included only for logged-in users |
| GET | `/api/products/:id/image` | The photo bytes, sent with the stored `Content-Type` |
| POST | `/api/products` 🔒 | Multipart form: `title, category_id, price, item_condition, description, image?`. Images only, 3 MB max |
| PATCH | `/api/products/:id/status` 🔒 | `{status: "available" \| "sold"}`, owner only |
| DELETE | `/api/products/:id` 🔒 | Owner only |
| GET | `/api/me/products` 🔒 | My listings, with how many students saved each one |
| GET | `/api/wishlist` 🔒 | My saved items |
| POST | `/api/wishlist/:productId` 🔒 | Save an item |
| DELETE | `/api/wishlist/:productId` 🔒 | Remove an item from the wishlist |
| GET | `/api/messages` 🔒 | All my sent and received messages (the frontend groups them into conversations) |
| POST | `/api/messages` 🔒 | `{product_id, body, to_user_id?}`. A buyer's message always goes to the seller. A seller may reply only to someone who already messaged them about that item |
| GET | `/api/stats` | Totals, listings per category, top sellers and most-saved items, each returned as `{sql, rows}` |
| GET | `/api/health` | Health check used by Render |

---

## SQL concepts used

- **Primary keys and `SERIAL`** for auto-incrementing ids. **Composite primary key** on `wishlist(user_id, product_id)`.
- **Foreign keys with `ON DELETE CASCADE`** to keep related rows consistent.
- **Constraints**: `UNIQUE` (email, category name), `CHECK (price >= 0)`, `CHECK (status IN (...))`, `NOT NULL`, `DEFAULT NOW()`.
- **Indexes** on `products(status)` and `products(category_id)`, the columns every browse query filters on.
- **Parameterised queries** (`$1, $2 …`) everywhere, so user input is never pasted into SQL text and SQL injection isn't possible. The sort column is chosen from a fixed whitelist.
- **`ILIKE`** for case-insensitive search across title, description and category name.
- **`INNER JOIN`** to attach seller and category names to products.
- **`LEFT JOIN` + `GROUP BY` + `COUNT`** for category counts, so categories with zero items still appear, and for "how many students saved this item".
- **Aggregates with `FILTER (WHERE …)`**, for example `COUNT(p.id) FILTER (WHERE p.status = 'sold')`, plus `SUM`, `AVG`, `ROUND` and `COALESCE`.
- **Scalar subqueries** for the totals and **`EXISTS`** for checks like "is this in my wishlist?".
- **`ON CONFLICT DO NOTHING`** for idempotent inserts (wishlist, seed data).
- **`INSERT … SELECT … FROM (VALUES …) JOIN …`** in `seed.sql`, which looks up foreign keys by email and category name instead of hard-coding ids.
- **`BYTEA`** for storing binary image data.
- **`RETURNING`** to get the new id back from an `INSERT`.

The Insights page shows the exact SQL behind each section under **Show the SQL**.

---

## Deployment

### 1. Database: Neon

1. Go to https://neon.tech, sign up (GitHub login works) and click **New Project**. Name it `campus-marketplace`, pick the region closest to you (for example *AWS Asia Pacific (Singapore)*) and keep Postgres 16 or 17.
2. On the project dashboard, click **Connect**. Leave *Connection pooling* on and copy the connection string. It looks like:
   `postgresql://neondb_owner:xxxx@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
3. Create the tables. Use one of these three options:
   - **Easiest:** do nothing. The backend runs `schema.sql` and `seed.sql` the first time it starts.
   - **Neon SQL Editor:** open **SQL Editor** in the Neon sidebar, paste the contents of `database/schema.sql` and click **Run**, then do the same with `database/seed.sql`.
   - **psql:** run the command below.

```bash
psql "YOUR_NEON_CONNECTION_STRING" -f database/schema.sql -f database/seed.sql
```

### 2. Backend: Render

1. Go to https://render.com and sign up with GitHub.
2. Click **New + → Blueprint**, pick the `campus-marketplace` repository and click **Connect**. Render reads `render.yaml` and proposes a free web service called `campus-marketplace-api` (root directory `backend`, build `npm install`, start `npm start`, health check `/api/health`).
3. Render asks for the two `sync: false` variables:
   - `DATABASE_URL`: paste the Neon connection string.
   - `FRONTEND_URL`: `https://YOUR-USERNAME.github.io` (the origin only, with no path).
4. Click **Apply**. The first deploy takes 2–3 minutes. The logs should end with `Database ready` and `API listening on port …`.
5. Copy the service URL shown under the service name, for example `https://campus-marketplace-api.onrender.com`, and open `<url>/api/health` to check it.

If you'd rather not use a Blueprint, choose **New + → Web Service** and enter the same settings by hand. Set the root directory to `backend`.

### 3. Frontend: GitHub Pages

1. In the GitHub repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Put your Render URL in `RENDER_API_URL` in `frontend/js/config.js`, then commit and push to `main`.
3. The **Deploy frontend to GitHub Pages** workflow (Actions tab) publishes only the `frontend/` folder. The site appears at `https://YOUR-USERNAME.github.io/campus-marketplace/`.
4. On Render, check that `FRONTEND_URL` is `https://YOUR-USERNAME.github.io`. Changing it triggers a redeploy.

All links between pages are relative (`item.html?id=3`, `css/style.css`), so the site works under the `/campus-marketplace/` sub-path.
