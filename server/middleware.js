const { verifyToken, getUserByEmail, isAdmin } = require('./authService');

// Middleware per autenticazione
function authenticateToken(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Accesso non autorizzato' });
  }

  try {
    const decoded = verifyToken(token);

    // I token con uno scopo dedicato (es. reset password) non valgono come sessione
    if (decoded.purpose) {
      return res.status(401).json({ error: 'Token non valido' });
    }

    // Controlla se è admin (ancora presente in tabella: un admin rimosso perde l'accesso)
    if (decoded.isAdmin) {
      if (!isAdmin(decoded.email)) {
        return res.status(401).json({ error: 'Token non valido' });
      }
      req.user = {
        email: decoded.email,
        isAdmin: true
      };
      return next();
    }

    // Utente normale
    const user = getUserByEmail(decoded.email);

    if (!user) {
      return res.status(401).json({ error: 'Utente non trovato' });
    }

    // Il ban vale anche per le sessioni aperte prima del ban
    if (user.banned === '1' || user.banned === 1) {
      return res.status(403).json({ error: 'Account sospeso' });
    }

    req.user = { ...user, isAdmin: false };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

module.exports = { authenticateToken };
