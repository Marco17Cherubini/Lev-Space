// Script dei dati demo: popola un database vuoto e non tocca un database già in uso
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const dbPath = path.join(os.tmpdir(), `lev-space-seed-${process.pid}-${Date.now()}.sqlite`);
const runSeed = () =>
  spawnSync(process.execPath, [path.join(__dirname, '../server/seed.js')], {
    env: {
      ...process.env,
      DATABASE_PATH: dbPath,
      ADMIN_EMAIL: 'admin@test.local',
      ADMIN_PASSWORD: 'AdminPassword123!'
    },
    encoding: 'utf8'
  });

after(() => fs.rmSync(dbPath, { force: true }));

test('npm run seed crea clienti e prenotazioni demo', async () => {
  const res = runSeed();
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Dati demo creati: 13 clienti/);

  const SQL = await require('sql.js')();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const count = sql => db.exec(sql)[0].values[0][0];
  assert.equal(count("SELECT COUNT(*) FROM users WHERE email LIKE '%@demo.levspace.it'"), 13);
  assert.ok(count('SELECT COUNT(*) FROM bookings') > 100);
  assert.ok(count("SELECT COUNT(*) FROM bookings WHERE tipo = 'ricorrente'") > 0);
  assert.ok(count('SELECT COUNT(*) FROM holidays') > 0);
  db.close();
});

test('il seed si rifiuta di scrivere su un database con prenotazioni', () => {
  const res = runSeed();
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /contiene già prenotazioni/);
});
