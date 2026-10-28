const { Resend } = require('resend');
const config = require('../config/config');
const { parseDate } = require('./dates');

// Resend client
let resend = null;

function initializeEmailService() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('⚠️  RESEND_API_KEY non configurata. Email notifications disabled.');
    console.warn('   Ottieni una API key gratuita su https://resend.com');
    return;
  }

  resend = new Resend(apiKey);
  console.log('✅ Email service (Resend) initialized');
}

// I dati della prenotazione arrivano da input utente: vanno neutralizzati nell'HTML
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre'
];

// 'YYYY-MM-DD' → "Venerdì 30 ottobre 2026"
function formatDate(dateString) {
  const date = parseDate(dateString);
  if (!date) return dateString;
  const text = `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function baseUrl() {
  return (process.env.BASE_URL || `http://localhost:${config.server.port}`).replace(/\/$/, '');
}

// ==================== MODELLO EMAIL ====================
// Le email hanno lo stesso mondo dell'app ("Il tuo turno"): la testata nera del
// distributore con la spia rossa e un biglietto di carta. Solo tabelle e stili in linea,
// perché i client di posta ignorano fogli di stile e font esterni.
const INK = '#161618';
const PAPER = '#fafaf8';
const GROUND = '#efefec';
const PANEL = '#121214';
const LED = '#ff4a1f';
const MUTED = '#4a4a50';
const DASH = '#c9c9c4';
const FONT = "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";

function layout({ preheader, body }) {
  const studio = escapeHtml(config.studio.name);
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${studio}</title>
</head>
<body style="margin:0;padding:0;background:${GROUND};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
      <tr><td style="background:${PANEL};padding:16px 24px;font-family:${FONT};font-size:20px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#ededea;">
        <span style="display:inline-block;width:10px;height:10px;background:${LED};margin-right:10px;"></span>${studio}
      </td></tr>
      <tr><td style="background:${PANEL};padding:0 24px;"><div style="height:8px;background:#1f1f23;"></div></td></tr>
      ${body}
      <tr><td style="padding:20px 24px;font-family:${FONT};font-size:14px;line-height:1.5;color:${MUTED};">
        Per assistenza: <strong style="color:${INK};">${escapeHtml(config.studio.phone)}</strong><br>
        ${studio} · niente coda, niente chiamate.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// Il biglietto: carta, riga tratteggiata, l'orario grande come sul display
function ticket(rows) {
  return `<tr><td style="background:${PAPER};padding:24px;font-family:${FONT};color:${INK};">${rows}</td></tr>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;">
    <tr><td style="background:${LED};text-align:center;">
      <a href="${escapeHtml(href)}" style="display:block;padding:16px;font-family:${FONT};font-size:18px;font-weight:bold;text-transform:uppercase;color:${PANEL};text-decoration:none;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

// Email di conferma: { nome, giorno, ora, numPersone }
function bookingConfirmationHtml(booking) {
  const people = Number(booking.numPersone) > 1 ? `${Number(booking.numPersone)} persone` : '';
  const rows = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Il tuo turno</td>
        <td align="right" style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(config.studio.name)}</td>
      </tr>
    </table>
    <div style="border-top:2px dashed ${DASH};margin:12px 0 16px;"></div>
    <p style="margin:0 0 4px;font-size:16px;color:${MUTED};">Ciao ${escapeHtml(booking.nome || '')}, ti aspettiamo</p>
    <p style="margin:0;font-size:22px;font-weight:bold;">${escapeHtml(formatDate(booking.giorno))}</p>
    <p style="margin:8px 0 0;font-size:72px;line-height:1;font-weight:bold;letter-spacing:-2px;">${escapeHtml(booking.ora)}</p>
    ${people ? `<p style="margin:12px 0 0;font-size:14px;font-weight:bold;color:${MUTED};">${escapeHtml(people)}</p>` : ''}
    <div style="border-top:2px dashed ${DASH};margin:20px 0 0;"></div>
    <p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:${MUTED};">Per spostarlo o cancellarlo entra nella tua area. Se hai prenotato senza account, chiamaci.</p>
    ${button(`${baseUrl()}/bookings`, 'I tuoi turni')}`;
  return layout({
    preheader: `${formatDate(booking.giorno)} alle ${booking.ora}`,
    body: ticket(rows)
  });
}

function passwordResetHtml(resetLink) {
  const rows = `
    <p style="margin:0 0 8px;font-size:26px;font-weight:bold;">Nuova password</p>
    <p style="margin:0;font-size:16px;line-height:1.5;color:${MUTED};">Hai chiesto di reimpostare la password. Il link vale un'ora e si può usare una volta sola.</p>
    ${button(resetLink, 'Scegli la nuova password')}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${MUTED};word-break:break-all;">Se il pulsante non funziona copia questo indirizzo nel browser:<br>${escapeHtml(resetLink)}</p>
    <div style="border-top:2px dashed ${DASH};margin:20px 0 0;"></div>
    <p style="margin:16px 0 0;font-size:14px;color:${MUTED};">Non sei stato tu? Ignora questa email: la password resta quella di prima.</p>`;
  return layout({ preheader: 'Il link per scegliere una nuova password', body: ticket(rows) });
}

// ==================== INVIO ====================

const fromEmail = () => process.env.EMAIL_FROM || 'Lev Space <onboarding@resend.dev>';

async function send({ to, subject, html, label }) {
  if (!resend) {
    console.log(`📧 Email service not configured. Skipping ${label}.`);
    return { success: false, message: 'Email service not configured' };
  }
  try {
    console.log(`📧 Invio ${label} a: ${to}`);
    const { data, error } = await resend.emails.send({
      from: fromEmail(),
      to: [to],
      subject,
      html
    });
    if (error) {
      console.error('❌ Errore Resend:', error.message);
      return { success: false, message: error.message };
    }
    console.log(`✅ Email inviata! ID: ${data.id}`);
    return { success: true, message: 'Email inviata con successo' };
  } catch (error) {
    console.error(`❌ Errore invio ${label}:`, error.message);
    return { success: false, message: error.message };
  }
}

// Invia email di conferma prenotazione
function sendBookingConfirmation(booking) {
  return send({
    to: booking.email,
    subject: `Il tuo turno: ${formatDate(booking.giorno)}, ${booking.ora} - ${config.studio.name}`,
    html: bookingConfirmationHtml(booking),
    label: 'conferma prenotazione'
  });
}

// Invia email per reset password
function sendPasswordResetEmail(email, resetLink) {
  return send({
    to: email,
    subject: `Reimposta la tua password - ${config.studio.name}`,
    html: passwordResetHtml(resetLink),
    label: 'reset password'
  });
}

// Invio senza attendere l'esito: la risposta all'utente non dipende dal provider email
function sendConfirmationInBackground(booking) {
  if (!booking.email) return; // prenotazione admin senza email
  sendBookingConfirmation(booking)
    .then(result => {
      if (!result.success) {
        console.log('Email non inviata:', result.message);
      }
    })
    .catch(err => {
      console.error('Errore invio email:', err.message);
    });
}

module.exports = {
  initializeEmailService,
  sendConfirmationInBackground,
  sendBookingConfirmation,
  sendPasswordResetEmail,
  bookingConfirmationHtml,
  passwordResetHtml
};
