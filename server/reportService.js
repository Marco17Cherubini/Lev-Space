// Statistiche per il pannello Report: prenotazioni per giorno nella finestra scelta
const { bookingsDB } = require('./database');

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function toDateString(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// period: 'weekly' (ultimi 7 giorni) o 'monthly' (ultimi 30 giorni).
// offset <= 0 sposta la finestra indietro di un periodo alla volta (navigazione storica).
function getBookingStats(period = 'weekly', offset = 0) {
  const isWeekly = period === 'weekly';
  const days = isWeekly ? 7 : 30;

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + Math.min(offset, 0) * days);

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  // Conteggio per giorno con una sola lettura della tabella
  const countsByDay = new Map();
  for (const booking of bookingsDB.readAll()) {
    countsByDay.set(booking.giorno, (countsByDay.get(booking.giorno) || 0) + 1);
  }

  const labels = [];
  const counts = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    labels.push(
      isWeekly
        ? `${DAY_NAMES[day.getDay()]} ${day.getDate()}`
        : `${day.getDate()}/${day.getMonth() + 1}`
    );
    counts.push(countsByDay.get(toDateString(day)) || 0);
  }

  // from/to: estremi della finestra, per mostrare il periodo esatto nel pannello
  return {
    labels,
    counts,
    period,
    from: toDateString(start),
    to: toDateString(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1))
  };
}

module.exports = { getBookingStats };
