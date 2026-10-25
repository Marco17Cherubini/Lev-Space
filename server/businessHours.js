// Validazione degli orari del salone salvati dall'admin (Gestione Orari).
// Gli orari guidano il calcolo di tutti gli slot: un formato errato
// (es. giorni come stringhe, turni senza slot) chiuderebbe il salone o farebbe
// fallire ogni richiesta, quindi si accetta solo la forma attesa.
const { isValidTime } = require('./dates');
const { HttpError } = require('./errors');

const SHIFTS = ['morning', 'afternoon', 'vip'];

function normalizeShift(shift, label) {
  if (shift === null || shift === undefined) return null;

  const { start, end, slots } = shift;
  if (!isValidTime(start) || !isValidTime(end) || !Array.isArray(slots)) {
    throw new HttpError(400, `Turno ${label} non valido`);
  }
  if (!slots.every(isValidTime)) {
    throw new HttpError(400, `Orari non validi nel turno ${label}`);
  }
  return { start, end, slots: [...slots] };
}

// Restituisce una copia pulita degli orari (solo i campi noti) o lancia un errore
function normalizeBusinessHours(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.daysOpen)) {
    throw new HttpError(400, 'Formato inviato non valido');
  }
  if (!input.days || typeof input.days !== 'object') {
    throw new HttpError(400, 'Formato inviato non valido');
  }

  const isDay = d => Number.isInteger(d) && d >= 0 && d <= 6;
  if (!input.daysOpen.every(isDay)) {
    throw new HttpError(400, 'Giorni di apertura non validi (0 = domenica ... 6 = sabato)');
  }

  const days = {};
  for (const [key, value] of Object.entries(input.days)) {
    const day = Number(key);
    if (!isDay(day)) {
      throw new HttpError(400, `Giorno non valido: ${key}`);
    }
    if (value === null) {
      days[day] = null;
      continue;
    }
    days[day] = {};
    for (const shift of SHIFTS) {
      days[day][shift] = normalizeShift(value[shift], `${shift} del giorno ${day}`);
    }
  }

  return { daysOpen: [...new Set(input.daysOpen)].sort(), days };
}

module.exports = { normalizeBusinessHours };
