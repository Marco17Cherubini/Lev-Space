const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '7d'
  },
  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM
  },
  studio: {
    name: process.env.STUDIO_NAME || 'Lev Space',
    phone: process.env.STUDIO_PHONE || '+39 123 456 7890',
    address: process.env.STUDIO_ADDRESS || 'Via Example 123, 00100 Roma, Italia'
  },
  database: {
    usersFile: path.join(__dirname, '../database/users.csv'),
    bookingsFile: path.join(__dirname, '../database/bookings.csv'),
    adminFile: path.join(__dirname, '../database/admin.csv'),
    holidaysFile: path.join(__dirname, '../database/holidays.csv')
  },
  businessHours: {
    daysOpen: [1, 2, 3, 4, 5, 6], // lunedì-sabato
    // Orari per giorno della settimana (1=lunedì ... 6=sabato)
    days: {
      // Lunedì: solo pomeriggio 14:00-18:00 (ultimo appuntamento 17:00)
      1: {
        morning: null,
        afternoon: {
          start: '14:00',
          end: '18:00',
          slots: ['14:00', '14:45', '15:30', '16:15', '17:00']
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
      // Venerdì: solo pomeriggio 14:00-16:15 (ultimo appuntamento 15:30)
      5: {
        morning: null,
        afternoon: {
          start: '14:00',
          end: '16:15',
          slots: ['14:00', '14:45', '15:30']
        }
      },
      // Sabato: mattina 9:15-12:15 + pomeriggio 14:00-14:45 (ultimo appuntamento 14:00)
      6: {
        morning: {
          start: '09:15',
          end: '12:15',
          slots: ['09:15', '10:00', '10:45', '11:30']
        },
        afternoon: {
          start: '14:00',
          end: '14:45',
          slots: ['14:00']
        }
      }
    }
  },
  // Campo services rimosso - non più utilizzato
  appointmentDuration: 45 // Durata standard appuntamento in minuti
};
