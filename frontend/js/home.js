// Home del cliente: il prossimo appuntamento come cartellino, "Il solito?" e le azioni
(async function () {
  const user = await requireAuth();
  if (!user) return;

  document.querySelector('[data-greeting]').innerHTML =
    `Ciao, ${escapeHtml(user.nome)}${user.vip ? ' <span class="tag tag--ink">VIP</span>' : ''}`;

  const next = document.querySelector('[data-next]');
  let bookings;
  try {
    bookings = (await apiRequest('/bookings', { sessionRequired: true })).bookings;
  } catch (error) {
    next.innerHTML = `<div class="state"><p>${escapeHtml(error.message)}</p>
      <button type="button" class="btn" data-retry>Riprova</button></div>`;
    next.querySelector('[data-retry]').addEventListener('click', () => location.reload());
    return;
  }

  const upcoming = groupBookings(bookings.filter(isUpcoming));
  if (upcoming.length === 0) {
    next.innerHTML = `<div class="state"><p>Nessun appuntamento in programma.</p>
      <a class="btn btn--primary" href="/dashboard">Prenota il prossimo</a></div>`;
  } else {
    const b = upcoming[0];
    const moveQuery = new URLSearchParams({ sposta: b.giorno, dalle: b.ora, persone: b.persone });
    const meta = [
      b.persone > 1 ? `${b.persone} persone` : '',
      b.ricorrente ? 'Fa parte di una serie' : '',
      upcoming.length > 1 ? `Poi altri ${upcoming.length - 1}` : ''
    ].filter(Boolean);
    next.innerHTML = `
      <article class="ticket next-ticket">
        <div class="ticket__body">
          <p class="ticket__kind">${escapeHtml(`${user.nome} ${user.cognome}`)}</p>
          <p class="ticket__day">${escapeHtml(formatDayMonth(b.giorno))}</p>
          <p class="ticket__time">${escapeHtml(b.ora)}</p>
          ${meta.length ? `<p class="ticket__meta">${meta.map(m => `<span>${escapeHtml(m)}</span>`).join('')}</p>` : ''}
        </div>
        <div class="ticket__stub row">
          <a class="btn btn--sm" href="/dashboard?${moveQuery}">Sposta</a>
          <a class="btn btn--quiet btn--sm" href="/bookings">Cancella o vedi tutti</a>
        </div>
      </article>`;
  }

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
