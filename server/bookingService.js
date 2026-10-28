const crypto = require('crypto');
const { bookingsDB, usersDB, withTransaction } = require('./database');
const { HttpError } = require('./errors');
const { isFlagOn, ensureGuestProfile } = require('./authService');
const { getBusinessHours } = require('./businessHours');
const { getHolidays, isHolidaySlot } = require('./holidayService');
const { parseDate, isValidTime, slotStart, toMinutes } = require('./dates');
const config = require('../config/config');

// Genera token univoco per gestione prenotazione (32 caratteri hex)
function generateBookingToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Durata standard appuntamento (minuti)
const APPOINTMENT_DURATION = config.appointmentDuration || 45;

function isDayAvailable(date) {
  const parsed = parseDate(date);
  return !!parsed && getBusinessHours().daysOpen.includes(parsed.getDay());
}

// Ottieni gli slot per un giorno specifico (sabato ha orari diversi)
function getSlotsForDay(date, includeExtraSlots = false) {
  const parsed = parseDate(date);
  if (!parsed) return [];
  const dayOfWeek = parsed.getDay();
  const hours = getBusinessHours().days[dayOfWeek];

  if (!hours) return [];

  let slots = [
    ...(hours.morning ? hours.morning.slots : []),
    ...(hours.afternoon ? hours.afternoon.slots : [])
  ];

  // Orari extra (pre-apertura e serali): solo per l'admin
  if (includeExtraSlots && hours.vip) {
    const extraSlots = hours.vip.slots || [];
    // Mantieni pre-orario 08:00 fisso o se nel JSON
    if (dayOfWeek !== 0 && !slots.includes('08:00') && !extraSlots.includes('08:00')) {
      slots = ['08:00', ...slots];
    }
    // Aggiungi straordinari
    slots = [...slots, ...extraSlots];
  } else if (includeExtraSlots && !('vip' in hours)) {
    // Fallback legacy solo se gli orari non sono mai stati salvati da Gestione Orari
    // (manca del tutto la chiave vip). vip: null vuol dire "extra spenti": nessun extra.
    const preOpeningSlot = ['08:00'];
    const extraSlotsWeekday = [
      '18:00',
      '18:45',
      '19:30',
      '20:15',
      '21:00',
      '21:45',
      '22:30',
      '23:15'
    ];
    const extraSlotsSaturday = [
      '15:30',
      '16:15',
      '17:00',
      '17:45',
      '18:30',
      '19:15',
      '20:00',
      '20:45',
      '21:30',
      '22:15',
      '23:00'
    ];
    const extraSlots = dayOfWeek === 6 ? extraSlotsSaturday : extraSlotsWeekday;
    slots = [...preOpeningSlot, ...slots, ...extraSlots];
  }

  // Deduplica array e ordina per stringa ("08:00", "09:00" ecc)
  slots = [...new Set(slots)].sort();

  return slots;
}

// Ottieni tutti gli slot disponibili per una data
function getAvailableSlots(date, includeExtraSlots = false) {
  if (!isDayAvailable(date)) {
    return [];
  }

  const allSlots = getSlotsForDay(date, includeExtraSlots);

  // Trova prenotazioni esistenti per questa data
  const existingBookings = bookingsDB.findMany(booking => booking.giorno === date);

  const bookedSlots = existingBookings.map(b => b.ora);

  // Trova ferie per questa data
  const holidaySlots = getHolidays()
    .filter(h => h.giorno === date)
    .map(h => h.ora);

  // Ritorna slot con stato (disponibile, occupato, o ferie)
  const now = new Date(); // Orario server attuale

  return allSlots
    .filter(slot => {
      // Mantiene solo slot futuri (orario del salone, vedi TZ in config.js)
      return slotStart(date, slot) > now;
    })
    .map(slot => ({
      time: slot,
      available: !bookedSlots.includes(slot) && !holidaySlots.includes(slot),
      isHoliday: holidaySlots.includes(slot)
    }));
}

// Numero di persone del gruppo: da 1 a 3, 1 se assente o non valido
function parseGroupSize(numPersone) {
  return Math.min(Math.max(parseInt(numPersone) || 1, 1), 3);
}

// Slot consecutivi (senza buchi) da `orario` per `groupSize` persone, solo tra quelli
// standard del giorno: un gruppo non scavalca mai la pausa pranzo o la chiusura
function groupSlots(data, orario, groupSize) {
  const allSlots = getSlotsForDay(data, false);
  const startIndex = allSlots.indexOf(orario);
  if (startIndex === -1) {
    throw new HttpError(400, 'Orario non valido');
  }

  const slots = allSlots.slice(startIndex, startIndex + groupSize);
  const contiguous = slots.every(
    (slot, i) => i === 0 || toMinutes(slot) - toMinutes(slots[i - 1]) === APPOINTMENT_DURATION
  );
  if (slots.length < groupSize || !contiguous) {
    throw new HttpError(409, 'Non ci sono abbastanza slot consecutivi disponibili');
  }
  return slots;
}

// Doppio invio o retry dopo una risposta persa: gli slot richiesti sono già tutti di
// questo cliente e formano esattamente un suo gruppo. Restituisce la prima prenotazione.
function findSameGroupBooking(userEmail, data, slots) {
  const dayBookings = bookingsDB.findMany(b => b.giorno === data);
  const mine = slots.map(ora => dayBookings.find(b => b.ora === ora && b.email === userEmail));
  const token = mine[0]?.token;
  if (!token || mine.some(b => !b || b.token !== token)) return null;

  const groupLength = dayBookings.filter(b => b.token === token).length;
  return groupLength === slots.length ? mine[0] : null;
}

// Crea una nuova prenotazione (supporta gruppi fino a 3 persone).
// Restituisce { booking, created }: created è false se la stessa prenotazione esisteva
// già (retry), così il chiamante non risponde con un errore né rimanda l'email.
function createBooking(userEmail, bookingData) {
  const { data, orario, numPersone = 1 } = bookingData;

  // Validazione
  if (!data || !orario) {
    throw new HttpError(400, 'Data e orario sono obbligatori');
  }

  const groupSize = parseGroupSize(numPersone);

  const start = slotStart(data, orario);
  if (!start) {
    throw new HttpError(400, 'Data o orario non validi');
  }
  if (start <= new Date()) {
    throw new HttpError(400, 'Non è possibile prenotare una data o un orario già passati');
  }

  // Verifica che il giorno sia disponibile
  if (!isDayAvailable(data)) {
    throw new HttpError(400, 'Il giorno selezionato non è disponibile');
  }

  // I clienti e i VIP non accedono agli slot extra
  const slotsToBook = groupSlots(data, orario, groupSize);

  const sameBooking = findSameGroupBooking(userEmail, data, slotsToBook);
  if (sameBooking) {
    return { booking: { ...sameBooking, numPersone: groupSize }, created: false };
  }

  for (const slotTime of slotsToBook) {
    if (isHolidaySlot(data, slotTime)) {
      throw new HttpError(409, `Slot ${slotTime} non disponibile (ferie)`);
    }
    if (bookingsDB.findOne(b => b.giorno === data && b.ora === slotTime)) {
      throw new HttpError(409, `Slot ${slotTime} già occupato`);
    }
  }

  // Ottieni dati utente
  const user = usersDB.findOne(u => u.email === userEmail);
  if (!user) {
    throw new HttpError(404, 'Utente non trovato');
  }

  // Copre anche la prenotazione ospite, che non passa dal middleware di autenticazione
  if (isFlagOn(user.banned)) {
    throw new HttpError(403, 'Account sospeso: impossibile prenotare');
  }

  // Crea prenotazioni per tutti gli slot
  const bookingToken = generateBookingToken();
  const createdBookings = [];

  withTransaction(() =>
    slotsToBook.forEach((slotTime, index) => {
      const booking = {
        nome: user.nome,
        cognome: user.cognome,
        email: user.email,
        telefono: user.telefono,
        giorno: data,
        ora: slotTime,
        token: bookingToken,
        numPersone: groupSize,
        slotIndex: index + 1 // 1, 2, 3 per identificare slot del gruppo
      };

      bookingsDB.insert(booking);
      createdBookings.push(booking);
    })
  );

  // La prima prenotazione è quella principale del gruppo
  return { booking: createdBookings[0], created: true };
}

// Lunedì (YYYY-MM-DD) della settimana di una data: identifica la settimana
function weekKey(dateStr) {
  const date = parseDate(dateStr);
  const offset = (date.getDay() + 6) % 7; // lunedì = 0 ... domenica = 6
  return addDaysToDateString(dateStr, -offset);
}

const SERIES_LENGTHS = [4, 8, 12];

// Prenotazione di lungo periodo: un appuntamento a settimana per 4, 8 o 12 settimane.
// Tutte le settimane vengono create insieme oppure nessuna: se qualcuna non è più
// disponibile si risponde 409 con l'elenco, così il cliente cambia solo quelle.
function createBookingSeries(userEmail, items) {
  if (!Array.isArray(items) || !SERIES_LENGTHS.includes(items.length)) {
    throw new HttpError(400, 'Scegli 4, 8 o 12 appuntamenti');
  }
  if (!items.every(item => item && parseDate(item.data) && isValidTime(item.orario))) {
    throw new HttpError(400, 'Data o orario non validi');
  }
  if (new Set(items.map(item => weekKey(item.data))).size !== items.length) {
    throw new HttpError(400, 'Puoi fissare un solo appuntamento per settimana');
  }

  const conflicts = [];
  const results = [];
  try {
    withTransaction(() => {
      for (const { data, orario } of items) {
        try {
          results.push(createBooking(userEmail, { data, orario, numPersone: 1 }));
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 409) throw error;
          conflicts.push({ data, orario, error: error.message });
        }
      }
      // Annulla anche le settimane già inserite in questa transazione
      if (conflicts.length > 0) throw new HttpError(409, 'conflitti');
    });
  } catch (error) {
    if (conflicts.length === 0) throw error;
    const label = conflicts.length === 1 ? 'Una settimana non è' : 'Alcune settimane non sono';
    throw new HttpError(409, `${label} più disponibile: scegli un altro orario`, { conflicts });
  }

  return {
    bookings: results.map(result => result.booking),
    // solo quelle create ora ricevono l'email di conferma
    createdBookings: results.filter(result => result.created).map(result => result.booking),
    created: results.some(result => result.created)
  };
}

// Prenotazione senza account: profilo ospite e prenotazione nella stessa transazione,
// così una prenotazione rifiutata non lascia profili ospite orfani
function createGuestBooking({ nome, cognome, email, giorno, ora, numPersone }) {
  if (!giorno || !ora) {
    throw new HttpError(400, 'Dati prenotazione incompleti (giorno, ora)');
  }

  return withTransaction(() => {
    const guestEmail = ensureGuestProfile({ nome, cognome, email });
    return createBooking(guestEmail, { data: giorno, orario: ora, numPersone });
  });
}

// Per ogni giorno del mese: true se resta almeno uno slot prenotabile
// (month 1-12; i giorni passati sono sempre false)
function getMonthAvailability(year, month, includeExtraSlots = false) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(400, 'Anno o mese non validi');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const availability = {};
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d) < today) {
      availability[d] = false;
      continue;
    }
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    availability[d] = getAvailableSlots(dateStr, includeExtraSlots).some(slot => slot.available);
  }
  return availability;
}

// Ottieni prenotazioni di un utente
function getUserBookings(userEmail) {
  return bookingsDB.findMany(b => b.email === userEmail);
}

// Cancella prenotazione
function cancelBooking(giorno, ora, userEmail) {
  const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);

  if (!booking) {
    throw new HttpError(404, 'Prenotazione non trovata');
  }

  if (booking.email !== userEmail) {
    throw new HttpError(403, 'Non autorizzato');
  }

  // Un appuntamento già iniziato fa parte dello storico (e dei report): lo modifica
  // solo il salone
  if (slotStart(giorno, ora) <= new Date()) {
    throw new HttpError(400, 'Questo appuntamento è già passato: contatta il salone');
  }

  // Gli slot di una prenotazione di gruppo condividono il token: si liberano tutti insieme
  // (le serie ricorrenti create dall'admin hanno un token di serie e restano escluse)
  const sameGroup = b =>
    !!booking.token &&
    b.token === booking.token &&
    b.email === userEmail &&
    b.giorno === giorno &&
    b.tipo !== 'ricorrente';

  bookingsDB.delete(b => (b.giorno === giorno && b.ora === ora) || sameGroup(b));

  return true;
}

// Sposta una prenotazione del cliente: cancellazione della vecchia e creazione della nuova
// avvengono insieme, quindi se la nuova non è valida la vecchia resta com'era
function rescheduleBooking(userEmail, oldGiorno, oldOra, bookingData) {
  // Retry dopo una risposta persa: la vecchia non c'è più e la nuova è già del cliente
  const oldStillThere = bookingsDB.findOne(b => b.giorno === oldGiorno && b.ora === oldOra);
  if (!oldStillThere && slotStart(bookingData.data, bookingData.orario)) {
    const size = parseGroupSize(bookingData.numPersone);
    const slots = getSlotsForDay(bookingData.data, false);
    const start = slots.indexOf(bookingData.orario);
    const same =
      start !== -1 &&
      findSameGroupBooking(userEmail, bookingData.data, slots.slice(start, start + size));
    if (same) return { booking: same, created: false };
  }

  return withTransaction(() => {
    cancelBooking(oldGiorno, oldOra, userEmail);
    return createBooking(userEmail, bookingData);
  });
}

// Calendario admin per un intervallo di giorni (max 6 settimane): per ogni giorno gli
// slot in vigore (extra compresi), le prenotazioni e le ferie. È l'unica fonte degli
// orari per il pannello, che così non ricalcola le regole nel browser.
const MAX_SCHEDULE_DAYS = 42;

function getAdminSchedule(from, to) {
  const start = typeof from === 'string' && parseDate(from);
  const end = typeof to === 'string' && parseDate(to);
  if (!start || !end || end < start) {
    throw new HttpError(400, 'Intervallo di date non valido');
  }
  const length = Math.round((end - start) / 86400000) + 1;
  if (length > MAX_SCHEDULE_DAYS) {
    throw new HttpError(400, `Intervallo troppo lungo (massimo ${MAX_SCHEDULE_DAYS} giorni)`);
  }

  const { daysOpen } = getBusinessHours();
  const bookings = bookingsDB.readAll();
  const holidays = getHolidays();

  return Array.from({ length }, (_, i) => {
    const date = addDaysToDateString(from, i);
    return {
      date,
      open: daysOpen.includes(parseDate(date).getDay()),
      slots: getSlotsForDay(date, true),
      // quelli prenotabili dai clienti: gli altri sono gli extra dell'admin
      standardSlots: getSlotsForDay(date, false),
      bookings: bookings.filter(b => b.giorno === date),
      holidays: holidays.filter(h => h.giorno === date).map(h => h.ora)
    };
  });
}

// Orari pubblici (pagina d'ingresso): solo i turni standard, senza gli extra VIP
function getPublicHours() {
  const { daysOpen, days } = getBusinessHours();
  const shift = s => (s ? { start: s.start, end: s.end, slots: s.slots } : null);
  const publicDays = {};
  for (const day of daysOpen) {
    const hours = days[day];
    publicDays[day] = { morning: shift(hours?.morning), afternoon: shift(hours?.afternoon) };
  }
  return { daysOpen, days: publicDays };
}

// Ottieni tutte le prenotazioni (per admin)
function getAllBookings() {
  return bookingsDB.readAll();
}

// Aggiunge N giorni a una data 'YYYY-MM-DD' restituendo una nuova stringa 'YYYY-MM-DD'.
// Costruisce la data a partire dai componenti (mezzanotte locale) per evitare
// spostamenti di giorno dovuti al fuso orario, coerentemente con formatDate() del frontend.
function addDaysToDateString(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Crea prenotazione da admin (senza verifica utente)
function createAdminBooking(bookingData) {
  const { nome, cognome, email, telefono, giorno, ora, ricorrente } = bookingData;

  // Validazione (solo cognome, giorno, ora obbligatori per admin)
  if (!cognome || !giorno || !ora) {
    throw new HttpError(400, 'Cognome, giorno e ora sono obbligatori');
  }

  // L'admin può usare orari fuori dal calendario standard, ma in un formato valido
  if (!parseDate(giorno) || !isValidTime(ora)) {
    throw new HttpError(400, 'Data o orario non validi');
  }

  // Se richiesta una prenotazione ricorrente, delega alla logica dedicata
  if (ricorrente) {
    return createRecurringBooking(bookingData);
  }

  // Verifica slot non già occupato
  const existingBooking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
  if (existingBooking) {
    throw new HttpError(409, 'Questo slot è già occupato');
  }

  // Le ferie valgono anche per l'admin, come già per le serie ricorrenti
  if (isHolidaySlot(giorno, ora)) {
    throw new HttpError(409, 'Slot non disponibile (ferie)');
  }

  // Crea prenotazione (campi opzionali possono essere vuoti)
  const booking = {
    nome: nome ? nome.trim() : '',
    cognome: cognome.trim(),
    email: email ? email.trim().toLowerCase() : '',
    telefono: telefono ? telefono.trim() : '',
    giorno,
    ora,
    tipo: 'normale'
  };

  bookingsDB.insert(booking);

  return booking;
}

// Crea una serie di prenotazioni ricorrenti da admin.
// Ripete lo stesso giorno della settimana e stessa ora ogni `intervalloSettimane` (1/2/3)
// settimane, all'interno di una finestra di (mesi * 4) settimane.
// Salta (senza sovrascrivere) le occorrenze il cui slot è già occupato o in ferie.
function createRecurringBooking(bookingData) {
  const { nome, cognome, email, telefono, giorno, ora, mesiRicorrenza, intervalloSettimane } =
    bookingData;

  // Validazione base (come per la prenotazione admin normale)
  if (!cognome || !giorno || !ora) {
    throw new HttpError(400, 'Cognome, giorno e ora sono obbligatori');
  }

  // Validazione numero di mesi (1-12): 1 mese = 4 settimane (finestra temporale)
  const mesi = parseInt(mesiRicorrenza, 10);
  if (!Number.isInteger(mesi) || mesi < 1 || mesi > 12) {
    throw new HttpError(400, 'Numero di mesi non valido (deve essere tra 1 e 12)');
  }

  // Intervallo tra le occorrenze in settimane: 1 (ogni settimana), 2 o 3.
  // Default a 1 per retro-compatibilità se il campo non è fornito.
  const intervallo = [1, 2, 3].includes(parseInt(intervalloSettimane, 10))
    ? parseInt(intervalloSettimane, 10)
    : 1;

  // I mesi definiscono la finestra temporale (mesi * 4 settimane); dentro la finestra
  // l'appuntamento si ripete ogni `intervallo` settimane.
  const settimaneOrizzonte = mesi * 4;
  const totaleOccorrenze = Math.ceil(settimaneOrizzonte / intervallo);

  // Dati cliente condivisi da tutte le occorrenze
  const datiCliente = {
    nome: nome ? nome.trim() : '',
    cognome: cognome.trim(),
    email: email ? email.trim().toLowerCase() : '',
    telefono: telefono ? telefono.trim() : ''
  };

  // Token condiviso: identifica logicamente tutte le occorrenze della serie
  const token = generateBookingToken();

  const inserite = [];
  let saltate = 0;

  // Tutta la serie in una transazione: un errore a metà non lascia occorrenze parziali
  withTransaction(() => {
    for (let i = 0; i < totaleOccorrenze; i++) {
      const dataOccorrenza = addDaysToDateString(giorno, i * intervallo * 7);

      // Salta se lo slot è in ferie o già occupato: non sovrascrivere l'appuntamento esistente
      const occupato =
        isHolidaySlot(dataOccorrenza, ora) ||
        bookingsDB.findOne(b => b.giorno === dataOccorrenza && b.ora === ora);

      if (occupato) {
        saltate++;
        continue;
      }

      const occorrenza = {
        ...datiCliente,
        giorno: dataOccorrenza,
        ora,
        token,
        tipo: 'ricorrente'
      };

      bookingsDB.insert(occorrenza);
      inserite.push(occorrenza);
    }
  });

  // Se ogni occorrenza era occupata/in ferie, non è stata creata nessuna prenotazione
  if (inserite.length === 0) {
    throw new HttpError(
      409,
      'Nessuna occorrenza inserita: tutte le date selezionate sono già occupate o in ferie'
    );
  }

  // Ritorna un riepilogo: prima occorrenza + conteggi inserite/saltate/totale
  return {
    booking: inserite[0],
    inserite: inserite.length,
    saltate,
    totale: totaleOccorrenze
  };
}

// Cancella prenotazione da admin (senza verifica proprietario)
function adminCancelBooking(giorno, ora) {
  if (!giorno || !ora) {
    throw new HttpError(400, 'Giorno e ora sono obbligatori');
  }

  const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
  if (!booking) {
    throw new HttpError(404, 'Prenotazione non trovata');
  }

  bookingsDB.delete(b => b.giorno === giorno && b.ora === ora);

  return true;
}

// Cancella l'intera serie ricorrente identificata dal token condiviso (solo admin).
// Ritorna il numero di occorrenze eliminate.
function adminCancelRecurringSeries(token) {
  if (!token) {
    throw new HttpError(400, 'Token serie non valido');
  }

  const occorrenze = bookingsDB.findMany(b => b.token === token && b.tipo === 'ricorrente');
  if (occorrenze.length === 0) {
    throw new HttpError(404, 'Nessuna prenotazione trovata per la serie');
  }

  bookingsDB.delete(b => b.token === token && b.tipo === 'ricorrente');

  return occorrenze.length;
}

// Sposta prenotazione da admin (cambia giorno/ora)
function moveBooking(oldGiorno, oldOra, newGiorno, newOra) {
  if (!oldGiorno || !oldOra || !newGiorno || !newOra) {
    throw new HttpError(400, 'Tutti i campi sono obbligatori');
  }

  // Come per l'inserimento: orari anche fuori calendario, ma in un formato valido
  if (!parseDate(newGiorno) || !isValidTime(newOra)) {
    throw new HttpError(400, 'Data o orario di destinazione non validi');
  }

  // Trova la prenotazione da spostare
  const booking = bookingsDB.findOne(b => b.giorno === oldGiorno && b.ora === oldOra);
  if (!booking) {
    throw new HttpError(404, 'Prenotazione non trovata');
  }

  // Verifica che il nuovo slot non sia occupato
  const existingBooking = bookingsDB.findOne(b => b.giorno === newGiorno && b.ora === newOra);
  if (existingBooking) {
    throw new HttpError(409, 'Questo slot è già occupato');
  }

  // Verifica che il nuovo slot non sia in ferie
  if (isHolidaySlot(newGiorno, newOra)) {
    throw new HttpError(409, 'Slot non disponibile (ferie)');
  }

  const newBooking = {
    ...booking,
    giorno: newGiorno,
    ora: newOra
  };

  // Spostamento atomico: se l'inserimento fallisce, la vecchia prenotazione non va persa
  withTransaction(() => {
    bookingsDB.delete(b => b.giorno === oldGiorno && b.ora === oldOra);
    bookingsDB.insert(newBooking);
  });

  return newBooking;
}

module.exports = {
  getAvailableSlots,
  getMonthAvailability,
  createGuestBooking,
  createBooking,
  createBookingSeries,
  getAdminSchedule,
  getPublicHours,
  getUserBookings,
  cancelBooking,
  rescheduleBooking,
  getAllBookings,
  createAdminBooking,
  adminCancelBooking,
  adminCancelRecurringSeries,
  moveBooking,
  addDaysToDateString
};
