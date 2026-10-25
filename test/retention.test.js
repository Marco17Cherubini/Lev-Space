// Conservazione dei dati: cancellazione dei dati scaduti secondo la Privacy Policy
const fs = require('fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv, toDateString } = require('./helpers');

const dbPath = configureTestEnv();
const { initDatabase, usersDB, bookingsDB, holidaysDB } = require('../server/database');
const { runRetention } = require('../server/retentionService');
const { touchUserActivity } = require('../server/authService');

const monthsAgo = months => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
};
const dayMonthsAgo = (months, ora = '09:15') => ({ giorno: toDateString(monthsAgo(months)), ora });

function addUser(email, { guest = false, inactiveMonths = 0 } = {}) {
  usersDB.insert({
    nome: 'N',
    cognome: 'C',
    email,
    telefono: guest ? '' : '1',
    password: guest ? '' : 'hash',
    vip: '0',
    banned: '0',
    isGuest: guest ? '1' : '0',
    last_active_at: monthsAgo(inactiveMonths).toISOString()
  });
}

function addBooking(email, when) {
  bookingsDB.insert({ nome: 'N', cognome: 'C', email, telefono: '1', ...when });
}

const emails = () => usersDB.readAll().map(u => u.email);

before(async () => {
  console.log = () => {};
  await initDatabase();

  // Cliente registrato attivo con prenotazioni vecchie e recenti
  addUser('attivo@test.local');
  addBooking('attivo@test.local', dayMonthsAgo(25, '09:15')); // oltre 24 mesi: da cancellare
  addBooking('attivo@test.local', dayMonthsAgo(13, '10:00')); // 13 mesi: resta (registrato)

  // Cliente registrato inattivo da 25 mesi, con una sola prenotazione vecchia
  addUser('inattivo@test.local', { inactiveMonths: 25 });
  addBooking('inattivo@test.local', dayMonthsAgo(26, '10:45'));

  // Cliente registrato inattivo da 25 mesi ma con un appuntamento recente: resta
  addUser('con-appuntamento@test.local', { inactiveMonths: 25 });
  addBooking('con-appuntamento@test.local', dayMonthsAgo(1, '11:30'));

  // Ospite con prenotazione di 13 mesi fa: prenotazione e profilo da cancellare
  addUser('ospite-vecchio@test.local', { guest: true, inactiveMonths: 13 });
  addBooking('ospite-vecchio@test.local', dayMonthsAgo(13, '14:00'));

  // Ospite recente: resta
  addUser('ospite-recente@test.local', { guest: true, inactiveMonths: 2 });
  addBooking('ospite-recente@test.local', dayMonthsAgo(2, '14:45'));

  // Appuntamento inserito dall'admin senza email: regola dei 24 mesi
  addBooking('', dayMonthsAgo(30, '15:30'));

  holidaysDB.insert({ giorno: '2020-01-07', ora: '09:15' });
});

after(() => fs.rmSync(dbPath, { force: true }));

test("l'anteprima conta i dati scaduti senza cancellare nulla", () => {
  const before = { users: usersDB.readAll().length, bookings: bookingsDB.readAll().length };
  const preview = runRetention({ apply: false });

  assert.equal(preview.applied, false);
  assert.equal(preview.bookings, 4);
  assert.equal(preview.users, 2);
  assert.equal(usersDB.readAll().length, before.users);
  assert.equal(bookingsDB.readAll().length, before.bookings);
});

test('la cancellazione rispetta i tempi della Privacy Policy', () => {
  const result = runRetention({ apply: true });
  assert.deepEqual({ bookings: result.bookings, users: result.users }, { bookings: 4, users: 2 });

  assert.deepEqual(emails().sort(), [
    'attivo@test.local',
    'con-appuntamento@test.local',
    'ospite-recente@test.local'
  ]);

  const remaining = bookingsDB.readAll().map(b => `${b.email} ${b.giorno}`);
  assert.equal(remaining.length, 3);
  assert.ok(remaining.includes(`attivo@test.local ${dayMonthsAgo(13).giorno}`));
  assert.ok(
    !remaining.some(r => r.startsWith(' ')),
    "l'appuntamento admin di 30 mesi fa è cancellato"
  );

  // Le ferie non sono dati personali e restano
  assert.equal(holidaysDB.readAll().length, 1);

  // Una seconda esecuzione non trova altro
  assert.deepEqual(
    { bookings: runRetention({ apply: true }).bookings, users: runRetention().users },
    { bookings: 0, users: 0 }
  );
});

test("l'attività del cliente sposta in avanti la scadenza dell'account", () => {
  addUser('ritorno@test.local', { inactiveMonths: 25 });
  touchUserActivity('ritorno@test.local');
  runRetention({ apply: true });
  assert.ok(emails().includes('ritorno@test.local'));
});
