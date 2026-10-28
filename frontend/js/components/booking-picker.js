// Scelta di giorno e orario condivisa da prenotazione cliente, ospite e lungo periodo.
// La disponibilità arriva dal server (/availability e /slots): qui si filtra soltanto,
// per i gruppi, sugli orari che hanno abbastanza slot liberi consecutivi.

// Orari di inizio prenotabili per un gruppo di `size` persone
function usableStarts(slots, size) {
  const free = new Set(slots.filter(s => s.available).map(s => s.time));
  const times = slots.map(s => s.time);
  return times.filter((time, i) => {
    for (let k = 0; k < size; k++) {
      const t = times[i + k];
      if (!t || !free.has(t) || (k > 0 && !isFollowingSlot(times[i + k - 1], t))) return false;
    }
    return true;
  });
}

// Fine di `n` appuntamenti consecutivi che iniziano a `time` ('HH:MM')
function endOf(time, n = 1) {
  const end = toMinutes(time) + n * APPOINTMENT_MINUTES;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

// Orari divisi in turni contigui (la pausa pranzo separa mattina e pomeriggio)
function shiftRuns(slots) {
  const runs = [];
  for (const slot of slots) {
    const last = runs[runs.length - 1];
    if (last && isFollowingSlot(last.slots[last.slots.length - 1].time, slot.time)) {
      last.slots.push(slot);
    } else {
      runs.push({ slots: [slot] });
    }
  }
  return runs.map(run => {
    const start = toMinutes(run.slots[0].time);
    return { ...run, name: start < 13 * 60 ? 'Mattina' : start < 18 * 60 ? 'Pomeriggio' : 'Sera' };
  });
}

// Primo posto libero dalla data indicata in avanti (fino a `months` mesi)
async function findFirstFreeSlot({ months = 2, size = 1 } = {}) {
  const start = new Date();
  for (let m = 0; m < months; m++) {
    const month = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const { availability } = await apiRequest(
      `/availability/${month.getFullYear()}/${month.getMonth() + 1}`
    );
    const days = Object.keys(availability)
      .map(Number)
      .filter(d => availability[d])
      .sort((a, b) => a - b);
    for (const day of days) {
      const date = toISO(new Date(month.getFullYear(), month.getMonth(), day));
      const { slots } = await apiRequest(`/slots/${date}`);
      const [time] = usableStarts(slots, size);
      if (time) return { date, time };
    }
  }
  return null;
}

/**
 * Calendario mensile + orari in un contenitore.
 * @param {HTMLElement} root  elemento con [data-calendar] e [data-slots] al suo interno
 * @param {{ size?: () => number, onChange: (sel: {date: string|null, time: string|null}) => void,
 *           allowDate?: (date: string) => boolean }} options
 */
function createBookingPicker(root, { size = () => 1, onChange, allowDate = () => true }) {
  const calendarEl = root.querySelector('[data-calendar]');
  const slotsEl = root.querySelector('[data-slots]');
  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let month = firstMonth;
  let selected = { date: null, time: null };
  let availability = {};
  let slotsRequest = 0;

  calendarEl.innerHTML = `
    <div class="calendar">
      <div class="calendar__head">
        <button type="button" class="btn btn--icon" data-prev aria-label="Mese precedente">${icon('left')}</button>
        <h2 class="calendar__title" aria-live="polite" data-title></h2>
        <button type="button" class="btn btn--icon" data-next aria-label="Mese successivo">${icon('right')}</button>
      </div>
      <div class="calendar__grid" role="group" data-grid></div>
    </div>`;
  const grid = calendarEl.querySelector('[data-grid]');
  const title = calendarEl.querySelector('[data-title]');
  const prev = calendarEl.querySelector('[data-prev]');

  prev.addEventListener('click', () => changeMonth(-1));
  calendarEl.querySelector('[data-next]').addEventListener('click', () => changeMonth(1));
  grid.addEventListener('click', event => {
    const day = event.target.closest('.day');
    if (day && !day.disabled) selectDate(day.dataset.date);
  });
  slotsEl.addEventListener('click', event => {
    const slot = event.target.closest('.slot');
    if (!slot || slot.disabled) return;
    selected = { ...selected, time: slot.dataset.time };
    lightKeys();
    onChange(selected);
  });

  // Il tasto scelto si accende; per un gruppo si accendono anche i tasti successivi
  function lightKeys() {
    const keys = [...slotsEl.querySelectorAll('.key')];
    const start = keys.findIndex(k => k.dataset.time === selected.time);
    const n = size();
    keys.forEach((key, i) => {
      key.setAttribute('aria-pressed', String(i === start));
      key.classList.toggle('is-lit', start !== -1 && i > start && i < start + n);
    });
  }

  function changeMonth(delta) {
    month = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    renderMonth();
  }

  async function renderMonth() {
    const y = month.getFullYear();
    const m = month.getMonth();
    title.textContent = `${MONTHS_IT[m]} ${y}`;
    prev.disabled = month <= firstMonth;
    grid.setAttribute('aria-label', `Giorni di ${MONTHS_IT[m]} ${y}`);
    grid.innerHTML = `${['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
      .map(d => `<span class="calendar__dow" aria-hidden="true">${d}</span>`)
      .join('')}<p class="loading calendar__msg">Carico i giorni liberi…</p>`;

    try {
      availability = (await apiRequest(`/availability/${y}/${m + 1}`)).availability;
    } catch (error) {
      grid.querySelector('.loading').outerHTML =
        `<p class="field-error calendar__msg">${escapeHtml(error.message)}</p>`;
      return;
    }
    if (month.getFullYear() !== y || month.getMonth() !== m) return; // mese cambiato nel frattempo

    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const today = todayISO();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span aria-hidden="true"></span>');
    for (let d = 1; d <= days; d++) {
      const date = toISO(new Date(y, m, d));
      const free = availability[d] && allowDate(date);
      const label = `${formatDayMonth(date)}${free ? '' : ', non disponibile'}`;
      cells.push(
        `<button type="button" class="day${free ? ' day--free' : ''}${date === today ? ' day--today' : ''}"
          data-date="${date}" aria-label="${label}" aria-pressed="${date === selected.date}"
          ${free ? '' : 'disabled'}>${d}</button>`
      );
    }
    grid.querySelector('.loading').outerHTML = cells.join('');
  }

  async function selectDate(date) {
    selected = { date, time: null };
    grid.querySelectorAll('.day').forEach(d => {
      d.setAttribute('aria-pressed', String(d.dataset.date === date));
    });
    onChange(selected);
    await renderSlots();
    // Gli orari compaiono sotto il calendario: su telefono vanno portati in vista
    if (slotsEl.getBoundingClientRect().top > window.innerHeight * 0.6) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      slotsEl.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }
  }

  async function renderSlots() {
    const { date } = selected;
    if (!date) {
      slotsEl.innerHTML = '';
      return;
    }
    const request = ++slotsRequest;
    slotsEl.innerHTML = `<h2>${escapeHtml(formatDayMonth(date))}</h2><p class="loading">Carico gli orari…</p>`;
    let slots;
    try {
      slots = (await apiRequest(`/slots/${date}`)).slots;
    } catch (error) {
      slotsEl.innerHTML = `<p class="field-error">${escapeHtml(error.message)}</p>`;
      return;
    }
    if (request !== slotsRequest) return;

    const n = size();
    const times = usableStarts(slots, n);
    const heading = `<h2>${escapeHtml(formatDayMonth(date))}</h2>`;
    if (times.length === 0) {
      const reason =
        n > 1
          ? `Nessun orario con ${n} posti consecutivi liberi in questo giorno.`
          : 'In questo giorno non restano orari liberi.';
      slotsEl.innerHTML = `${heading}<div class="state"><p>${reason} Prova un altro giorno.</p></div>`;
      return;
    }
    // Tutti gli orari del giorno come file di tasti, una per turno (mattina, pomeriggio):
    // quelli che non possono iniziare l'appuntamento restano spenti ma visibili, così la
    // forma della giornata si legge a colpo d'occhio
    const usable = new Set(times);
    const keyHtml = slot => {
      const can = usable.has(slot.time);
      const state = !slot.available ? 'occupato' : can ? 'libero' : `servono ${n} posti di fila`;
      return `<button type="button" class="key slot" data-time="${slot.time}" ${can ? '' : 'disabled'}
          aria-pressed="false" aria-label="Ore ${slot.time}, ${state}">
          <span class="key__time">${slot.time}</span>${slot.available ? '' : '<small>occupato</small>'}
        </button>`;
    };
    slotsEl.innerHTML = `${heading}
      <div class="shifts">
        ${shiftRuns(slots)
          .map(
            run => `<div class="shift-row" role="group" aria-label="${run.name}">
              <p class="shift-row__name"><span>${run.name}</span><span class="muted num">${run.slots[0].time}–${endOf(run.slots[run.slots.length - 1].time, 1)}</span></p>
              <div class="keys">${run.slots.map(keyHtml).join('')}</div>
            </div>`
          )
          .join('')}
      </div>
      ${n > 1 ? `<p class="hint">Con ${n} persone si accendono ${n} tasti di fila: un appuntamento dopo l'altro.</p>` : ''}`;
    lightKeys();
  }

  // Preselezione (es. "Il solito?" o il primo posto libero dalla pagina d'ingresso)
  async function preselect(date, time) {
    const d = parseISO(date);
    if (!d) return;
    month = new Date(d.getFullYear(), d.getMonth(), 1);
    await renderMonth();
    await selectDate(date);
    const slot = slotsEl.querySelector(`.slot[data-time="${CSS.escape(time || '')}"]`);
    if (slot) slot.click();
  }

  // Mostra il mese di una data senza selezionare nulla
  function goTo(date) {
    const d = parseISO(date);
    month = new Date(d.getFullYear(), d.getMonth(), 1);
    selected = { date: null, time: null };
    renderSlots();
    return renderMonth();
  }

  return {
    render: renderMonth,
    goTo,
    refreshSlots: renderSlots,
    preselect,
    get selection() {
      return selected;
    },
    reset() {
      selected = { date: null, time: null };
      renderMonth();
      renderSlots();
      onChange(selected);
    }
  };
}

// "Il solito?": l'ultimo appuntamento già fatto, stesso giorno della settimana e stessa
// ora, nella prima settimana da oggi in cui quello slot è libero e il cliente non ha
// già un appuntamento (al massimo tre settimane avanti). null se non c'è nulla da proporre.
const USUAL_WEEKS_AHEAD = 3;

async function findUsualSlot(bookings) {
  const past = (bookings || []).filter(b => !isUpcoming(b)).sort(byDateTime);
  const last = past[past.length - 1];
  if (!last) return null;

  const bookedWeeks = new Set(bookings.filter(isUpcoming).map(b => mondayOf(b.giorno)));
  let date = addDays(last.giorno, 7);
  while (slotDate(date, last.ora) <= new Date()) date = addDays(date, 7);

  for (let i = 0; i < USUAL_WEEKS_AHEAD; i++, date = addDays(date, 7)) {
    if (bookedWeeks.has(mondayOf(date))) continue;
    try {
      const { slots } = await apiRequest(`/slots/${date}`);
      if (usableStarts(slots, 1).includes(last.ora)) return { date, time: last.ora, from: last };
    } catch (error) {
      return null;
    }
  }
  return null;
}

// Il riquadro "Il solito?" (home e prenotazione): il cartellino della volta scorsa
// ricopiato una settimana dopo
function renderUsual(container, usual, name, href) {
  container.innerHTML = `
    <div class="ticket usual__ticket">
      <p class="ticket__head"><span>Il solito</span><span>come ${escapeHtml(formatDateShort(usual.from.giorno))}</span></p>
      <h2 id="usual-title" class="usual__title">Il solito, ${escapeHtml(name)}?</h2>
      <p class="ticket__day">${escapeHtml(formatDayMonth(usual.date))}</p>
      <div class="ticket__time">${SegmentDisplay.html(usual.time, { className: 'seg--ink' })}</div>
      <div class="ticket__foot"><a class="btn btn--turn btn--block" href="${href}">Sì, prendi questo turno</a></div>
    </div>`;
  container.hidden = false;
}
