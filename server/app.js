// Applicazione Express: middleware comuni, file statici, rotte e gestione errori.
// L'avvio (controlli di configurazione, database, listen) è in server.js.
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const config = require('../config/config');
const { notFoundHandler, errorHandler } = require('./errors');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const { router: pageRoutes, FRONTEND_DIR } = require('./routes/pages');

const app = express();

// Content Security Policy con i default di helmet: script solo da questo server, nessun
// script o handler inline (un eventuale XSS non può eseguire codice iniettato).
// In locale (http) non si forza l'upgrade a https delle risorse.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: config.server.env === 'production' ? [] : null
      }
    }
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

// Chart.js (pagina Report) servito dalla dipendenza npm, con versione fissata nel lockfile
const CHART_JS = path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.min.js');
app.get('/vendor/chart.umd.min.js', (req, res) => res.sendFile(CHART_JS));

app.use(authRoutes);
app.use(bookingRoutes);
app.use(adminRoutes);
app.use(pageRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
