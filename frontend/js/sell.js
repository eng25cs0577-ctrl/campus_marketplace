// Sell page: post a new item, with optional photo preview.
if (requireLogin()) {
  const form = document.getElementById('sell-form');
  const errorEl = document.getElementById('error');
  const fileInput = document.getElementById('image');
  const preview = document.getElementById('preview');
  const removeBtn = document.getElementById('remove-photo');
  const submitBtn = document.getElementById('submit-btn');
  const MAX_BYTES = 3 * 1024 * 1024;

  api('/api/categories').then(({ categories }) => {
    const sel = document.getElementById('category_id');
    sel.insertAdjacentHTML('beforeend',
      categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(''));
  }).catch((err) => showMessage(errorEl, err.message));

  function clearPhoto() {
    fileInput.value = '';
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.removeAttribute('src');
    preview.hidden = true;
    removeBtn.hidden = true;
  }

  fileInput.addEventListener('change', () => {
    showMessage(errorEl, '');
    const file = fileInput.files[0];
    if (!file) return clearPhoto();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      clearPhoto();
      return showMessage(errorEl, 'Please choose a JPEG, PNG, WebP or GIF image.');
    }
    if (file.size > MAX_BYTES) {
      clearPhoto();
      return showMessage(errorEl, 'That photo is larger than 3 MB. Please pick a smaller one.');
    }
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    removeBtn.hidden = false;
  });
  removeBtn.addEventListener('click', clearPhoto);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage(errorEl, '');
    const title = form.title.value.trim();
    const price = form.price.value.trim();
    if (title.length < 3) return showMessage(errorEl, 'Please give your item a title (at least 3 characters).');
    if (!form.category_id.value) return showMessage(errorEl, 'Please choose a category.');
    if (price === '' || !/^\d+$/.test(price)) return showMessage(errorEl, 'Price must be a whole number of rupees.');

    const fd = new FormData();
    fd.append('title', title);
    fd.append('category_id', form.category_id.value);
    fd.append('price', price);
    fd.append('item_condition', form.item_condition.value);
    fd.append('description', form.description.value.trim());
    if (fileInput.files[0]) fd.append('image', fileInput.files[0]);

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';
    try {
      const { id } = await api('/api/products', { method: 'POST', form: fd });
      location.href = `item.html?id=${id}`;
    } catch (err) {
      showMessage(errorEl, err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post item';
    }
  });
}
