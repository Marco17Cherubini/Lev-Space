// Migrazione di un database creato con lo schema storico (servizio NOT NULL)
const fs = require('fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv } = require('./helpers');

const dbPath = configureTestEnv();

// Schema delle prime versioni: servizio obbligatorio; token e tipo aggiunti in seguito
async function createLegacyDatabase() {
  const SQL = await require('sql.js')();
  const legacy = new SQL.Database();
  legacy.run(`
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL,
      giorno TEXT NOT NULL,
      ora TEXT NOT NULL,
      servizio TEXT NOT NULL,
      token TEXT,
      tipo TEXT DEFAULT 'normale',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  legacy.run(`
    INSERT INTO bookings (id, nome, cognome, email, telefono, giorno, ora, servizio, token, tipo)
    VALUES
      (7, 'Anna', 'Rossi', 'anna@test.local', '1', '2031-03-04', '09:15', 'Capelli', 'serie-1', 'ricorrente'),
      (8, 'Anna', 'Rossi', 'anna@test.local', '1', '2031-03-11', '09:15', 'Capelli', 'serie-1', 'ricorrente'),
      (9, 'Bruno', 'Verdi', 'bruno@test.local', '2', '2031-03-04', '10:00', 'Barba', NULL, 'normale')
  `);
  fs.writeFileSync(dbPath, Buffer.from(legacy.export()));
  legacy.close();
}

let database;
let bookingService;

before(async () => {
  console.log = () => {};
  console.warn = () => {};
  await createLegacyDatabase();
  database = require('../server/database');
  bookingService = require('../server/bookingService');
  await database.initDatabase();
});

after(() => fs.rmSync(dbPath, { force: true }));

async function columnsOnDisk() {
  const SQL = await require('sql.js')();
  const disk = new SQL.Database(fs.readFileSync(dbPath));
  const info = disk.exec('PRAGMA table_info(bookings)')[0].values;
  const tables = disk.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0].values.flat();
  disk.close();
  return {
    columns: Object.fromEntries(info.map(col => [col[1], { notNull: col[3] === 1 }])),
    tables
  };
}

test('la migrazione rende servizio facoltativo senza perdere colonne né dati', async () => {
  const { columns, tables } = await columnsOnDisk();
  assert.equal(columns.servizio.notNull, false);
  assert.ok(columns.tipo, 'la colonna tipo deve restare dopo la ricostruzione');
  assert.ok(columns.token);
  assert.ok(!tables.includes('bookings_old'));

  const rows = database.bookingsDB.readAll();
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.filter(b => b.tipo === 'ricorrente').map(b => b.giorno),
    ['2031-03-04', '2031-03-11']
  );
  assert.equal(rows.find(b => b.email === 'bruno@test.local').tipo, 'normale');
});

test('dopo la migrazione le serie ricorrenti restano gestibili', () => {
  assert.equal(bookingService.adminCancelRecurringSeries('serie-1'), 2);
});

test('subito dopo la migrazione si possono creare prenotazioni admin e ricorrenti', () => {
  const single = bookingService.createAdminBooking({
    cognome: 'Neri',
    giorno: '2031-03-05',
    ora: '14:00'
  });
  assert.equal(single.tipo, 'normale');

  const series = bookingService.createAdminBooking({
    cognome: 'Gialli',
    giorno: '2031-03-06',
    ora: '14:45',
    ricorrente: true,
    mesiRicorrenza: 1
  });
  assert.equal(series.inserite, 4);
});

test('un secondo avvio non ricostruisce di nuovo la tabella', async () => {
  const before = database.bookingsDB.readAll().length;
  await database.initDatabase();
  assert.equal(database.bookingsDB.readAll().length, before);
  assert.equal((await columnsOnDisk()).columns.servizio.notNull, false);
});
