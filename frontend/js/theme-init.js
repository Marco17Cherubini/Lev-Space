// Applica il tema salvato prima che la pagina venga disegnata, così chi usa il tema
// scuro non vede un lampo di quello chiaro. Pulsante e preferenze sono in theme.js.
(function () {
  try {
    const saved = localStorage.getItem('lev-space-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (error) {
    // localStorage non disponibile: resta il tema predefinito
  }
})();
