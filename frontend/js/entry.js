// Pagina d'ingresso: il primo posto libero reale sul cartellino e gli orari di apertura.
// Senza JavaScript restano i collegamenti a prenotazione, accesso e registrazione.
(function () {
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  async function showFirstFreeSlot(user) {
    const day = document.querySelector('[data-first-day]');
    const time = document.querySelector('[data-first-time]');
    const link = document.querySelector('[data-first-link]');
    try {
      const first = await findFirstFreeSlot({ months: 2 });
      if (!first) {
        day.textContent = 'Nessun posto libero nei prossimi due mesi.';
        time.hidden = true;
        link.textContent = 'Guarda il calendario';
        return;
      }
      const query = new URLSearchParams({ data: first.date, ora: first.time });
      day.textContent = formatDayMonth(first.date);
      time.textContent = first.time;
      time.removeAttribute('aria-hidden');
      link.textContent = 'Prenota questo posto';
      // Chi ha già una sessione prenota dal suo account, gli altri come ospiti
      link.href = user && !user.isAdmin ? `/dashboard?${query}` : `/guest-booking?${query}`;
      // Chi ha un account accede e arriva allo stesso orario già scelto
      document.querySelector('[data-login-link]').href =
        `/login?${new URLSearchParams({ next: `/dashboard?${query}` })}`;
    } catch (error) {
      day.textContent = 'Non riesco a leggere la disponibilità adesso.';
      time.hidden = true;
      link.textContent = 'Apri il calendario';
    }
  }

  async function showHours() {
    const list = document.querySelector('[data-hours]');
    try {
      const { daysOpen, days } = await apiRequest('/hours');
      const shift = s => (s ? `${s.start}–${s.end}` : null);
      list.innerHTML = DAY_ORDER.map(d => {
        const hours = daysOpen.includes(d) && days[d];
        const text = hours
          ? [shift(hours.morning), shift(hours.afternoon)].filter(Boolean).join(' · ')
          : 'Chiuso';
        return `<div${hours ? '' : ' class="is-closed"'}><dt>${DAYS_IT[d]}</dt><dd class="num">${escapeHtml(text)}</dd></div>`;
      }).join('');
    } catch (error) {
      list.innerHTML = `<p class="muted">Orari non disponibili in questo momento.</p>`;
    }
  }

  getCurrentUser().then(user => {
    if (user) {
      // Una sessione aperta porta direttamente all'area giusta
      const login = document.querySelector('[data-login-link]');
      login.textContent = user.isAdmin ? 'Apri l’agenda' : 'Vai alla tua area';
      login.href = user.isAdmin ? '/admin' : '/home';
    }
    showFirstFreeSlot(user);
  });
  showHours();
})();
