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

// true mentre è aperta una transazione: i salvataggi intermedi vengono rimandati al COMMIT
let inTransaction = false;

// Salva il database su disco. sql.js tiene il DB in memoria e lo riscrive per intero:
// si scrive prima un file temporaneo e poi lo si rinomina, così un crash a metà
// scrittura non lascia mai un database troncato.
function saveDatabase() {
  if (!db || inTransaction) return;

  const buffer = Buffer.from(db.export());
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  try {
    fs.renameSync(tmpPath, DB_PATH);
  } catch (error) {
    // Su Windows la rinomina può fallire se il file è aperto da un altro processo
    // (antivirus, backup): si ripiega sulla scrittura diretta
    console.warn('⚠️  Rinomina atomica non riuscita, scrittura diretta:', error.code);
    fs.writeFileSync(DB_PATH, buffer);
    fs.rmSync(tmpPath, { force: true });
  }
}

// Esegue più scritture come un'unica operazione: o vanno tutte a buon fine o nessuna,
// con un solo salvataggio su disco alla fine. Le chiamate annidate riusano la transazione.
function withTransaction(fn) {
  if (!db || inTransaction) return fn();

  db.run('BEGIN');
  inTransaction = true;
  try {
    const result = fn();
    db.run('COMMIT');
    inTransaction = false;
    saveDatabase();
    return result;
  } catch (error) {
    inTransaction = false;
    db.run('ROLLBACK');
    throw error;
  }
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

// Le prime versioni avevano servizio NOT NULL; i servizi sono stati rimossi e SQLite non
// permette di cambiare il vincolo, quindi la tabella va ricostruita copiando tutte le
// colonne in comune (tipo e token compresi). Tutto avviene in una transazione: se qualcosa
// fallisce la tabella originale resta com'era.
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
    db.run('ROLLBACK');
    console.error(
      '❌ Migrazione della tabella bookings non riuscita, dati invariati:',
      error.message
    );
  }
}

// Inizializza il database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Carica database esistente o crea nuovo
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('📦 Database SQLite caricato da file');
  } else {
    db = new SQL.Database();
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

  // Aggiungi colonna vip se non esiste (migrazione)
  try {
    db.run(`ALTER TABLE users ADD COLUMN vip INTEGER DEFAULT 0`);
  } catch (e) {
    // Colonna già esiste
  }

  // Aggiungi colonna banned se non esiste (migrazione)
  try {
    db.run(`ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0`);
  } catch (e) {
    // Colonna già esiste
  }

  // Aggiungi colonna isGuest se non esiste (migrazione per Guest Checkout)
  try {
    db.run(`ALTER TABLE users ADD COLUMN isGuest INTEGER DEFAULT 0`);
  } catch (e) {
    // Colonna gia esiste
  }

  // Aggiungi colonna token a bookings se non esiste (migrazione per Smart Rescheduling)
  try {
    db.run(`ALTER TABLE bookings ADD COLUMN token TEXT`);
  } catch (e) {
    // Colonna gia esiste
  }

  // Aggiungi colonna tipo a bookings se non esiste (migrazione per Prenotazioni Ricorrenti)
  // Valori: 'normale' (default) | 'ricorrente'
  try {
    db.run(`ALTER TABLE bookings ADD COLUMN tipo TEXT DEFAULT 'normale'`);
  } catch (e) {
    // Colonna gia esiste
  }

  migrateBookingsServizioNullable();

  // Un solo appuntamento per slot. Se i dati esistenti contengono già doppioni
  // l'indice non può essere creato: lo si segnala senza bloccare l'avvio.
  try {
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot ON bookings (giorno, ora)');
  } catch (e) {
    console.warn('⚠️  Prenotazioni duplicate sullo stesso slot: indice univoco non creato.');
    console.warn('   Rimuovi i doppioni (stesso giorno e ora) e riavvia il server.');
  }

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
  const currentHours = globalSettingsDB.get('businessHours');
  if (!currentHours) {
    try {
      const config = require('../config/config');
      if (config.businessHours) {
        globalSettingsDB.set('businessHours', config.businessHours);
        console.log('⚙️ Impostazioni businessHours migrate da config.js');
      }
    } catch (e) {
      console.error('Errore durante la migrazione di businessHours:', e);
    }
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

    saveDatabase();
    return db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0];
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

const globalSettingsDB = {
  get: function (key) {
    if (!db) return null;
    try {
      const stmt = db.prepare(`SELECT json_data FROM global_settings WHERE key = ?`);
      stmt.bind([key]);
      if (stmt.step()) {
        const rs = stmt.getAsObject();
        stmt.free();
        return JSON.parse(rs.json_data);
      }
      stmt.free();
      return null;
    } catch (e) {
      console.error(`Errore in globalSettingsDB.get(${key}):`, e);
      return null;
    }
  },
  set: function (key, data) {
    if (!db) return;
    try {
      const stringData = JSON.stringify(data);
      const stmt = db.prepare(
        `INSERT INTO global_settings (key, json_data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json_data = excluded.json_data`
      );
      stmt.run([key, stringData]);
      stmt.free();
      saveDatabase();
    } catch (e) {
      console.error(`Errore in globalSettingsDB.set(${key}):`, e);
    }
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
  initDatabase,
  withTransaction
};
