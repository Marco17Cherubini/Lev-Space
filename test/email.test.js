// Modelli delle email: contenuto, escape dei dati utente, nessun invio reale
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv } = require('./helpers');

configureTestEnv();
const { bookingConfirmationHtml, passwordResetHtml } = require('../server/emailService');

test('la conferma riporta giorno, ora e persone del turno', () => {
  const html = bookingConfirmationHtml({
    nome: 'Luca',
    giorno: '2031-10-30',
    ora: '14:45',
    numPersone: 2
  });
  assert.match(html, /Giovedì 30 ottobre 2031/);
  assert.match(html, />14:45</);
  assert.match(html, /2 persone/);
  assert.match(html, /\/bookings/);
});

test('i dati inseriti dagli utenti vengono neutralizzati nell’HTML', () => {
  const html = bookingConfirmationHtml({
    nome: '<img src=x onerror=alert(1)>',
    giorno: '2031-10-30',
    ora: '14:45'
  });
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x/);
});

test('l’email di reset contiene il link e la sua durata', () => {
  const html = passwordResetHtml('https://example.test/new-password?token=abc.def');
  assert.match(html, /new-password\?token=abc\.def/);
  assert.match(html, /un'ora/);
});
