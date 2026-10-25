// Privacy Policy, Cookie Policy e footer legale
const fs = require('fs');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, makeUser, futureWeekday } = require('./helpers');

const FRONTEND = path.join(__dirname, '../frontend');
let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

const page = async url => {
  const res = await fetch(api.baseUrl + url);
  return { status: res.status, html: await res.text() };
};

test('la Privacy Policy è pubblica e indica il titolare', async () => {
  const { status, html } = await page('/privacy-policy');
  assert.equal(status, 200);
  assert.match(html, /Titolare del trattamento/);
  assert.match(html, /Via Romera 36, 15122\s+Alessandria/);
  assert.match(html, /Garante per la protezione dei dati personali/);
});

test('la Cookie Policy elenca tutti i cookie e le chiavi di memorizzazione usati dal frontend', async () => {
  const { status, html } = await page('/cookie-policy');
  assert.equal(status, 200);
  assert.match(html, /<code>token<\/code>/);

  // Ogni chiave salvata in localStorage/sessionStorage dagli script deve essere dichiarata
  const keys = new Set();
  for (const file of fs.readdirSync(path.join(FRONTEND, 'js'))) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(FRONTEND, 'js', file), 'utf8');
    for (const match of source.matchAll(/(?:local|session)Storage\.setItem\('([^']+)'/g)) {
      keys.add(match[1]);
    }
  }
  const themeKey = /THEME_KEY = '([^']+)'/.exec(
    fs.readFileSync(path.join(FRONTEND, 'js/theme.js'), 'utf8')
  )[1];
  keys.add(themeKey);

  assert.ok(keys.size > 5);
  for (const key of keys) {
    assert.match(html, new RegExp(`<code>${key}</code>`), `chiave non dichiarata: ${key}`);
  }
});

test('ogni pagina carica il footer con i link a Privacy e Cookie Policy', () => {
  const pages = fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html'));
  assert.ok(pages.length >= 19);
  for (const file of pages) {
    const html = fs.readFileSync(path.join(FRONTEND, file), 'utf8');
    assert.match(html, /<script src="\/js\/legal-footer\.js"><\/script>/, file);
  }
  const footer = fs.readFileSync(path.join(FRONTEND, 'js/legal-footer.js'), 'utf8');
  assert.match(footer, /href="\/privacy-policy"/);
  assert.match(footer, /href="\/cookie-policy"/);
});

test("registrazione e prenotazione ospite richiedono la presa visione dell'informativa", async () => {
  const { privacyAccepted: _, ...withoutAck } = makeUser('noack');
  const register = await api.request('POST', '/api/auth/register', { body: withoutAck });
  assert.equal(register.status, 400);
  assert.match(register.data.error, /informativa privacy/);

  const guest = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'Anna',
      cognome: 'Neri',
      email: 'anna.noack@test.local',
      giorno: futureWeekday(3),
      ora: '14:00'
    }
  });
  assert.equal(guest.status, 400);
  assert.match(guest.data.error, /informativa privacy/);
});

test('la data della presa visione viene registrata per clienti e ospiti', async () => {
  const { usersDB } = require('../server/database');
  const user = makeUser('ack');
  assert.equal((await api.request('POST', '/api/auth/register', { body: user })).status, 201);
  const guest = await api.request('POST', '/api/bookings/guest', {
    body: {
      privacyAccepted: true,
      nome: 'Luca',
      cognome: 'Ospite',
      email: 'luca.ack@test.local',
      giorno: futureWeekday(3),
      ora: '14:45'
    }
  });
  assert.equal(guest.status, 201);

  for (const email of [user.email, 'luca.ack@test.local']) {
    const saved = usersDB.findOne(u => u.email === email);
    assert.ok(!Number.isNaN(Date.parse(saved.privacy_accepted_at)), email);
  }
});
