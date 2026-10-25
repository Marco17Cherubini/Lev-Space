// Date e orari delle prenotazioni: 'YYYY-MM-DD' e 'HH:MM' nel fuso del salone.
// new Date('YYYY-MM-DD') interpreta la stringa come mezzanotte UTC, che nei fusi a ovest
// di Greenwich cade nel giorno precedente: qui le date si costruiscono dai componenti.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Mezzanotte locale della data, oppure null se la stringa non è una data reale
function parseDate(dateStr) {
  const match = DATE_PATTERN.exec(dateStr);
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  // Scarta date inesistenti come 2030-02-30, che Date farebbe slittare al mese dopo
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function isValidTime(timeStr) {
  return typeof timeStr === 'string' && TIME_PATTERN.test(timeStr);
}

// Data e ora locali di inizio dello slot
function slotStart(dateStr, timeStr) {
  const date = parseDate(dateStr);
  if (!date || !isValidTime(timeStr)) return null;

  const [hours, minutes] = timeStr.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// Minuti dalla mezzanotte, per confrontare orari 'HH:MM'
function toMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

module.exports = { parseDate, isValidTime, slotStart, toMinutes };
