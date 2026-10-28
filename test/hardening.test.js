// Retry e doppio invio, lungo periodo atomico, VIP/BAN espliciti, spostamenti, passato,
// CSRF, logout e calendario admin calcolato dal server (B19-B27)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN, startTestServer, makeUser, futureWeekday, toDateString } = require('./helpers');

let api;
let admin;

before(async () => {
  api = await startTestServer();
  admin = (await api.login(ADMIN.email, ADMIN.password)).cookie;
});

after(() => api.close());

// Data 'YYYY-MM-DD' spostata di n giorni
function shift(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return toDateString(new Date(y, m - 1, d + n));
}

test('B19: un retry della stessa prenotazione restituisce quella esistente invece di un errore', async () => {
  const mario = await api.registerAndLogin(makeUser('retry'));
  const body = { data: futureWeekday(2, 4), orario: '09:15', numPersone: 2 };

  const first = await api.request('POST', '/api/bookings', { cookie: mario, body });
  const retry = await api.request('POST', '/api/bookings', { cookie: mario, body });

  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.alreadyBooked, true);
  assert.equal(retry.data.booking.token, first.data.booking.token);

  const mine = await api.request('GET', '/api/bookings', { cookie: mario });
  assert.equal(mine.data.bookings.length, 2, 'nessuno slot in più');
});

test('B19: lo stesso slot di un altro cliente resta un conflitto', async () => {
  const a = await api.registerAndLogin(makeUser('slot-a'));
  const b = await api.registerAndLogin(makeUser('slot-b'));
  const body = { data: futureWeekday(2, 4), orario: '11:30' };
  await api.request('POST', '/api/bookings', { cookie: a, body });
  const res = await api.request('POST', '/api/bookings', { cookie: b, body });
  assert.equal(res.status, 409);
});

test('B19: un retry con un gruppo diverso non viene scambiato per un doppio invio', async () => {
  const c = await api.registerAndLogin(makeUser('slot-c'));
  const day = futureWeekday(2, 4);
  await api.request('POST', '/api/bookings', { cookie: c, body: { data: day, orario: '14:00' } });
  const res = await api.request('POST', '/api/bookings', {
    cookie: c,
    body: { data: day, orario: '14:00', numPersone: 2 }
  });
  assert.equal(res.status, 409);
});

test('B20: il lungo periodo crea tutte le settimane insieme oppure nessuna', async () => {
  const luca = await api.registerAndLogin(makeUser('series'));
  const other = await api.registerAndLogin(makeUser('series-other'));
  const first = futureWeekday(2, 6);
  const weeks = [0, 1, 2, 3].map(i => ({ data: shift(first, i * 7), orario: '10:00' }));

  // La terza settimana è già occupata da un altro cliente
  await api.request('POST', '/api/bookings', { cookie: other, body: weeks[2] });

  const conflict = await api.request('POST', '/api/bookings/series', {
    cookie: luca,
    body: { bookings: weeks }
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(
    conflict.data.conflicts.map(c => c.data),
    [weeks[2].data]
  );
  let mine = await api.request('GET', '/api/bookings', { cookie: luca });
  assert.equal(mine.data.bookings.length, 0, 'nessuna settimana creata a metà');

  weeks[2] = { data: weeks[2].data, orario: '10:45' };
  const ok = await api.request('POST', '/api/bookings/series', {
    cookie: luca,
    body: { bookings: weeks }
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.bookings.length, 4);
  mine = await api.request('GET', '/api/bookings', { cookie: luca });
  assert.equal(mine.data.bookings.length, 4);

  // Retry dopo una risposta persa: stessa serie, nessun errore e nessun doppione
  const retry = await api.request('POST', '/api/bookings/series', {
    cookie: luca,
    body: { bookings: weeks }
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.alreadyBooked, true);
});

test('B20: il lungo periodo accetta solo 4, 8 o 12 settimane, una per settimana', async () => {
  const luca = await api.registerAndLogin(makeUser('series-rules'));
  const first = futureWeekday(2, 6);
  const sameWeek = [
    { data: first, orario: '14:00' },
    { data: shift(first, 2), orario: '14:00' },
    { data: shift(first, 7), orario: '14:00' },
    { data: shift(first, 14), orario: '14:00' }
  ];
  const twoWeeks = sameWeek.slice(2);

  for (const bookings of [sameWeek, twoWeeks, 'x', []]) {
    const res = await api.request('POST', '/api/bookings/series', {
      cookie: luca,
      body: { bookings }
    });
    assert.equal(res.status, 400, JSON.stringify(bookings));
  }
});

test('B21: VIP e BAN accettano il valore esplicito e sono idempotenti', async () => {
  const user = makeUser('flags');
  await api.registerAndLogin(user);
  const url = flag => `/api/admin/users/${encodeURIComponent(user.email)}/${flag}`;

  for (let i = 0; i < 2; i++) {
    const res = await api.request('PUT', url('banned'), { cookie: admin, body: { banned: true } });
    assert.equal(res.data.banned, true);
  }
  const vip = await api.request('PUT', url('vip'), { cookie: admin, body: { vip: true } });
  assert.equal(vip.data.vip, true);
  const unban = await api.request('PUT', url('banned'), {
    cookie: admin,
    body: { banned: false }
  });
  assert.equal(unban.data.banned, false);

  const bad = await api.request('PUT', url('vip'), { cookie: admin, body: { vip: 'sì' } });
  assert.equal(bad.status, 400);
});

test('B22: lo spostamento admin rifiuta date e orari non validi', async () => {
  const day = futureWeekday(3, 5);
  await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Sposta', giorno: day, ora: '14:00' }
  });

  for (const [newGiorno, newOra] of [
    ['domani', '14:45'],
    [day, '25:99'],
    ['2031-02-30', '14:45']
  ]) {
    const res = await api.request('PUT', '/api/admin/bookings', {
      cookie: admin,
      body: { oldGiorno: day, oldOra: '14:00', newGiorno, newOra }
    });
    assert.equal(res.status, 400, `${newGiorno} ${newOra}`);
  }
});

test('B23: il cliente non può cancellare né modificare un appuntamento già passato', async () => {
  const user = makeUser('past');
  await api.registerAndLogin(user);
  const cookie = (await api.login(user.email, user.password)).cookie;
  const yesterday = toDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: {
      nome: 'Mario',
      cognome: user.cognome,
      email: user.email,
      giorno: yesterday,
      ora: '09:15'
    }
  });

  const del = await api.request('DELETE', '/api/bookings', {
    cookie,
    body: { giorno: yesterday, ora: '09:15' }
  });
  assert.equal(del.status, 400);

  const move = await api.request('PUT', '/api/bookings', {
    cookie,
    body: { oldGiorno: yesterday, oldOra: '09:15', data: futureWeekday(2, 5), orario: '09:15' }
  });
  assert.equal(move.status, 400);

  const mine = await api.request('GET', '/api/bookings', { cookie });
  assert.equal(mine.data.bookings.length, 1);
});

test('B24: le richieste da un’altra origine vengono rifiutate', async () => {
  const cookie = await api.registerAndLogin(makeUser('csrf'));
  const res = await fetch(`${api.baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: futureWeekday(2, 7), orario: '09:15' })
  });
  assert.equal(res.status, 403);

  const fetchSite = await fetch(`${api.baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' }
  });
  assert.equal(fetchSite.status, 403);

  const sameOrigin = await fetch(`${api.baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: api.baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: futureWeekday(2, 7), orario: '09:15' })
  });
  assert.equal(sameOrigin.status, 201);
});

test('B24: un corpo che non è JSON viene rifiutato con 415', async () => {
  const cookie = await api.registerAndLogin(makeUser('plain'));
  const res = await fetch(`${api.baseUrl}/api/bookings`, {
    method: 'DELETE',
    headers: { Cookie: cookie, 'Content-Type': 'text/plain' },
    body: JSON.stringify({ giorno: futureWeekday(2), ora: '09:15' })
  });
  assert.equal(res.status, 415);
});

test('B25: dopo il logout il token non vale più', async () => {
  const user = makeUser('logout');
  await api.registerAndLogin(user);
  const { cookie } = await api.login(user.email, user.password);

  assert.equal((await api.request('GET', '/api/auth/me', { cookie })).status, 200);
  await api.request('POST', '/api/auth/logout', { cookie });
  assert.equal((await api.request('GET', '/api/auth/me', { cookie })).status, 401);

  // Le altre sessioni dello stesso utente restano valide
  const other = (await api.login(user.email, user.password)).cookie;
  assert.equal((await api.request('GET', '/api/auth/me', { cookie: other })).status, 200);
});

test('B25: anche il token admin decade con il logout', async () => {
  const { cookie } = await api.login(ADMIN.email, ADMIN.password);
  await api.request('POST', '/api/auth/logout', { cookie });
  assert.equal((await api.request('GET', '/api/admin/bookings', { cookie })).status, 401);
});

test('B26: il calendario admin riceve slot, prenotazioni e ferie dal server', async () => {
  const monday = futureWeekday(1, 8);
  const tuesday = shift(monday, 1);
  await api.request('POST', '/api/admin/holidays', {
    cookie: admin,
    body: { slots: [{ giorno: tuesday, ora: '08:30' }] }
  });
  await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Agenda', giorno: tuesday, ora: '09:15' }
  });

  const res = await api.request(
    'GET',
    `/api/admin/schedule?from=${monday}&to=${shift(monday, 6)}`,
    {
      cookie: admin
    }
  );
  assert.equal(res.status, 200);
  assert.equal(res.data.days.length, 7);
  const [mon, tue, , , , , sun] = res.data.days;
  assert.equal(mon.date, monday);
  assert.ok(mon.slots.includes('14:00') && !mon.slots.includes('09:15'));
  assert.ok(tue.slots.includes('08:00'), 'slot extra visibili all’admin');
  assert.equal(sun.open, false);
  assert.ok(tue.holidays.includes('08:30'));
  assert.equal(tue.bookings.find(b => b.ora === '09:15').cognome, 'Agenda');

  const client = await api.registerAndLogin(makeUser('schedule'));
  const denied = await api.request('GET', `/api/admin/schedule?from=${monday}&to=${monday}`, {
    cookie: client
  });
  assert.equal(denied.status, 403);

  const tooLong = await api.request(
    'GET',
    `/api/admin/schedule?from=${monday}&to=${shift(monday, 60)}`,
    {
      cookie: admin
    }
  );
  assert.equal(tooLong.status, 400);
});

test('B27: gli orari pubblici non contengono gli extra VIP', async () => {
  const res = await api.request('GET', '/api/hours');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.daysOpen, [1, 2, 3, 4, 5, 6]);
  assert.equal(res.data.days[2].morning.start, '08:30');
  assert.ok(!JSON.stringify(res.data).includes('vip'));
});

test('cambio dell’ora legale: le serie ricorrenti restano sullo stesso giorno e alla stessa ora', async () => {
  // In Europe/Rome l'ora legale termina l'ultima domenica di ottobre
  const res = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: {
      cognome: 'Ora legale',
      giorno: '2031-10-21',
      ora: '09:15',
      ricorrente: true,
      mesiRicorrenza: 1
    }
  });
  assert.equal(res.status, 201);
  const all = await api.request('GET', '/api/admin/bookings', { cookie: admin });
  const series = all.data.bookings.filter(b => b.token === res.data.booking.token);
  assert.deepEqual(
    series.map(b => `${b.giorno} ${b.ora}`),
    ['2031-10-21 09:15', '2031-10-28 09:15', '2031-11-04 09:15', '2031-11-11 09:15']
  );
});

test('revisione sicurezza: il retry ospite non rivela i dati di un altro ospite', async () => {
  const guest = { nome: 'Gina', cognome: 'Ospite', email: 'gina.ospite@test.local' };
  const slot = { giorno: futureWeekday(4, 6), ora: '14:45' };
  const first = await api.request('POST', '/api/bookings/guest', { body: { ...guest, ...slot } });
  assert.equal(first.status, 201);

  const probe = await api.request('POST', '/api/bookings/guest', {
    body: { nome: 'x', cognome: 'y', email: guest.email, ...slot }
  });
  assert.equal(probe.status, 200);
  assert.deepEqual(probe.data.booking, slot);
});

test('revisione sicurezza: parametri malformati danno 400/404, non 500', async () => {
  const schedule = await api.request('GET', '/api/admin/schedule?from[]=2031-01-06&to=2031-01-07', {
    cookie: admin
  });
  assert.equal(schedule.status, 400);

  const flag = await api.request('PUT', '/api/admin/users/%25E0/vip', {
    cookie: admin,
    body: { vip: true }
  });
  assert.equal(flag.status, 404);
});
