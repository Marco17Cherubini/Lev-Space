// Controlla se arriva da registrazione completata
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('registered') === 'true') {
  showSuccess('success-message', 'Registrazione completata! Effettua il login.');
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();

  hideMessage('error-message');
  hideMessage('success-message');

  const formData = {
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value
  };

  // Validazione client-side
  if (!formData.email || !formData.password) {
    showError('error-message', 'Email e password sono obbligatori');
    return;
  }

  try {
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Accesso...';

    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(formData)
    });

    if (response.success) {
      // Redirect in base al tipo utente
      if (response.isAdmin) {
        window.location.href = '/admin';
      } else {
        window.location.href = '/home';
      }
    }
  } catch (error) {
    showError('error-message', error.message);
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = false;
    submitButton.textContent = 'Accedi';
  }
});
