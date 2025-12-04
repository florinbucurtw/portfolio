(function(){
  const form = document.getElementById('register-form');
  const firstName = document.getElementById('first_name');
  const lastName = document.getElementById('last_name');
  const age = document.getElementById('age');
  const country = document.getElementById('country');
  const email = document.getElementById('email');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const toggle = document.getElementById('toggle-password');
  const submitBtn = document.getElementById('register-submit');
  const msg = document.getElementById('register-message');

  async function loadCountries(){
    try {
      const resp = await fetch('assets/countries.json');
      const list = await resp.json();
      country.innerHTML = '';
      list.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        country.appendChild(opt);
      });
      // Preselect user locale country if available
      const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
      const region = (locale.split('-')[1] || '').toLowerCase();
      const found = list.find((c) => c.toLowerCase().includes(region));
      if (found) country.value = found;
    } catch (e) {
      // fallback minimal list
      ['Romania','United States','United Kingdom','Germany','France'].forEach((name)=>{
        const opt = document.createElement('option'); opt.value = name; opt.textContent = name; country.appendChild(opt);
      });
    }
  }

  if (toggle && password) {
    toggle.addEventListener('click', () => {
      const isPw = password.type === 'password';
      password.type = isPw ? 'text' : 'password';
      toggle.textContent = isPw ? '🙈' : '👁️';
    });
  }

  function showMessage(text, ok) {
    msg.style.display = 'block';
    msg.textContent = text;
    msg.style.color = ok ? '#00ff88' : '#ff8080';
  }

  function showError(el, text){
    if(el){ el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'), 400); }
    showMessage(text, false);
  }

  if (form) {
    loadCountries();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true; submitBtn.textContent = 'Registering…';
      const payload = {
        first_name: (firstName.value||'').trim(),
        last_name: (lastName.value||'').trim(),
        age: (age.value||'').trim(),
        country: country.value||'',
        email: (email.value||'').trim(),
        username: (username.value||'').trim(),
        password: (password.value||'').trim(),
      };
      if(!payload.first_name) { submitBtn.disabled=false; submitBtn.textContent='Register'; return showError(firstName,'Enter your first name'); }
      if(!payload.last_name) { submitBtn.disabled=false; submitBtn.textContent='Register'; return showError(lastName,'Enter your last name'); }
      if(!payload.email) { submitBtn.disabled=false; submitBtn.textContent='Register'; return showError(email,'Enter a valid email'); }
      if(!payload.username) { submitBtn.disabled=false; submitBtn.textContent='Register'; return showError(username,'Choose a username'); }
      if(!payload.password) { submitBtn.disabled=false; submitBtn.textContent='Register'; return showError(password,'Enter a password'); }

      try {
        const resp = await fetch('/api/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if(!resp.ok){ throw new Error(data?.error || 'Registration failed'); }
        showMessage('Registration successful! Check your email to activate.', true);
        // For local dev: show activation link if provided
        if (data.activation_url) {
          const a = document.createElement('a'); a.href = data.activation_url; a.textContent = 'Activate now'; a.style.color = '#00d9ff'; a.style.fontWeight = '700'; a.style.marginLeft = '6px'; a.target = '_self';
          msg.appendChild(document.createTextNode(' ')); msg.appendChild(a);
        }
      } catch (e) {
        showMessage(e.message, false);
      } finally {
        submitBtn.disabled = false; submitBtn.textContent = 'Register';
      }
    });
  }
})();
