const { bookingsDB, usersDB, holidaysDB, globalSettingsDB } = require('./database');
const { generateId } = require('./authService');
const config = require('../config/config');
const crypto = require('crypto');

// Helper
function getBusinessHours() {
  const customHours = globalSettingsDB.get('businessHours');
  return customHours || config.businessHours;
}

// Genera token univoco per gestione prenotazione (32 caratteri hex)
function generateBookingToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Durata standard appuntamento (minuti)
const APPOINTMENT_DURATION = config.appointmentDuration || 45;

function isDayAvailable(date) {
  const dayOfWeek = new Date(date).getDay();
  return getBusinessHours().daysOpen.includes(dayOfWeek);
}

// Verifica se uno slot è in ferie
function isHolidaySlot(date, time) {
  const holidays = holidaysDB.readAll();
  return holidays.some(h => h.giorno === date && h.ora === time);
}

// Ottieni gli slot per un giorno specifico (sabato ha orari diversi)
function getSlotsForDay(date, includeExtraSlots = false) {
  const dayOfWeek = new Date(date).getDay();
  const hours = getBusinessHours().days[dayOfWeek];

  if (!hours) return [];

  let slots = [
    ...(hours.morning ? hours.morning.slots : []),
    ...(hours.afternoon ? hours.afternoon.slots : [])
  ];

  // Se VIP o admin, aggiungi orari extra
  if (includeExtraSlots && hours.vip) {
    const extraSlots = hours.vip.slots || [];
    // Mantieni pre-orario 08:00 fisso o se nel JSON
    if (dayOfWeek !== 0 && !slots.includes('08:00') && !extraSlots.includes('08:00')) {
         slots = ['08:00', ...slots];
    }
    // Aggiungi straordinari
    slots = [...slots, ...extraSlots];
  } else if (includeExtraSlots && !hours.vip) {
    // Fallback legacy se il JSON VIP non è ancora stato salvato tramite la nuova UI
    const preOpeningSlot = ['08:00'];
    const extraSlotsWeekday = ['18:00', '18:45', '19:30', '20:15', '21:00', '21:45', '22:30', '23:15'];
    const extraSlotsSaturday = ['15:30', '16:15', '17:00', '17:45', '18:30', '19:15', '20:00', '20:45', '21:30', '22:15', '23:00'];
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
  const existingBookings = bookingsDB.findMany(
    booking => booking.giorno === date
  );

  const bookedSlots = existingBookings.map(b => b.ora);

  // Trova ferie per questa data
  const holidays = holidaysDB.readAll();
  const holidaySlots = holidays.filter(h => h.giorno === date).map(h => h.ora);

  // Ritorna slot con stato (disponibile, occupato, o ferie)
  const now = new Date(); // Orario server attuale

  return allSlots
    .filter(slot => {
      // Crea data completa dello slot per confronto preciso
      // Assumiamo che date sia formato YYYY-MM-DD e slot HH:MM
      const slotDate = new Date(`${date}T${slot}:00`);

      // Mantiene solo slot futuri
      const keep = slotDate > now;
      if (!keep) {
        // console.log(`[FILTER] Removed past slot ${slot} for ${date} (Server time: ${now.toLocaleTimeString()})`);
      }
      return keep;
    })
    .map(slot => ({
      time: slot,
      available: !bookedSlots.includes(slot) && !holidaySlots.includes(slot),
      isHoliday: holidaySlots.includes(slot)
    }));
}

// Crea una nuova prenotazione (supporta gruppi fino a 3 persone)
function createBooking(userEmail, bookingData) {
  const { data, orario, numPersone = 1 } = bookingData;

  // Validazione
  if (!data || !orario) {
    throw new Error('Data e orario sono obbligatori');
  }

  // Validazione numero persone
  const groupSize = Math.min(Math.max(parseInt(numPersone) || 1, 1), 3);

  // Verifica che il giorno sia disponibile
  if (!isDayAvailable(data)) {
    throw new Error('Il giorno selezionato non è disponibile');
  }

  // Ottieni tutti gli slot per il giorno (i clienti/VIP non accedono agli slot extra)
  const allSlots = getSlotsForDay(data, false);
  const startIndex = allSlots.indexOf(orario);

  if (startIndex === -1) {
    throw new Error('Orario non valido');
  }

  // Verifica che ci siano abbastanza slot consecutivi
  const slotsToBook = [];
  for (let i = 0; i < groupSize; i++) {
    const slotTime = allSlots[startIndex + i];
    if (!slotTime) {
      throw new Error(`Non ci sono abbastanza slot consecutivi disponibili`);
    }

    // Verifica che lo slot non sia in ferie
    if (isHolidaySlot(data, slotTime)) {
      throw new Error(`Slot ${slotTime} non disponibile (ferie)`);
    }

    // Verifica che lo slot sia ancora disponibile
    const existingBooking = bookingsDB.findOne(
      b => b.giorno === data && b.ora === slotTime
    );

    if (existingBooking) {
      throw new Error(`Slot ${slotTime} già occupato`);
    }

    slotsToBook.push(slotTime);
  }

  // Ottieni dati utente
  const user = usersDB.findOne(u => u.email === userEmail);
  if (!user) {
    throw new Error('Utente non trovato');
  }

  // Crea prenotazioni per tutti gli slot
  const bookingToken = generateBookingToken();
  const createdBookings = [];

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
  });

  // Ritorna la prima prenotazione (principale)
  return createdBookings[0];
}

// Ottieni prenotazioni di un utente
function getUserBookings(userEmail) {
  return bookingsDB.findMany(b => b.email === userEmail);
}

// Ottieni statistiche prenotazioni per un utente
function getUserBookingStats(userEmail) {
  const bookings = bookingsDB.findMany(b => b.email === userEmail);

  // Conta prenotazioni e trova ultima data
  let count = bookings.length;
  let lastDate = null;

  bookings.forEach(booking => {
    if (!lastDate || new Date(booking.giorno) > new Date(lastDate)) {
      lastDate = booking.giorno;
    }
  });

  return { count, lastDate };
}

// Ottieni prenotazione per giorno e ora (identificatore univoco)
function getBookingByDateTime(giorno, ora) {
  return bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
}

// Cancella prenotazione
function cancelBooking(giorno, ora, userEmail) {
  const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);

  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  if (booking.email !== userEmail) {
    throw new Error('Non autorizzato');
  }

  // Elimina la prenotazione dal CSV
  bookingsDB.delete(b => b.giorno === giorno && b.ora === ora);

  return true;
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
    throw new Error('Cognome, giorno e ora sono obbligatori');
  }

  // Se richiesta una prenotazione ricorrente, delega alla logica dedicata
  if (ricorrente) {
    return createRecurringBooking(bookingData);
  }

  // Verifica slot non già occupato
  const existingBooking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
  if (existingBooking) {
    throw new Error('Questo slot è già occupato');
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

// Crea una serie di prenotazioni ricorrenti (settimanali) da admin.
// Ripete lo stesso giorno della settimana e stessa ora per (mesi * 4) settimane.
// Salta (senza sovrascrivere) le settimane il cui slot è già occupato o in ferie.
function createRecurringBooking(bookingData) {
  const { nome, cognome, email, telefono, giorno, ora, mesiRicorrenza } = bookingData;

  // Validazione base (come per la prenotazione admin normale)
  if (!cognome || !giorno || !ora) {
    throw new Error('Cognome, giorno e ora sono obbligatori');
  }

  // Validazione numero di mesi (1-12): 1 mese = 4 settimane
  const mesi = parseInt(mesiRicorrenza, 10);
  if (!Number.isInteger(mesi) || mesi < 1 || mesi > 12) {
    throw new Error('Numero di mesi non valido (deve essere tra 1 e 12)');
  }

  const settimane = mesi * 4;

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

  for (let i = 0; i < settimane; i++) {
    const dataOccorrenza = addDaysToDateString(giorno, i * 7);

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

  // Se ogni settimana era occupata/in ferie, non è stata creata nessuna occorrenza
  if (inserite.length === 0) {
    throw new Error('Nessuna occorrenza inserita: tutte le date selezionate sono già occupate o in ferie');
  }

  // Ritorna un riepilogo: prima occorrenza + conteggi inserite/saltate/totale
  return {
    booking: inserite[0],
    inserite: inserite.length,
    saltate,
    totale: settimane
  };
}

// Cancella prenotazione da admin (senza verifica proprietario)
function adminCancelBooking(giorno, ora) {
  if (!giorno || !ora) {
    throw new Error('Giorno e ora sono obbligatori');
  }

  const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  bookingsDB.delete(b => b.giorno === giorno && b.ora === ora);

  return true;
}

// Cancella l'intera serie ricorrente identificata dal token condiviso (solo admin).
// Ritorna il numero di occorrenze eliminate.
function adminCancelRecurringSeries(token) {
  if (!token) {
    throw new Error('Token serie non valido');
  }

  const occorrenze = bookingsDB.findMany(b => b.token === token && b.tipo === 'ricorrente');
  if (occorrenze.length === 0) {
    throw new Error('Nessuna prenotazione trovata per la serie');
  }

  bookingsDB.delete(b => b.token === token && b.tipo === 'ricorrente');

  return occorrenze.length;
}

// Sposta prenotazione da admin (cambia giorno/ora)
function moveBooking(oldGiorno, oldOra, newGiorno, newOra) {
  if (!oldGiorno || !oldOra || !newGiorno || !newOra) {
    throw new Error('Tutti i campi sono obbligatori');
  }

  // Trova la prenotazione da spostare
  const booking = bookingsDB.findOne(b => b.giorno === oldGiorno && b.ora === oldOra);
  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  // Verifica che il nuovo slot non sia occupato
  const existingBooking = bookingsDB.findOne(b => b.giorno === newGiorno && b.ora === newOra);
  if (existingBooking) {
    throw new Error('Questo slot è già occupato');
  }

  // Verifica che il nuovo slot non sia in ferie
  if (isHolidaySlot(newGiorno, newOra)) {
    throw new Error('Slot non disponibile (ferie)');
  }

  // Elimina la vecchia prenotazione
  bookingsDB.delete(b => b.giorno === oldGiorno && b.ora === oldOra);

  // Crea la nuova prenotazione con i nuovi dati
  const newBooking = {
    ...booking,
    giorno: newGiorno,
    ora: newOra
  };

  bookingsDB.insert(newBooking);

  return newBooking;
}

// ==================== GESTIONE VIA TOKEN (Smart Rescheduling) ====================

// Ottieni prenotazione tramite token univoco
function getBookingByToken(token) {
  if (!token) return null;
  return bookingsDB.findOne(b => b.token === token);
}

// Aggiorna prenotazione tramite token (cambio data/ora)
function updateBookingByToken(token, updates) {
  const booking = getBookingByToken(token);
  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  const { newGiorno, newOra } = updates;

  // Verifica politica 24h: non modificabile entro 24h dall'appuntamento
  const bookingDate = new Date(booking.giorno + 'T' + booking.ora.replace(':', '') + ':00');
  const now = new Date();
  const hoursUntilBooking = (bookingDate - now) / (1000 * 60 * 60);

  if (hoursUntilBooking < 24) {
    throw new Error('Non e possibile modificare la prenotazione entro 24 ore dall\'appuntamento');
  }

  // Se cambia data/ora, verifica disponibilita
  if (newGiorno && newOra && (newGiorno !== booking.giorno || newOra !== booking.ora)) {
    // Verifica slot non occupato
    const existingBooking = bookingsDB.findOne(b =>
      b.giorno === newGiorno && b.ora === newOra && b.token !== token
    );
    if (existingBooking) {
      throw new Error('Questo slot e gia occupato');
    }

    // Verifica non in ferie
    if (isHolidaySlot(newGiorno, newOra)) {
      throw new Error('Slot non disponibile (ferie)');
    }
  }

  // Elimina vecchia prenotazione
  bookingsDB.delete(b => b.token === token);

  // Crea nuova con dati aggiornati (mantiene lo stesso token)
  const updatedBooking = {
    nome: booking.nome,
    cognome: booking.cognome,
    email: booking.email,
    telefono: booking.telefono,
    giorno: newGiorno || booking.giorno,
    ora: newOra || booking.ora,
    token: booking.token
  };

  bookingsDB.insert(updatedBooking);

  return updatedBooking;
}

// Cancella prenotazione tramite token
function cancelBookingByToken(token) {
  const booking = getBookingByToken(token);
  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  // Verifica politica 24h
  const bookingDate = new Date(booking.giorno + 'T' + booking.ora.replace(':', '') + ':00');
  const now = new Date();
  const hoursUntilBooking = (bookingDate - now) / (1000 * 60 * 60);

  if (hoursUntilBooking < 24) {
    throw new Error('Non e possibile cancellare la prenotazione entro 24 ore dall\'appuntamento');
  }

  bookingsDB.delete(b => b.token === token);
  return true;
}

module.exports = {
  isDayAvailable,
  getAvailableSlots,
  createBooking,
  getUserBookings,
  getUserBookingStats,
  getBookingByDateTime,
  cancelBooking,
  getAllBookings,
  createAdminBooking,
  createRecurringBooking,
  adminCancelBooking,
  adminCancelRecurringSeries,
  moveBooking,
  getBookingByToken,
  updateBookingByToken,
  cancelBookingByToken,
  generateBookingToken
};
