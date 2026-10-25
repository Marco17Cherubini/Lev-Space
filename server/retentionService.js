/**
 * Conservazione dei dati (Privacy Policy, sezione 10): cancella i dati personali scaduti.
 *
 * - prenotazioni dei clienti registrati (e quelle inserite dall'admin): 24 mesi dall'appuntamento
 * - prenotazioni come ospite: 12 mesi dall'appuntamento
 * - account registrati: 24 mesi dall'ultima attività, se non restano prenotazioni collegate
 * - profili ospite: 12 mesi dall'ultima attività, se non restano prenotazioni collegate
 *
 * Il server lo esegue all'avvio e poi ogni 24 ore. Da terminale:
 *   npm run retention            mostra cosa verrebbe cancellato, senza cancellare
 *   npm run retention -- --apply cancella davvero
 */
const config = require('../config/config');
const { usersDB, bookingsDB, withTransaction } = require('./database');
const { isFlagOn } = require('./authService');

const DAY_MS = 24 * 60 * 60 * 1000;

function monthsBefore(now, months) {
  const date = new Date(now);
  date.setMonth(date.getMonth() - months);
  return date;
}

function toDateString(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// Ultima attività del cliente; per i profili creati prima di questa funzione vale la data
// di creazione (SQLite la salva in UTC come 'YYYY-MM-DD HH:MM:SS'). Una data illeggibile
// non viene mai considerata scaduta.
function lastActivity(user) {
  const candidates = [
    user.last_active_at,
    user.created_at && `${user.created_at.replace(' ', 'T')}Z`
  ];
  for (const value of candidates) {
    const time = Date.parse(value || '');
    if (!Number.isNaN(time)) return time;
  }
  return Infinity;
}

// Calcola cosa è scaduto alla data `now`, senza modificare nulla
function findExpiredData(now = new Date()) {
  const { registeredMonths, guestMonths } = config.retention;
  const registeredCutoff = monthsBefore(now, registeredMonths);
  const guestCutoff = monthsBefore(now, guestMonths);
  const registeredDay = toDateString(registeredCutoff);
  const guestDay = toDateString(guestCutoff);

  const users = usersDB.readAll();
  const guestEmails = new Set(users.filter(u => isFlagOn(u.isGuest)).map(u => u.email));

  const bookings = bookingsDB.readAll();
  const isExpiredBooking = b => b.giorno < (guestEmails.has(b.email) ? guestDay : registeredDay);
  const expiredBookings = bookings.filter(isExpiredBooking);
  const remainingEmails = new Set(bookings.filter(b => !isExpiredBooking(b)).map(b => b.email));

  const expiredUsers = users.filter(user => {
    if (remainingEmails.has(user.email)) return false;
    const cutoff = isFlagOn(user.isGuest) ? guestCutoff : registeredCutoff;
    return lastActivity(user) < cutoff.getTime();
  });

  return {
    cutoffs: { registered: registeredDay, guest: guestDay },
    bookings: expiredBookings,
    users: expiredUsers
  };
}

// Restituisce solo conteggi: nei log non finiscono dati personali
function runRetention({ apply = false, now = new Date() } = {}) {
  const expired = findExpiredData(now);
  const summary = {
    applied: apply,
    cutoffs: expired.cutoffs,
    bookings: expired.bookings.length,
    users: expired.users.length
  };
  if (!apply || (summary.bookings === 0 && summary.users === 0)) return summary;

  const bookingKeys = new Set(expired.bookings.map(b => `${b.giorno} ${b.ora} ${b.email}`));
  const userEmails = new Set(expired.users.map(u => u.email));
  withTransaction(() => {
    bookingsDB.delete(b => bookingKeys.has(`${b.giorno} ${b.ora} ${b.email}`));
    usersDB.delete(u => userEmails.has(u.email));
  });
  return summary;
}

function startRetentionScheduler() {
  if (!config.retention.enabled) return null;

  const run = () => {
    try {
      const result = runRetention({ apply: true });
      if (result.bookings || result.users) {
        console.log(
          `🧹 Conservazione dati: eliminate ${result.bookings} prenotazioni e ${result.users} profili scaduti`
        );
      }
    } catch (error) {
      console.error('❌ Errore nella cancellazione dei dati scaduti:', error.message);
    }
  };

  run();
  const timer = setInterval(run, DAY_MS);
  // Il timer non tiene in vita il processo (test, script)
  timer.unref();
  return timer;
}

if (require.main === module) {
  const { initDatabase } = require('./database');
  const apply = process.argv.includes('--apply');
  console.log = () => {};
  initDatabase()
    .then(() => {
      const result = runRetention({ apply });
      process.stdout.write(
        `${apply ? 'Eliminati' : 'Da eliminare (anteprima, nessuna modifica)'}: ` +
          `${result.bookings} prenotazioni, ${result.users} profili ` +
          `(prenotazioni prima del ${result.cutoffs.registered}, ospiti prima del ${result.cutoffs.guest})\n`
      );
    })
    .catch(error => {
      process.stderr.write(`Errore: ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { findExpiredData, runRetention, startRetentionScheduler };
