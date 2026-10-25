// Prenotazioni lato cliente e ospite, attraverso le API HTTP.
// I test con `todo` descrivono il comportamento atteso per bug noti (piano T08):
// vengono eseguiti ma non fanno fallire la suite finché il bug non è corretto.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN, startTestServer, makeUser, futureWeekday } = require('./helpers');

let api;
let mario;
let luigi;

before(async () => {
  api = await startTestServer();
  mario = await api.registerAndLogin(makeUser('mario'));
  luigi = await api.registerAndLogin(makeUser('luigi'));
});

after(() => api.close());

test('un cliente prenota uno slot libero e lo ritrova tra le sue prenotazioni', async () => {
  const day = futureWeekday(2);
  const res = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: day, orario: '09:15' }
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.booking.giorno, day);

  const list = await api.request('GET', '/api/bookings', { cookie: mario });
  assert.ok(list.data.bookings.some(b => b.giorno === day && b.ora === '09:15'));

  const slots = await api.request('GET', `/api/slots/${day}`);
  assert.equal(slots.data.slots.find(s => s.time === '09:15').available, false);
});

test('prenotare senza sessione restituisce 401', async () => {
  const res = await api.request('POST', '/api/bookings', {
    body: { data: futureWeekday(2), orario: '10:00' }
  });
  assert.equal(res.status, 401);
});

test('uno slot già occupato viene rifiutato', async () => {
  const day = futureWeekday(2, 3);
  await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: day, orario: '10:00' }
  });
  const res = await api.request('POST', '/api/bookings', {
    cookie: luigi,
    body: { data: day, orario: '10:00' }
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /già occupato/);
});

test('orari fuori calendario e giorni di chiusura vengono rifiutati', async () => {
  const wrongTime = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: futureWeekday(2), orario: '13:00' }
  });
  assert.equal(wrongTime.status, 400);

  const sunday = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: futureWeekday(0), orario: '10:00' }
  });
  assert.equal(sunday.status, 400);
});

test('un cliente non può cancellare la prenotazione di un altro', async () => {
  const day = futureWeekday(4);
  await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: day, orario: '08:30' }
  });

  const res = await api.request('DELETE', '/api/bookings', {
    cookie: luigi,
    body: { giorno: day, ora: '08:30' }
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Non autorizzato/);

  const own = await api.request('DELETE', '/api/bookings', {
    cookie: mario,
    body: { giorno: day, ora: '08:30' }
  });
  assert.equal(own.status, 200);
});

test('una prenotazione di gruppo occupa slot consecutivi', async () => {
  const day = futureWeekday(2, 4);
  const res = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: day, orario: '08:30', numPersone: 2 }
  });
  assert.equal(res.status, 201);

  const slots = (await api.request('GET', `/api/slots/${day}`)).data.slots;
  const busy = slots.filter(s => !s.available).map(s => s.time);
  assert.deepEqual(busy, ['08:30', '09:15']);
});

test("l'ospite prenota senza account con nome, cognome ed email", async () => {
  const res = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'Anna',
      cognome: 'Bianchi',
      email: 'anna@test.local',
      giorno: futureWeekday(3),
      ora: '14:00'
    }
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.booking.email, 'anna@test.local');
});

test("l'ospite non può prenotare con l'email di un account registrato", async () => {
  const res = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'Finto',
      cognome: 'Mario',
      email: makeUser('mario').email,
      giorno: futureWeekday(3, 3),
      ora: '14:00'
    }
  });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /accedi/);
});

test('un ospite bannato non può prenotare di nuovo con la stessa email', async () => {
  const guest = { nome: 'G', cognome: 'Bannato', email: 'guest.ban@test.local' };
  const first = await api.request('POST', '/api/bookings/guest', {
    body: { ...guest, giorno: futureWeekday(3, 4), ora: '14:00' }
  });
  assert.equal(first.status, 201);

  const admin = (await api.login(ADMIN.email, ADMIN.password)).cookie;
  await api.request('PUT', `/api/admin/users/${encodeURIComponent(guest.email)}/banned`, {
    cookie: admin
  });

  const second = await api.request('POST', '/api/bookings/guest', {
    body: { ...guest, giorno: futureWeekday(3, 4), ora: '14:45' }
  });
  assert.equal(second.status, 400);
  assert.match(second.data.error, /sospeso/);
});

test("l'ospite riceve 400 se mancano dati o l'email non è valida", async () => {
  const missing = await api.request('POST', '/api/bookings/guest', {
    body: { nome: 'Anna', giorno: futureWeekday(3), ora: '14:45' }
  });
  assert.equal(missing.status, 400);

  const invalid = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'A',
      cognome: 'B',
      email: 'non-una-email',
      giorno: futureWeekday(3),
      ora: '14:45'
    }
  });
  assert.equal(invalid.status, 400);
});

test('una data passata o malformata non è prenotabile', async () => {
  const past = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: '2020-01-07', orario: '09:15' }
  });
  assert.equal(past.status, 400);
  assert.match(past.data.error, /già passati/);

  const malformed = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: '2030-02-30', orario: '09:15' }
  });
  assert.equal(malformed.status, 400);
});

test('un gruppo non scavalca la pausa pranzo', async () => {
  const res = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: futureWeekday(2, 5), orario: '11:30', numPersone: 2 }
  });
  assert.equal(res.status, 400);
});

test('B3: cancellare un gruppo libera tutti i suoi slot', { todo: 'piano T08 / B3' }, async () => {
  const day = futureWeekday(4, 5);
  await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: day, orario: '08:30', numPersone: 2 }
  });
  await api.request('DELETE', '/api/bookings', {
    cookie: mario,
    body: { giorno: day, ora: '08:30' }
  });

  const slots = (await api.request('GET', `/api/slots/${day}`)).data.slots;
  assert.ok(slots.every(s => s.available));
});
