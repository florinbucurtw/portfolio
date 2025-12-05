(function(){
  const form = document.getElementById('forgot-form');
  const email = document.getElementById('forgot-email');
  const submitBtn = document.getElementById('forgot-submit');
  const msg = document.getElementById('forgot-message');

  function showMessage(text, ok){
    msg.style.display = 'block';
    msg.textContent = text;
    msg.style.color = ok ? '#00ff88' : '#ff8080';
  }

  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      submitBtn.disabled = true; submitBtn.textContent = 'Sending…';
      const value = (email.value||'').trim();
      if(!value){ submitBtn.disabled=false; submitBtn.textContent='Send Reset Link'; return showMessage('Enter a valid email.', false); }
      try{
        const resp = await fetch('/api/forgot', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: value }) });
        const data = await resp.json();
        if(!resp.ok) throw new Error(data?.error || 'Failed to send reset link');
        showMessage('Reset link sent! Check the console for link.', true);
        if (data.reset_url) {
          const a = document.createElement('a'); a.href = data.reset_url; a.textContent = 'Open reset page'; a.style.color = '#00d9ff'; a.style.fontWeight = '700'; a.style.marginLeft = '6px'; a.target = '_self';
          msg.appendChild(document.createTextNode(' ')); msg.appendChild(a);
        }
      }catch(err){
        showMessage(err.message, false);
      } finally {
        submitBtn.disabled = false; submitBtn.textContent = 'Send Reset Link';
      }
    });
  }
})();
