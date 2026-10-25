// Utility condivise da tutte le pagine (caricato prima degli script di pagina)
const API_BASE = '/api';

// Chiamata all'API JSON del server. Restituisce i dati della risposta oppure lancia un
// Error con un messaggio già adatto all'utente (error.status contiene lo status HTTP).
async function apiRequest(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  } catch (networkError) {
    throw new Error('Impossibile contattare il server. Controlla la connessione e riprova.');
  }

  // Un proxy o un errore del server possono rispondere con HTML invece che JSON
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = new Error((data && data.error) || 'Si è verificato un errore, riprova più tardi');
    error.status = response.status;
    throw error;
  }

  return data;
}

// Neutralizza i caratteri speciali HTML: da usare su ogni dato inserito in innerHTML
// tramite template string (nomi, email, telefoni arrivano da input di utenti e ospiti)
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Durata di un appuntamento (config.appointmentDuration lato server)
const APPOINTMENT_MINUTES = 45;

// true se lo slot `next` ('HH:MM') inizia appena finito `prev`: serve per le
// prenotazioni di gruppo, che non possono scavalcare pause come quella di pranzo
function isFollowingSlot(prev, next) {
  const toMinutes = time => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(next) - toMinutes(prev) === APPOINTMENT_MINUTES;
}

const MONTHS_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre'
];
const DAYS_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

// I messaggi restano visibili finché l'utente non agisce di nuovo (hideMessage)
function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
}

function showSuccess(elementId, message) {
  const successElement = document.getElementById(elementId);
  successElement.textContent = message;
  successElement.classList.remove('hidden');
}

function hideMessage(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add('hidden');
  }
}

// 'YYYY-MM-DD' → "martedì 8 gennaio 2030". La data si costruisce dai componenti:
// new Date('YYYY-MM-DD') è mezzanotte UTC e a ovest di Greenwich cade nel giorno prima.
function formatDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  const date = match ? new Date(match[1], match[2] - 1, match[3]) : new Date(dateString);

  const dayName = DAYS_IT[date.getDay()].toLowerCase();
  const month = MONTHS_IT[date.getMonth()].toLowerCase();
  return `${dayName} ${date.getDate()} ${month} ${date.getFullYear()}`;
}

async function getCurrentUser() {
  try {
    const response = await apiRequest('/auth/me');
    return response.user;
  } catch (error) {
    return null;
  }
}

function redirectToLogin() {
  window.location.href = '/login';
}
