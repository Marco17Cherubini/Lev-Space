// Tema chiaro/scuro: i pulsanti con data-theme-toggle lo cambiano e lo ricordano.
// Il tema salvato viene applicato prima del disegno da theme-init.js.
(function () {
  const THEME_KEY = 'lev-space-theme';

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncButtons() {
    const dark = currentTheme() === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(dark));
    });
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      // Navigazione privata: il tema vale solo per questa pagina
    }
    syncButtons();
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });

  syncButtons();
})();
