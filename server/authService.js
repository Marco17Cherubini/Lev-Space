const bcrypt = require('bcryptjs');
const { HttpError } = require('./errors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { usersDB, adminDB, revokedTokensDB } = require('./database');
const config = require('../config/config');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_PATTERN.test(email.trim().toLowerCase());
}

// I flag vip/banned sono salvati come '0'/'1'
const isFlagOn = value => value === '1' || value === 1;

// Utente senza hash della password, come esposto da API e sessione
function toPublicUser(user) {
  const { password: _, ...userWithoutPassword } = user;
  return { ...userWithoutPassword, vip: isFlagOn(user.vip) };
}

// Verifica se è admin (tabella admins)
function isAdmin(email) {
  const admin = adminDB.findOne(a => a.email === email.trim().toLowerCase());
  return !!admin;
}

// Verifica password admin
async function verifyAdminPassword(email, password) {
  const admin = adminDB.findOne(a => a.email === email.trim().toLowerCase());
  if (!admin) return false;

  // Le password admin sono sempre hash bcrypt (vedi initializeDefaultAdmin)
  return bcrypt.compare(password, admin.password);
}

// Registrazione utente
async function registerUser(userData) {
  const { nome, cognome, email, telefono, password } = userData;

  // Validazione base
  const fields = [nome, cognome, email, telefono, password];
  if (fields.some(value => typeof value !== 'string' || !value.trim())) {
    throw new HttpError(400, 'Tutti i campi sono obbligatori');
  }

  const emailLower = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(emailLower)) {
    throw new HttpError(400, 'Formato email non valido');
  }

  if (password.length < 8) {
    throw new HttpError(400, 'La password deve essere di almeno 8 caratteri');
  }

  // Controlla email duplicata (le email sono salvate in minuscolo).
  // Un profilo ospite (creato dal checkout senza password) può invece diventare un account.
  const existingUser = usersDB.findOne(user => user.email === emailLower);
  if (existingUser && existingUser.password) {
    throw new HttpError(409, 'Email già registrata');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = {
    nome: nome.trim(),
    cognome: cognome.trim(),
    email: emailLower,
    telefono: telefono.trim(),
    password: hashedPassword
  };

  if (existingUser) {
    usersDB.update(u => u.email === emailLower, { ...user, isGuest: '0' });
  } else {
    usersDB.insert(user);
  }

  // Ritorna utente senza password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Profilo usato dal checkout ospite: lo crea se l'email è nuova (senza password),
// lo riusa se è già un ospite, rifiuta se appartiene a un account registrato
function ensureGuestProfile({ nome, cognome, email }) {
  if ([nome, cognome, email].some(value => typeof value !== 'string' || !value.trim())) {
    throw new HttpError(400, 'Nome, cognome e email sono obbligatori');
  }
  if (!isValidEmail(email)) {
    throw new HttpError(400, 'Formato email non valido');
  }

  const emailLower = email.trim().toLowerCase();
  const existingUser = usersDB.findOne(u => u.email === emailLower);

  if (existingUser && existingUser.password) {
    // Senza login chiunque potrebbe prenotare a nome di quel cliente
    throw new HttpError(409, 'Esiste già un account con questa email: accedi per prenotare');
  }

  if (!existingUser) {
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
  }

  return emailLower;
}

// Login utente
async function loginUser(email, password) {
  if (!email || !password) {
    throw new HttpError(400, 'Email e password sono obbligatori');
  }

  const emailLower = email.trim().toLowerCase();

  // Prima controlla se è un admin
  const adminCheck = await verifyAdminPassword(emailLower, password);
  if (adminCheck) {
    // È un admin - genera token con flag isAdmin
    const token = signSession({ email: emailLower, isAdmin: true });

    return {
      user: { email: emailLower, isAdmin: true },
      token,
      isAdmin: true
    };
  }

  // Non è admin, cerca tra gli utenti normali
  const user = usersDB.findOne(u => u.email === emailLower);
  if (!user) {
    throw new HttpError(401, 'Credenziali non valide');
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new HttpError(401, 'Credenziali non valide');
  }

  // Il ban si comunica solo dopo la password corretta: prima rivelerebbe
  // a chiunque che l'account esiste
  if (isFlagOn(user.banned)) {
    throw new HttpError(403, 'Account sospeso');
  }

  // Genera JWT token (utente normale). L'impronta della password fa decadere
  // la sessione appena la password cambia (vedi getSessionUser)
  const token = signSession({ email: user.email, isAdmin: false, pwd: passwordFingerprint(user) });

  const { password: _, ...userWithoutPassword } = user;
  return { user: { ...userWithoutPassword, isAdmin: false }, token, isAdmin: false };
}

// Token di sessione: il jti permette di revocarlo singolarmente al logout
function signSession(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    jwtid: crypto.randomUUID()
  });
}

// Logout: il token smette di valere subito, non solo nel browser che cancella il cookie.
// I token emessi prima dell'introduzione del jti non sono revocabili e scadono da soli.
function revokeSession(token) {
  if (!token) return;
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    return; // già scaduto o non valido: non c'è nulla da revocare
  }
  if (decoded.jti && !decoded.purpose) {
    revokedTokensDB.add(decoded.jti, decoded.exp);
  }
}

// Verifica token JWT
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new HttpError(401, 'Token non valido');
  }
}

// Utente della sessione a partire dal token del cookie: lancia 401 se la sessione
// non è valida e 403 se l'account è sospeso
function getSessionUser(token) {
  if (!token) {
    throw new HttpError(401, 'Accesso non autorizzato');
  }

  const decoded = verifyToken(token);

  // I token con uno scopo dedicato (es. reset password) non valgono come sessione
  if (decoded.purpose) {
    throw new HttpError(401, 'Token non valido');
  }

  if (revokedTokensDB.has(decoded.jti)) {
    throw new HttpError(401, 'Sessione chiusa, accedi di nuovo');
  }

  // Admin ancora presente in tabella: un admin rimosso perde l'accesso
  if (decoded.isAdmin) {
    if (!isAdmin(decoded.email)) {
      throw new HttpError(401, 'Token non valido');
    }
    return { email: decoded.email, isAdmin: true };
  }

  const user = usersDB.findOne(u => u.email === decoded.email);
  if (!user) {
    throw new HttpError(401, 'Utente non trovato');
  }

  // Dopo un cambio password le sessioni aperte prima decadono. I token emessi prima
  // dell'introduzione dell'impronta non la contengono e valgono fino alla scadenza.
  if (decoded.pwd !== undefined && decoded.pwd !== passwordFingerprint(user)) {
    throw new HttpError(401, 'Sessione scaduta, accedi di nuovo');
  }

  // Il ban vale anche per le sessioni aperte prima del ban
  if (isFlagOn(user.banned)) {
    throw new HttpError(403, 'Account sospeso');
  }

  return { ...toPublicUser(user), isAdmin: false };
}

// Get all users (per admin - senza password)
function getAllUsers() {
  const users = usersDB.readAll();
  return users.map(toPublicUser);
}

// Imposta VIP o BAN (flag: 'vip' | 'banned'). Con un valore esplicito l'operazione è
// idempotente: un doppio clic o un retry non invertono lo stato. Senza valore resta il
// vecchio comportamento a interruttore, per compatibilità.
function setUserFlag(email, flag, value) {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new HttpError(400, 'Valore non valido: usa true o false');
  }
  const user = usersDB.findOne(u => u.email === email);
  if (!user) {
    throw new HttpError(404, 'Utente non trovato');
  }

  const enabled = value === undefined ? !isFlagOn(user[flag]) : value;
  usersDB.update(u => u.email === email, { [flag]: enabled ? '1' : '0' });
  return enabled;
}

// Impronta della password attuale: inserita nel token di reset, lo invalida
// appena la password cambia, rendendo il link utilizzabile una sola volta
function passwordFingerprint(user) {
  return crypto
    .createHash('sha256')
    .update(user.password || '')
    .digest('hex')
    .slice(0, 16);
}

// Genera token per reset password (JWT con scadenza 1 ora, monouso)
function generateResetToken(email) {
  const emailLower = email.trim().toLowerCase();
  const user = usersDB.findOne(u => u.email === emailLower);

  if (!user) {
    // Non rivelare se l'email esiste o meno
    return null;
  }

  const token = jwt.sign(
    { email: emailLower, purpose: 'password-reset', pwd: passwordFingerprint(user) },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  return token;
}

// Reset password con token
async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw new HttpError(400, 'Token e password sono obbligatori');
  }

  if (newPassword.length < 8) {
    throw new HttpError(400, 'La password deve essere di almeno 8 caratteri');
  }

  // Verifica token
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new HttpError(400, 'Link scaduto o non valido');
  }

  // Verifica che sia un token di reset
  if (decoded.purpose !== 'password-reset') {
    throw new HttpError(400, 'Token non valido');
  }

  // Trova utente
  const user = usersDB.findOne(u => u.email === decoded.email);
  if (!user) {
    throw new HttpError(404, 'Utente non trovato');
  }

  // Link già usato: la password è cambiata dopo l'emissione del token
  if (decoded.pwd !== passwordFingerprint(user)) {
    throw new HttpError(400, 'Link scaduto o non valido');
  }

  // Hash nuova password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Aggiorna password
  usersDB.update(u => u.email === decoded.email, { password: hashedPassword });

  return { success: true, email: decoded.email };
}

module.exports = {
  registerUser,
  loginUser,
  getSessionUser,
  isFlagOn,
  isValidEmail,
  ensureGuestProfile,
  getAllUsers,
  setUserFlag,
  revokeSession,
  generateResetToken,
  resetPassword
};
