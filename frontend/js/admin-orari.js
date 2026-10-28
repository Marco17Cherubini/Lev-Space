// Orari: per ogni giorno apertura, mattina, pomeriggio ed extra VIP. Gli slot si
// calcolano sul server da inizio e fine (ogni 45 minuti); qui se ne mostra un'anteprima
// con la stessa regola, poi dopo il salvataggio si rilegge quanto salvato davvero.
(async function () {
  if (!(await requireAuth({ admin: true }))) return;

  const DAYS = [1, 2, 3, 4, 5, 6, 0];
  const SHIFTS = [
    { key: 'morning', label: 'Mattina', from: '08:30', to: '12:15' },
    { key: 'afternoon', label: 'Pomeriggio', from: '14:00', to: '17:00' },
    { key: 'vip', label: 'Extra VIP', from: '18:00', to: '21:00', hint: 'Solo nella tua agenda' }
  ];
  // Orari selezionabili ogni 15 minuti, dalle 06:00 alle 23:45
  const TIMES = Array.from({ length: 72 }, (_, i) => {
    const m = 360 + i * 15;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  });

  const container = document.querySelector('[data-days]');
  const saveButton = document.querySelector('[data-save]');
  const dirtyLabel = document.querySelector('[data-dirty]');
  let saved = null;
  let dirty = false;

  const fmt = m =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function preview(start, end) {
    const slots = [];
    for (
      let t = toMinutes(start);
      t + APPOINTMENT_MINUTES <= toMinutes(end);
      t += APPOINTMENT_MINUTES
    ) {
      slots.push(fmt(t));
    }
    return slots;
  }

  const options = selected =>
    TIMES.map(t => `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`).join(
      ''
    );

  function shiftRow(day, shift, data) {
    const on = !!data;
    const start = data ? data.start : shift.from;
    const end = data ? data.end : shift.to;
    const id = `d${day}-${shift.key}`;
    return `<div class="shift" data-shift="${shift.key}">
        <label class="switch"><input type="checkbox" role="switch" data-shift-on ${on ? 'checked' : ''} />${shift.label}</label>
        ${shift.hint ? `<p class="hint">${shift.hint}</p>` : ''}
        <div class="shift__times" ${on ? '' : 'hidden'}>
          <div class="field"><label for="${id}-start">Dalle</label><select class="select" id="${id}-start" data-start>${options(start)}</select></div>
          <div class="field"><label for="${id}-end">Alle</label><select class="select" id="${id}-end" data-end>${options(end)}</select></div>
        </div>
        <p class="shift__preview muted num" data-preview ${on ? '' : 'hidden'}></p>
      </div>`;
  }

  function render() {
    container.innerHTML = DAYS.map(day => {
      const open = saved.daysOpen.includes(day);
      const data = saved.days[day] || {};
      return `<section class="dayhours${open ? '' : ' is-closed'}" data-day="${day}" aria-labelledby="day-${day}">
          <div class="dayhours__head">
            <h2 id="day-${day}">${DAYS_IT[day]}</h2>
            <label class="switch"><input type="checkbox" role="switch" data-open ${open ? 'checked' : ''} />Aperto</label>
          </div>
          <div class="dayhours__shifts" ${open ? '' : 'hidden'}>
            ${SHIFTS.map(shift => shiftRow(day, shift, data[shift.key])).join('')}
          </div>
        </section>`;
    }).join('');
    container.querySelectorAll('.shift').forEach(updatePreview);
  }

  function updatePreview(shiftEl) {
    const start = shiftEl.querySelector('[data-start]').value;
    const end = shiftEl.querySelector('[data-end]').value;
    const slots = preview(start, end);
    const box = shiftEl.querySelector('[data-preview]');
    box.classList.toggle('field-error', slots.length === 0);
    box.textContent = slots.length
      ? `${slots.length} ${slots.length === 1 ? 'appuntamento' : 'appuntamenti'}: ${slots.join(' · ')}`
      : 'Turno troppo corto per un appuntamento da 45 minuti';
    return slots.length;
  }

  function markDirty() {
    dirty = true;
    saveButton.disabled = false;
    dirtyLabel.innerHTML =
      'Modifiche non salvate<span>Salva per applicarle alle nuove prenotazioni</span>';
  }

  container.addEventListener('change', event => {
    const day = event.target.closest('[data-day]');
    if (event.target.matches('[data-open]')) {
      day.classList.toggle('is-closed', !event.target.checked);
      day.querySelector('.dayhours__shifts').hidden = !event.target.checked;
    }
    const shift = event.target.closest('.shift');
    if (shift) {
      const on = shift.querySelector('[data-shift-on]').checked;
      shift.querySelector('.shift__times').hidden = !on;
      shift.querySelector('[data-preview]').hidden = !on;
      updatePreview(shift);
    }
    markDirty();
  });

  // Raccoglie gli orari dalla pagina; i giorni chiusi conservano i turni per quando riaprono
  function collect() {
    const result = { daysOpen: [], days: {} };
    let invalid = null;
    container.querySelectorAll('[data-day]').forEach(day => {
      const d = Number(day.dataset.day);
      if (day.querySelector('[data-open]').checked) result.daysOpen.push(d);
      result.days[d] = {};
      day.querySelectorAll('.shift').forEach(shift => {
        const on = shift.querySelector('[data-shift-on]').checked;
        const start = shift.querySelector('[data-start]').value;
        const end = shift.querySelector('[data-end]').value;
        if (on && preview(start, end).length === 0 && !invalid) invalid = shift;
        result.days[d][shift.dataset.shift] = on ? { start, end } : null;
      });
    });
    return { result, invalid };
  }

  async function load() {
    const { businessHours } = await apiRequest('/admin/settings/hours', { sessionRequired: true });
    saved = businessHours;
    render();
  }

  saveButton.addEventListener('click', async () => {
    const { result, invalid } = collect();
    if (invalid) {
      showToast('Un turno è più corto di un appuntamento: allunga l’orario di fine.');
      invalid.querySelector('[data-end]').focus();
      return;
    }
    setBusy(saveButton, true, 'Salvo…');
    try {
      await apiRequest('/admin/settings/hours', {
        ...jsonBody('POST', result),
        sessionRequired: true
      });
      await load();
      dirty = false;
      dirtyLabel.innerHTML = 'Orari salvati<span>Valgono già per le nuove prenotazioni</span>';
      showToast('Orari salvati', 'success');
      setBusy(saveButton, false);
      saveButton.disabled = true;
    } catch (error) {
      showToast(error.message);
      setBusy(saveButton, false);
    }
  });

  window.addEventListener('beforeunload', event => {
    if (dirty) event.preventDefault();
  });

  try {
    await load();
  } catch (error) {
    container.innerHTML = `<div class="state"><p>${escapeHtml(error.message)}</p></div>`;
  }
})();
