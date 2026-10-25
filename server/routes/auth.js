// Registrazione, login/logout, sessione corrente e reset password
const express = require('express');
const config = require('../../config/config');
const { registerUser, loginUser, generateResetToken, resetPassword } = require('../authService');
const { sendPasswordResetEmail } = require('../emailService');
const { authenticateToken, authLimiter } = require('../middleware');
const { HttpError, asyncHandler } = require('../errors');

const router = express.Router();

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.server.env === 'production',
  sameSite: 'lax'
};
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // come config.jwt.expiresIn

router.post(
  '/api/auth/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const user = await registerUser(req.body);
    res.status(201).json({ success: true, user });
  })
);

router.post(
  '/api/auth/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { user, token, isAdmin } = await loginUser(req.body.email, req.body.password);
    res.cookie('token', token, { ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
    res.json({ success: true, user, isAdmin });
  })
);

router.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', SESSION_COOKIE_OPTIONS);
  res.json({ success: true, message: 'Logout effettuato' });
});

router.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

router.post('/api/auth/forgot-password', authLimiter, (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    throw new HttpError(400, 'Email obbligatoria');
  }

  const token = generateResetToken(email);
  if (token) {
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
});

router.post(
  '/api/auth/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    await resetPassword(token, password);
    res.json({ success: true, message: 'Password aggiornata con successo' });
  })
);

module.exports = router;
