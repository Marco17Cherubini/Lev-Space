const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Path del database - usa variabile d'ambiente per Railway Volume, altrimenti default locale
// Su Railway: imposta DATABASE_PATH=/data/database.sqlite e monta un Volume su /data
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../database/database.sqlite');

console.log(`📁 Database path: ${DB_PATH}`);

// Assicurati che la directory esista
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Database instance (sarà inizializzato in modo asincrono)
let db = null;
let SQL = null;

// Copia dell'ultimo stato scritto su disco: se un salvataggio fallisce la memoria torna
// a questo stato, così memoria, file e risposta HTTP non divergono mai
let lastSaved = null;

// true mentre è aperta una transazione: i salvataggi intermedi vengono rimandati al COMMIT
let inTransaction = false;

// Su Windows la rinomina fallisce se il file è aperto un istante da un altro processo
// (antivirus, backup): si riprova per poco, poi si rinuncia senza toccare il file
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_MS = 50;
const RETRYABLE_RENAME_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Scrive un file temporaneo e lo rinomina: un crash a metà non lascia mai un database
// troncato. Non si ripiega mai sulla scrittura diretta, che non sarebbe atomica.
function writeAtomically(buffer) {
  const tmpPath = `${DB_PATH}.tmp`;
  try {
    fs.writeFileSync(tmpPath, buffer);
  } catch (error) {
    // Disco pieno o cartella non scrivibile: niente file temporanei a metà
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmpPath, DB_PATH);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !RETRYABLE_RENAME_ERRORS.has(error.code)) {
        fs.rmSync(tmpPath, { force: true });
        throw error;
      }
      pause(RENAME_RETRY_MS);
    }
  }
}

// sql.js può usare come file in memoria lo stesso buffer ricevuto: gli si passa sempre
// una copia, altrimenti le scritture successive modificherebbero anche lo snapshot
function openFromBuffer(buffer) {
  return new SQL.Database(Uint8Array.from(buffer));
}

// Riporta la memoria all'ultimo stato salvato (dopo un salvataggio fallito)
// (si apre la copia prima di chiudere l'attuale: se fallisse, il database resta aperto)
function restoreLastSaved() {
  const restored = openFromBuffer(lastSaved);
  db.close();
  db = restored;
}

// Salva il database su disco. sql.js tiene il DB in memoria e lo riscrive per intero.
// Se la scrittura fallisce le modifiche vengono annullate anche in memoria e l'errore
// arriva al chiamante (500 al client): una prenotazione non salvata non esiste.
function saveDatabase() {
  if (!db || inTransaction) return;

  let buffer;
  try {
    buffer = Buffer.from(db.export());
    writeAtomically(buffer);
  } catch (error) {
    console.error('❌ Salvataggio del database non riuscito, modifiche annullate:', error.code);
    restoreLastSaved();
    throw error;
  }
  lastSaved = buffer;
}

// Se il COMMIT stesso è fallito SQLite può aver già chiuso la transazione: il ROLLBACK
// fallirebbe e nasconderebbe l'errore originale, che è quello da propagare
function rollbackQuietly() {
  try {
    db.run('ROLLBACK');
  } catch (rollbackError) {
    console.error('ROLLBACK non eseguito:', rollbackError.message);
  }
}

// Esegue più scritture come un'unica operazione: o vanno tutte a buon fine o nessuna,
// con un solo salvataggio su disco alla fine. Le chiamate annidate riusano la transazione.
function withTransaction(fn) {
  if (!db || inTransaction) return fn();

  db.run('BEGIN');
  inTransaction = true;
  let result;
  try {
    result = fn();
    db.run('COMMIT');
  } catch (error) {
    inTransaction = false;
    rollbackQuietly();
    throw error;
  }
  inTransaction = false;
  // Dopo il COMMIT non c'è più nulla da annullare con ROLLBACK: se il salvataggio
  // fallisce è saveDatabase a riportare la memoria allo stato su disco
  saveDatabase();
  return result;
}

// Schema attuale delle prenotazioni: usato per crearla e per ricostruirla nelle migrazioni.
// tipo: 'normale' | 'ricorrente'; token: lega gli slot di un gruppo o di una serie.
const BOOKINGS_COLUMNS_SQL = `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL,
      giorno TEXT NOT NULL,
      ora TEXT NOT NULL,
      servizio TEXT,
      token TEXT,
      tipo TEXT DEFAULT 'normale',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP`;

function tableColumns(table) {
  const info = db.exec(`PRAGMA table_info(${table})`);
  return (info[0]?.values || []).map(col => ({ name: col[1], notNull: col[3] === 1 }));
}

// Migrazione additiva: aggiunge la colonna solo se manca. Gli errori veri (non "esiste
// già") interrompono l'avvio invece di lasciare uno schema a metà.
function addColumnIfMissing(table, column, definition) {
  if (tableColumns(table).some(col => col.name === column)) return;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`🔄 Migrazione: aggiunta colonna ${table}.${column}`);
}

// Slot con più di una prenotazione: [{ giorno, ora, ids: [..] }].
// Usata all'avvio e da `npm run db:check` (server/db-check.js).
const DUPLICATE_SLOTS_SQL = `
  SELECT giorno, ora, group_concat(id) FROM bookings
  GROUP BY giorno, ora HAVING COUNT(*) > 1 ORDER BY giorno, ora`;

function findDuplicateSlots(database) {
  const res = database.exec(DUPLICATE_SLOTS_SQL);
  return (res[0]?.values || []).map(([giorno, ora, ids]) => ({
    giorno,
    ora,
    ids: String(ids).split(',').map(Number)
  }));
}

// Il vincolo "un appuntamento per slot" è la garanzia principale contro i doppioni:
// senza di esso l'app non parte. I doppioni non vengono mai cancellati in automatico
// (sono clienti reali): li si elenca perché l'admin decida quale spostare.
function ensureUniqueSlotIndex() {
  const duplicates = findDuplicateSlots(db);
  if (duplicates.length > 0) {
    const list = duplicates
      .map(d => `${d.giorno} ${d.ora} (prenotazioni ${d.ids.map(id => `#${id}`).join(', ')})`)
      .join('; ');
    throw new Error(
      `Prenotazioni doppie sullo stesso slot, indice univoco non creabile: ${list}. ` +
        'Nessun dato è stato modificato: sposta o rimuovi i doppioni (npm run db:check) e riavvia.'
    );
  }
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot ON bookings (giorno, ora)');
}

// Le prime versioni avevano servizio NOT NULL; i servizi sono stati rimossi e SQLite non
// permette di cambiare il vincolo, quindi la tabella va ricostruita copiando tutte le
// colonne in comune (tipo e token compresi). Tutto avviene in una transazione: se qualcosa
// fallisce la tabella originale resta com'era e l'avvio si interrompe.
function migrateBookingsServizioNullable() {
  const oldColumns = tableColumns('bookings');
  const servizio = oldColumns.find(col => col.name === 'servizio');
  if (!servizio || !servizio.notNull) return;

  console.log('🔄 Migrazione: rimuovo vincolo NOT NULL da servizio...');
  db.run('BEGIN');
  try {
    db.run('ALTER TABLE bookings RENAME TO bookings_old');
    db.run(`CREATE TABLE bookings (${BOOKINGS_COLUMNS_SQL}
    )`);
    const newNames = new Set(tableColumns('bookings').map(col => col.name));
    const copied = oldColumns
      .map(col => col.name)
      .filter(name => newNames.has(name))
      .join(', ');
    db.run(`INSERT INTO bookings (${copied}) SELECT ${copied} FROM bookings_old`);
    db.run('DROP TABLE bookings_old');
    db.run('COMMIT');
    console.log('✅ Migrazione completata: servizio ora è opzionale');
  } catch (error) {
    rollbackQuietly();
    throw new Error(
      `Migrazione della tabella bookings non riuscita, dati invariati: ${error.message}`
    );
  }
}

// Inizializza il database. Qualunque errore di schema o migrazione interrompe l'avvio:
// meglio un deploy fallito che un'app che parte con dati incoerenti.
async function initDatabase() {
  SQL = SQL || (await initSqlJs());
  inTransaction = false;
  if (db) db.close();

  // Carica database esistente o crea nuovo
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = openFromBuffer(fileBuffer);
    lastSaved = fileBuffer;
    console.log('📦 Database SQLite caricato da file');
  } else {
    db = new SQL.Database();
    lastSaved = Buffer.from(db.export());
    console.log('📦 Nuovo database SQLite creato');
  }

  // Crea tabelle se non esistono
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      telefono TEXT NOT NULL,
      password TEXT NOT NULL,
      vip INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE TABLE IF NOT EXISTS bookings (${BOOKINGS_COLUMNS_SQL}
    )`);

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giorno TEXT NOT NULL,
      ora TEXT NOT NULL,
      UNIQUE(giorno, ora)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      json_data TEXT NOT NULL
    )
  `);

  // Sessioni chiuse con il logout: restano qui fino alla loro scadenza naturale
  db.run(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    )
  `);

  // Colonne aggiunte nelle versioni successive (VIP, BAN, ospiti, gruppi, ricorrenze)
  addColumnIfMissing('users', 'vip', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'banned', 'INTEGER DEFAULT 0');
  addColumnIfMissing('users', 'isGuest', 'INTEGER DEFAULT 0');
  addColumnIfMissing('bookings', 'token', 'TEXT');
  // tipo: 'normale' (default) | 'ricorrente'
  addColumnIfMissing('bookings', 'tipo', "TEXT DEFAULT 'normale'");

  migrateBookingsServizioNullable();
  ensureUniqueSlotIndex();

  // Salva struttura iniziale
  saveDatabase();

  // Inizializza impostazioni globali se mancano
  initializeSettings();

  // Inizializza admin
  initializeDefaultAdmin();

  console.log('📦 Database SQLite inizializzato');
}

// ==================== INIZIALIZZA SETTINGS (SEED) ====================
function initializeSettings() {
  if (!db) return;
  if (!globalSettingsDB.get('businessHours')) {
    const config = require('../config/config');
    globalSettingsDB.set('businessHours', config.businessHours);
    console.log('⚙️ Impostazioni businessHours migrate da config.js');
  }
}

// ==================== CLASSE DB WRAPPER ====================

class SQLiteTable {
  constructor(tableName, columns) {
    this.tableName = tableName;
    this.columns = columns;
  }

  // Leggi tutti i record
  readAll() {
    if (!db) return [];
    const stmt = db.prepare(`SELECT * FROM ${this.tableName}`);
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const obj = {};
      this.columns.forEach(col => {
        obj[col] = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
      });
      rows.push(obj);
    }
    stmt.free();
    return rows;
  }

  // Trova un record
  findOne(filterFn) {
    const data = this.readAll();
    return data.find(filterFn);
  }

  // Trova più record
  findMany(filterFn) {
    const data = this.readAll();
    return data.filter(filterFn);
  }

  // Inserisci un record
  insert(record) {
    if (!db) return null;
    const cols = this.columns.filter(c => record[c] !== undefined);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(c => record[c]);

    db.run(`INSERT INTO ${this.tableName} (${cols.join(', ')}) VALUES (${placeholders})`, values);
    // Letto prima del salvataggio: l'export di sql.js riapre il database e lo azzera
    const id = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0];

    saveDatabase();
    return id;
  }

  // Aggiorna record che matchano il filtro
  update(filterFn, updates) {
    if (!db) return;
    const allData = this.readAll();

    allData.forEach(row => {
      if (filterFn(row)) {
        const setClauses = Object.keys(updates)
          .map(k => `${k} = ?`)
          .join(', ');
        const values = Object.values(updates);

        let whereClause, whereValues;
        if (this.tableName === 'users' || this.tableName === 'admins') {
          whereClause = 'email = ?';
          whereValues = [row.email];
        } else if (this.tableName === 'bookings') {
          whereClause = 'giorno = ? AND ora = ? AND email = ?';
          whereValues = [row.giorno, row.ora, row.email];
        } else {
          whereClause = 'giorno = ? AND ora = ?';
          whereValues = [row.giorno, row.ora];
        }

        db.run(`UPDATE ${this.tableName} SET ${setClauses} WHERE ${whereClause}`, [
          ...values,
          ...whereValues
        ]);
      }
    });

    saveDatabase();
  }

  // Elimina record che matchano il filtro
  delete(filterFn) {
    if (!db) return false;
    const allData = this.readAll();
    let deleted = false;

    allData.forEach(row => {
      if (filterFn(row)) {
        let whereClause, whereValues;
        if (this.tableName === 'users' || this.tableName === 'admins') {
          whereClause = 'email = ?';
          whereValues = [row.email];
        } else if (this.tableName === 'bookings') {
          whereClause = 'giorno = ? AND ora = ? AND email = ?';
          whereValues = [row.giorno, row.ora, row.email];
        } else {
          whereClause = 'giorno = ? AND ora = ?';
          whereValues = [row.giorno, row.ora];
        }

        db.run(`DELETE FROM ${this.tableName} WHERE ${whereClause}`, whereValues);
        deleted = true;
      }
    });

    if (deleted) saveDatabase();
    return deleted;
  }
}

// ==================== INIZIALIZZA TABELLE ====================

const userColumns = [
  'nome',
  'cognome',
  'email',
  'telefono',
  'password',
  'vip',
  'banned',
  'isGuest'
];
const bookingColumns = ['nome', 'cognome', 'email', 'telefono', 'giorno', 'ora', 'token', 'tipo'];
const adminColumns = ['email', 'password'];
const holidayColumns = ['giorno', 'ora'];

const usersDB = new SQLiteTable('users', userColumns);
const bookingsDB = new SQLiteTable('bookings', bookingColumns);
const adminDB = new SQLiteTable('admins', adminColumns);
const holidaysDB = new SQLiteTable('holidays', holidayColumns);

// Impostazioni in JSON. Gli errori non vengono nascosti: un salvataggio fallito deve
// arrivare all'admin come errore, e un valore illeggibile non deve far ripiegare in
// silenzio su orari diversi da quelli scelti.
const globalSettingsDB = {
  get(key) {
    if (!db) return null;
    const stmt = db.prepare('SELECT json_data FROM global_settings WHERE key = ?');
    try {
      stmt.bind([key]);
      return stmt.step() ? JSON.parse(stmt.getAsObject().json_data) : null;
    } finally {
      stmt.free();
    }
  },
  set(key, data) {
    if (!db) return;
    db.run(
      'INSERT INTO global_settings (key, json_data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json_data = excluded.json_data',
      [key, JSON.stringify(data)]
    );
    saveDatabase();
  }
};

// Token di sessione revocati dal logout (jti). Le righe scadute vengono rimosse a ogni
// nuova revoca, così la tabella resta piccola.
const revokedTokensDB = {
  has(jti) {
    if (!db || !jti) return false;
    const stmt = db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?');
    try {
      stmt.bind([jti]);
      return stmt.step();
    } finally {
      stmt.free();
    }
  },
  add(jti, expiresAt) {
    if (!db) return;
    withTransaction(() => {
      db.run('DELETE FROM revoked_tokens WHERE expires_at < ?', [Math.floor(Date.now() / 1000)]);
      db.run('INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)', [
        jti,
        expiresAt
      ]);
    });
  }
};

// ==================== INIZIALIZZA ADMIN ====================

function initializeDefaultAdmin() {
  if (!db) return;
  const admins = adminDB.readAll();
  if (admins.length === 0) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.log('⚠️  ATTENZIONE: ADMIN_EMAIL e ADMIN_PASSWORD non configurati nel .env');
      console.log("   Imposta queste variabili per creare l'account admin");
      return;
    }

    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    adminDB.insert({
      email: adminEmail.toLowerCase(),
      password: hashedPassword
    });
    console.log(`👤 Admin creato: ${adminEmail}`);
  }
}

// ==================== EXPORT ====================

module.exports = {
  usersDB,
  bookingsDB,
  adminDB,
  holidaysDB,
  globalSettingsDB,
  revokedTokensDB,
  initDatabase,
  withTransaction,
  findDuplicateSlots
};
