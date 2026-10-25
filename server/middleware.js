const rateLimit = require('express-rate-limit');
const config = require('../config/config');
const { getSessionUser } = require('./authService');
const { HttpError } = require('./errors');

// Richiede una sessione valida: imposta req.user oppure risponde 401/403
function authenticateToken(req, res, next) {
  try {
    req.user = getSessionUser(req.cookies.token);
    next();
  } catch (error) {
    next(error);
  }
}

// Da usare dopo authenticateToken sulle rotte del pannello admin
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return next(new HttpError(403, 'Accesso negato'));
  }
  next();
}

// Sessione facoltativa: true solo per un admin con sessione valida
// (es. per mostrare gli orari extra riservati all'admin)
function isAdminRequest(req) {
  try {
    return getSessionUser(req.cookies.token).isAdmin;
  } catch (error) {
    return false;
  }
}

// Rate limiting per IP sugli endpoint esposti ad abusi (tentativi di login, spam di email/prenotazioni)
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

module.exports = { authenticateToken, requireAdmin, isAdminRequest, authLimiter, guestLimiter };
