// I tuoi appuntamenti: i prossimi con Sposta e Cancella, i passati in sola lettura
(async function () {
  const user = await requireAuth();
  if (!user) return;

  const upcomingEl = document.querySelector('[data-upcoming]');
  const pastWrap = document.querySelector('[data-past-wrap]');
  const heading = document.querySelector('h1');
  heading.setAttribute('tabindex', '-1');

  async function load() {
    upcomingEl.setAttribute('aria-busy', 'true');
    try {
      const { bookings } = await apiRequest('/bookings', { sessionRequired: true });
      render(
        groupBookings(bookings.filter(isUpcoming)),
        groupBookings(bookings.filter(b => !isUpcoming(b)))
      );
    } catch (error) {
      upcomingEl.innerHTML = `<div class="state"><p>${escapeHtml(error.message)}</p>
        <button type="button" class="btn" data-retry>Riprova</button></div>`;
    } finally {
      upcomingEl.removeAttribute('aria-busy');
    }
  }

  function item(b, past = false) {
    const date = parseISO(b.giorno);
    const tags = [b.persone > 1 ? `${b.persone} persone` : '', b.ricorrente ? 'Serie' : '']
      .filter(Boolean)
      .map(t => `<span class="tag">${t}</span>`)
      .join('');
    const move = new URLSearchParams({ sposta: b.giorno, dalle: b.ora, persone: b.persone });
    const actions = past
      ? ''
      : `<div class="appt__actions">
          <a class="btn btn--sm" href="/dashboard?${move}" aria-label="Sposta il turno di ${escapeHtml(formatDayMonth(b.giorno))} alle ${escapeHtml(b.ora)}">Sposta</a>
          <button type="button" class="btn btn--danger btn--sm" data-cancel data-giorno="${escapeHtml(b.giorno)}" data-ora="${escapeHtml(b.ora)}" data-persone="${b.persone}" aria-label="Cancella il turno di ${escapeHtml(formatDayMonth(b.giorno))} alle ${escapeHtml(b.ora)}">Cancella</button>
        </div>`;
    return `<li class="appt${past ? ' appt--past' : ''}">
        <p class="appt__date" aria-hidden="true"><span>${date.getDate()}</span>${MONTHS_IT[date.getMonth()].slice(0, 3)}</p>
        <div class="appt__body">
          <p class="appt__when"><span class="visually-hidden">${escapeHtml(formatDate(b.giorno))}</span><span aria-hidden="true">${DAYS_IT[date.getDay()]}</span></p>
          <p class="appt__time">${SegmentDisplay.html(b.ora, { className: 'seg--ink', label: `ore ${b.ora}` })}</p>
          ${tags ? `<p class="appt__meta">${tags}</p>` : ''}
        </div>
        ${actions}
      </li>`;
  }

  function render(upcoming, past) {
    if (upcoming.length === 0) {
      upcomingEl.innerHTML = `<div class="state"><p>Nessun turno in programma.</p>
        <a class="btn btn--turn" href="/dashboard">Prendi un turno</a></div>`;
    } else {
      // Raggruppati per mese, come le pagine di un'agenda
      const months = new Map();
      upcoming.forEach(b => {
        const key = b.giorno.slice(0, 7);
        months.set(key, [...(months.get(key) || []), b]);
      });
      upcomingEl.innerHTML = [...months.entries()]
        .map(([key, list]) => {
          const [y, m] = key.split('-').map(Number);
          return `<section class="month" aria-labelledby="month-${key}">
              <h2 class="month__title" id="month-${key}">${MONTHS_IT[m - 1]} <span class="muted">${y}</span></h2>
              <ul class="appts receipt">${list.map(b => item(b)).join('')}</ul>
            </section>`;
        })
        .join('');
    }
    pastWrap.hidden = past.length === 0;
    pastWrap.querySelector('[data-past-count]').textContent = `Turni passati (${past.length})`;
    pastWrap.querySelector('[data-past]').innerHTML = past
      .reverse()
      .map(b => item(b, true))
      .join('');
  }

  upcomingEl.addEventListener('click', async event => {
    if (event.target.closest('[data-retry]')) {
      load();
      return;
    }
    const button = event.target.closest('[data-cancel]');
    if (!button) return;
    const { giorno, ora, persone } = button.dataset;
    const group = Number(persone) > 1 ? `, per ${persone} persone: si liberano tutti i posti` : '';
    const ok = await Sheet.confirm({
      title: 'Cancellare il turno?',
      message: `${formatDate(giorno)} alle ${ora}${group}. Il posto torna disponibile per gli altri clienti.`,
      confirmLabel: 'Sì, cancella'
    });
    if (!ok) return;
    setBusy(button, true, 'Cancello…');
    try {
      await apiRequest('/bookings', {
        ...jsonBody('DELETE', { giorno, ora }),
        sessionRequired: true
      });
      showToast('Turno cancellato: il posto torna libero', 'success');
      await load();
      heading.focus({ preventScroll: true });
    } catch (error) {
      showToast(error.message);
      setBusy(button, false);
    }
  });

  load();
})();
