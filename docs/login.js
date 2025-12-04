(function(){
  const form = document.getElementById('login-form');
  const username = document.getElementById('login-username');
  const password = document.getElementById('login-password');
  const toggle = document.getElementById('toggle-password');
  const submitBtn = document.getElementById('login-submit');
  const remember = document.getElementById('remember');

  if (toggle && password) {
    toggle.addEventListener('click', () => {
      const isPw = password.type === 'password';
      password.type = isPw ? 'text' : 'password';
      toggle.textContent = isPw ? '🙈' : '👁️';
    });
  }

  function showError(el, msg) {
    if (!el) return;
    el.classList.add('shake');
    el.setAttribute('aria-invalid', 'true');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
    alert(msg);
    setTimeout(() => el.classList.remove('shake'), 400);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';

      const user = (username?.value || '').trim();
      const pw = (password?.value || '').trim();

      if (!user) { submitBtn.disabled=false; submitBtn.textContent='Sign In'; return showError(username, 'Please enter your email or username.'); }
      if (!pw) { submitBtn.disabled=false; submitBtn.textContent='Sign In'; return showError(password, 'Please enter your password.'); }

      try {
        const base = window.API_BASE || '';
        const resp = await fetch(`${base}/api/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pw })
        });
        let data;
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          data = await resp.json();
        } else {
          const text = await resp.text();
          throw new Error(`Unexpected response (${resp.status}): ${text.slice(0,200)}`);
        }
        if (!resp.ok) { throw new Error(data?.error || 'Login failed'); }
        try {
          localStorage.setItem('auth_token', data.token);
          localStorage.setItem('auth_user', data?.user?.username || user);
          localStorage.setItem('auth_remember', remember?.checked ? '1' : '0');
        } catch {}
        setTimeout(() => { window.location.href = 'new.html'; }, 250);
      } catch (err) {
        alert(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });
  }
})();
