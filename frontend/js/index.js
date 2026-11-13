// Browse page: search, filters (kept in the URL), sort, product grid.
const els = {
  q: document.getElementById('q'),
  min: document.getElementById('min'),
  max: document.getElementById('max'),
  sold: document.getElementById('include-sold'),
  sort: document.getElementById('sort'),
  grid: document.getElementById('grid'),
  cats: document.getElementById('cat-list'),
  title: document.getElementById('results-title'),
  count: document.getElementById('results-count'),
  error: document.getElementById('error'),
  sidebar: document.getElementById('sidebar'),
  toggle: document.getElementById('filter-toggle'),
};

let categories = [];

function readState() {
  const p = new URLSearchParams(location.search);
  return {
    q: p.get('q') || '',
    category: p.get('category') || '',
    min: p.get('min') || '',
    max: p.get('max') || '',
    sort: p.get('sort') || 'newest',
    include_sold: p.get('include_sold') === '1',
  };
}

function writeState(state) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.category) p.set('category', state.category);
  if (state.min !== '') p.set('min', state.min);
  if (state.max !== '') p.set('max', state.max);
  if (state.sort && state.sort !== 'newest') p.set('sort', state.sort);
  if (state.include_sold) p.set('include_sold', '1');
  const qs = p.toString();
  history.pushState(null, '', qs ? `?${qs}` : location.pathname);
  load();
}

function update(changes) { writeState({ ...readState(), ...changes }); }

function syncInputs(state) {
  els.q.value = state.q;
  els.min.value = state.min;
  els.max.value = state.max;
  els.sort.value = state.sort;
  els.sold.checked = state.include_sold;
}

function renderCategories(state) {
  const total = categories.reduce((s, c) => s + c.count, 0);
  const btn = (id, name, count) => `
    <li><button type="button" data-cat="${id}" class="${String(state.category) === String(id) ? 'active' : ''}">
      <span>${esc(name)}</span><span class="count">${count}</span></button></li>`;
  els.cats.innerHTML = btn('', 'All categories', total) +
    categories.map((c) => btn(c.id, c.name, c.count)).join('');
}

async function loadCategories() {
  try {
    const data = await api('/api/categories');
    categories = data.categories;
    renderCategories(readState());
  } catch (err) {
    els.cats.innerHTML = `<li class="muted small">${esc(err.message)}</li>`;
  }
}

let loadId = 0;
async function load() {
  const state = readState();
  syncInputs(state);
  if (categories.length) renderCategories(state);

  const cat = categories.find((c) => String(c.id) === state.category);
  els.title.textContent = state.q
    ? `Results for “${state.q}”${cat ? ' in ' + cat.name : ''}`
    : (cat ? cat.name : 'All items');

  const params = new URLSearchParams();
  for (const k of ['q', 'category', 'min', 'max', 'sort']) if (state[k]) params.set(k, state[k]);
  if (state.include_sold) params.set('include_sold', '1');

  const id = ++loadId;
  els.grid.innerHTML = '<div class="loading">Loading items…</div>';
  showMessage(els.error, '');
  try {
    const { products } = await api('/api/products?' + params);
    if (id !== loadId) return; // a newer request has started
    els.count.textContent = `${products.length} item${products.length === 1 ? '' : 's'}`;
    els.grid.innerHTML = products.length
      ? products.map((p) => productCard(p)).join('')
      : `<div class="empty" style="grid-column:1/-1"><strong>No items match.</strong><br>Try a different search or clear the filters.</div>`;
  } catch (err) {
    if (id !== loadId) return;
    els.grid.innerHTML = '';
    els.count.textContent = '';
    showMessage(els.error, err.message);
  }
}

// ---------- Events ----------
document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  update({ q: els.q.value.trim() });
});
document.getElementById('price-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const min = els.min.value.trim(), max = els.max.value.trim();
  if (min !== '' && max !== '' && Number(min) > Number(max)) {
    showMessage(els.error, 'Minimum price is higher than the maximum.');
    return;
  }
  update({ min, max });
});
els.cats.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (b) update({ category: b.dataset.cat });
});
els.sold.addEventListener('change', () => update({ include_sold: els.sold.checked }));
els.sort.addEventListener('change', () => update({ sort: els.sort.value }));
document.getElementById('clear-filters').addEventListener('click', () => {
  history.pushState(null, '', location.pathname);
  load();
});
els.toggle.addEventListener('click', () => {
  const open = els.sidebar.classList.toggle('open');
  els.toggle.setAttribute('aria-expanded', String(open));
});
window.addEventListener('popstate', load);

loadCategories().then(load);
