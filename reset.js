(function(){
  const form = document.getElementById('reset-form');
  const pw1 = document.getElementById('reset-password');
  const pw2 = document.getElementById('reset-password2');
  const submitBtn = document.getElementById('reset-submit');
  const msg = document.getElementById('reset-message');
  const toggle1 = document.getElementById('toggle-password');
  const toggle2 = document.getElementById('toggle-password2');

  function showMessage(text, ok){
    msg.style.display = 'block';
    msg.textContent = text;
    msg.style.color = ok ? '#00ff88' : '#ff8080';
  }

  function getToken(){
    try{
      const url = new URL(window.location.href);
      return url.searchParams.get('token') || '';
    } catch { return ''; }
  }

  function toggle(btn, input){
    if(btn && input){
      btn.addEventListener('click', ()=>{
        const isPw = input.type === 'password';
        input.type = isPw ? 'text' : 'password';
        btn.textContent = isPw ? '🙈' : '👁️';
      });
    }
  }

  toggle(toggle1, pw1);
  toggle(toggle2, pw2);

  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      submitBtn.disabled = true; submitBtn.textContent = 'Updating…';
      const p1 = (pw1.value||'').trim();
      const p2 = (pw2.value||'').trim();
      if(!p1 || !p2){ submitBtn.disabled=false; submitBtn.textContent='Update Password'; return showMessage('Enter and confirm your password.', false); }
      if(p1 !== p2){ submitBtn.disabled=false; submitBtn.textContent='Update Password'; return showMessage('Passwords do not match.', false); }
      const token = getToken();
      if(!token){ submitBtn.disabled=false; submitBtn.textContent='Update Password'; return showMessage('Missing reset token.', false); }
      try{
        const resp = await fetch('/api/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, password: p1 }) });
        const data = await resp.json();
        if(!resp.ok) throw new Error(data?.error || 'Failed to reset password');
        showMessage('Password updated! You can login now.', true);
        setTimeout(()=>{ window.location.href = 'login.html'; }, 800);
      }catch(err){
        showMessage(err.message, false);
      } finally {
        submitBtn.disabled = false; submitBtn.textContent = 'Update Password';
      }
    });
  }
})();
