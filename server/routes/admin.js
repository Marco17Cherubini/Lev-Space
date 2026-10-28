// Pannello admin: calendario, clienti, ferie, orari e report (tutte le rotte richiedono l'admin)
const express = require('express');
const {
  getAllBookings,
  createAdminBooking,
  adminCancelBooking,
  adminCancelRecurringSeries,
  moveBooking,
  getAdminSchedule
} = require('../bookingService');
const { getAllUsers, setUserFlag } = require('../authService');
const { addHolidays, removeHolidays } = require('../holidayService');
const { getBusinessHours, saveBusinessHours } = require('../businessHours');
const { getBookingStats } = require('../reportService');
const { sendConfirmationInBackground } = require('../emailService');
const { authenticateToken, requireAdmin } = require('../middleware');

const router = express.Router();
const adminOnly = [authenticateToken, requireAdmin];

// ==================== PRENOTAZIONI ====================

router.get('/api/admin/bookings', adminOnly, (req, res) => {
  res.json({ success: true, bookings: getAllBookings() });
});

// Agenda: giorni dell'intervallo con slot, prenotazioni e ferie (vedi getAdminSchedule)
router.get('/api/admin/schedule', adminOnly, (req, res) => {
  res.json({ success: true, days: getAdminSchedule(req.query.from, req.query.to) });
});

router.post('/api/admin/bookings', adminOnly, (req, res) => {
  const result = createAdminBooking(req.body);

  // Per le serie ricorrenti il servizio restituisce un riepilogo
  // { booking, inserite, saltate, totale }: si conferma la prima occorrenza
  if (req.body.ricorrente) {
    sendConfirmationInBackground(result.booking);
    return res.status(201).json({
      success: true,
      booking: result.booking,
      ricorrente: true,
      inserite: result.inserite,
      saltate: result.saltate,
      totale: result.totale,
      emailSent: 'pending'
    });
  }

  sendConfirmationInBackground(result);
  res.status(201).json({ success: true, booking: result, emailSent: 'pending' });
});

router.delete('/api/admin/bookings', adminOnly, (req, res) => {
  const { giorno, ora, token, scope } = req.body;

  // Cancellazione dell'intera serie ricorrente (scope 'series' + token condiviso)
  if (scope === 'series' && token) {
    const eliminate = adminCancelRecurringSeries(token);
    return res.json({ success: true, message: 'Serie ricorrente cancellata', eliminate });
  }

  adminCancelBooking(giorno, ora);
  res.json({ success: true, message: 'Prenotazione cancellata' });
});

router.put('/api/admin/bookings', adminOnly, (req, res) => {
  const { oldGiorno, oldOra, newGiorno, newOra } = req.body;
  const booking = moveBooking(oldGiorno, oldOra, newGiorno, newOra);
  res.json({ success: true, booking, message: 'Prenotazione spostata' });
});

// ==================== CLIENTI (VIP / BAN) ====================

router.get('/api/admin/users', adminOnly, (req, res) => {
  res.json({ success: true, users: getAllUsers() });
});

// Corpo { vip: true|false } / { banned: true|false }; senza corpo inverte lo stato
for (const flag of ['vip', 'banned']) {
  router.put(`/api/admin/users/:email/${flag}`, adminOnly, (req, res) => {
    const email = decodeURIComponent(req.params.email);
    const value = req.body ? req.body[flag] : undefined;
    res.json({ success: true, email, [flag]: setUserFlag(email, flag, value) });
  });
}

// ==================== FERIE ====================

router.post('/api/admin/holidays', adminOnly, (req, res) => {
  const added = addHolidays(req.body.slots);
  res.status(201).json({ success: true, added, count: added.length });
});

router.delete('/api/admin/holidays', adminOnly, (req, res) => {
  res.json({ success: true, removed: removeHolidays(req.body.slots) });
});

// ==================== ORARI E REPORT ====================

router.get('/api/admin/settings/hours', adminOnly, (req, res) => {
  res.json({ success: true, businessHours: getBusinessHours() });
});

router.post('/api/admin/settings/hours', adminOnly, (req, res) => {
  saveBusinessHours(req.body);
  res.json({ success: true, message: 'Orari aggiornati con successo!' });
});

router.get('/api/admin/reports/bookings-stats', adminOnly, (req, res) => {
  const offset = Number.parseInt(req.query.offset, 10);
  res.json({
    success: true,
    ...getBookingStats(req.query.period || 'weekly', Number.isFinite(offset) ? offset : 0)
  });
});

module.exports = router;
