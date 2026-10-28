// Validazione degli orari del salone salvati dall'admin (Gestione Orari).
// Gli orari guidano il calcolo di tutti gli slot: un formato errato
// (es. giorni come stringhe, turni senza slot) chiuderebbe il salone o farebbe
// fallire ogni richiesta, quindi si accetta solo la forma attesa.
const { isValidTime, toMinutes } = require('./dates');
const { globalSettingsDB } = require('./database');
const config = require('../config/config');
const { HttpError } = require('./errors');

const SHIFTS = ['morning', 'afternoon', 'vip'];

const APPOINTMENT_MINUTES = config.appointmentDuration || 45;

const toTime = minutes =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Inizi degli appuntamenti di un turno: ogni 45 minuti da `start`, finché l'appuntamento
// finisce entro `end` (08:30-12:15 → 08:30 ... 11:30). Gli slot si ricavano sempre qui,
// così due appuntamenti dello stesso turno non possono sovrapporsi.
function shiftSlots(start, end) {
  const slots = [];
  for (
    let t = toMinutes(start);
    t + APPOINTMENT_MINUTES <= toMinutes(end);
    t += APPOINTMENT_MINUTES
  ) {
    slots.push(toTime(t));
  }
  return slots;
}

// Gli slot inviati dal client vengono solo validati (compatibilità con il vecchio
// formato), poi sostituiti da quelli calcolati da inizio e fine
function normalizeShift(shift, label) {
  if (shift === null || shift === undefined) return null;

  const { start, end, slots } = shift;
  if (!isValidTime(start) || !isValidTime(end)) {
    throw new HttpError(400, `Turno ${label} non valido`);
  }
  if (slots !== undefined && (!Array.isArray(slots) || !slots.every(isValidTime))) {
    throw new HttpError(400, `Orari non validi nel turno ${label}`);
  }
  const computed = shiftSlots(start, end);
  if (computed.length === 0) {
    throw new HttpError(400, `Il turno ${label} è più corto di un appuntamento`);
  }
  return { start, end, slots: computed };
}

// Restituisce una copia pulita degli orari (solo i campi noti) o lancia un errore
function normalizeBusinessHours(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.daysOpen)) {
    throw new HttpError(400, 'Formato inviato non valido');
  }
  if (!input.days || typeof input.days !== 'object') {
    throw new HttpError(400, 'Formato inviato non valido');
  }

  const isDay = d => Number.isInteger(d) && d >= 0 && d <= 6;
  if (!input.daysOpen.every(isDay)) {
    throw new HttpError(400, 'Giorni di apertura non validi (0 = domenica ... 6 = sabato)');
  }

  const days = {};
  for (const [key, value] of Object.entries(input.days)) {
    const day = Number(key);
    if (!isDay(day)) {
      throw new HttpError(400, `Giorno non valido: ${key}`);
    }
    if (value === null) {
      days[day] = null;
      continue;
    }
    days[day] = {};
    for (const shift of SHIFTS) {
      days[day][shift] = normalizeShift(value[shift], `${shift} del giorno ${day}`);
    }
  }

  return { daysOpen: [...new Set(input.daysOpen)].sort(), days };
}

// Orari in vigore: quelli salvati da Gestione Orari o, al primo avvio, quelli di config.js
function getBusinessHours() {
  return globalSettingsDB.get('businessHours') || config.businessHours;
}

function saveBusinessHours(input) {
  const hours = normalizeBusinessHours(input);
  globalSettingsDB.set('businessHours', hours);
  return hours;
}

module.exports = { normalizeBusinessHours, getBusinessHours, saveBusinessHours };
