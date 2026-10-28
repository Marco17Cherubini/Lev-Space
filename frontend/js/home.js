// Home del cliente: il display "Il tuo prossimo turno", le azioni e "Il solito?"
(async function () {
  const user = await requireAuth();
  if (!user) return;

  document.querySelector('[data-greeting]').innerHTML =
    `Ciao, ${escapeHtml(user.nome)}${user.vip ? ' <span class="tag tag--led">VIP</span>' : ''}`;

  const next = document.querySelector('[data-next]');
  const timeEl = next.querySelector('[data-next-time]');
  const dayEl = next.querySelector('[data-next-day]');
  const metaEl = next.querySelector('[data-next-meta]');
  const actionsEl = next.querySelector('[data-next-actions]');
  SegmentDisplay.set(timeEl, '--:--', 'In attesa');

  let bookings;
  try {
    bookings = (await apiRequest('/bookings', { sessionRequired: true })).bookings;
  } catch (error) {
    dayEl.textContent = error.message;
    actionsEl.innerHTML = '<button type="button" class="btn btn--sm" data-retry>Riprova</button>';
    actionsEl.querySelector('[data-retry]').addEventListener('click', () => location.reload());
    next.removeAttribute('aria-busy');
    return;
  }

  const upcoming = groupBookings(bookings.filter(isUpcoming));
  if (upcoming.length === 0) {
    SegmentDisplay.set(timeEl, '--:--', 'Nessun turno');
    dayEl.textContent = 'Nessun turno in programma.';
    actionsEl.innerHTML = '<a class="btn btn--sm" href="/dashboard">Prendi il prossimo</a>';
  } else {
    const b = upcoming[0];
    const moveQuery = new URLSearchParams({ sposta: b.giorno, dalle: b.ora, persone: b.persone });
    SegmentDisplay.boot(timeEl, b.ora, `Ore ${b.ora}`);
    dayEl.textContent = formatDayMonth(b.giorno);
    metaEl.textContent = [
      b.persone > 1 ? `${b.persone} persone` : '',
      b.ricorrente ? 'Fa parte di una serie' : '',
      upcoming.length === 2 ? 'Poi un altro turno' : '',
      upcoming.length > 2 ? `Poi altri ${upcoming.length - 1} turni` : ''
    ]
      .filter(Boolean)
      .join(' · ');
    actionsEl.innerHTML = `<a class="btn btn--sm" href="/dashboard?${moveQuery}">Sposta</a>
      <a class="btn btn--quiet btn--sm" href="/bookings">Cancella o vedi tutti</a>`;
  }
  next.removeAttribute('aria-busy');

  const usual = await findUsualSlot(bookings);
  if (usual) {
    renderUsual(
      document.querySelector('[data-usual]'),
      usual,
      user.nome,
      `/dashboard?${new URLSearchParams({ data: usual.date, ora: usual.time, conferma: 1 })}`
    );
  }
})();
