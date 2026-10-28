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

// Protezione CSRF in profondità, oltre a SameSite=Lax: le richieste che modificano dati
// devono arrivare da questa stessa origine e, se hanno un corpo, essere JSON (che un form
// o un fetch "semplice" di un altro sito non possono inviare senza preflight CORS).
// SameSite da solo non basta contro un sito dello stesso "site" (es. un sottodominio).
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);
const PUBLIC_HOST = (() => {
  try {
    return process.env.BASE_URL ? new URL(process.env.BASE_URL).host : null;
  } catch (error) {
    return null;
  }
})();

function isSameOriginHost(req, origin) {
  let host;
  try {
    host = new URL(origin).host;
  } catch (error) {
    return false;
  }
  // Dietro il proxy di Railway l'host pubblico può arrivare in X-Forwarded-Host
  const forwardedHost = req.app.get('trust proxy') ? req.get('x-forwarded-host') : null;
  return [req.get('host'), forwardedHost, PUBLIC_HOST].includes(host);
}

function rejectCrossSiteRequests(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const fetchSite = req.get('sec-fetch-site');
  const origin = req.get('origin');
  if (
    (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite)) ||
    (origin && !isSameOriginHost(req, origin))
  ) {
    return next(new HttpError(403, 'Richiesta non consentita da questa origine'));
  }

  const hasBody = Number(req.get('content-length')) > 0 || req.get('transfer-encoding');
  if (hasBody && !req.is('application/json')) {
    return next(new HttpError(415, 'Formato della richiesta non supportato'));
  }
  next();
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

module.exports = {
  authenticateToken,
  requireAdmin,
  isAdminRequest,
  rejectCrossSiteRequests,
  authLimiter,
  guestLimiter
};
