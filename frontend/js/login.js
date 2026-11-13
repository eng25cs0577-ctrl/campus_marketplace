// Login / create account, then redirect back to where the user came from.
const errorEl = document.getElementById('error');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

function nextUrl() {
  const next = new URLSearchParams(location.search).get('next') || '';
  // Only allow relative page links (no external redirects).
  return /^[a-z]+\.html([?#].*)?$/i.test(next) && !next.startsWith('login.html') ? next : 'index.html';
}

if (Auth.token) location.replace(nextUrl());

function showTab(which) {
  const isLogin = which === 'login';
  tabLogin.setAttribute('aria-selected', String(isLogin));
  tabRegister.setAttribute('aria-selected', String(!isLogin));
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  showMessage(errorEl, '');
}
tabLogin.addEventListener('click', () => showTab('login'));
tabRegister.addEventListener('click', () => showTab('register'));
if (location.hash === '#register') showTab('register');

async function submit(form, path, body) {
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  showMessage(errorEl, '');
  try {
    const { token, user } = await api(path, { method: 'POST', body });
    Auth.save(token, user);
    location.href = nextUrl();
  } catch (err) {
    showMessage(errorEl, err.message);
    btn.disabled = false;
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submit(loginForm, '/api/auth/login', {
    email: document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  });
});

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const password = document.getElementById('reg-password').value;
  if (password.length < 6) return showMessage(errorEl, 'Password must be at least 6 characters.');
  submit(registerForm, '/api/auth/register', {
    name: document.getElementById('reg-name').value,
    email: document.getElementById('reg-email').value,
    phone: document.getElementById('reg-phone').value,
    password,
  });
});
