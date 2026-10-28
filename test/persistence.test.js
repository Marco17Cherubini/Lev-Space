// Coerenza tra memoria, file e risposta quando il salvataggio su disco fallisce (B14, B15, B18)
const fs = require('fs');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv } = require('./helpers');

const dbPath = configureTestEnv();
const {
  initDatabase,
  bookingsDB,
  globalSettingsDB,
  withTransaction
} = require('../server/database');

const realRename = fs.renameSync;
const realWrite = fs.writeFileSync;

const booking = (giorno, ora) => ({
  nome: 'A',
  cognome: 'B',
  email: 'a@b.it',
  telefono: '1',
  giorno,
  ora
});

// Simula un file del database bloccato (antivirus, backup, disco pieno)
function failRename() {
  fs.renameSync = () => {
    const error = new Error('EPERM: operation not permitted, rename');
    error.code = 'EPERM';
    throw error;
  };
}

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
  console.error = () => {};
  await initDatabase();
});

afterEach(() => {
  fs.renameSync = realRename;
  fs.writeFileSync = realWrite;
});

after(() => fs.rmSync(dbPath, { force: true }));

test('B14: se la rinomina fallisce il file del database non viene riscritto in modo non atomico', async () => {
  const directWrites = [];
  fs.writeFileSync = (file, ...rest) => {
    if (file === dbPath) directWrites.push(file);
    return realWrite(file, ...rest);
  };
  failRename();

  assert.throws(() => bookingsDB.insert(booking('2031-02-04', '09:15')), /EPERM/);
  assert.deepEqual(directWrites, [], 'nessuna scrittura diretta sul file del database');
  assert.equal(fs.existsSync(`${dbPath}.tmp`), false);
});

test('B15: una scrittura non salvata non resta in memoria', async () => {
  failRename();
  assert.throws(() => bookingsDB.insert(booking('2031-02-11', '09:15')), /EPERM/);
  fs.renameSync = realRename;

  assert.equal(bookingsDB.findMany(b => b.giorno === '2031-02-11').length, 0);
  assert.equal(await countOnDisk('2031-02-11'), 0);
});

test('B15: se il salvataggio dopo il COMMIT fallisce arriva l’errore originale e la memoria torna allo stato su disco', async () => {
  bookingsDB.insert(booking('2031-02-18', '08:30'));
  failRename();

  assert.throws(
    () =>
      withTransaction(() => {
        bookingsDB.insert(booking('2031-02-18', '09:15'));
        bookingsDB.insert(booking('2031-02-18', '10:00'));
      }),
    /EPERM/
  );
  fs.renameSync = realRename;

  assert.deepEqual(
    bookingsDB.findMany(b => b.giorno === '2031-02-18').map(b => b.ora),
    ['08:30']
  );
  assert.equal(await countOnDisk('2031-02-18'), 1);

  // Il database resta utilizzabile dopo il ripristino
  bookingsDB.insert(booking('2031-02-18', '10:45'));
  assert.equal(await countOnDisk('2031-02-18'), 2);
});

test('B18: un errore nel salvataggio delle impostazioni non viene nascosto', () => {
  globalSettingsDB.set('prova', { valore: 1 });
  failRename();
  assert.throws(() => globalSettingsDB.set('prova', { valore: 2 }), /EPERM/);
  fs.renameSync = realRename;
  assert.deepEqual(globalSettingsDB.get('prova'), { valore: 1 });
});
