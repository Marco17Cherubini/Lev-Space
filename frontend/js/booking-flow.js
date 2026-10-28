// Prenotazione in una sola pagina: persone → giorno → orario → conferma nello sheet.
// Stesso flusso per il cliente (/dashboard, anche per spostare un appuntamento) e per
// l'ospite (/guest-booking). I parametri ?data&ora preselezionano un orario,
// ?sposta&dalle&persone spostano un appuntamento esistente.
(async function () {
  const main = document.querySelector('[data-flow]');
  const isGuest = main.dataset.flow === 'guest';
  const params = new URLSearchParams(location.search);
  const moving =
    !isGuest && params.get('sposta') && params.get('dalle')
      ? { giorno: params.get('sposta'), ora: params.get('dalle') }
      : null;

  const sheet = document.getElementById('confirm-sheet');
  const form = document.getElementById('confirm-form');
  const success = sheet.querySelector('[data-success]');
  const errorBox = sheet.querySelector('[data-confirm-error]');
  const continueButton = main.querySelector('[data-continue]');
  const summary = main.querySelector('[data-summary]');
  const peopleRadios = [...main.querySelectorAll('[data-people] input')];

  const user = isGuest ? null : await requireAuth();
  if (!isGuest && !user) return;

  const groupSize = () => Number(peopleRadios.find(r => r.checked).value);
  const endTime = (time, n) => {
    const end = toMinutes(time) + n * APPOINTMENT_MINUTES;
    return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  };

  const picker = createBookingPicker(main.querySelector('[data-picker]'), {
    size: groupSize,
    onChange: updateSummary
  });

  function updateSummary({ date, time }) {
    const n = groupSize();
    continueButton.disabled = !(date && time);
    const who = n === 1 ? '1 persona' : `${n} persone`;
    if (date && time) {
      summary.innerHTML = `${escapeHtml(formatDateShort(date))} · ${time}<span>${who}, fino alle ${endTime(time, n)}</span>`;
    } else if (date) {
      summary.innerHTML = `${escapeHtml(formatDateShort(date))}<span>Ora scegli l'orario</span>`;
    } else {
      summary.innerHTML =
        'Scegli giorno e orario<span>I giorni evidenziati hanno posti liberi</span>';
    }
  }

  peopleRadios.forEach(radio =>
    radio.addEventListener('change', () => {
      picker.refreshSlots();
      updateSummary({ date: picker.selection.date, time: null });
    })
  );

  // ---- Spostamento di un appuntamento esistente
  if (moving) {
    const n = Math.min(Math.max(Number(params.get('persone')) || 1, 1), 3);
    peopleRadios.forEach(r => {
      r.checked = Number(r.value) === n;
      r.disabled = true;
    });
    main.querySelector('[data-flow-title]').textContent = 'Sposta l’appuntamento';
    main.querySelector('[data-flow-intro]').textContent =
      'Scegli il nuovo giorno e orario: quello attuale resta tuo finché non confermi.';
    const notice = main.querySelector('[data-moving]');
    notice.innerHTML = `Ora hai ${escapeHtml(formatDateShort(moving.giorno))} alle ${escapeHtml(moving.ora)}. <a href="/bookings">Lascia com'è</a>`;
    notice.hidden = false;
    sheet.querySelector('[data-confirm-submit]').textContent = 'Sposta qui';
    sheet.querySelector('#confirm-title').textContent = 'Conferma lo spostamento';
  }

  // ---- Dati del cliente nel riepilogo
  if (user) {
    sheet.querySelector('[data-confirm-user]').innerHTML = [
      ['Nome', `${user.nome} ${user.cognome}`],
      ['Email', user.email],
      ['Telefono', user.telefono]
    ]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join('');
  }

  function openConfirm() {
    const { date, time } = picker.selection;
    if (!date || !time) return;
    const n = groupSize();
    form.hidden = false;
    success.hidden = true;
    showMessage(errorBox, '');
    sheet.querySelector('[data-confirm-kind]').textContent =
      n === 1 ? 'Appuntamento' : `Appuntamento per ${n} persone, fino alle ${endTime(time, n)}`;
    sheet.querySelector('[data-confirm-day]').textContent = formatDayMonth(date);
    sheet.querySelector('[data-confirm-time]').textContent = time;
    Sheet.open(sheet);
  }
  continueButton.addEventListener('click', openConfirm);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const { date, time } = picker.selection;
    const n = groupSize();
    const submit = form.querySelector('[data-confirm-submit]');
    showMessage(errorBox, '');

    let request;
    if (isGuest) {
      const fields = ['nome', 'cognome', 'email'].map(name => form.elements[name]);
      const missing = fields.find(f => !f.value.trim() || !f.checkValidity());
      if (missing) {
        missing.setAttribute('aria-invalid', 'true');
        missing.focus();
        showMessage(
          errorBox,
          missing.validity.typeMismatch ? 'Controlla l’email.' : 'Compila nome, cognome ed email.'
        );
        return;
      }
      fields.forEach(f => f.removeAttribute('aria-invalid'));
      const [nome, cognome, email] = fields.map(f => f.value.trim());
      request = [
        '/bookings/guest',
        jsonBody('POST', { nome, cognome, email, giorno: date, ora: time, numPersone: n })
      ];
    } else if (moving) {
      request = [
        '/bookings',
        jsonBody('PUT', {
          oldGiorno: moving.giorno,
          oldOra: moving.ora,
          data: date,
          orario: time,
          numPersone: n
        })
      ];
    } else {
      request = ['/bookings', jsonBody('POST', { data: date, orario: time, numPersone: n })];
    }

    setBusy(submit, true, 'Confermo…');
    try {
      const response = await apiRequest(request[0], { ...request[1], sessionRequired: !isGuest });
      showSuccess(date, time, n, response.alreadyBooked);
    } catch (error) {
      showMessage(errorBox, error.message);
      // Slot preso da qualcun altro nel frattempo: si aggiornano gli orari sotto lo sheet
      if (error.status === 409) picker.refreshSlots();
      if (error.data && /accedi/i.test(error.data.error || '')) {
        errorBox.innerHTML = `${escapeHtml(error.message)} <a href="/login?${new URLSearchParams({ email: form.elements.email.value.trim(), next: `/dashboard?${new URLSearchParams({ data: date, ora: time })}` })}">Accedi</a>`;
      }
    } finally {
      setBusy(submit, false);
    }
  });

  function showSuccess(date, time, n, alreadyBooked) {
    form.hidden = true;
    success.hidden = false;
    success.querySelector('[data-success-day]').textContent = formatDayMonth(date);
    success.querySelector('[data-success-time]').textContent = time;
    success.querySelector('[data-success-meta]').textContent =
      n === 1 ? '' : `${n} persone, fino alle ${endTime(time, n)}`;
    // Il timbro riparte a ogni conferma
    const stamp = success.querySelector('[data-stamp]');
    stamp.textContent = moving ? 'Spostato' : 'Confermato';
    stamp.replaceWith(stamp.cloneNode(true));

    const note = success.querySelector('[data-success-note]');
    const actions = success.querySelector('[data-success-actions]');
    if (alreadyBooked) {
      note.textContent = 'Questo appuntamento era già registrato a tuo nome: non è cambiato nulla.';
    } else if (isGuest) {
      const email = form.elements.email.value.trim();
      note.textContent = `Abbiamo mandato la conferma a ${email}. Con un account sulla stessa email ritrovi qui le tue prenotazioni.`;
    } else {
      note.textContent = 'Ti abbiamo mandato la conferma per email.';
    }
    actions.innerHTML = isGuest
      ? `<a class="btn btn--primary btn--block" href="/register?${new URLSearchParams({ email: form.elements.email.value.trim() })}">Crea un account</a>
         <a class="btn btn--block" href="/">Torna all'inizio</a>`
      : `<a class="btn btn--primary btn--block" href="/bookings">I tuoi appuntamenti</a>
         <a class="btn btn--block" href="/home">Torna alla home</a>`;
    actions.querySelector('a').focus();
    sheet.addEventListener('close', () => picker.reset(), { once: true });
  }

  // ---- Avvio: "Il solito?" per chi prenota da solo, poi eventuale preselezione
  await picker.render();
  if (user && !moving) {
    try {
      const { bookings } = await apiRequest('/bookings', { sessionRequired: true });
      const usual = await findUsualSlot(bookings);
      const box = main.querySelector('[data-usual]');
      if (usual) {
        renderUsual(
          box,
          usual,
          user.nome,
          `/dashboard?${new URLSearchParams({ data: usual.date, ora: usual.time })}`
        );
        box.querySelector('a').addEventListener('click', async event => {
          event.preventDefault();
          peopleRadios[0].checked = true;
          await picker.preselect(usual.date, usual.time);
          openConfirm();
        });
      }
    } catch (error) {
      // "Il solito?" è un aiuto: senza, la prenotazione resta disponibile
    }
  }
  if (params.get('data') && params.get('ora')) {
    const n = Number(params.get('persone')) || 1;
    peopleRadios.forEach(r => {
      if (!r.disabled) r.checked = Number(r.value) === n;
    });
    await picker.preselect(params.get('data'), params.get('ora'));
    if (params.get('conferma') && picker.selection.time) openConfirm();
  }
})();
