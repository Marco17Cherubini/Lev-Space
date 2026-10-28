// Avvio fail-safe: niente partenza con schema incoerente o senza il vincolo sugli slot (B16, B17)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv } = require('./helpers');

const dbPath = configureTestEnv();
let database;

const BOOKINGS_SQL = servizio => `
  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, cognome TEXT NOT NULL, email TEXT NOT NULL, telefono TEXT NOT NULL,
    giorno TEXT NOT NULL, ora TEXT NOT NULL, servizio TEXT ${servizio},
    token TEXT, tipo TEXT DEFAULT 'normale', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;

async function writeDatabase(statements) {
  const SQL = await require('sql.js')();
  const db = new SQL.Database();
  statements.forEach(sql => db.run(sql));
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();
}

async function bookingsOnDisk() {
  const SQL = await require('sql.js')();
  const disk = new SQL.Database(fs.readFileSync(dbPath));
  const rows = disk.exec('SELECT id, giorno, ora FROM bookings ORDER BY id')[0].values;
  disk.close();
  return rows;
}

const DUPLICATES = [
  BOOKINGS_SQL(''),
  `INSERT INTO bookings (nome, cognome, email, telefono, giorno, ora) VALUES
     ('A', 'Uno', 'a@test.local', '1', '2031-04-01', '09:15'),
     ('B', 'Due', 'b@test.local', '2', '2031-04-01', '09:15'),
     ('C', 'Tre', 'c@test.local', '3', '2031-04-01', '10:00')`
];

before(() => {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  database = require('../server/database');
});

after(() => fs.rmSync(dbPath, { force: true }));

test('B16: con prenotazioni doppie sullo stesso slot l’avvio si ferma e non cancella nulla', async () => {
  await writeDatabase(DUPLICATES);

  await assert.rejects(database.initDatabase(), /2031-04-01 09:15/);
  assert.deepEqual(await bookingsOnDisk(), [
    [1, '2031-04-01', '09:15'],
    [2, '2031-04-01', '09:15'],
    [3, '2031-04-01', '10:00']
  ]);
});

test('B16: db:check elenca i doppioni in sola lettura', async () => {
  await writeDatabase(DUPLICATES);
  const before = fs.readFileSync(dbPath);

  const res = spawnSync(process.execPath, [path.join(__dirname, '../server/db-check.js')], {
    env: { ...process.env, DATABASE_PATH: dbPath },
    encoding: 'utf8'
  });

  assert.equal(res.status, 1);
  assert.match(res.stdout, /2031-04-01 09:15/);
  assert.match(res.stdout, /#1/);
  assert.match(res.stdout, /#2/);
  assert.ok(before.equals(fs.readFileSync(dbPath)), 'il file non deve cambiare');
});

test('B17: una migrazione che fallisce interrompe l’avvio invece di proseguire', async () => {
  // Uno stato a metà di una migrazione precedente: la tabella di appoggio esiste già
  await writeDatabase([
    BOOKINGS_SQL('NOT NULL'),
    BOOKINGS_SQL('NOT NULL').replace('CREATE TABLE bookings', 'CREATE TABLE bookings_old')
  ]);

  await assert.rejects(database.initDatabase(), /bookings_old/);
});

test('un database sano si avvia e ottiene l’indice univoco', async () => {
  fs.rmSync(dbPath, { force: true });
  await database.initDatabase();
  database.bookingsDB.insert({
    nome: 'A',
    cognome: 'B',
    email: 'a@b.it',
    telefono: '1',
    giorno: '2031-04-08',
    ora: '09:15'
  });
  assert.throws(
    () =>
      database.bookingsDB.insert({
        nome: 'C',
        cognome: 'D',
        email: 'c@d.it',
        telefono: '1',
        giorno: '2031-04-08',
        ora: '09:15'
      }),
    /UNIQUE/
  );
});
