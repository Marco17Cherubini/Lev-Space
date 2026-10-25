// Disponibilità e prenotazioni lato cliente (con account o come ospite)
const express = require('express');
const {
  getAvailableSlots,
  getMonthAvailability,
  createBooking,
  createGuestBooking,
  getUserBookings,
  rescheduleBooking,
  cancelBooking
} = require('../bookingService');
const { getHolidays } = require('../holidayService');
const { sendConfirmationInBackground } = require('../emailService');
const { authenticateToken, isAdminRequest, guestLimiter } = require('../middleware');

const router = express.Router();

// La sessione è facoltativa: gli slot extra (pre-apertura e serali) sono solo per l'admin,
// i VIP vedono gli stessi orari degli altri clienti

router.get('/api/availability/:year/:month', (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);
  const availability = getMonthAvailability(year, month, isAdminRequest(req));
  res.json({ success: true, availability });
});

router.get('/api/slots/:date', (req, res) => {
  const slots = getAvailableSlots(req.params.date, isAdminRequest(req));
  // La disponibilità cambia di continuo: niente cache
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({ success: true, slots });
});

router.get('/api/holidays', (req, res) => {
  res.json({ success: true, holidays: getHolidays() });
});

router.post('/api/bookings', authenticateToken, (req, res) => {
  const booking = createBooking(req.user.email, req.body);
  sendConfirmationInBackground(booking);
  res.status(201).json({ success: true, booking, emailSent: 'pending' });
});

router.get('/api/bookings', authenticateToken, (req, res) => {
  res.json({ success: true, bookings: getUserBookings(req.user.email) });
});

// Sposta una propria prenotazione su un nuovo giorno/orario (operazione atomica)
router.put('/api/bookings', authenticateToken, (req, res) => {
  const { oldGiorno, oldOra, data, orario, numPersone } = req.body;
  const booking = rescheduleBooking(req.user.email, oldGiorno, oldOra, {
    data,
    orario,
    numPersone
  });
  sendConfirmationInBackground(booking);
  res.json({ success: true, booking, emailSent: 'pending' });
});

router.delete('/api/bookings', authenticateToken, (req, res) => {
  const { giorno, ora } = req.body;
  cancelBooking(giorno, ora, req.user.email);
  res.json({ success: true, message: 'Prenotazione cancellata' });
});

// Prenotazione rapida senza account: bastano nome, cognome ed email
router.post('/api/bookings/guest', guestLimiter, (req, res) => {
  const booking = createGuestBooking(req.body);
  sendConfirmationInBackground(booking);
  res.status(201).json({
    success: true,
    booking,
    message: 'Prenotazione confermata! Riceverai una email con i dettagli.',
    emailSent: 'pending'
  });
});

module.exports = router;
