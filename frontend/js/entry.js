// Pagina d'ingresso: il display mostra il primo turno libero reale (con l'accensione dei
// segmenti) e la settimana è disegnata come file di tasti, uno per appuntamento.
// Senza JavaScript restano i collegamenti a prenotazione, accesso e registrazione.
(function () {
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const timeEl = document.querySelector('[data-first-time]');
  const dayEl = document.querySelector('[data-first-day]');
  const link = document.querySelector('[data-first-link]');

  SegmentDisplay.set(timeEl, '--:--', 'In attesa');

  async function showFirstFreeSlot(user) {
    try {
      const first = await findFirstFreeSlot({ months: 2 });
      if (!first) {
        SegmentDisplay.set(timeEl, '--:--', 'Nessun turno libero');
        dayEl.textContent = 'Nessun turno libero nei prossimi due mesi.';
        link.textContent = 'Guarda il calendario';
        return;
      }
      const query = new URLSearchParams({ data: first.date, ora: first.time });
      SegmentDisplay.boot(timeEl, first.time, `Ore ${first.time}`);
      dayEl.textContent = formatDayMonth(first.date);
      link.textContent = 'Prendi questo turno';
      // Chi ha già una sessione prenota dal suo account, gli altri come ospiti
      link.href = user && !user.isAdmin ? `/dashboard?${query}` : `/guest-booking?${query}`;
      // Chi ha un account accede e arriva allo stesso orario già scelto
      document.querySelector('[data-login-link]').href =
        `/login?${new URLSearchParams({ next: `/dashboard?${query}` })}`;
    } catch (error) {
      dayEl.textContent = 'Non riesco a leggere la disponibilità adesso.';
      link.textContent = 'Apri il calendario';
    }
  }

  // Ogni giorno: i suoi turni come tasti, mattina e pomeriggio separati dalla pausa
  async function showWeek() {
    const list = document.querySelector('[data-hours]');
    try {
      const { daysOpen, days } = await apiRequest('/hours');
      list.innerHTML = DAY_ORDER.map(d => {
        const hours = daysOpen.includes(d) && days[d];
        const shifts = hours ? [hours.morning, hours.afternoon].filter(Boolean) : [];
        const range = shifts.map(s => `${s.start}–${s.end}`).join(' · ');
        const keys = shifts
          .map(s => `<span class="mini-keys">${s.slots.map(() => '<i></i>').join('')}</span>`)
          .join('<span class="mini-gap"></span>');
        return `<li class="weekday${hours ? '' : ' is-closed'}">
            <span class="weekday__name">${DAYS_SHORT_IT[d]}</span>
            <span class="weekday__keys" aria-hidden="true">${keys}</span>
            <span class="weekday__range num">${hours ? escapeHtml(range) : 'Chiuso'}</span>
          </li>`;
      }).join('');
    } catch (error) {
      list.innerHTML = '<li class="muted">Orari non disponibili in questo momento.</li>';
    }
  }

  getCurrentUser().then(user => {
    if (user) {
      const login = document.querySelector('[data-login-link]');
      login.textContent = user.isAdmin ? 'Apri l’agenda' : 'Vai ai tuoi turni';
      login.href = user.isAdmin ? '/admin' : '/home';
    }
    showFirstFreeSlot(user);
  });
  showWeek();
})();
