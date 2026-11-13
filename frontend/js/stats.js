// Insights page: totals + tables, each with a "Show the SQL" toggle.
const root = document.getElementById('stats');
const errorEl = document.getElementById('error');

function sqlBlock(id, sql) {
  return `
    <div class="sql-toggle">
      <button class="btn btn-sm" type="button" aria-expanded="false" aria-controls="sql-${id}" data-sql="${id}">Show the SQL</button>
      <pre class="sql" id="sql-${id}" hidden><code>${esc(sql)}</code></pre>
    </div>`;
}

function table(rows, columns) {
  if (!rows.length) return '<div class="empty">No data yet.</div>';
  return `<div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) =>
      `<td class="${c.num ? 'num' : ''}">${c.format ? c.format(r[c.key], r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

const money = (v) => rupees(v);

async function init() {
  try {
    const s = await api('/api/stats');
    const t = s.totals.rows[0];
    const tile = (num, lbl) => `<div class="tile"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;

    root.innerHTML = `
      <section class="stats-section" style="margin-top:20px">
        <h2>Totals</h2>
        <div class="stat-tiles">
          ${tile(t.students, 'Students')}
          ${tile(t.listings, 'Listings')}
          ${tile(t.available, 'Available')}
          ${tile(t.sold, 'Sold')}
          ${tile(rupees(t.avg_price), 'Average price')}
          ${tile(t.messages, 'Messages sent')}
        </div>
        ${sqlBlock('totals', s.totals.sql)}
      </section>

      <section class="stats-section">
        <h2>Listings per category</h2>
        ${table(s.per_category.rows, [
          { key: 'category', label: 'Category' },
          { key: 'listings', label: 'Listings', num: true },
          { key: 'available', label: 'Available', num: true },
          { key: 'avg_price', label: 'Avg price', num: true, format: money },
        ])}
        ${sqlBlock('per_category', s.per_category.sql)}
      </section>

      <section class="stats-section">
        <h2>Top sellers</h2>
        ${table(s.top_sellers.rows, [
          { key: 'seller', label: 'Seller' },
          { key: 'listings', label: 'Listings', num: true },
          { key: 'sold', label: 'Sold', num: true },
          { key: 'earned', label: 'Earned', num: true, format: money },
        ])}
        ${sqlBlock('top_sellers', s.top_sellers.sql)}
      </section>

      <section class="stats-section">
        <h2>Most-saved items</h2>
        ${table(s.most_saved.rows, [
          { key: 'title', label: 'Item', format: (v, r) => `<a href="item.html?id=${r.id}">${esc(v)}</a>` },
          { key: 'price', label: 'Price', num: true, format: money },
          { key: 'saves', label: 'Saves', num: true },
        ])}
        ${sqlBlock('most_saved', s.most_saved.sql)}
      </section>`;
  } catch (err) {
    root.innerHTML = '';
    showMessage(errorEl, err.message);
  }
}

root.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sql]');
  if (!b) return;
  const pre = document.getElementById('sql-' + b.dataset.sql);
  pre.hidden = !pre.hidden;
  b.setAttribute('aria-expanded', String(!pre.hidden));
  b.textContent = pre.hidden ? 'Show the SQL' : 'Hide the SQL';
});

init();
