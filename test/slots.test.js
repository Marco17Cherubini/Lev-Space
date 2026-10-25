// Calcolo degli slot a partire dagli orari predefiniti di config.js
const fs = require('fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv, futureWeekday } = require('./helpers');

const dbPath = configureTestEnv();
const { initDatabase, bookingsDB, holidaysDB } = require('../server/database');
const { getAvailableSlots } = require('../server/bookingService');

const TUESDAY_SLOTS = [
  '08:30',
  '09:15',
  '10:00',
  '10:45',
  '11:30',
  '14:00',
  '14:45',
  '15:30',
  '16:15'
];

before(async () => {
  console.log = () => {};
  await initDatabase();
});

after(() => fs.rmSync(dbPath, { force: true }));

test('martedì espone mattina e pomeriggio, tutti liberi', () => {
  const slots = getAvailableSlots(futureWeekday(2));
  assert.deepEqual(
    slots.map(s => s.time),
    TUESDAY_SLOTS
  );
  assert.ok(slots.every(s => s.available && !s.isHoliday));
});

test('lunedì espone solo il pomeriggio', () => {
  const slots = getAvailableSlots(futureWeekday(1));
  assert.deepEqual(
    slots.map(s => s.time),
    ['14:00', '14:45', '15:30', '16:15']
  );
});

test('domenica il salone è chiuso', () => {
  assert.deepEqual(getAvailableSlots(futureWeekday(0)), []);
});

test('con gli slot extra (admin) si aggiungono pre-apertura e serali', () => {
  const times = getAvailableSlots(futureWeekday(2), true).map(s => s.time);
  assert.equal(times[0], '08:00');
  assert.ok(times.includes('18:00'));
  assert.ok(times.includes('23:15'));
  assert.ok(TUESDAY_SLOTS.every(t => times.includes(t)));
});

test('uno slot prenotato o in ferie risulta non disponibile', () => {
  const day = futureWeekday(4);
  bookingsDB.insert({
    nome: 'A',
    cognome: 'B',
    email: 'a@b.it',
    telefono: '1',
    giorno: day,
    ora: '09:15'
  });
  holidaysDB.insert({ giorno: day, ora: '10:00' });

  const byTime = Object.fromEntries(getAvailableSlots(day).map(s => [s.time, s]));
  assert.equal(byTime['09:15'].available, false);
  assert.equal(byTime['09:15'].isHoliday, false);
  assert.equal(byTime['10:00'].available, false);
  assert.equal(byTime['10:00'].isHoliday, true);
  assert.equal(byTime['08:30'].available, true);
});

test('gli slot di una data passata non vengono restituiti', () => {
  assert.deepEqual(getAvailableSlots('2020-01-07'), []);
});
