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
  assert.equal(dup.status, 409);

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

test("la prenotazione singola dell'admin rispetta le ferie ma non il calendario standard", async () => {
  const day = futureWeekday(2, 9);
  await api.request('POST', '/api/admin/holidays', {
    cookie: admin,
    body: { slots: [{ giorno: day, ora: '09:15' }] }
  });

  const onHoliday = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Ferie', giorno: day, ora: '09:15' }
  });
  assert.equal(onHoliday.status, 409);
  assert.match(onHoliday.data.error, /ferie/);

  // Orario fuori calendario (pausa pranzo): consentito all'admin
  const offHours = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Fuori', giorno: day, ora: '13:00' }
  });
  assert.equal(offHours.status, 201);

  const invalid = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Errato', giorno: day, ora: '25:00' }
  });
  assert.equal(invalid.status, 400);
});

test('gli orari salvati vengono validati prima di essere applicati', async () => {
  const save = body => api.request('POST', '/api/admin/settings/hours', { cookie: admin, body });
  const current = (await api.request('GET', '/api/admin/settings/hours', { cookie: admin })).data
    .businessHours;

  // Giorni come stringhe: prima venivano salvati e chiudevano il salone
  assert.equal((await save({ ...current, daysOpen: ['1', '2'] })).status, 400);
  // Turno senza slot: prima faceva fallire ogni richiesta di slot
  assert.equal((await save({ ...current, days: { 2: { morning: {} } } })).status, 400);
  assert.equal(
    (
      await save({
        ...current,
        days: { 2: { morning: { start: '08:30', end: '12:15', slots: ['8:30'] } } }
      })
    ).status,
    400
  );

  // Il formato inviato dalla pagina Gestione Orari viene accettato e applicato
  const ok = await save({
    ...current,
    days: {
      ...current.days,
      2: {
        morning: { start: '08:30', end: '09:15', slots: ['08:30'] },
        afternoon: null,
        vip: null
      }
    }
  });
  assert.equal(ok.status, 200);
  const slots = (await api.request('GET', `/api/slots/${futureWeekday(2, 10)}`)).data.slots;
  assert.deepEqual(
    slots.map(s => s.time),
    ['08:30']
  );

  // Ripristina gli orari originali per gli altri test
  assert.equal((await save(current)).status, 200);
});

test('report: conteggi per giorno e navigazione nei periodi precedenti', async () => {
  const { toDateString } = require('./helpers');
  const daysAgo = n => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return toDateString(d);
  };
  // L'admin può registrare anche appuntamenti passati
  for (const [giorno, ora] of [
    [daysAgo(1), '09:15'],
    [daysAgo(1), '10:00'],
    [daysAgo(9), '09:15']
  ]) {
    await api.request('POST', '/api/admin/bookings', {
      cookie: admin,
      body: { cognome: 'Report', giorno, ora }
    });
  }

  const stats = async query =>
    (await api.request('GET', `/api/admin/reports/bookings-stats?${query}`, { cookie: admin }))
      .data;

  const week = await stats('period=weekly');
  assert.equal(week.labels.length, 7);
  assert.equal(week.counts[5], 2); // ieri: penultimo giorno della finestra
  assert.match(week.labels[6], /^(Dom|Lun|Mar|Mer|Gio|Ven|Sab) \d+$/);

  const previousWeek = await stats('period=weekly&offset=-1');
  assert.equal(previousWeek.counts[4], 1); // 9 giorni fa

  const month = await stats('period=monthly');
  assert.equal(month.labels.length, 30);
  assert.equal(month.counts[28], 2);
  assert.match(month.labels[0], /^\d+\/\d+$/);
});

test('B28: gli slot di un turno si ricavano da inizio e fine, a passi di 45 minuti', async () => {
  const save = body => api.request('POST', '/api/admin/settings/hours', { cookie: admin, body });
  const current = (await api.request('GET', '/api/admin/settings/hours', { cookie: admin })).data
    .businessHours;

  // La vecchia pagina mandava slot da una lista irregolare (18:00, 18:30, 18:45...):
  // appuntamenti da 45 minuti sovrapposti. Il server ora li ignora e li ricalcola.
  const res = await save({
    ...current,
    days: {
      ...current.days,
      2: {
        morning: { start: '08:30', end: '12:15', slots: ['08:30', '09:15'] },
        afternoon: null,
        vip: { start: '18:00', end: '21:00', slots: ['18:00', '18:30', '18:45'] }
      }
    }
  });
  assert.equal(res.status, 200);
  const saved = (await api.request('GET', '/api/admin/settings/hours', { cookie: admin })).data
    .businessHours.days[2];
  assert.deepEqual(saved.morning.slots, ['08:30', '09:15', '10:00', '10:45', '11:30']);
  assert.deepEqual(saved.vip.slots, ['18:00', '18:45', '19:30', '20:15']);

  // Un turno più corto di un appuntamento non è valido
  const tooShort = await save({
    ...current,
    days: { ...current.days, 2: { morning: { start: '08:30', end: '09:00' } } }
  });
  assert.equal(tooShort.status, 400);

  assert.equal((await save(current)).status, 200);
});
