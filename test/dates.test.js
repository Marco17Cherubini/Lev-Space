// Date e orari: parsing per componenti e fuso orario del salone
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDate, isValidTime, slotStart, toMinutes } = require('../server/dates');

test('parseDate accetta solo date reali nel formato YYYY-MM-DD', () => {
  assert.equal(parseDate('2030-01-08').getDay(), 2);
  assert.equal(parseDate('2030-02-30'), null);
  assert.equal(parseDate('2030-1-8'), null);
  assert.equal(parseDate('2030-01-08T10:00'), null);
  assert.equal(parseDate(undefined), null);
});

test('isValidTime accetta solo orari HH:MM', () => {
  assert.ok(isValidTime('09:15'));
  assert.ok(isValidTime('23:59'));
  assert.equal(isValidTime('9:15'), false);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime(915), false);
});

test('slotStart combina data e ora locali', () => {
  const start = slotStart('2030-01-08', '14:45');
  assert.deepEqual(
    [start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()],
    [2030, 0, 8, 14, 45]
  );
  assert.equal(slotStart('2030-01-08', 'xx'), null);
});

test('toMinutes converte HH:MM in minuti dalla mezzanotte', () => {
  assert.equal(toMinutes('11:30'), 690);
});

test('il fuso predefinito è quello del salone (Europe/Rome)', () => {
  const previous = process.env.TZ;
  delete process.env.TZ;
  delete require.cache[require.resolve('../config/config')];
  require('../config/config');
  assert.equal(process.env.TZ, 'Europe/Rome');
  // Il 1° luglio a mezzogiorno UTC sono le 14:00 a Roma (ora legale)
  assert.equal(new Date(Date.UTC(2030, 6, 1, 12)).getHours(), 14);
  if (previous) process.env.TZ = previous;
});
