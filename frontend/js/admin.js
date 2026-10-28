// Agenda del barbiere: vista giorno (telefono) e settimana, inserimento, dettaglio,
// spostamento (azione esplicita e trascinamento su desktop), cancellazione e ferie.
// Slot, prenotazioni e ferie arrivano tutti da GET /api/admin/schedule.
(async function () {
  if (!(await requireAuth({ admin: true }))) return;

  const VIEW_KEY = 'lev-space-agenda-view';
  const $ = selector => document.querySelector(selector);
  const agendaEl = $('[data-agenda]');
  const stripEl = $('[data-strip]');
  const holidayBar = $('[data-holiday-bar]');
  const holidayButton = $('[data-holiday-mode]');
  const bookingSheet = document.getElementById('booking-sheet');
  const newSheet = document.getElementById('new-sheet');
  const newForm = document.getElementById('new-form');
  const moveForm = bookingSheet.querySelector('[data-move-form]');

  const state = {
    monday: mondayOf(todayISO()),
    day: todayISO(),
    view: readView(),
    days: [],
    holidayMode: false,
    selected: new Set(),
    current: null, // prenotazione aperta nel dettaglio
    users: []
  };

  function readView() {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'day' || saved === 'week') return saved;
    } catch (error) {
      // preferenza non disponibile: si decide dalla larghezza
    }
    return window.matchMedia('(min-width: 1024px)').matches ? 'week' : 'day';
  }

  const findDay = date => state.days.find(d => d.date === date);
  const parseKey = value => value.split('|');

  // ==================== CARICAMENTO E DISEGNO ====================

  async function load() {
    agendaEl.setAttribute('aria-busy', 'true');
    try {
      const { days } = await apiRequest(
        `/admin/schedule?from=${state.monday}&to=${addDays(state.monday, 6)}`,
        { sessionRequired: true }
      );
      state.days = days;
      render();
    } catch (error) {
      agendaEl.innerHTML = `<div class="state"><p>${escapeHtml(error.message)}</p>
        <button type="button" class="btn" data-retry>Riprova</button></div>`;
    } finally {
      agendaEl.removeAttribute('aria-busy');
    }
  }

  function render() {
    const sunday = addDays(state.monday, 6);
    $('[data-range]').textContent = `${formatDateShort(state.monday)} – ${formatDateShort(sunday)}`;
    document.querySelectorAll('[data-view] input').forEach(input => {
      input.checked = input.value === state.view;
    });
    stripEl.hidden = state.view !== 'day';
    stripEl.innerHTML = AgendaView.strip(state.days, state.day);
    const opts = { holidayMode: state.holidayMode, selected: state.selected };
    agendaEl.innerHTML =
      state.view === 'day'
        ? AgendaView.day(findDay(state.day), opts)
        : AgendaView.week(state.days, opts);
    updateHolidayBar();
  }

  function goToWeek(delta) {
    if (delta === 0) {
      state.monday = mondayOf(todayISO());
      state.day = todayISO();
    } else {
      state.monday = addDays(state.monday, delta * 7);
      // Si resta sullo stesso giorno della settimana
      state.day = addDays(state.day, delta * 7);
    }
    state.selected.clear();
    load();
  }

  document.querySelectorAll('[data-week]').forEach(button => {
    button.addEventListener('click', () => goToWeek(Number(button.dataset.week)));
  });
  document.querySelectorAll('[data-view] input').forEach(input => {
    input.addEventListener('change', () => {
      state.view = input.value;
      try {
        localStorage.setItem(VIEW_KEY, state.view);
      } catch (error) {
        // solo per questa visita
      }
      render();
    });
  });
  stripEl.addEventListener('click', event => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    state.day = button.dataset.day;
    render();
    stripEl.querySelector(`[data-day="${state.day}"]`).focus();
  });

  // ==================== CLIC NELL'AGENDA ====================

  agendaEl.addEventListener('click', event => {
    if (event.target.closest('[data-retry]')) return load();
    if (event.target.closest('[data-new-day]')) return openNew(state.day, null);
    const booking = event.target.closest('[data-booking]');
    if (booking) return openBooking(...parseKey(booking.dataset.booking));
    const add = event.target.closest('[data-add]');
    if (add) return openNew(...parseKey(add.dataset.add));
    return undefined;
  });

  agendaEl.addEventListener('change', event => {
    const box = event.target.closest('[data-hsel]');
    if (!box) return;
    if (box.checked) state.selected.add(box.dataset.hsel);
    else state.selected.delete(box.dataset.hsel);
    updateHolidayBar();
  });

  // ==================== DETTAGLIO, SPOSTAMENTO, CANCELLAZIONE ====================

  function bookingAt(date, time) {
    const day = findDay(date);
    return day && day.bookings.find(b => b.ora === time);
  }

  function openBooking(date, time) {
    const b = bookingAt(date, time);
    if (!b) return;
    state.current = b;
    const series = b.tipo === 'ricorrente';
    bookingSheet.querySelector('[data-b-name]').textContent = AgendaView.clientName(b);
    bookingSheet.querySelector('[data-b-kind]').textContent = series
      ? 'Appuntamento di una serie'
      : 'Appuntamento';
    bookingSheet.querySelector('[data-b-day]').textContent = formatDayMonth(b.giorno);
    bookingSheet.querySelector('[data-b-time]').textContent = b.ora;
    const contacts = [
      b.telefono && [
        'Telefono',
        `<a href="tel:${escapeHtml(b.telefono.replace(/\s/g, ''))}">${escapeHtml(b.telefono)}</a>`
      ],
      b.email && ['Email', `<a href="mailto:${escapeHtml(b.email)}">${escapeHtml(b.email)}</a>`]
    ].filter(Boolean);
    bookingSheet.querySelector('[data-b-contacts]').innerHTML = contacts.length
      ? contacts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')
      : '<div><dt>Contatti</dt><dd class="muted">Nessun recapito registrato</dd></div>';
    bookingSheet.querySelector('[data-b-cancel-series]').hidden = !series;
    bookingSheet.querySelector('[data-b-actions]').hidden = false;
    moveForm.hidden = true;
    Sheet.open(bookingSheet);
  }

  // Orari liberi di un giorno per lo spostamento o l'inserimento (extra compresi)
  async function freeTimes(date, keep) {
    const { days } = await apiRequest(`/admin/schedule?from=${date}&to=${date}`, {
      sessionRequired: true
    });
    const [day] = days;
    const taken = new Set([...day.bookings.map(b => b.ora), ...day.holidays]);
    return day.slots
      .filter(t => !taken.has(t) || t === keep)
      .map(t => ({
        time: t,
        extra: !day.standardSlots.includes(t)
      }));
  }

  async function fillTimes(select, date, { keep, selected, allowCustom = false } = {}) {
    select.innerHTML = '<option value="">Carico gli orari…</option>';
    select.disabled = true;
    try {
      const times = await freeTimes(date, keep);
      const options = times.map(
        t =>
          `<option value="${t.time}"${t.time === selected ? ' selected' : ''}>${t.time}${t.extra ? ' (extra)' : ''}</option>`
      );
      if (options.length === 0) options.push('<option value="">Nessun orario libero</option>');
      if (allowCustom) options.push('<option value="custom">Altro orario…</option>');
      select.innerHTML = options.join('');
    } catch (error) {
      select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`;
    } finally {
      select.disabled = false;
    }
  }

  bookingSheet.querySelector('[data-b-move]').addEventListener('click', async () => {
    const b = state.current;
    bookingSheet.querySelector('[data-b-actions]').hidden = true;
    moveForm.hidden = false;
    showMessage(moveForm.querySelector('[data-move-error]'), '');
    const dateInput = document.getElementById('move-date');
    dateInput.value = b.giorno;
    dateInput.focus();
    await fillTimes(document.getElementById('move-time'), b.giorno, {
      keep: b.ora,
      selected: b.ora
    });
  });
  document.getElementById('move-date').addEventListener('change', event => {
    if (event.target.value) fillTimes(document.getElementById('move-time'), event.target.value);
  });
  moveForm.querySelector('[data-move-cancel]').addEventListener('click', () => {
    moveForm.hidden = true;
    bookingSheet.querySelector('[data-b-actions]').hidden = false;
    bookingSheet.querySelector('[data-b-move]').focus();
  });

  async function moveBooking(b, newGiorno, newOra) {
    await apiRequest('/admin/bookings', {
      ...jsonBody('PUT', { oldGiorno: b.giorno, oldOra: b.ora, newGiorno, newOra }),
      sessionRequired: true
    });
    showToast(
      `${AgendaView.clientName(b)} spostato a ${formatDateShort(newGiorno)}, ${newOra}`,
      'success'
    );
    if (newGiorno < state.monday || newGiorno > addDays(state.monday, 6)) {
      state.monday = mondayOf(newGiorno);
    }
    state.day = newGiorno;
    await load();
  }

  moveForm.addEventListener('submit', async event => {
    event.preventDefault();
    const b = state.current;
    const newGiorno = document.getElementById('move-date').value;
    const newOra = document.getElementById('move-time').value;
    const errorBox = moveForm.querySelector('[data-move-error]');
    if (!newGiorno || !newOra) {
      showMessage(errorBox, 'Scegli giorno e orario.');
      return;
    }
    if (newGiorno === b.giorno && newOra === b.ora) {
      Sheet.close(bookingSheet);
      return;
    }
    const submit = moveForm.querySelector('[type="submit"]');
    setBusy(submit, true, 'Sposto…');
    try {
      await moveBooking(b, newGiorno, newOra);
      Sheet.close(bookingSheet);
    } catch (error) {
      showMessage(errorBox, error.message);
    } finally {
      setBusy(submit, false);
    }
  });

  bookingSheet.querySelector('[data-b-cancel]').addEventListener('click', async event => {
    const b = state.current;
    const ok = await Sheet.confirm({
      title: 'Cancellare l’appuntamento?',
      message: `${AgendaView.clientName(b)}, ${formatDate(b.giorno)} alle ${b.ora}. Il cliente non riceve avvisi automatici.`,
      confirmLabel: 'Sì, cancella'
    });
    if (!ok) return;
    const button = event.target;
    setBusy(button, true, 'Cancello…');
    try {
      await apiRequest('/admin/bookings', {
        ...jsonBody('DELETE', { giorno: b.giorno, ora: b.ora }),
        sessionRequired: true
      });
      Sheet.close(bookingSheet);
      showToast('Appuntamento cancellato', 'success');
      await load();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(button, false);
    }
  });

  bookingSheet.querySelector('[data-b-cancel-series]').addEventListener('click', async event => {
    const b = state.current;
    const button = event.target;
    let count = '';
    try {
      const { bookings } = await apiRequest('/admin/bookings', { sessionRequired: true });
      count = bookings.filter(x => x.token === b.token && x.tipo === 'ricorrente').length;
    } catch (error) {
      // il conteggio è solo informativo
    }
    const ok = await Sheet.confirm({
      title: 'Cancellare tutta la serie?',
      message: `${count ? `${count} appuntamenti` : 'Tutti gli appuntamenti'} della serie di ${AgendaView.clientName(b)}, compresi quelli già passati.`,
      confirmLabel: 'Sì, cancella la serie'
    });
    if (!ok) return;
    setBusy(button, true, 'Cancello…');
    try {
      const response = await apiRequest('/admin/bookings', {
        ...jsonBody('DELETE', { token: b.token, scope: 'series' }),
        sessionRequired: true
      });
      Sheet.close(bookingSheet);
      showToast(`Serie cancellata: ${response.eliminate} appuntamenti`, 'success');
      await load();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(button, false);
    }
  });

  // ==================== TRASCINAMENTO (desktop, vista settimana) ====================
  // Scorciatoia per il mouse: la stessa operazione è sempre disponibile con "Sposta".

  let dragged = null;
  agendaEl.addEventListener('dragstart', event => {
    const cell = event.target.closest('[data-booking]');
    if (!cell) return;
    dragged = bookingAt(...parseKey(cell.dataset.booking));
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cell.dataset.booking);
    cell.classList.add('is-dragging');
  });
  agendaEl.addEventListener('dragend', () => {
    dragged = null;
    agendaEl
      .querySelectorAll('.is-dragging, .is-drop')
      .forEach(el => el.classList.remove('is-dragging', 'is-drop'));
  });
  agendaEl.addEventListener('dragover', event => {
    const target = event.target.closest('[data-drop]');
    if (!dragged || !target || !target.querySelector('[data-add]')) return;
    event.preventDefault();
    agendaEl.querySelectorAll('.is-drop').forEach(el => el.classList.remove('is-drop'));
    target.classList.add('is-drop');
  });
  agendaEl.addEventListener('drop', async event => {
    const target = event.target.closest('[data-drop]');
    if (!dragged || !target) return;
    event.preventDefault();
    const b = dragged;
    const [date, time] = parseKey(target.dataset.drop);
    try {
      await moveBooking(b, date, time);
    } catch (error) {
      showToast(error.message);
    }
  });

  // ==================== NUOVO APPUNTAMENTO ====================

  const newFields = {
    search: document.getElementById('new-search'),
    nome: document.getElementById('new-nome'),
    cognome: document.getElementById('new-cognome'),
    telefono: document.getElementById('new-telefono'),
    email: document.getElementById('new-email'),
    date: document.getElementById('new-date'),
    time: document.getElementById('new-time'),
    custom: document.getElementById('new-time-custom'),
    repeat: document.getElementById('new-repeat'),
    months: document.getElementById('new-months')
  };
  newFields.months.innerHTML = Array.from(
    { length: 12 },
    (_, i) => `<option value="${i + 1}">${i + 1} ${i === 0 ? 'mese' : 'mesi'}</option>`
  ).join('');

  async function openNew(date, time) {
    newForm.reset();
    showMessage(newForm.querySelector('[data-new-error]'), '');
    newForm.querySelector('[data-custom-time]').hidden = true;
    newForm.querySelector('[data-months]').hidden = true;
    newForm.querySelector('[data-repeat-hint]').hidden = true;
    newFields.date.value = date || state.day;
    Sheet.open(newSheet);
    newFields.search.focus();
    await fillTimes(newFields.time, newFields.date.value, { selected: time, allowCustom: true });
    if (time && newFields.time.value !== time) {
      // Orario fuori dagli slot (es. riga di una prenotazione già cancellata)
      newFields.time.value = 'custom';
      newFields.custom.value = time;
      newForm.querySelector('[data-custom-time]').hidden = false;
    }
  }

  $('[data-new]').addEventListener('click', () => openNew(state.day, null));
  newFields.date.addEventListener('change', () => {
    if (newFields.date.value) {
      fillTimes(newFields.time, newFields.date.value, { allowCustom: true });
    }
  });
  newFields.time.addEventListener('change', () => {
    newForm.querySelector('[data-custom-time]').hidden = newFields.time.value !== 'custom';
  });
  newFields.repeat.addEventListener('change', () => {
    const repeating = newFields.repeat.value !== '0';
    newForm.querySelector('[data-months]').hidden = !repeating;
    newForm.querySelector('[data-repeat-hint]').hidden = !repeating;
  });

  // Ricerca cliente (combobox): compila nome, cognome, telefono ed email
  const suggestions = document.getElementById('new-suggestions');
  let matches = [];
  try {
    state.users = (await apiRequest('/admin/users', { sessionRequired: true })).users.filter(
      u => u.banned !== '1'
    );
  } catch (error) {
    state.users = [];
  }

  function closeSuggestions() {
    suggestions.hidden = true;
    newFields.search.setAttribute('aria-expanded', 'false');
    newFields.search.removeAttribute('aria-activedescendant');
  }

  function choose(user) {
    newFields.nome.value = user.nome;
    newFields.cognome.value = user.cognome;
    newFields.telefono.value = user.telefono || '';
    newFields.email.value = user.email;
    newFields.search.value = `${user.cognome} ${user.nome}`;
    closeSuggestions();
    newFields.date.focus();
  }

  newFields.search.addEventListener('input', () => {
    const q = newFields.search.value.trim().toLowerCase();
    matches =
      q.length < 2
        ? []
        : state.users
            .filter(u => `${u.nome} ${u.cognome} ${u.cognome} ${u.nome}`.toLowerCase().includes(q))
            .slice(0, 6);
    if (matches.length === 0) return closeSuggestions();
    suggestions.innerHTML = matches
      .map(
        (u, i) => `<li role="option" id="sugg-${i}" data-index="${i}" aria-selected="false">
            <strong>${escapeHtml(`${u.cognome} ${u.nome}`)}</strong>${u.vip ? ' <span class="tag tag--ink">VIP</span>' : ''}
            <span class="muted">${escapeHtml(u.email)}</span>
          </li>`
      )
      .join('');
    suggestions.hidden = false;
    newFields.search.setAttribute('aria-expanded', 'true');
    return undefined;
  });
  newFields.search.addEventListener('keydown', event => {
    if (suggestions.hidden) return;
    const options = [...suggestions.querySelectorAll('[role="option"]')];
    let index = options.findIndex(o => o.getAttribute('aria-selected') === 'true');
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      index = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((o, i) => o.setAttribute('aria-selected', String(i === index)));
      newFields.search.setAttribute('aria-activedescendant', options[index].id);
    } else if (event.key === 'Enter' && index >= 0) {
      event.preventDefault();
      choose(matches[index]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      closeSuggestions();
    }
  });
  suggestions.addEventListener('mousedown', event => event.preventDefault());
  suggestions.addEventListener('click', event => {
    const option = event.target.closest('[data-index]');
    if (option) choose(matches[Number(option.dataset.index)]);
  });
  newFields.search.addEventListener('blur', closeSuggestions);

  newForm.addEventListener('submit', async event => {
    event.preventDefault();
    const errorBox = newForm.querySelector('[data-new-error]');
    const ora = newFields.time.value === 'custom' ? newFields.custom.value : newFields.time.value;
    if (!newFields.cognome.value.trim()) {
      showMessage(errorBox, 'Il cognome è obbligatorio.');
      newFields.cognome.focus();
      return;
    }
    if (!newFields.date.value || !/^\d{2}:\d{2}$/.test(ora || '')) {
      showMessage(errorBox, 'Scegli giorno e orario.');
      return;
    }
    const repeat = Number(newFields.repeat.value);
    const body = {
      nome: newFields.nome.value.trim(),
      cognome: newFields.cognome.value.trim(),
      telefono: newFields.telefono.value.trim(),
      email: newFields.email.value.trim(),
      giorno: newFields.date.value,
      ora,
      ...(repeat
        ? {
            ricorrente: true,
            intervalloSettimane: repeat,
            mesiRicorrenza: Number(newFields.months.value)
          }
        : {})
    };
    const submit = newForm.querySelector('[type="submit"]');
    setBusy(submit, true, 'Aggiungo…');
    try {
      const response = await apiRequest('/admin/bookings', {
        ...jsonBody('POST', body),
        sessionRequired: true
      });
      Sheet.close(newSheet);
      showToast(
        response.ricorrente
          ? `Serie creata: ${response.inserite} appuntamenti${response.saltate ? `, ${response.saltate} date saltate perché occupate o in ferie` : ''}`
          : 'Appuntamento aggiunto',
        'success'
      );
      state.day = body.giorno;
      if (body.giorno < state.monday || body.giorno > addDays(state.monday, 6)) {
        state.monday = mondayOf(body.giorno);
      }
      await load();
    } catch (error) {
      showMessage(errorBox, error.message);
    } finally {
      setBusy(submit, false);
    }
  });

  // ==================== FERIE ====================

  function setHolidayMode(on) {
    state.holidayMode = on;
    state.selected.clear();
    holidayButton.setAttribute('aria-pressed', String(on));
    holidayButton.textContent = on ? 'Esci dalle ferie' : 'Ferie';
    $('[data-new]').hidden = on;
    $('[data-hint]').textContent = on
      ? 'Seleziona gli orari da chiudere (liberi) o da riaprire (ferie), poi salva.'
      : 'Tocca un appuntamento per vederlo, spostarlo o cancellarlo; tocca un orario libero per aggiungerne uno.';
    holidayBar.hidden = !on;
    render();
  }

  function updateHolidayBar() {
    if (!state.holidayMode) return;
    const holidays = new Set(state.days.flatMap(d => d.holidays.map(h => `${d.date}|${h}`)));
    const toClose = [...state.selected].filter(k => !holidays.has(k)).length;
    const toOpen = state.selected.size - toClose;
    const parts = [toClose && `${toClose} da chiudere`, toOpen && `${toOpen} da riaprire`].filter(
      Boolean
    );
    $('[data-holiday-count]').innerHTML = parts.length
      ? `${parts.join(' · ')}<span>Salva per applicare</span>`
      : 'Nessun orario selezionato<span>Tocca gli orari da chiudere o riaprire</span>';
    $('[data-holiday-save]').disabled = state.selected.size === 0;
    $('[data-holiday-day]').hidden = state.view !== 'day';
  }

  holidayButton.addEventListener('click', () => setHolidayMode(!state.holidayMode));

  // Tutto il giorno: seleziona ogni orario libero del giorno mostrato
  $('[data-holiday-day]').addEventListener('click', () => {
    AgendaView.rowsOf(findDay(state.day))
      .filter(r => !r.booking && !r.holiday)
      .forEach(r => state.selected.add(`${r.date}|${r.time}`));
    render();
  });

  $('[data-holiday-save]').addEventListener('click', async event => {
    const button = event.currentTarget;
    const holidays = new Set(state.days.flatMap(d => d.holidays.map(h => `${d.date}|${h}`)));
    const toSlot = k => {
      const [giorno, ora] = parseKey(k);
      return { giorno, ora };
    };
    const add = [...state.selected].filter(k => !holidays.has(k)).map(toSlot);
    const remove = [...state.selected].filter(k => holidays.has(k)).map(toSlot);
    setBusy(button, true, 'Salvo…');
    try {
      if (add.length) {
        await apiRequest('/admin/holidays', {
          ...jsonBody('POST', { slots: add }),
          sessionRequired: true
        });
      }
      if (remove.length) {
        await apiRequest('/admin/holidays', {
          ...jsonBody('DELETE', { slots: remove }),
          sessionRequired: true
        });
      }
      showToast(
        [add.length && `${add.length} orari chiusi`, remove.length && `${remove.length} riaperti`]
          .filter(Boolean)
          .join(', '),
        'success'
      );
      state.selected.clear();
      await load();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(button, false);
      updateHolidayBar();
    }
  });

  load();
})();
