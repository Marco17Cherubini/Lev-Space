// Rate limiting: limiti bassi impostati prima dell'avvio, solo per questo file
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.RATE_LIMIT_AUTH_MAX = '3';
process.env.RATE_LIMIT_GUEST_MAX = '2';
const { startTestServer, futureWeekday } = require('./helpers');

let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

test('dopo troppi tentativi di login risponde 429', async () => {
  const statuses = [];
  for (let i = 0; i < 4; i++) {
    statuses.push((await api.login('nessuno@test.local', 'sbagliata')).status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 429]);
});

test('le prenotazioni ospite sono limitate per IP', async () => {
  const book = ora =>
    api.request('POST', '/api/bookings/guest', {
      body: {
        privacyAccepted: true,
        nome: 'A',
        cognome: 'B',
        email: `ospite${ora}@test.local`,
        giorno: futureWeekday(3),
        ora
      }
    });
  assert.equal((await book('14:00')).status, 201);
  assert.equal((await book('14:45')).status, 201);
  const blocked = await book('15:30');
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /Troppe prenotazioni/);
});

test('le altre API non sono limitate', async () => {
  for (let i = 0; i < 5; i++) {
    assert.equal((await api.request('GET', '/api/holidays')).status, 200);
  }
});
