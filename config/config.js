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
    // Orari martedì-venerdì
    weekday: {
      morning: {
        start: '08:30',
        end: '13:00',
        slots: ['08:30', '09:15', '10:00', '10:45', '11:30', '12:15']
      },
      afternoon: {
        start: '14:00',
        end: '18:00',
        slots: ['14:00', '14:45', '15:30', '16:15', '17:00']
      }
    },
    // Orari sabato (giorno 6)
    saturday: {
      morning: {
        start: '08:30',
        end: '13:00',
        slots: ['08:30', '09:15', '10:00', '10:45', '11:30', '12:15']
      },
      afternoon: {
        start: '14:00',
        end: '15:30',
        slots: ['14:00', '14:45']
      }
    }
  },
  // Campo services rimosso - non più utilizzato
  appointmentDuration: 45 // Durata standard appuntamento in minuti
};
