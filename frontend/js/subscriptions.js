// Più settimane: un appuntamento per settimana (4, 8 o 12), scelti uno per uno o
// ripetendo il primo, poi confermati insieme con POST /api/bookings/series. Se una
// settimana non è più libera il server non prenota nulla e la indica: si cambia solo quella.
(async function () {
  const user = await requireAuth();
  if (!user) return;

  const list = document.querySelector('[data-week-list]');
  const startSelect = document.querySelector('[data-start]');
  const repeatBox = document.querySelector('[data-repeat]');
  const summary = document.querySelector('[data-series-summary]');
  const confirmButton = document.querySelector('[data-series-confirm]');
  const weekSheet = document.getElementById('week-sheet');
  const saveButton = weekSheet.querySelector('[data-week-save]');
  const weekRadios = [...document.querySelectorAll('[data-weeks] input')];

  let choices = [];
  let conflicts = new Map(); // data → messaggio del server
  let editing = null; // indice della settimana nello sheet

  const weekCount = () => Number(weekRadios.find(r => r.checked).value);
  const weekStart = i => addDays(startSelect.value, i * 7);

  // Settimane da cui partire: questa e le cinque successive
  const thisMonday = mondayOf(todayISO());
  startSelect.innerHTML = [0, 1, 2, 3, 4, 5]
    .map(i => {
      const monday = addDays(thisMonday, i * 7);
      const label = `${formatDayMonth(monday).replace(/^\S+ /, '')}${i === 0 ? ' (questa)' : i === 1 ? ' (prossima)' : ''}`;
      return `<option value="${monday}">dal ${label}</option>`;
    })
    .join('');

  const picker = createBookingPicker(weekSheet.querySelector('[data-picker]'), {
    allowDate: date =>
      editing !== null && date >= weekStart(editing) && date <= addDays(weekStart(editing), 6),
    onChange: ({ date, time }) => {
      saveButton.disabled = !(date && time);
    }
  });

  function resetChoices() {
    choices = Array.from({ length: weekCount() }, () => null);
    conflicts = new Map();
    repeatBox.hidden = true;
    render();
  }

  function render() {
    list.innerHTML = choices
      .map((choice, i) => {
        const monday = weekStart(i);
        const conflict = choice && conflicts.get(choice.data);
        const value = choice
          ? `<span class="week__value">${escapeHtml(formatDateShort(choice.data))} · <span class="num">${escapeHtml(choice.orario)}</span></span>`
          : '<span class="week__value week__value--empty">Scegli giorno e orario</span>';
        const chosen = choice ? ` data-date="${choice.data}" data-time="${choice.orario}"` : '';
        return `<li class="week${choice ? ' week--set' : ''}${conflict ? ' week--conflict' : ''}"${chosen}>
            <button type="button" class="week__button" data-week="${i}">
              <span class="week__label">Settimana ${i + 1} · dal ${escapeHtml(formatDateShort(monday))}</span>
              ${value}
            </button>
            ${conflict ? `<p class="field-error">${escapeHtml(conflict)}: scegli un altro orario.</p>` : ''}
          </li>`;
      })
      .join('');
    const filled = choices.filter(Boolean).length;
    summary.innerHTML = `${filled} su ${choices.length} settimane scelte<span>${
      filled === choices.length ? 'Pronte da confermare' : 'Tocca una settimana per scegliere'
    }</span>`;
    confirmButton.disabled = filled !== choices.length;
    confirmButton.textContent = `Conferma ${choices.length}`;
  }

  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-week]');
    if (!button) return;
    editing = Number(button.dataset.week);
    weekSheet.querySelector('#week-title').textContent =
      `Settimana ${editing + 1}: dal ${formatDayMonth(weekStart(editing))}`;
    saveButton.disabled = true;
    Sheet.open(weekSheet);
    const choice = choices[editing];
    if (choice) await picker.preselect(choice.data, choice.orario);
    else await picker.goTo(weekStart(editing));
  });

  saveButton.addEventListener('click', () => {
    const { date, time } = picker.selection;
    choices[editing] = { data: date, orario: time };
    conflicts.delete(date);
    const wasFirst = choices.filter(Boolean).length === 1;
    Sheet.close(weekSheet);
    render();
    if (wasFirst && choices.length > 1) offerRepeat(editing);
    list.querySelector(`[data-week="${editing}"]`).focus();
  });

  // Dopo la prima scelta: stesso giorno della settimana e stessa ora per le altre
  function offerRepeat(index) {
    const { data, orario } = choices[index];
    const weekday = DAYS_IT[parseISO(data).getDay()];
    repeatBox.innerHTML = `<p>Ripetere ${escapeHtml(weekday)} alle ${escapeHtml(orario)} nelle altre settimane?</p>
      <button type="button" class="btn btn--primary btn--sm" data-repeat-go>Sì, compila le altre</button>`;
    repeatBox.hidden = false;
    repeatBox.querySelector('[data-repeat-go]').addEventListener('click', async event => {
      const button = event.currentTarget;
      setBusy(button, true, 'Controllo gli orari…');
      const offset = Math.round((parseISO(data) - parseISO(weekStart(index))) / 86400000);
      let missing = 0;
      for (let i = 0; i < choices.length; i++) {
        if (choices[i]) continue;
        const date = addDays(weekStart(i), offset);
        try {
          const { slots } = await apiRequest(`/slots/${date}`);
          if (usableStarts(slots, 1).includes(orario)) choices[i] = { data: date, orario };
          else missing++;
        } catch (error) {
          missing++;
        }
      }
      repeatBox.hidden = true;
      render();
      showToast(
        missing === 0
          ? 'Settimane compilate: controlla e conferma'
          : `${missing} ${missing === 1 ? 'settimana non ha' : 'settimane non hanno'} quell'orario libero: sceglile tu`,
        'success'
      );
    });
  }

  confirmButton.addEventListener('click', async () => {
    setBusy(confirmButton, true, 'Confermo…');
    try {
      const response = await apiRequest('/bookings/series', {
        ...jsonBody('POST', { bookings: choices }),
        sessionRequired: true
      });
      const done = document.getElementById('series-done');
      done.querySelector('[data-done-list]').innerHTML = response.bookings
        .map(
          b =>
            `<li>${escapeHtml(formatDateShort(b.giorno))} · <span class="num">${escapeHtml(b.ora)}</span></li>`
        )
        .join('');
      Sheet.open(done);
      done.addEventListener('close', () => (location.href = '/bookings'), { once: true });
    } catch (error) {
      if (error.data && error.data.conflicts) {
        conflicts = new Map(error.data.conflicts.map(c => [c.data, c.error]));
        render();
        list.querySelector('.week--conflict .week__button')?.focus();
      }
      showToast(error.message);
    } finally {
      setBusy(confirmButton, false);
      render();
    }
  });

  weekRadios.forEach(r => r.addEventListener('change', resetChoices));
  startSelect.addEventListener('change', resetChoices);
  resetChoices();
})();
