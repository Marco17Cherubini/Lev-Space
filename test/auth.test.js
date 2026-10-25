// Registrazione, login, sessione, ban e reset password.
// I test con `todo` descrivono il comportamento atteso per problemi noti (piano T06/T08).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN, startTestServer, makeUser, futureWeekday } = require('./helpers');

let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

test('registrazione: tutti i campi sono obbligatori e la password ha almeno 8 caratteri', async () => {
  const missing = await api.request('POST', '/api/auth/register', {
    body: { email: 'x@test.local', password: 'Password123!' }
  });
  assert.equal(missing.status, 400);

  const short = await api.request('POST', '/api/auth/register', {
    body: { ...makeUser('short'), password: 'corta' }
  });
  assert.equal(short.status, 400);
});

test("registrazione: la risposta non contiene la password e l'email doppia è rifiutata", async () => {
  const user = makeUser('reg');
  const res = await api.request('POST', '/api/auth/register', { body: user });
  assert.equal(res.status, 201);
  assert.equal(res.data.user.password, undefined);

  const dup = await api.request('POST', '/api/auth/register', { body: user });
  assert.equal(dup.status, 400);
  assert.match(dup.data.error, /già registrata/);
});

test('login: credenziali errate → 401, corrette → cookie httpOnly e /me', async () => {
  const user = makeUser('login');
  await api.request('POST', '/api/auth/register', { body: user });

  const wrong = await api.login(user.email, 'PasswordSbagliata');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.cookie, null);

  const ok = await api.login(user.email.toUpperCase(), user.password);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/i);

  const me = await api.request('GET', '/api/auth/me', { cookie: ok.cookie });
  assert.equal(me.data.user.email, user.email);
  assert.equal(me.data.user.password, undefined);
});

test('/api/auth/me senza cookie o con token falso restituisce 401', async () => {
  assert.equal((await api.request('GET', '/api/auth/me')).status, 401);
  assert.equal((await api.request('GET', '/api/auth/me', { cookie: 'token=abc' })).status, 401);
});

test("le rotte admin rispondono 403 ai clienti e 200 all'admin", async () => {
  const client = await api.registerAndLogin(makeUser('notadmin'));
  const admin = (await api.login(ADMIN.email, ADMIN.password)).cookie;

  for (const url of ['/api/admin/bookings', '/api/admin/users', '/api/admin/settings/hours']) {
    assert.equal((await api.request('GET', url, { cookie: client })).status, 403, url);
    assert.equal((await api.request('GET', url, { cookie: admin })).status, 200, url);
  }
});

test('un utente bannato non può fare login', async () => {
  const user = makeUser('banned');
  await api.request('POST', '/api/auth/register', { body: user });
  const admin = (await api.login(ADMIN.email, ADMIN.password)).cookie;

  const ban = await api.request(
    'PUT',
    `/api/admin/users/${encodeURIComponent(user.email)}/banned`,
    {
      cookie: admin
    }
  );
  assert.equal(ban.data.banned, true);

  const res = await api.login(user.email, user.password);
  assert.equal(res.status, 401);
  assert.match(res.data.error, /sospeso/);
});

test('reset password: il token aggiorna la password e il login usa quella nuova', async () => {
  const { generateResetToken, resetPassword } = require('../server/authService');
  const user = makeUser('reset');
  await api.request('POST', '/api/auth/register', { body: user });

  assert.equal(generateResetToken('nessuno@test.local'), null);

  const token = generateResetToken(user.email);
  const res = await api.request('POST', '/api/auth/reset-password', {
    body: { token, password: 'NuovaPassword456!' }
  });
  assert.equal(res.status, 200);
  assert.equal((await api.login(user.email, user.password)).status, 401);
  assert.equal((await api.login(user.email, 'NuovaPassword456!')).status, 200);

  await assert.rejects(resetPassword('token-falso', 'NuovaPassword456!'), /scaduto o non valido/);
});

test('forgot-password risponde sempre allo stesso modo (anti-enumerazione)', async () => {
  const known = await api.request('POST', '/api/auth/forgot-password', {
    body: { email: makeUser('reg').email }
  });
  const unknown = await api.request('POST', '/api/auth/forgot-password', {
    body: { email: 'sconosciuto@test.local' }
  });
  assert.equal(known.status, 200);
  assert.deepEqual(known.data, unknown.data);
});

test('il token di reset non vale come sessione', async () => {
  const { generateResetToken } = require('../server/authService');
  const user = makeUser('resetsession');
  await api.request('POST', '/api/auth/register', { body: user });

  const token = generateResetToken(user.email);
  const me = await api.request('GET', '/api/auth/me', { cookie: `token=${token}` });
  assert.equal(me.status, 401);
});

test('il link di reset funziona una sola volta', async () => {
  const { generateResetToken } = require('../server/authService');
  const user = makeUser('resetonce');
  await api.request('POST', '/api/auth/register', { body: user });

  const token = generateResetToken(user.email);
  const first = await api.request('POST', '/api/auth/reset-password', {
    body: { token, password: 'PrimaNuova123!' }
  });
  assert.equal(first.status, 200);

  const second = await api.request('POST', '/api/auth/reset-password', {
    body: { token, password: 'SecondaNuova123!' }
  });
  assert.equal(second.status, 400);
  assert.equal((await api.login(user.email, 'PrimaNuova123!')).status, 200);
});

test('un utente bannato con sessione già aperta riceve 403', async () => {
  const user = makeUser('bannedsession');
  const cookie = await api.registerAndLogin(user);
  const admin = (await api.login(ADMIN.email, ADMIN.password)).cookie;
  await api.request('PUT', `/api/admin/users/${encodeURIComponent(user.email)}/banned`, {
    cookie: admin
  });

  const res = await api.request('POST', '/api/bookings', {
    cookie,
    body: { data: futureWeekday(2), orario: '16:15' }
  });
  assert.equal(res.status, 403);
  assert.equal((await api.request('GET', '/api/auth/me', { cookie })).status, 403);
});

test("un admin rimosso dalla tabella admins perde l'accesso", async () => {
  const { adminDB } = require('../server/database');
  const bcrypt = require('bcryptjs');
  adminDB.insert({ email: 'ex-admin@test.local', password: bcrypt.hashSync('ExAdmin12345!', 4) });
  const cookie = (await api.login('ex-admin@test.local', 'ExAdmin12345!')).cookie;
  assert.equal((await api.request('GET', '/api/admin/users', { cookie })).status, 200);

  adminDB.delete(a => a.email === 'ex-admin@test.local');
  assert.equal((await api.request('GET', '/api/admin/users', { cookie })).status, 401);
});

test('il cookie di sessione è SameSite=Lax', async () => {
  const user = makeUser('samesite');
  await api.request('POST', '/api/auth/register', { body: user });
  const res = await api.login(user.email, user.password);
  assert.match(res.headers.get('set-cookie'), /SameSite=Lax/i);
});

test('le richieste urlencoded non vengono interpretate (solo JSON)', async () => {
  const user = makeUser('urlenc');
  await api.request('POST', '/api/auth/register', { body: user });
  const res = await fetch(`${api.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: user.email, password: user.password })
  });
  assert.notEqual(res.status, 200);
});

test("l'email doppia con maiuscole diverse dà un errore chiaro", async () => {
  const user = makeUser('case');
  await api.request('POST', '/api/auth/register', { body: user });
  const dup = await api.request('POST', '/api/auth/register', {
    body: { ...user, email: user.email.toUpperCase() }
  });
  assert.equal(dup.status, 400);
  assert.match(dup.data.error, /già registrata/);
});

test('registrazione: email non valida rifiutata', async () => {
  const res = await api.request('POST', '/api/auth/register', {
    body: { ...makeUser('bademail'), email: 'non-una-email' }
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /email non valido/);
});

test('un ospite può registrarsi con la stessa email e ritrova le sue prenotazioni', async () => {
  const email = 'ospite.poi.cliente@test.local';
  const guest = await api.request('POST', '/api/bookings/guest', {
    body: { nome: 'Ospite', cognome: 'Prima', email, giorno: futureWeekday(1, 3), ora: '14:00' }
  });
  assert.equal(guest.status, 201);

  const user = { ...makeUser('upgrade'), email };
  const reg = await api.request('POST', '/api/auth/register', { body: user });
  assert.equal(reg.status, 201);

  const cookie = (await api.login(email, user.password)).cookie;
  const me = await api.request('GET', '/api/auth/me', { cookie });
  assert.equal(me.data.user.cognome, user.cognome);
  assert.equal(me.data.user.isGuest, '0');
  const list = await api.request('GET', '/api/bookings', { cookie });
  assert.equal(list.data.bookings.length, 1);
});
