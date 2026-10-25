// Ferie e chiusure straordinarie: slot { giorno, ora } bloccati dall'admin
const { holidaysDB, withTransaction } = require('./database');
const { HttpError } = require('./errors');
const { parseDate, isValidTime } = require('./dates');

function getHolidays() {
  return holidaysDB.readAll();
}

function isHolidaySlot(date, time) {
  return holidaysDB.readAll().some(h => h.giorno === date && h.ora === time);
}

function assertSlotList(slots, validateFormat) {
  const isValidSlot = slot =>
    slot && (!validateFormat || (parseDate(slot.giorno) && isValidTime(slot.ora)));
  if (!Array.isArray(slots) || slots.length === 0 || !slots.every(isValidSlot)) {
    throw new HttpError(400, 'Slot ferie non validi');
  }
}

// Aggiunge gli slot, saltando quelli già in ferie e i doppioni nella richiesta
function addHolidays(slots) {
  assertSlotList(slots, true);

  const added = [];
  const seen = new Set(holidaysDB.readAll().map(h => `${h.giorno} ${h.ora}`));

  withTransaction(() => {
    for (const { giorno, ora } of slots) {
      const key = `${giorno} ${ora}`;
      if (!seen.has(key)) {
        seen.add(key);
        holidaysDB.insert({ giorno, ora });
        added.push({ giorno, ora });
      }
    }
  });

  return added;
}

// Rimuove gli slot indicati; restituisce quanti erano effettivamente in ferie
function removeHolidays(slots) {
  assertSlotList(slots, false);

  let removed = 0;
  withTransaction(() => {
    for (const slot of slots) {
      const deleted = holidaysDB.delete(h => h.giorno === slot.giorno && h.ora === slot.ora);
      if (deleted) removed++;
    }
  });

  return removed;
}

module.exports = { getHolidays, isHolidaySlot, addHolidays, removeHolidays };
