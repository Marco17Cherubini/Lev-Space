/**
 * Dati dimostrativi per provare Lev Space in locale: `npm run seed`
 *
 * Crea clienti fittizi (alcuni VIP, uno sospeso, un ospite), due mesi di storico per i
 * Report, prenotazioni nelle prossime settimane, una serie ricorrente e un giorno di ferie.
 * Per sicurezza si rifiuta di scrivere su un database che contiene già prenotazioni.
 *
 * Password di tutti i clienti demo: Demo12345!
 * L'admin è quello configurato in .env (ADMIN_EMAIL / ADMIN_PASSWORD).
 */
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const { initDatabase, usersDB, bookingsDB, withTransaction } = require('./database');
const { createAdminBooking, getAvailableSlots, addDaysToDateString } = require('./bookingService');
const { addHolidays } = require('./holidayService');
const { getBusinessHours } = require('./businessHours');

const DEMO_PASSWORD = 'Demo12345!';
const DEMO_DOMAIN = 'demo.levspace.it';

const CLIENTS = [
  ['Luca', 'Bianchi'],
  ['Matteo', 'Romano'],
  ['Giulia', 'Colombo'],
  ['Alessandro', 'Ricci'],
  ['Francesco', 'Marino'],
  ['Sofia', 'Greco'],
  ['Andrea', 'Bruno'],
  ['Davide', 'Gallo'],
  ['Lorenzo', 'Conti'],
  ['Simone', "D'Amico"],
  ['Federico', 'Mancini'],
  ['Elena', 'Costa']
];

// Generatore pseudo-casuale con seme fisso: ogni esecuzione produce gli stessi dati
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = createRandom(2026);
const pick = list => list[Math.floor(random() * list.length)];

function toDateString(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// Slot standard di un giorno secondo gli orari in vigore (senza gli extra admin)
function standardSlots(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();
  const hours = getBusinessHours();
  const day = hours.days[dayOfWeek];
  if (!hours.daysOpen.includes(dayOfWeek) || !day) return [];
  return [...(day.morning ? day.morning.slots : []), ...(day.afternoon ? day.afternoon.slots : [])];
}

function bookingFor(client, giorno, ora) {
  return {
    nome: client.nome,
    cognome: client.cognome,
    email: client.email,
    telefono: client.telefono,
    giorno,
    ora
  };
}

async function seed() {
  console.log = (...args) => process.stdout.write(args.join(' ') + '\n');
  await initDatabase();

  if (bookingsDB.readAll().length > 0) {
    console.error('❌ Il database contiene già prenotazioni: il seed demo non viene eseguito.');
    console.error('   Usa un database vuoto, per esempio DATABASE_PATH=database/demo.sqlite');
    process.exitCode = 1;
    return;
  }

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const clients = CLIENTS.map(([nome, cognome], i) => ({
    nome,
    cognome,
    email: `${nome}.${cognome}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${DEMO_DOMAIN}`,
    telefono: `333 000 ${String(1000 + i).slice(1)}`
  }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateString(today);

  withTransaction(() => {
    // Clienti: i primi due VIP, l'ultimo sospeso
    clients.forEach((client, i) => {
      usersDB.insert({
        ...client,
        password: passwordHash,
        vip: i < 2 ? '1' : '0',
        banned: i === clients.length - 1 ? '1' : '0',
        isGuest: '0'
      });
    });
    usersDB.insert({
      nome: 'Marta',
      cognome: 'Ospite',
      email: `marta.ospite@${DEMO_DOMAIN}`,
      telefono: '',
      password: '',
      vip: '0',
      banned: '0',
      isGuest: '1'
    });

    // Storico degli ultimi 60 giorni per i Report (l'admin può registrare date passate)
    const active = clients.slice(0, -1);
    for (let back = 60; back >= 1; back--) {
      const giorno = addDaysToDateString(todayStr, -back);
      const slots = standardSlots(giorno);
      const busy = Math.round(slots.length * (0.5 + random() * 0.5));
      for (const ora of slots.slice(0, busy)) {
        createAdminBooking(bookingFor(pick(active), giorno, ora));
      }
    }

    // Prossime tre settimane: circa metà degli slot occupati
    for (let ahead = 1; ahead <= 21; ahead++) {
      const giorno = addDaysToDateString(todayStr, ahead);
      for (const ora of standardSlots(giorno)) {
        if (random() < 0.5) createAdminBooking(bookingFor(pick(active), giorno, ora));
      }
    }
  });

  // Serie ricorrente: un cliente VIP ogni 2 settimane per 3 mesi, alla prima ora libera
  const vip = clients[0];
  const firstFree = (() => {
    for (let ahead = 22; ahead <= 40; ahead++) {
      const giorno = addDaysToDateString(todayStr, ahead);
      const slot = getAvailableSlots(giorno).find(s => s.available);
      if (slot) return { giorno, ora: slot.time };
    }
    return null;
  })();
  if (firstFree) {
    createAdminBooking({
      ...bookingFor(vip, firstFree.giorno, firstFree.ora),
      ricorrente: true,
      mesiRicorrenza: 3,
      intervalloSettimane: 2
    });
  }

  // Un giorno di ferie tra quattro settimane (tutti gli slot liberi di quel giorno)
  for (let ahead = 28; ahead <= 35; ahead++) {
    const giorno = addDaysToDateString(todayStr, ahead);
    const free = getAvailableSlots(giorno).filter(s => s.available);
    if (free.length > 0) {
      addHolidays(free.map(s => ({ giorno, ora: s.time })));
      break;
    }
  }

  const total = bookingsDB.readAll().length;
  console.log(`✅ Dati demo creati: ${clients.length + 1} clienti, ${total} prenotazioni`);
  console.log(
    `   Accesso clienti: ${clients[0].email} / ${DEMO_PASSWORD} (e gli altri @${DEMO_DOMAIN})`
  );
  console.log(`   Accesso admin: ${process.env.ADMIN_EMAIL || '(imposta ADMIN_EMAIL nel .env)'}`);
  console.log(`   ${config.studio.name} pronto: npm start`);
}

seed().catch(error => {
  console.error('❌ Errore durante il seed:', error);
  process.exit(1);
});
