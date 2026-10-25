// Privacy Policy, Cookie Policy e footer legale
const fs = require('fs');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

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
