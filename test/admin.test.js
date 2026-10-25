// Funzioni del pannello admin: prenotazioni dirette, ricorrenze, spostamenti e ferie.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN, configureTestEnv, startTestServer, futureWeekday } = require('./helpers');

configureTestEnv();
const { addDaysToDateString } = require('../server/bookingService');

let api;
let admin;

before(async () => {
  api = await startTestServer();
  admin = (await api.login(ADMIN.email, ADMIN.password)).cookie;
});

after(() => api.close());

const bookingsOn = async day =>
  (await api.request('GET', '/api/admin/bookings', { cookie: admin })).data.bookings.filter(
    b => b.giorno === day
  );

test('addDaysToDateString attraversa mesi e anni senza slittamenti di fuso', () => {
  assert.equal(addDaysToDateString('2030-01-29', 7), '2030-02-05');
  assert.equal(addDaysToDateString('2030-12-30', 3), '2031-01-02');
  assert.equal(addDaysToDateString('2030-03-25', 7), '2030-04-01');
});

test("l'admin crea una prenotazione con il solo cognome e la cancella", async () => {
  const day = futureWeekday(5);
  const res = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Verdi', giorno: day, ora: '14:00' }
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.booking.tipo, 'normale');

  const dup = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Neri', giorno: day, ora: '14:00' }
  });
  assert.equal(dup.status, 400);

  const del = await api.request('DELETE', '/api/admin/bookings', {
    cookie: admin,
    body: { giorno: day, ora: '14:00' }
  });
  assert.equal(del.status, 200);
  assert.deepEqual(await bookingsOn(day), []);
});

test('ricorrenza ogni 2 settimane per 1 mese: 2 occorrenze, salta quelle occupate', async () => {
  const start = futureWeekday(3, 6);
  const secondo = addDaysToDateString(start, 14);

  // La seconda occorrenza è già occupata: deve essere saltata, non sovrascritta
  await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Occupato', giorno: secondo, ora: '15:30' }
  });

  const res = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: {
      cognome: 'Gialli',
      giorno: start,
      ora: '15:30',
      ricorrente: true,
      mesiRicorrenza: 1,
      intervalloSettimane: 2
    }
  });
  assert.equal(res.status, 201);
  assert.deepEqual(
    { inserite: res.data.inserite, saltate: res.data.saltate, totale: res.data.totale },
    { inserite: 1, saltate: 1, totale: 2 }
  );
  assert.equal((await bookingsOn(secondo))[0].cognome, 'Occupato');
});

test('ricorrenza: mesi fuori intervallo 1-12 vengono rifiutati', async () => {
  const res = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: {
      cognome: 'X',
      giorno: futureWeekday(3),
      ora: '14:00',
      ricorrente: true,
      mesiRicorrenza: 13
    }
  });
  assert.equal(res.status, 400);
});

test('cancellare la serie elimina tutte le occorrenze ricorrenti', async () => {
  const start = futureWeekday(1, 6);
  const created = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Serie', giorno: start, ora: '14:45', ricorrente: true, mesiRicorrenza: 1 }
  });
  assert.equal(created.data.inserite, 4);

  const del = await api.request('DELETE', '/api/admin/bookings', {
    cookie: admin,
    body: { token: created.data.booking.token, scope: 'series' }
  });
  assert.equal(del.data.eliminate, 4);
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(await bookingsOn(addDaysToDateString(start, i * 7)), []);
  }
});

test('spostare una prenotazione libera il vecchio slot e occupa il nuovo', async () => {
  const day = futureWeekday(6);
  await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Mobile', giorno: day, ora: '09:15' }
  });

  const res = await api.request('PUT', '/api/admin/bookings', {
    cookie: admin,
    body: { oldGiorno: day, oldOra: '09:15', newGiorno: day, newOra: '10:45' }
  });
  assert.equal(res.status, 200);
  assert.deepEqual(
    (await bookingsOn(day)).map(b => b.ora),
    ['10:45']
  );
});

test('le ferie bloccano lo slot e si possono rimuovere', async () => {
  const day = futureWeekday(2, 7);
  const slots = [{ giorno: day, ora: '10:00' }];

  const add = await api.request('POST', '/api/admin/holidays', { cookie: admin, body: { slots } });
  assert.equal(add.data.count, 1);
  const again = await api.request('POST', '/api/admin/holidays', {
    cookie: admin,
    body: { slots }
  });
  assert.equal(again.data.count, 0);

  const busy = (await api.request('GET', `/api/slots/${day}`)).data.slots.find(
    s => s.time === '10:00'
  );
  assert.equal(busy.isHoliday, true);

  const del = await api.request('DELETE', '/api/admin/holidays', {
    cookie: admin,
    body: { slots }
  });
  assert.equal(del.data.removed, 1);
});

test('slot di ferie duplicati nella stessa richiesta vengono inseriti una volta', async () => {
  const day = futureWeekday(2, 8);
  const slot = { giorno: day, ora: '11:30' };
  const res = await api.request('POST', '/api/admin/holidays', {
    cookie: admin,
    body: { slots: [slot, slot] }
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.count, 1);
});

test('slot di ferie con data o ora non valide vengono rifiutati', async () => {
  const res = await api.request('POST', '/api/admin/holidays', {
    cookie: admin,
    body: { slots: [{ giorno: '2030-13-01', ora: '10:00' }] }
  });
  assert.equal(res.status, 400);
});

test("gli slot extra sono solo per l'admin: un VIP vede gli orari normali", async () => {
  const { makeUser } = require('./helpers');
  const vip = makeUser('vip');
  await api.request('POST', '/api/auth/register', { body: vip });
  await api.request('PUT', `/api/admin/users/${encodeURIComponent(vip.email)}/vip`, {
    cookie: admin
  });
  const vipCookie = (await api.login(vip.email, vip.password)).cookie;

  // Sabato con tutti gli slot standard occupati: liberi restano solo gli extra
  const day = futureWeekday(6, 9);
  for (const ora of ['09:15', '10:00', '10:45', '11:30']) {
    await api.request('POST', '/api/admin/bookings', {
      cookie: admin,
      body: { cognome: 'Pieno', giorno: day, ora }
    });
  }
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const availability = async cookie =>
    (await api.request('GET', `/api/availability/${year}/${month}`, { cookie })).data.availability[
      dayOfMonth
    ];

  assert.equal(await availability(vipCookie), false);
  assert.equal(await availability(admin), true);

  const vipSlots = (await api.request('GET', `/api/slots/${day}`, { cookie: vipCookie })).data
    .slots;
  assert.ok(vipSlots.every(s => !s.available));
});

test('availability rifiuta anno o mese non validi', async () => {
  assert.equal((await api.request('GET', '/api/availability/2030/13')).status, 400);
  assert.equal((await api.request('GET', '/api/availability/abc/1')).status, 400);
});
