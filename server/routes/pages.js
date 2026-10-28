// Pagine HTML servite con URL "puliti" (es. /dashboard invece di /dashboard.html).
// Le pagine stesse verificano la sessione tramite /api/auth/me.
const express = require('express');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '../../frontend');

const PAGES = {
  '/': 'index.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/reset-password': 'reset-password.html',
  '/new-password': 'new-password.html',
  '/guest-booking': 'guest-booking.html',
  '/home': 'home.html',
  '/dashboard': 'dashboard.html',
  '/bookings': 'bookings.html',
  '/subscriptions': 'subscriptions.html',
  '/admin': 'admin.html',
  '/admin/clienti': 'admin-clienti.html',
  '/admin/orari': 'admin-orari.html',
  '/admin/reports': 'admin-reports.html'
};

// Pagine unite ad altre nel redesign: i vecchi link (segnalibri, email) continuano a funzionare
const REDIRECTS = {
  '/guest-home': '/guest-booking',
  '/summary': '/dashboard',
  '/subscription-booking': '/subscriptions'
};

const router = express.Router();

for (const [url, file] of Object.entries(PAGES)) {
  router.get(url, (req, res) => res.sendFile(path.join(FRONTEND_DIR, file)));
}

for (const [from, to] of Object.entries(REDIRECTS)) {
  router.get(from, (req, res) => res.redirect(301, to));
}

module.exports = { router, FRONTEND_DIR };
