// Applicazione Express: middleware comuni, file statici, rotte e gestione errori.
// L'avvio (controlli di configurazione, database, listen) è in server.js.
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const config = require('../config/config');
const { notFoundHandler, errorHandler } = require('./errors');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const { router: pageRoutes, FRONTEND_DIR } = require('./routes/pages');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false // Disabilita per permettere inline scripts
  })
);

// L'API accetta solo JSON: niente parser urlencoded, così un form HTML
// di un altro sito non può inviare richieste valide (CSRF)
app.use(express.json());
app.use(cookieParser());

// In produzione (Railway) l'app è dietro un proxy: serve per leggere l'IP reale del client
if (config.server.env === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.static(FRONTEND_DIR));

app.use(authRoutes);
app.use(bookingRoutes);
app.use(adminRoutes);
app.use(pageRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
