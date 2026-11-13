// Shared helpers used by every page: API calls, auth token, escaping, header, cards.

const TOKEN_KEY = 'cm_token';
const USER_KEY = 'cm_user';

const Auth = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

// Escape any user-provided text before it goes into innerHTML.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN');

function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso)) / 1000));
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [name, secs] of units) {
    const v = Math.floor(s / secs);
    if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

// ---------- "Waking up the server" notice (Render free tier sleeps) ----------
let pending = 0;
let wakeTimer = null;
function showWakeNotice(show) {
  let el = document.getElementById('wake-notice');
  if (show && !el) {
    el = document.createElement('div');
    el.id = 'wake-notice';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="spinner" aria-hidden="true"></span> Waking up the server, this can take up to a minute…';
    document.body.appendChild(el);
  }
  if (el) el.classList.toggle('visible', show);
}

// ---------- API wrapper ----------
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (Auth.token) headers.Authorization = `Bearer ${Auth.token}`;
  let payload;
  if (form) payload = form; // FormData — browser sets the multipart boundary
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  pending++;
  if (!wakeTimer) wakeTimer = setTimeout(() => showWakeNotice(true), 2500);

  let res;
  try {
    res = await fetch(window.API_BASE_URL + path, { method, headers, body: payload });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  } finally {
    if (--pending === 0) {
      clearTimeout(wakeTimer);
      wakeTimer = null;
      showWakeNotice(false);
    }
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && Auth.token && path !== '/api/auth/login') {
    Auth.clear(); // token expired or deleted
    renderHeader();
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const imageUrl = (id) => `${window.API_BASE_URL}/api/products/${id}/image`;

// ---------- Header / footer ----------
function renderHeader() {
  const el = document.getElementById('site-header');
  if (!el) return;
  const user = Auth.user;
  const page = (location.pathname.split('/').pop() || 'index.html');
  const link = (href, label) =>
    `<a href="${href}"${page === href ? ' aria-current="page"' : ''}>${label}</a>`;
  el.innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="index.html"><span class="brand-mark">CM</span> Campus Marketplace</a>
      <nav class="nav">
        ${link('index.html', 'Browse')}
        ${link('stats.html', 'Insights')}
        ${user ? link('account.html', 'My account') : ''}
        ${user
          ? `<button class="linklike" id="logout-btn" type="button">Log out</button>`
          : link('login.html', 'Log in')}
        <a class="btn btn-primary btn-sm" href="sell.html">+ Sell an item</a>
      </nav>
    </div>`;
  const out = document.getElementById('logout-btn');
  if (out) out.addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    Auth.clear();
    location.href = 'index.html';
  });
}

function renderFooter() {
  const el = document.getElementById('site-footer');
  if (el) el.innerHTML = `<div class="container">Made by students, for students · Meet in public places on campus and check items before paying.</div>`;
}

function requireLogin() {
  if (!Auth.token) {
    const back = location.pathname.split('/').pop() + location.search;
    location.href = 'login.html?next=' + encodeURIComponent(back);
    return false;
  }
  return true;
}

// ---------- Product visuals ----------
function photoHtml(p, cls = '') {
  if (p.has_image) {
    return `<div class="photo ${cls}"><img src="${imageUrl(p.id)}" alt="${esc(p.title)}" loading="lazy"></div>`;
  }
  const letter = esc((p.category || p.title || '?').trim().charAt(0).toUpperCase());
  return `<div class="photo placeholder ${cls}" aria-hidden="true"><span>${letter}</span></div>`;
}

function priceTag(price, cls = '') {
  return `<span class="price-tag ${cls}">${rupees(price)}</span>`;
}

function productCard(p, extra = '') {
  const sold = p.status === 'sold';
  return `
    <article class="card${sold ? ' is-sold' : ''}">
      <a class="card-link" href="item.html?id=${p.id}">
        <div class="card-media">
          ${photoHtml(p)}
          ${sold ? '<span class="stamp">Sold</span>' : ''}
          ${priceTag(p.price)}
        </div>
        <div class="card-body">
          <span class="chip">${esc(p.category)}</span>
          <h3 class="card-title">${esc(p.title)}</h3>
          <p class="muted small">${esc(p.item_condition)} · ${esc(p.seller_name)} · ${timeAgo(p.created_at)}</p>
        </div>
      </a>
      ${extra}
    </article>`;
}

function showMessage(el, text, kind = 'error') {
  if (!el) return;
  el.className = `notice notice-${kind}`;
  el.textContent = text;
  el.hidden = !text;
}

document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
});
