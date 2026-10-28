// Disegno dell'agenda admin (vista giorno e vista settimana) a partire dai giorni di
// GET /api/admin/schedule. Solo funzioni che restituiscono HTML: stato ed eventi in admin.js.
// Gli stati si leggono anche senza colore: Libero, nome del cliente, Ferie, Serie, Extra.

const AgendaView = (function () {
  const key = (date, time) => `${date}|${time}`;

  // Righe di un giorno: unione di slot in vigore, prenotazioni (anche fuori orario) e ferie
  // (nei giorni chiusi solo ciò che c'è davvero: i turni restano salvati per la riapertura)
  function rowsOf(day) {
    const times = [
      ...new Set([...(day.open ? day.slots : []), ...day.bookings.map(b => b.ora), ...day.holidays])
    ].sort();
    const now = new Date();
    return times.map(time => {
      const booking = day.bookings.find(b => b.ora === time) || null;
      const group =
        booking && booking.token && booking.tipo !== 'ricorrente'
          ? day.bookings.filter(b => b.token === booking.token).length
          : 1;
      return {
        date: day.date,
        time,
        booking,
        group,
        holiday: day.holidays.includes(time),
        extra: !day.standardSlots.includes(time),
        past: slotDate(day.date, time) <= now
      };
    });
  }

  const clientName = b => [b.cognome, b.nome].filter(Boolean).join(' ');

  function tags(row) {
    const list = [];
    if (row.booking && row.booking.tipo === 'ricorrente') {
      list.push('<span class="tag">Serie</span>');
    }
    if (row.group > 1) list.push(`<span class="tag">Gruppo di ${row.group}</span>`);
    return list.join('');
  }

  // Contenuto di una cella o riga, uguale nelle due viste
  function cell(row, { holidayMode, selected, compact }) {
    const id = key(row.date, row.time);
    const label = `${formatDayMonth(row.date)}, ore ${row.time}`;
    if (holidayMode) {
      if (row.booking) {
        return `<span class="cell cell--booked cell--locked"><strong>${escapeHtml(clientName(row.booking))}</strong></span>`;
      }
      return `<label class="cell cell--check${row.holiday ? ' cell--holiday' : ''}">
          <input type="checkbox" data-hsel="${id}" ${selected.has(id) ? 'checked' : ''}
            aria-label="${row.holiday ? 'Riapri' : 'Chiudi per ferie'} ${label}" />
          <span>${row.holiday ? 'Ferie' : 'Libero'}</span>
        </label>`;
    }
    if (row.booking) {
      return `<button type="button" class="cell cell--booked" data-booking="${id}"
          ${compact ? 'draggable="true"' : ''} aria-label="${escapeHtml(clientName(row.booking))}, ${label}">
          <strong>${escapeHtml(clientName(row.booking))}</strong>${tags(row)}
        </button>`;
    }
    if (row.holiday) {
      return `<span class="cell cell--holiday"><span>Ferie</span></span>`;
    }
    return `<button type="button" class="cell cell--free" data-add="${id}" aria-label="Aggiungi un appuntamento: ${label}">
        <span>Libero</span>${compact ? '' : '<span class="cell__add">Aggiungi</span>'}
      </button>`;
  }

  function timeLabel(row) {
    return `<span class="num">${row.time}</span>${row.extra ? '<small>Extra</small>' : ''}`;
  }

  // Vista giorno (telefono): una riga per orario
  function day(dayData, opts) {
    const rows = rowsOf(dayData);
    if (rows.length === 0) {
      return `<div class="state"><p>${dayData.open ? 'Nessun orario in questo giorno.' : 'Giorno di chiusura.'}</p>
        ${opts.holidayMode ? '' : '<button type="button" class="btn btn--sm" data-new-day>Aggiungi comunque un appuntamento</button>'}</div>`;
    }
    const booked = rows.filter(r => r.booking).length;
    return `<h2 class="agenda__day">${escapeHtml(formatDayMonth(dayData.date))}
        <span class="muted">${booked === 0 ? 'nessun appuntamento' : booked === 1 ? '1 appuntamento' : `${booked} appuntamenti`}${dayData.open ? '' : ' · chiuso'}</span></h2>
      <ol class="agenda">
        ${rows
          .map(
            row => `<li class="agenda__row${row.past ? ' is-past' : ''}">
              <span class="agenda__time">${timeLabel(row)}</span>
              ${cell(row, opts)}
            </li>`
          )
          .join('')}
      </ol>`;
  }

  // Vista settimana: una colonna per giorno; la domenica compare solo se ha orari
  function week(days, opts) {
    const visible = days.filter(d => d.open || d.slots.length || d.bookings.length);
    const byDay = visible.map(d => new Map(rowsOf(d).map(r => [r.time, r])));
    const times = [...new Set(byDay.flatMap(m => [...m.keys()]))].sort();
    const today = todayISO();
    return `<div class="week-scroll" tabindex="0" aria-label="Settimana, scorri in orizzontale">
      <table class="weekgrid">
        <thead><tr><th scope="col" class="weekgrid__corner">Ora</th>${visible
          .map(d => {
            const date = parseISO(d.date);
            return `<th scope="col"${d.date === today ? ' class="is-today"' : ''}>${DAYS_SHORT_IT[date.getDay()]} <span class="num">${date.getDate()}</span></th>`;
          })
          .join('')}</tr></thead>
        <tbody>${times
          .map(
            time =>
              `<tr><th scope="row" class="num">${time}</th>${byDay
                .map((rows, i) => {
                  const row = rows.get(time);
                  if (!row) return '<td class="weekgrid__none"></td>';
                  return `<td class="${row.past ? 'is-past' : ''}" data-drop="${key(visible[i].date, time)}">${row.extra ? '<small class="weekgrid__extra">Extra</small>' : ''}${cell(row, { ...opts, compact: true })}</td>`;
                })
                .join('')}</tr>`
          )
          .join('')}</tbody>
      </table></div>`;
  }

  // Selettore dei giorni (vista giorno)
  function strip(days, selectedDate) {
    const today = todayISO();
    return days
      .map(d => {
        const date = parseISO(d.date);
        const count = d.bookings.length;
        return `<button type="button" class="strip-day${d.open ? '' : ' is-closed'}${d.date === today ? ' is-today' : ''}"
            data-day="${d.date}" aria-pressed="${d.date === selectedDate}"
            aria-label="${formatDayMonth(d.date)}, ${count === 1 ? '1 appuntamento' : `${count} appuntamenti`}${d.open ? '' : ', chiuso'}">
            <span class="strip-day__dow">${DAYS_SHORT_IT[date.getDay()]}</span>
            <span class="strip-day__num num">${date.getDate()}</span>
            <span class="strip-day__count">${count || ''}</span>
          </button>`;
      })
      .join('');
  }

  return { day, week, strip, rowsOf, clientName };
})();
