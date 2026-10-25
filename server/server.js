const express = require('express');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const config = require('../config/config');
const { registerUser, loginUser } = require('./authService');
const { authenticateToken } = require('./middleware');
const {
  getAvailableSlots,
  createBooking,
  getUserBookings,
  cancelBooking,
  rescheduleBooking,
  getAllBookings,
  createAdminBooking,
  adminCancelBooking,
  adminCancelRecurringSeries,
  moveBooking
} = require('./bookingService');
const {
  verifyToken,
  isAdmin,
  getAllUsers,
  toggleVip,
  toggleBanned,
  generateResetToken,
  resetPassword
} = require('./authService');
const {
  initializeEmailService,
  sendBookingConfirmation,
  sendPasswordResetEmail
} = require('./emailService');
const { initDatabase, withTransaction } = require('./database');
const { parseDate, isValidTime } = require('./dates');

// ==================== VALIDAZIONE SICUREZZA ====================

// Segnaposto pubblicati in .env.example: chi li conosce può firmare token validi
const PLACEHOLDER_JWT_SECRET = 'CAMBIA_QUESTO_CON_UNA_STRINGA_CASUALE_DI_ALMENO_64_CARATTERI';
const PLACEHOLDER_ADMIN_PASSWORD = 'CambiaMi_ConPassword_Sicura_123!';

// Verifica che JWT_SECRET sia configurato e non sia il segnaposto di esempio
if (!config.jwt.secret || config.jwt.secret === PLACEHOLDER_JWT_SECRET) {
  console.error('❌ ERRORE CRITICO: JWT_SECRET non configurato!');
  console.error('   Imposta JWT_SECRET nel file .env (il valore di .env.example non è valido)');
  console.error(
    "   Genera un secret con: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
  process.exit(1);
}

if (config.jwt.secret.length < 32) {
  console.warn('⚠️  JWT_SECRET è più corto di 32 caratteri: usa una stringa casuale più lunga');
}

if (process.env.ADMIN_PASSWORD === PLACEHOLDER_ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD è ancora il valore di esempio: cambiala nel file .env');
}

const app = express();

// Inizializza servizio email
initializeEmailService();

// Middleware
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

// Rate limiting sugli endpoint esposti ad abusi (tentativi di login, spam di email/prenotazioni)
function createLimiter(limit, error) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error }
  });
}
const authLimiter = createLimiter(
  config.rateLimit.authMax,
  'Troppi tentativi, riprova tra qualche minuto'
);
const guestLimiter = createLimiter(
  config.rateLimit.guestMax,
  'Troppe prenotazioni dallo stesso dispositivo, riprova più tardi'
);

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.server.env === 'production',
  sameSite: 'lax'
};

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ==================== AUTH ROUTES ====================

// POST /api/auth/register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const user = await registerUser(req.body);
    res.status(201).json({ success: true, user });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { user, token, isAdmin } = await loginUser(req.body.email, req.body.password);

    // Set cookie HTTP-only
    res.cookie('token', token, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 giorni
    });

    res.json({ success: true, user, isAdmin });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', SESSION_COOKIE_OPTIONS);
  res.json({ success: true, message: 'Logout effettuato' });
});

// GET /api/auth/me - Ottieni utente corrente
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /api/auth/forgot-password - Richiedi reset password
app.post('/api/auth/forgot-password', authLimiter, (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email obbligatoria' });
    }

    const token = generateResetToken(email);

    if (token) {
      // Costruisci link di reset
      const baseUrl = process.env.BASE_URL || `http://localhost:${config.server.port}`;
      const resetLink = `${baseUrl}/new-password?token=${token}`;

      // Invio in background: attenderlo solo per le email esistenti renderebbe
      // la risposta più lenta e quindi rivelerebbe quali account esistono
      sendPasswordResetEmail(email.trim().toLowerCase(), resetLink).catch(err => {
        console.error('Errore invio email reset:', err.message);
      });
    }

    // Risposta generica (anti-enumerazione)
    res.json({ success: true, message: "Se l'email esiste, riceverai un link di reset." });
  } catch (error) {
    console.error('Errore forgot-password:', error);
    res.status(500).json({ success: false, error: 'Errore interno' });
  }
});

// POST /api/auth/reset-password - Reimposta password con token
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    await resetPassword(token, password);

    res.json({ success: true, message: 'Password aggiornata con successo' });
  } catch (error) {
    console.error('Errore reset-password:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== BOOKING ROUTES ====================

// GET /api/slots/:date - Ottieni slot disponibili per una data
// Gli slot extra (pre-apertura e serali) sono riservati all'admin: i VIP vedono e
// prenotano gli stessi orari degli altri clienti. La sessione qui è facoltativa.
function hasAdminSession(req) {
  const token = req.cookies.token;
  if (!token) return false;
  try {
    const decoded = verifyToken(token);
    return !!decoded.isAdmin && !decoded.purpose && isAdmin(decoded.email);
  } catch (e) {
    return false;
  }
}

// GET /api/availability/:year/:month - Ottieni la disponibilità per un intero mese
app.get('/api/availability/:year/:month', (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month) - 1; // getMonth() returns 0-11

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
      return res.status(400).json({ success: false, error: 'Anno o mese non validi' });
    }

    const includeExtraSlots = hasAdminSession(req);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const availability = {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);

      // Se è nel passato, è false e non calcoliamo
      if (date < today) {
        availability[d] = false;
        continue;
      }

      // Calcoliamo la disponibilità vera
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const slots = getAvailableSlots(dateStr, includeExtraSlots);

      // Controllo che ci sia almeno uno slot disponibile per essere considerato aperto ai click
      availability[d] = slots.some(slot => slot.available);
    }

    res.json({ success: true, availability });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// GET /api/slots/:date - Ottieni slot disponibili per una data
// Per l'admin include anche gli orari extra
app.get('/api/slots/:date', (req, res) => {
  try {
    const slots = getAvailableSlots(req.params.date, hasAdminSession(req));

    // Prevent caching of availability
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    res.json({ success: true, slots });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/bookings - Crea nuova prenotazione
app.post('/api/bookings', authenticateToken, (req, res) => {
  try {
    const booking = createBooking(req.user.email, req.body);

    // Invia email di conferma in background (fire-and-forget)
    // Non blocca la risposta - l'email parte in parallelo
    sendBookingConfirmation(booking)
      .then(result => {
        if (!result.success) {
          console.log('Email non inviata:', result.message);
        }
      })
      .catch(err => {
        console.error('Errore invio email:', err.message);
      });

    // Risposta immediata senza aspettare l'email
    res.status(201).json({
      success: true,
      booking,
      emailSent: 'pending' // L'email è in coda, non aspettiamo
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/bookings - Ottieni prenotazioni dell'utente
app.get('/api/bookings', authenticateToken, (req, res) => {
  try {
    const bookings = getUserBookings(req.user.email);
    res.json({ success: true, bookings });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/bookings - Sposta una propria prenotazione su un nuovo giorno/orario
app.put('/api/bookings', authenticateToken, (req, res) => {
  try {
    const { oldGiorno, oldOra, data, orario, numPersone } = req.body;
    const booking = rescheduleBooking(req.user.email, oldGiorno, oldOra, {
      data,
      orario,
      numPersone
    });

    sendBookingConfirmation(booking).catch(err => {
      console.error('Errore invio email:', err.message);
    });

    res.json({ success: true, booking, emailSent: 'pending' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/bookings - Cancella prenotazione (usando giorno e ora)
app.delete('/api/bookings', authenticateToken, (req, res) => {
  try {
    const { giorno, ora } = req.body;
    cancelBooking(giorno, ora, req.user.email);
    res.json({ success: true, message: 'Prenotazione cancellata' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== GUEST CHECKOUT ====================

const { usersDB } = require('./database');

// POST /api/bookings/guest - Prenotazione rapida senza account
// Richiede solo: nome, cognome, email (niente password)
app.post('/api/bookings/guest', guestLimiter, (req, res) => {
  try {
    const { nome, cognome, email, giorno, ora, numPersone } = req.body;

    // Validazione campi obbligatori
    if (!nome || !cognome || !email) {
      return res.status(400).json({
        success: false,
        error: 'Nome, cognome e email sono obbligatori'
      });
    }

    if (!giorno || !ora) {
      return res.status(400).json({
        success: false,
        error: 'Dati prenotazione incompleti (giorno, ora)'
      });
    }

    // Validazione formato email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Formato email non valido'
      });
    }

    const emailLower = email.trim().toLowerCase();

    // Verifica se l'email esiste gia nel sistema
    let existingUser = usersDB.findOne(u => u.email === emailLower);

    if (!existingUser) {
      // Crea profilo Guest silente (senza password)
      usersDB.insert({
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: emailLower,
        telefono: '',
        password: '',
        vip: '0',
        banned: '0',
        isGuest: '1'
      });
      console.log(`[Guest Checkout] Nuovo profilo guest creato: ${emailLower}`);
    } else if (existingUser.password) {
      // L'email appartiene a un account registrato: senza login chiunque potrebbe
      // prenotare a nome di quel cliente, quindi si chiede di accedere
      return res.status(409).json({
        success: false,
        error: 'Esiste già un account con questa email: accedi per prenotare'
      });
    } else {
      console.log(`[Guest Checkout] Profilo guest esistente, associo prenotazione: ${emailLower}`);
    }

    // Crea la prenotazione usando la logica esistente
    // Mappa giorno->data, ora->orario per compatibilità con createBooking
    const booking = createBooking(emailLower, { data: giorno, orario: ora, numPersone });

    // Invia email di conferma (fire-and-forget)
    sendBookingConfirmation(booking)
      .then(result => {
        if (!result.success) {
          console.log('Email non inviata:', result.message);
        }
      })
      .catch(err => {
        console.error('Errore invio email:', err.message);
      });

    // Risposta immediata - nessun redirect a dashboard
    res.status(201).json({
      success: true,
      booking,
      message: 'Prenotazione confermata! Riceverai una email con i dettagli.',
      emailSent: 'pending'
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== ADMIN ROUTES ====================

// GET /api/admin/settings/hours - Ottieni configurazione orari lavorativi (solo admin)
app.get('/api/admin/settings/hours', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { globalSettingsDB } = require('./database');
    const config = require('../config/config');
    const customHours = globalSettingsDB.get('businessHours');
    res.json({ success: true, businessHours: customHours || config.businessHours });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/admin/settings/hours - Salva configurazione orari lavorativi (solo admin)
app.post('/api/admin/settings/hours', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { globalSettingsDB } = require('./database');
    const newHours = req.body;

    // validazione base
    if (!newHours || !newHours.daysOpen || !newHours.days) {
      return res.status(400).json({ success: false, error: 'Formato inviato non valido' });
    }

    globalSettingsDB.set('businessHours', newHours);
    res.json({ success: true, message: 'Orari aggiornati con successo!' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/admin/bookings - Ottieni tutte le prenotazioni (solo admin)
app.get('/api/admin/bookings', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const bookings = getAllBookings();
    res.json({ success: true, bookings });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/admin/users - Ottieni tutti gli utenti registrati (solo admin)
app.get('/api/admin/users', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const users = getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/admin/bookings - Crea prenotazione da admin (solo admin)
app.post('/api/admin/bookings', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const isRecurring = !!req.body.ricorrente;
    const bookingResult = createAdminBooking(req.body);
    // Per le ricorrenti il servizio ritorna un riepilogo { booking, inserite, saltate, totale }
    const booking = isRecurring ? bookingResult.booking : bookingResult;

    // Invia email di conferma in background (fire-and-forget)
    // Per le serie ricorrenti si conferma la prima occorrenza inserita
    sendBookingConfirmation(booking)
      .then(result => {
        if (!result.success) {
          console.log('Email non inviata:', result.message);
        }
      })
      .catch(err => {
        console.error('Errore invio email:', err.message);
      });

    if (isRecurring) {
      return res.status(201).json({
        success: true,
        booking,
        ricorrente: true,
        inserite: bookingResult.inserite,
        saltate: bookingResult.saltate,
        totale: bookingResult.totale,
        emailSent: 'pending'
      });
    }

    res.status(201).json({ success: true, booking, emailSent: 'pending' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/bookings - Cancella prenotazione da admin (solo admin)
app.delete('/api/admin/bookings', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { giorno, ora, token, scope } = req.body;

    // Cancellazione dell'intera serie ricorrente (scope 'series' + token condiviso)
    if (scope === 'series' && token) {
      const eliminate = adminCancelRecurringSeries(token);
      return res.json({ success: true, message: 'Serie ricorrente cancellata', eliminate });
    }

    // Cancellazione della singola occorrenza (comportamento predefinito)
    adminCancelBooking(giorno, ora);
    res.json({ success: true, message: 'Prenotazione cancellata' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/bookings - Sposta prenotazione da admin (solo admin)
app.put('/api/admin/bookings', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { oldGiorno, oldOra, newGiorno, newOra } = req.body;
    const booking = moveBooking(oldGiorno, oldOra, newGiorno, newOra);
    res.json({ success: true, booking, message: 'Prenotazione spostata' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
// ==================== VIP ROUTES ====================

// PUT /api/admin/users/:email/vip - Toggle VIP status (solo admin)
app.put('/api/admin/users/:email/vip', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const email = decodeURIComponent(req.params.email);
    const isNowVip = toggleVip(email);
    res.json({ success: true, email, vip: isNowVip });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me - includi info VIP nell'utente corrente
// (già gestito da authenticateToken + info utente)

// ==================== HOLIDAYS (FERIE) ROUTES ====================

const { holidaysDB } = require('./database');

// GET /api/holidays - Ottieni tutte le ferie
app.get('/api/holidays', (req, res) => {
  try {
    const holidays = holidaysDB.readAll();
    res.json({ success: true, holidays });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/admin/holidays - Aggiungi ferie (solo admin)
app.post('/api/admin/holidays', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { slots } = req.body; // Array di { giorno, ora }

    const isValidSlot = slot => slot && parseDate(slot.giorno) && isValidTime(slot.ora);
    if (!Array.isArray(slots) || slots.length === 0 || !slots.every(isValidSlot)) {
      return res.status(400).json({ success: false, error: 'Slot ferie non validi' });
    }

    // Aggiungi ogni slot, saltando quelli già in ferie e i doppioni nella richiesta
    const added = [];
    const seen = new Set(holidaysDB.readAll().map(h => `${h.giorno} ${h.ora}`));

    withTransaction(() => {
      for (const { giorno, ora } of slots) {
        const key = `${giorno} ${ora}`;
        if (!seen.has(key)) {
          seen.add(key);
          holidaysDB.insert({ giorno, ora });
          added.push({ giorno, ora });
        }
      }
    });

    res.status(201).json({ success: true, added, count: added.length });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/holidays - Rimuovi ferie (solo admin)
app.delete('/api/admin/holidays', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { slots } = req.body; // Array di { giorno, ora }

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ success: false, error: 'Slot ferie non validi' });
    }

    // Rimuovi ogni slot
    let removed = 0;
    withTransaction(() => {
      for (const slot of slots) {
        const deleted = holidaysDB.delete(h => h.giorno === slot.giorno && h.ora === slot.ora);
        if (deleted) removed++;
      }
    });

    res.json({ success: true, removed });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== FRONTEND ROUTES ====================

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Register page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/register.html'));
});

// Guest Booking - Prenotazione rapida senza account
app.get('/guest-booking', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/guest-booking.html'));
});

// Guest Home - Home page per utenti guest
app.get('/guest-home', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/guest-home.html'));
});

// Home page (dopo login)
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/home.html'));
});

// Dashboard/Calendario (protetta)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// Gestione prenotazioni
app.get('/bookings', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/bookings.html'));
});

// Service selection page
app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/services.html'));
});

// Booking summary page
app.get('/summary', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/summary.html'));
});

// Subscriptions page
app.get('/subscriptions', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/subscriptions.html'));
});

// Subscription booking page
app.get('/subscription-booking', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/subscription-booking.html'));
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Admin VIP page (legacy)
app.get('/admin/vip', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-vip.html'));
});

// Admin Reports page
app.get('/admin/reports', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-reports.html'));
});

// Admin Banned Users page (legacy)
app.get('/admin/banned', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-banned.html'));
});

// Admin Unified Client Management page
app.get('/admin/clienti', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-clienti.html'));
});

// Admin Gestione Oraria page
app.get('/admin/orari', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-orari.html'));
});

// ==================== REPORTS API ====================

const { bookingsDB } = require('./database');

// GET /api/admin/reports/bookings-stats - Statistiche prenotazioni
app.get('/api/admin/reports/bookings-stats', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }

    const period = req.query.period || 'weekly';
    const parsedOffset = Number.parseInt(req.query.offset, 10);
    const offset = Number.isFinite(parsedOffset) ? Math.min(parsedOffset, 0) : 0;
    const allBookings = bookingsDB.readAll();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (period === 'weekly') {
      today.setDate(today.getDate() + offset * 7);
    } else if (period === 'monthly') {
      today.setDate(today.getDate() + offset * 30);
    }

    let startDate,
      labels = [],
      dateFormat;

    if (period === 'weekly') {
      // Ultimi 7 giorni
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 6);

      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        labels.push(dayNames[d.getDay()] + ' ' + d.getDate());
      }
    } else {
      // Ultimi 30 giorni (raggruppati per settimana)
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 29);

      for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        labels.push(d.getDate() + '/' + (d.getMonth() + 1));
      }
    }

    // Conta prenotazioni per ogni giorno
    const counts = labels.map((_, index) => {
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + index);
      const dateStr = [
        targetDate.getFullYear(),
        String(targetDate.getMonth() + 1).padStart(2, '0'),
        String(targetDate.getDate()).padStart(2, '0')
      ].join('-');

      return allBookings.filter(b => b.giorno === dateStr).length;
    });

    res.json({ success: true, labels, counts, period });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== BANNED USERS API ====================

// PUT /api/admin/users/:email/banned - Toggle banned status (solo admin)
app.put('/api/admin/users/:email/banned', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const email = decodeURIComponent(req.params.email);
    const isNowBanned = toggleBanned(email);
    res.json({ success: true, email, banned: isNowBanned });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== PAGE ROUTES ====================

// Serve password reset pages
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/reset-password.html'));
});

app.get('/new-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/new-password.html'));
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato' });
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Errore interno del server' });
});

// ==================== START SERVER ====================

const PORT = config.server.port;

// Inizializza database e poi avvia server.
// Risolve con l'istanza http.Server, così i test possono usare PORT=0 e leggere la porta.
async function startServer() {
  try {
    await initDatabase();

    return await new Promise(resolve => {
      const server = app.listen(PORT, () => {
        console.log(`🚀 Server avviato su http://localhost:${server.address().port}`);
        console.log(`🏪 ${config.studio.name}`);
        resolve(server);
      });
    });
  } catch (error) {
    console.error('❌ Errore avvio server:', error);
    process.exit(1);
  }
}

const serverReady = startServer();

module.exports = { app, serverReady };
