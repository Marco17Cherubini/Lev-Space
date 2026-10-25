// Persistenza: salvataggio atomico, transazioni, vincolo di unicità e backup
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv } = require('./helpers');

const dbPath = configureTestEnv();
const { initDatabase, bookingsDB, withTransaction } = require('../server/database');

const booking = (giorno, ora) => ({
  nome: 'A',
  cognome: 'B',
  email: 'a@b.it',
  telefono: '1',
  giorno,
  ora
});

// Rilegge il file da disco con un'istanza sql.js separata
async function countOnDisk(giorno) {
  const SQL = await require('sql.js')();
  const disk = new SQL.Database(fs.readFileSync(dbPath));
  const res = disk.exec(`SELECT COUNT(*) FROM bookings WHERE giorno = '${giorno}'`);
  disk.close();
  return res[0].values[0][0];
}

before(async () => {
  console.log = () => {};
  console.warn = () => {};
  await initDatabase();
});

after(() => fs.rmSync(dbPath, { force: true }));

test('ogni scrittura arriva su disco senza lasciare file temporanei', async () => {
  bookingsDB.insert(booking('2031-01-07', '09:15'));
  assert.equal(await countOnDisk('2031-01-07'), 1);
  assert.equal(fs.existsSync(`${dbPath}.tmp`), false);
});

test('una transazione fallita non lascia scritture parziali, né in memoria né su disco', async () => {
  assert.throws(
    () =>
      withTransaction(() => {
        bookingsDB.insert(booking('2031-01-14', '09:15'));
        bookingsDB.insert(booking('2031-01-14', '10:00'));
        throw new Error('errore simulato');
      }),
    /errore simulato/
  );
  assert.equal(bookingsDB.findMany(b => b.giorno === '2031-01-14').length, 0);
  assert.equal(await countOnDisk('2031-01-14'), 0);
});

test('una transazione riuscita salva tutte le scritture insieme', async () => {
  withTransaction(() => {
    bookingsDB.insert(booking('2031-01-21', '09:15'));
    // Le chiamate annidate riusano la transazione esterna
    withTransaction(() => bookingsDB.insert(booking('2031-01-21', '10:00')));
  });
  assert.equal(await countOnDisk('2031-01-21'), 2);
});

test('due prenotazioni sullo stesso slot sono impedite dal database', () => {
  bookingsDB.insert(booking('2031-01-28', '09:15'));
  assert.throws(() => bookingsDB.insert(booking('2031-01-28', '09:15')), /UNIQUE/);
});

test('lo script di backup usa DATABASE_PATH e BACKUP_DIR', () => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lev-space-backup-'));
  const res = spawnSync(process.execPath, [path.join(__dirname, '../server/backup.js')], {
    env: { ...process.env, DATABASE_PATH: dbPath, BACKUP_DIR: backupDir },
    encoding: 'utf8'
  });
  try {
    assert.equal(res.status, 0, res.stderr);
    const files = fs.readdirSync(backupDir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^database_.*\.sqlite$/);
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
});
