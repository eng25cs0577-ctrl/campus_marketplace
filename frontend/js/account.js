// Account page: My listings, Wishlist, Messages (grouped into conversations).
if (requireLogin()) {
  const me = Auth.user;
  const errorEl = document.getElementById('error');
  const panels = {
    listings: document.getElementById('panel-listings'),
    wishlist: document.getElementById('panel-wishlist'),
    messages: document.getElementById('panel-messages'),
  };
  const loaders = { listings: loadListings, wishlist: loadWishlist, messages: loadMessages };

  document.getElementById('hello').textContent = `Hi, ${me.name.split(' ')[0]}!`;
  document.getElementById('hello-sub').textContent = me.email;

  function showTab(name) {
    if (!panels[name]) name = 'listings';
    document.querySelectorAll('.tab[data-tab]').forEach((t) =>
      t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    for (const [k, el] of Object.entries(panels)) el.hidden = k !== name;
    history.replaceState(null, '', '#' + name);
    showMessage(errorEl, '');
    loaders[name]();
  }
  document.querySelectorAll('.tab[data-tab]').forEach((t) =>
    t.addEventListener('click', () => showTab(t.dataset.tab)));

  const badge = (name, n) => { document.getElementById('badge-' + name).textContent = n; };

  // ---------- My listings ----------
  async function loadListings() {
    const el = panels.listings;
    el.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const { products } = await api('/api/me/products');
      badge('listings', products.length);
      if (!products.length) {
        el.innerHTML = `<div class="empty">You haven't listed anything yet.<br><br><a class="btn btn-primary" href="sell.html">Sell your first item</a></div>`;
        return;
      }
      el.innerHTML = `<div class="grid">${products.map((p) => productCard(p, `
        <div class="card-actions">
          <span class="muted small" style="flex-basis:100%">♥ ${p.saves} saved</span>
          <button class="btn btn-sm" data-action="status" data-id="${p.id}" data-status="${p.status}">
            ${p.status === 'sold' ? 'Mark available' : 'Mark sold'}</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">Delete</button>
        </div>`)).join('')}</div>`;
    } catch (err) { el.innerHTML = ''; showMessage(errorEl, err.message); }
  }

  panels.listings.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    const id = b.dataset.id;
    b.disabled = true;
    try {
      if (b.dataset.action === 'status') {
        const status = b.dataset.status === 'sold' ? 'available' : 'sold';
        await api(`/api/products/${id}/status`, { method: 'PATCH', body: { status } });
      } else {
        if (!confirm('Delete this listing permanently?')) { b.disabled = false; return; }
        await api(`/api/products/${id}`, { method: 'DELETE' });
      }
      loadListings();
    } catch (err) { showMessage(errorEl, err.message); b.disabled = false; }
  });

  // ---------- Wishlist ----------
  async function loadWishlist() {
    const el = panels.wishlist;
    el.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const { products } = await api('/api/wishlist');
      badge('wishlist', products.length);
      el.innerHTML = products.length
        ? `<div class="grid">${products.map((p) => productCard(p, `
            <div class="card-actions"><button class="btn btn-sm" data-remove="${p.id}">Remove from wishlist</button></div>`)).join('')}</div>`
        : `<div class="empty">Your wishlist is empty. Tap “Save to wishlist” on any item to keep track of it.</div>`;
    } catch (err) { el.innerHTML = ''; showMessage(errorEl, err.message); }
  }

  panels.wishlist.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-remove]');
    if (!b) return;
    b.disabled = true;
    try {
      await api(`/api/wishlist/${b.dataset.remove}`, { method: 'DELETE' });
      loadWishlist();
    } catch (err) { showMessage(errorEl, err.message); b.disabled = false; }
  });

  // ---------- Messages ----------
  async function loadMessages() {
    const el = panels.messages;
    el.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const { messages } = await api('/api/messages');
      // Group by item + the other student.
      const convos = new Map();
      for (const m of messages) {
        const otherId = m.sender_id === me.id ? m.receiver_id : m.sender_id;
        const otherName = m.sender_id === me.id ? m.receiver_name : m.sender_name;
        const key = `${m.product_id}:${otherId}`;
        if (!convos.has(key)) {
          convos.set(key, { productId: m.product_id, title: m.product_title, sold: m.product_status === 'sold',
            iAmSeller: m.seller_id === me.id, otherId, otherName, items: [] });
        }
        convos.get(key).items.push(m);
      }
      const list = [...convos.values()].sort((a, b) =>
        new Date(b.items.at(-1).created_at) - new Date(a.items.at(-1).created_at));
      badge('messages', list.length);

      if (!list.length) {
        el.innerHTML = `<div class="empty">No messages yet. Open an item and use “Message the seller” to start a conversation.</div>`;
        return;
      }
      el.innerHTML = list.map((c) => `
        <div class="convo">
          <div class="convo-head">
            <div><a href="item.html?id=${c.productId}">${esc(c.title)}</a>${c.sold ? ' <span class="chip" style="color:var(--red);background:#FDECEC">Sold</span>' : ''}</div>
            <span class="muted small">${c.iAmSeller ? 'Buyer' : 'Seller'}: ${esc(c.otherName)}</span>
          </div>
          <div class="convo-body">
            ${c.items.map((m) => `
              <div class="bubble${m.sender_id === me.id ? ' mine' : ''}">${esc(m.body)}<time datetime="${esc(m.created_at)}">${timeAgo(m.created_at)}</time></div>`).join('')}
          </div>
          <form class="reply" data-product="${c.productId}" data-to="${c.otherId}">
            <input name="body" maxlength="1000" placeholder="Reply to ${esc(c.otherName)}…" aria-label="Reply to ${esc(c.otherName)}" required>
            <button class="btn btn-primary btn-sm" type="submit">Send</button>
          </form>
        </div>`).join('');
      el.querySelectorAll('.convo-body').forEach((b) => { b.scrollTop = b.scrollHeight; });
    } catch (err) { el.innerHTML = ''; showMessage(errorEl, err.message); }
  }

  panels.messages.addEventListener('submit', async (e) => {
    const form = e.target.closest('form.reply');
    if (!form) return;
    e.preventDefault();
    const body = form.body.value.trim();
    if (!body) return;
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api('/api/messages', { method: 'POST', body: {
        product_id: Number(form.dataset.product), to_user_id: Number(form.dataset.to), body } });
      loadMessages();
    } catch (err) { showMessage(errorEl, err.message); btn.disabled = false; }
  });

  showTab(location.hash.slice(1) || 'listings');
}
