// Item detail page: buyer actions (wishlist, message) and owner actions (status, delete).
const root = document.getElementById('item');
const errorEl = document.getElementById('error');
const productId = new URLSearchParams(location.search).get('id');

let product = null;

function render() {
  const p = product;
  const me = Auth.user;
  const isOwner = me && me.id === p.seller_id;
  const sold = p.status === 'sold';
  document.title = `${p.title} — Campus Marketplace`;

  let actions = '';
  if (isOwner) {
    actions = `
      <div class="notice notice-info">This is your listing. ${p.saves} student${p.saves === 1 ? ' has' : 's have'} saved it.</div>
      <div class="actions">
        <button class="btn btn-primary" id="toggle-status">${sold ? 'Mark as available' : 'Mark as sold'}</button>
        <button class="btn btn-danger" id="delete-btn">Delete listing</button>
      </div>`;
  } else if (me) {
    actions = `
      <div class="actions">
        <button class="btn" id="wish-btn" aria-pressed="${p.in_wishlist}">
          ${p.in_wishlist ? '♥ Saved to wishlist' : '♡ Save to wishlist'}
        </button>
      </div>
      ${sold ? '<div class="notice notice-info">This item has been sold.</div>' : `
      <form class="panel" id="msg-form" style="padding:18px">
        <label for="msg-body">Message ${esc(p.seller_name)}</label>
        <textarea id="msg-body" maxlength="1000" required>Hi! Is “${esc(p.title)}” still available?</textarea>
        <div id="msg-status" hidden></div>
        <button class="btn btn-primary" type="submit" style="margin-top:10px">Send message</button>
      </form>`}`;
  } else {
    const next = encodeURIComponent(`item.html?id=${p.id}`);
    actions = `<div class="actions"><a class="btn btn-primary" href="login.html?next=${next}">Log in to message the seller or save this item</a></div>`;
  }

  const contact = (p.seller_email || p.seller_phone)
    ? `<dt>Contact</dt><dd>${esc(p.seller_email || '')}${p.seller_phone ? ' · ' + esc(p.seller_phone) : ''}</dd>`
    : '';

  root.innerHTML = `
    <div class="item-layout">
      <div class="item-photo">
        ${photoHtml(p)}
        ${sold ? '<span class="stamp big">Sold</span>' : ''}
      </div>
      <div>
        <span class="chip">${esc(p.category)}</span>
        <h1 style="margin-top:10px">${esc(p.title)}</h1>
        <div style="margin:14px 0 6px">${priceTag(p.price, 'big')}</div>
        <dl class="item-meta">
          <dt>Condition</dt><dd>${esc(p.item_condition)}</dd>
          <dt>Seller</dt><dd>${esc(p.seller_name)}</dd>
          ${contact}
          <dt>Posted</dt><dd>${timeAgo(p.created_at)}</dd>
          <dt>Status</dt><dd>${sold ? '<strong style="color:var(--red)">Sold</strong>' : '<strong style="color:var(--green)">Available</strong>'}</dd>
        </dl>
        <p class="item-desc">${esc(p.description) || '<span class="muted">No description.</span>'}</p>
        ${actions}
      </div>
    </div>`;
  bind();
}

function bind() {
  const toggle = document.getElementById('toggle-status');
  if (toggle) toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      const status = product.status === 'sold' ? 'available' : 'sold';
      await api(`/api/products/${product.id}/status`, { method: 'PATCH', body: { status } });
      product.status = status;
      render();
    } catch (err) { showMessage(errorEl, err.message); toggle.disabled = false; }
  });

  const del = document.getElementById('delete-btn');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Delete this listing permanently? Messages and wishlist saves for it will be removed too.')) return;
    del.disabled = true;
    try {
      await api(`/api/products/${product.id}`, { method: 'DELETE' });
      location.href = 'account.html';
    } catch (err) { showMessage(errorEl, err.message); del.disabled = false; }
  });

  const wish = document.getElementById('wish-btn');
  if (wish) wish.addEventListener('click', async () => {
    wish.disabled = true;
    try {
      const method = product.in_wishlist ? 'DELETE' : 'POST';
      await api(`/api/wishlist/${product.id}`, { method });
      product.in_wishlist = !product.in_wishlist;
      render();
    } catch (err) { showMessage(errorEl, err.message); wish.disabled = false; }
  });

  const form = document.getElementById('msg-form');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bodyEl = document.getElementById('msg-body');
    const status = document.getElementById('msg-status');
    const btn = form.querySelector('button');
    const body = bodyEl.value.trim();
    if (!body) return showMessage(status, 'Please write a message.');
    btn.disabled = true;
    try {
      await api('/api/messages', { method: 'POST', body: { product_id: product.id, body } });
      bodyEl.value = '';
      status.className = 'notice notice-success';
      status.innerHTML = 'Message sent! Replies will appear in <a href="account.html#messages">My account → Messages</a>.';
      status.hidden = false;
    } catch (err) { showMessage(status, err.message); }
    btn.disabled = false;
  });
}

async function init() {
  if (!productId) {
    root.innerHTML = '';
    return showMessage(errorEl, 'No item selected.');
  }
  try {
    const data = await api(`/api/products/${encodeURIComponent(productId)}`);
    product = data.product;
    render();
  } catch (err) {
    root.innerHTML = '';
    showMessage(errorEl, err.status === 404 ? 'This item no longer exists — it may have been deleted.' : err.message);
  }
}

init();
