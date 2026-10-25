// Footer legale comune a tutte le pagine: dati del titolare e link a Privacy e Cookie Policy.
// I dati del titolare compaiono anche in privacy-policy.html: vanno aggiornati in entrambi i punti.
(function () {
  if (document.getElementById('legal-footer')) return;

  const LEGAL = {
    name: 'Lev Space',
    address: 'Via Romera 36, 15122 Alessandria',
    vat: '02465603349'
  };

  const footer = document.createElement('footer');
  footer.id = 'legal-footer';
  footer.className = 'legal-footer';
  footer.innerHTML = `
    <p>&copy; ${new Date().getFullYear()} ${LEGAL.name} &middot; P.IVA ${LEGAL.vat}</p>
    <p>${LEGAL.address}</p>
    <nav class="legal-footer__links" aria-label="Informazioni legali">
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/cookie-policy">Cookie Policy</a>
    </nav>
  `;
  document.body.appendChild(footer);
})();
