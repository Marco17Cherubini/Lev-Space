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

module.exports = { authenticateToken, requireAdmin, isAdminRequest };
