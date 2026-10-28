// Errori HTTP condivisi da servizi e rotte.
// I servizi lanciano HttpError con lo status corretto e un messaggio per l'utente;
// tutto il resto (bug, errori SQLite, ecc.) diventa un 500 generico senza dettagli interni.

// details: campi aggiuntivi per il client (es. le settimane in conflitto di una serie)
class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

// Express 4 non intercetta le promise rifiutate: inoltra l'errore al gestore centrale
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: 'Endpoint non trovato' });
}

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ ...err.details, success: false, error: err.message });
  }

  // Errori del parser JSON di Express (corpo malformato, troppo grande, ...)
  if (err.type && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ success: false, error: 'Richiesta non valida' });
  }

  console.error(err);
  res.status(500).json({ success: false, error: 'Errore interno del server' });
}

module.exports = { HttpError, asyncHandler, notFoundHandler, errorHandler };
