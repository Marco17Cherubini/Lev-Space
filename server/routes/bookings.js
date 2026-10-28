// Disponibilità e prenotazioni lato cliente (con account o come ospite)
const express = require('express');
const {
  getAvailableSlots,
  getMonthAvailability,
  getPublicHours,
  createBooking,
  createBookingSeries,
  createGuestBooking,
  getUserBookings,
  rescheduleBooking,
  cancelBooking
} = require('../bookingService');
const { getHolidays } = require('../holidayService');
const { sendConfirmationInBackground } = require('../emailService');
const { authenticateToken, isAdminRequest, guestLimiter } = require('../middleware');

const router = express.Router();

// Risposta a una prenotazione: 201 se è stata creata ora; 200 senza nuova email se era
// già stata registrata (doppio invio o retry dopo una risposta persa)
// Con publicOnly (ospiti, senza sessione) un retry restituisce solo giorno e ora: chi
// conosce l'email di un ospite non deve poter leggere i dati della sua prenotazione
function sendBookingResult(res, { booking, created }, { publicOnly = false, ...extra } = {}) {
  if (created) sendConfirmationInBackground(booking);
  const visible = !created && publicOnly ? { giorno: booking.giorno, ora: booking.ora } : booking;
  res.status(created ? 201 : 200).json({
    success: true,
    booking: visible,
    alreadyBooked: !created,
    emailSent: created ? 'pending' : 'skipped',
    ...extra
  });
}

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

// Orari di apertura per la pagina pubblica (senza gli extra VIP)
router.get('/api/hours', (req, res) => {
  res.json({ success: true, ...getPublicHours() });
});

router.post('/api/bookings', authenticateToken, (req, res) => {
  sendBookingResult(res, createBooking(req.user.email, req.body));
});

// Lungo periodo: tutte le settimane in un'unica operazione (vedi createBookingSeries)
router.post('/api/bookings/series', authenticateToken, (req, res) => {
  const { bookings, createdBookings, created } = createBookingSeries(
    req.user.email,
    req.body.bookings
  );
  createdBookings.forEach(sendConfirmationInBackground);
  res.status(created ? 201 : 200).json({ success: true, bookings, alreadyBooked: !created });
});

router.get('/api/bookings', authenticateToken, (req, res) => {
  res.json({ success: true, bookings: getUserBookings(req.user.email) });
});

// Sposta una propria prenotazione su un nuovo giorno/orario (operazione atomica)
router.put('/api/bookings', authenticateToken, (req, res) => {
  const { oldGiorno, oldOra, data, orario, numPersone } = req.body;
  const result = rescheduleBooking(req.user.email, oldGiorno, oldOra, {
    data,
    orario,
    numPersone
  });
  if (result.created) sendConfirmationInBackground(result.booking);
  res.json({ success: true, booking: result.booking, alreadyBooked: !result.created });
});

router.delete('/api/bookings', authenticateToken, (req, res) => {
  const { giorno, ora } = req.body;
  cancelBooking(giorno, ora, req.user.email);
  res.json({ success: true, message: 'Prenotazione cancellata' });
});

// Prenotazione rapida senza account: bastano nome, cognome ed email
router.post('/api/bookings/guest', guestLimiter, (req, res) => {
  sendBookingResult(res, createGuestBooking(req.body), {
    publicOnly: true,
    message: 'Prenotazione confermata! Riceverai una email con i dettagli.'
  });
});

module.exports = router;
