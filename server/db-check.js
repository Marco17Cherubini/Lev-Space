// Controllo in sola lettura del database: elenca gli slot con più di una prenotazione,
// che impedirebbero l'avvio (vedi ensureUniqueSlotIndex in database.js).
// Uscita 0 se il database è pulito, 1 se ci sono doppioni.   npm run db:check
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
require('../config/config');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../database/database.sqlite');

// Stessa query dell'avvio, senza caricare database.js (che crea tabelle e salva il file)
const DUPLICATE_SLOTS_SQL = `
  SELECT giorno, ora, group_concat(id) FROM bookings
  GROUP BY giorno, ora HAVING COUNT(*) > 1 ORDER BY giorno, ora`;

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.log(`Nessun database in ${DB_PATH}`);
    return 0;
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  const rows = db.exec(DUPLICATE_SLOTS_SQL)[0]?.values || [];
  db.close();

  if (rows.length === 0) {
    console.log('✅ Nessuna prenotazione doppia sullo stesso slot');
    return 0;
  }
  console.log(`⚠️  ${rows.length} slot con più prenotazioni:`);
  for (const [giorno, ora, ids] of rows) {
    const list = String(ids)
      .split(',')
      .map(id => `#${id}`)
      .join(', ');
    console.log(`   ${giorno} ${ora}: prenotazioni ${list}`);
  }
  return 1;
}

// exitCode invece di process.exit(): su Windows l'uscita forzata mentre sql.js chiude
// le sue risorse fa terminare il processo con un'asserzione di libuv
main().then(
  code => {
    process.exitCode = code;
  },
  error => {
    console.error('❌ Controllo non riuscito:', error.message);
    process.exitCode = 2;
  }
);
