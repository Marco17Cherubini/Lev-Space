// Parti comuni delle pagine con sessione: voce di navigazione attiva, logout e
// controllo d'accesso. Richiede utils.js; va caricato prima dello script della pagina.

async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch (error) {
    // Anche se il server non risponde il cookie verrà ignorato: si torna all'ingresso
  }
  location.href = '/';
}

// Utente della sessione, oppure null dopo aver reindirizzato: al login se non c'è una
// sessione valida, all'area giusta se la pagina è dell'altro ruolo
async function requireAuth({ admin = false } = {}) {
  const user = await getCurrentUser();
  if (!user) {
    redirectToLogin();
    return null;
  }
  if (admin !== user.isAdmin) {
    location.href = user.isAdmin ? '/admin' : '/home';
    return null;
  }
  return user;
}

(function initShell() {
  // La voce della pagina attuale (navigazione in basso e in alto)
  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.tabbar a, .appbar__nav a').forEach(link => {
    const target = new URL(link.href).pathname;
    const matches = link.dataset.match ? new RegExp(link.dataset.match).test(path) : false;
    if (target === path || matches) link.setAttribute('aria-current', 'page');
  });

  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', () => {
      setBusy(button, true, 'Uscita…');
      logout();
    });
  });
})();
