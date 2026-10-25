const dotenv = require('dotenv');

dotenv.config();

// Orari, slot e date sono quelli del salone: si fissa il fuso prima di qualsiasi
// calcolo, altrimenti su un host in UTC (es. Railway) gli slot già iniziati
// resterebbero prenotabili per 1-2 ore. Sovrascrivibile con TZ nel .env.
process.env.TZ = process.env.TZ || 'Europe/Rome';

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '7d'
  },
  // Richieste consentite per IP nella finestra temporale (login/registrazione/reset e ospiti)
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX) || 20,
    guestMax: Number(process.env.RATE_LIMIT_GUEST_MAX) || 10
  },
  // Tempi di conservazione dei dati personali (Privacy Policy, sezione 10)
  retention: {
    registeredMonths: 24,
    guestMonths: 12,
    // Cancellazione automatica ogni 24 ore; RETENTION_ENABLED=false la disattiva
    enabled: process.env.RETENTION_ENABLED !== 'false'
  },
  studio: {
    name: process.env.STUDIO_NAME || 'Lev Space',
    phone: process.env.STUDIO_PHONE || '+39 123 456 7890',
    address: process.env.STUDIO_ADDRESS || 'Via Example 123, 00100 Roma, Italia'
  },
  businessHours: {
    daysOpen: [1, 2, 3, 4, 5, 6], // lunedì-sabato
    // Orari per giorno della settimana (1=lunedì ... 6=sabato)
    days: {
      // Lunedì: solo pomeriggio (ultimo appuntamento 16:15, chiusura 17:00)
      1: {
        morning: null,
        afternoon: {
          start: '14:00',
          end: '17:00',
          slots: ['14:00', '14:45', '15:30', '16:15']
        }
      },
      // Martedì: mattina 8:30-12:15 + pomeriggio 14:00-17:00 (ultimo appuntamento 16:15)
      2: {
        morning: {
          start: '08:30',
          end: '12:15',
          slots: ['08:30', '09:15', '10:00', '10:45', '11:30']
        },
        afternoon: {
          start: '14:00',
          end: '17:00',
          slots: ['14:00', '14:45', '15:30', '16:15']
        }
      },
      // Mercoledì: solo pomeriggio 14:00-17:00 (ultimo appuntamento 16:15)
      3: {
        morning: null,
        afternoon: {
          start: '14:00',
          end: '17:00',
          slots: ['14:00', '14:45', '15:30', '16:15']
        }
      },
      // Giovedì: mattina 8:30-12:15 + pomeriggio 14:00-16:15 (ultimo appuntamento 15:30)
      4: {
        morning: {
          start: '08:30',
          end: '12:15',
          slots: ['08:30', '09:15', '10:00', '10:45', '11:30']
        },
        afternoon: {
          start: '14:00',
          end: '16:15',
          slots: ['14:00', '14:45', '15:30']
        }
      },
      // Venerdì: solo pomeriggio (ultimo appuntamento 14:45, chiusura 15:30)
      5: {
        morning: null,
        afternoon: {
          start: '14:00',
          end: '15:30',
          slots: ['14:00', '14:45']
        }
      },
      // Sabato: solo mattina 9:15-12:15
      6: {
        morning: {
          start: '09:15',
          end: '12:15',
          slots: ['09:15', '10:00', '10:45', '11:30']
        },
        afternoon: null
      }
    }
  },
  // Campo services rimosso - non più utilizzato
  appointmentDuration: 45 // Durata standard appuntamento in minuti
};
