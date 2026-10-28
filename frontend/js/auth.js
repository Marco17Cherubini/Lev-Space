// Accesso, registrazione, recupero e nuova password: un modulo per le quattro pagine,
// ognuna riconosciuta dal suo form.
(function () {
  const params = new URLSearchParams(location.search);
  const errorBox = document.getElementById('form-error');
  const infoBox = document.getElementById('form-info');

  // Mostra/Nascondi password: un pulsante vero, annunciato con aria-pressed
  document.querySelectorAll('[data-reveal]').forEach(button => {
    const input = document.getElementById(button.dataset.reveal);
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Nascondi' : 'Mostra';
      button.setAttribute('aria-pressed', String(show));
      input.focus();
    });
  });

  // Errore del form: messaggio generale + campo segnato e focalizzato
  function fail(message, field) {
    showMessage(errorBox, message);
    document.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  function clearMessages() {
    if (errorBox) showMessage(errorBox, '');
    if (infoBox) showMessage(infoBox, '');
  }

  // Il primo campo obbligatorio vuoto o non valido, secondo il browser
  function firstInvalid(form) {
    return [...form.elements].find(el => el.willValidate && !el.checkValidity());
  }

  function handle(formId, submit) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      clearMessages();
      const invalid = firstInvalid(form);
      if (invalid) {
        const label = form.querySelector(`label[for="${invalid.id}"]`);
        const name = label ? label.textContent.trim() : 'Questo campo';
        fail(
          invalid.validity.valueMissing
            ? `${name}: campo obbligatorio.`
            : invalid.validity.tooShort
              ? 'La password deve avere almeno 8 caratteri.'
              : `${name}: controlla il formato.`,
          invalid
        );
        return;
      }
      const button = form.querySelector('[type="submit"]');
      setBusy(button, true);
      try {
        await submit(form);
      } catch (error) {
        fail(error.message);
      } finally {
        setBusy(button, false);
      }
    });
  }

  const value = id => document.getElementById(id).value.trim();

  async function login(email, password) {
    const response = await apiRequest('/auth/login', jsonBody('POST', { email, password }));
    const next = safeNextPath(params.get('next'));
    location.href = response.isAdmin ? '/admin' : next || '/home';
  }

  // ---- Accesso
  if (document.getElementById('login-form')) {
    if (params.get('scaduta')) {
      showMessage(infoBox, 'La sessione è scaduta: accedi di nuovo per continuare.');
    } else if (params.get('password') === 'aggiornata') {
      showMessage(infoBox, 'Password aggiornata: accedi con quella nuova.');
    }
    if (params.get('email')) document.getElementById('email').value = params.get('email');
  }
  handle('login-form', () => login(value('email'), document.getElementById('password').value));

  // ---- Registrazione: dopo la creazione si entra subito
  handle('register-form', async () => {
    const password = document.getElementById('password').value;
    if (password !== document.getElementById('confirm-password').value) {
      fail('Le due password non coincidono.', document.getElementById('confirm-password'));
      return;
    }
    const email = value('email');
    await apiRequest(
      '/auth/register',
      jsonBody('POST', {
        nome: value('nome'),
        cognome: value('cognome'),
        email,
        telefono: value('telefono'),
        password
      })
    );
    try {
      await login(email, password);
    } catch (error) {
      location.href = `/login?${new URLSearchParams({ email })}`;
    }
  });
  if (document.getElementById('register-form') && params.get('email')) {
    document.getElementById('email').value = params.get('email');
  }

  // ---- Recupero password: risposta sempre uguale, che l'email esista o no
  handle('reset-form', async form => {
    const response = await apiRequest(
      '/auth/forgot-password',
      jsonBody('POST', { email: value('email') })
    );
    showMessage(infoBox, `${response.message} Controlla anche la cartella spam.`);
    form.reset();
  });

  // ---- Nuova password dal link ricevuto per email
  const newPasswordForm = document.getElementById('new-password-form');
  if (newPasswordForm && !params.get('token')) {
    fail('Il link non è valido: chiedine uno nuovo dalla pagina di recupero password.');
    newPasswordForm.querySelectorAll('input, button[type="submit"]').forEach(el => {
      el.disabled = true;
    });
  }
  handle('new-password-form', async () => {
    const password = document.getElementById('password').value;
    if (password !== document.getElementById('confirm-password').value) {
      fail('Le due password non coincidono.', document.getElementById('confirm-password'));
      return;
    }
    await apiRequest(
      '/auth/reset-password',
      jsonBody('POST', { token: params.get('token'), password })
    );
    location.href = '/login?password=aggiornata';
  });
})();
