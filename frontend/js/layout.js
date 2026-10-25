// Parti comuni delle pagine con sessione: menu laterale, logout e controllo d'accesso.
// Richiede utils.js; va caricato prima dello script della pagina.

async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Errore logout:', error);
  }
  window.location.href = '/';
}

// Utente della sessione, oppure null dopo aver reindirizzato: al login se non c'è una
// sessione valida, alla home cliente se la pagina è riservata all'admin
async function requireAuth({ admin = false } = {}) {
  const user = await getCurrentUser();
  if (!user) {
    redirectToLogin();
    return null;
  }
  if (admin && !user.isAdmin) {
    window.location.href = '/home';
    return null;
  }
  return user;
}

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const overlay = document.getElementById('sidebar-overlay');
  const open = () => {
    sidebar.classList.add('active');
    overlay.classList.add('active');
  };
  const close = () => {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
  };

  document.getElementById('hamburger-btn').addEventListener('click', open);
  document.getElementById('close-sidebar').addEventListener('click', close);
  overlay.addEventListener('click', close);

  const logoutButton = document.getElementById('sidebar-logout');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }
}

initSidebar();
