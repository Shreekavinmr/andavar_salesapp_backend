// public/js/reset-password.js
console.log('✅ Reset password script loaded');

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('resetForm');
  const messageEl = document.getElementById('message');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('🔥 Form submitted!');
    
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const token = document.getElementById('tokenInput').value;

    // Clear previous messages
    messageEl.textContent = '';
    messageEl.className = '';

    // Validation
    if (!token) {
      messageEl.textContent = '❌ Invalid reset token';
      messageEl.className = 'error';
      return;
    }

    if (password !== confirmPassword) {
      messageEl.textContent = '❌ Passwords do not match';
      messageEl.className = 'error';
      return;
    }

    if (password.length < 6) {
      messageEl.textContent = '❌ Password must be at least 6 characters';
      messageEl.className = 'error';
      return;
    }

    // Show loading state
    messageEl.textContent = '⏳ Resetting password...';
    messageEl.className = 'success';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Resetting...';

    try {
      console.log('📤 Sending reset request...', { 
        token: token.substring(0, 10) + '...', 
        passwordLength: password.length 
      });
      
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          token: token, 
          password: password 
        })
      });

      console.log('📥 Response status:', response.status);
      const data = await response.json();
      console.log('📥 Response data:', data);

      if (response.ok) {
        messageEl.textContent = '✅ Password reset successful! You can now login with your new password.';
        messageEl.className = 'success';
        
        // Disable form fields
        document.getElementById('password').disabled = true;
        document.getElementById('confirmPassword').disabled = true;
        
        // Optional: Redirect after 3 seconds
        setTimeout(() => {
          messageEl.textContent += ' Redirecting...';
          // window.location.href = '/login'; // Uncomment when you have login page
        }, 3000);
      } else {
        messageEl.textContent = '❌ ' + (data.message || 'Reset failed. Please try again.');
        messageEl.className = 'error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reset Password';
      }
    } catch (err) {
      console.error('❌ Network error:', err);
      messageEl.textContent = '❌ Network error. Please check your connection and try again.';
      messageEl.className = 'error';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password';
    }
  });
});