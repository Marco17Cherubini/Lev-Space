// Utility condivise da tutte le pagine (caricato prima degli script di pagina)
const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = 15000;

// Chiamata all'API JSON del server. Restituisce i dati della risposta oppure lancia un
// Error con un messaggio già adatto all'utente (error.status contiene lo status HTTP).
// Con sessionRequired, una sessione scaduta (401) riporta al login e poi a questa pagina.
async function apiRequest(endpoint, { sessionRequired = false, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  } catch (networkError) {
    const error = new Error(
      networkError.name === 'AbortError'
        ? 'Il server non risponde. Controlla la connessione e riprova.'
        : 'Impossibile contattare il server. Controlla la connessione e riprova.'
    );
    error.status = 0;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  // Un proxy o un errore del server possono rispondere con HTML invece che JSON
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401 && sessionRequired) {
      redirectToLogin({ expired: true });
    }
    const error = new Error((data && data.error) || 'Si è verificato un errore, riprova più tardi');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Corpo JSON per apiRequest
const jsonBody = (method, body) => ({ method, body: JSON.stringify(body) });

// Neutralizza i caratteri speciali HTML: da usare su ogni dato inserito in innerHTML
// tramite template string (nomi, email, telefoni arrivano da input di utenti e ospiti)
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== DATE ====================
// Le date viaggiano come 'YYYY-MM-DD' (giorno del salone) e si costruiscono dai
// componenti: new Date('YYYY-MM-DD') è mezzanotte UTC e a ovest di Greenwich cade il giorno prima.

const MONTHS_IT = [
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
const DAYS_IT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const DAYS_SHORT_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function parseISO(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function toISO(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function todayISO() {
  return toISO(new Date());
}

function addDays(dateStr, days) {
  const date = parseISO(dateStr);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

// Lunedì della settimana della data
function mondayOf(dateStr) {
  const offset = (parseISO(dateStr).getDay() + 6) % 7;
  return addDays(dateStr, -offset);
}

// 'YYYY-MM-DD' → "martedì 8 gennaio 2030"
function formatDate(dateStr) {
  const date = parseISO(dateStr);
  if (!date) return dateStr;
  return `${DAYS_IT[date.getDay()]} ${date.getDate()} ${MONTHS_IT[date.getMonth()]} ${date.getFullYear()}`;
}

// 'YYYY-MM-DD' → "mar 8 gen"
function formatDateShort(dateStr) {
  const date = parseISO(dateStr);
  if (!date) return dateStr;
  return `${DAYS_SHORT_IT[date.getDay()].toLowerCase()} ${date.getDate()} ${MONTHS_IT[date.getMonth()].slice(0, 3)}`;
}

// 'YYYY-MM-DD' → "martedì 8 gennaio" (senza anno, per titoli brevi)
function formatDayMonth(dateStr) {
  const date = parseISO(dateStr);
  if (!date) return dateStr;
  return `${DAYS_IT[date.getDay()]} ${date.getDate()} ${MONTHS_IT[date.getMonth()]}`;
}

// Inizio dello slot come Date locale
function slotDate(dateStr, time) {
  const date = parseISO(dateStr);
  const [h, m] = time.split(':').map(Number);
  date.setHours(h, m, 0, 0);
  return date;
}

const isUpcoming = booking => slotDate(booking.giorno, booking.ora) > new Date();

const byDateTime = (a, b) =>
  a.giorno === b.giorno ? a.ora.localeCompare(b.ora) : a.giorno.localeCompare(b.giorno);

// Durata di un appuntamento (config.appointmentDuration lato server)
const APPOINTMENT_MINUTES = 45;

const toMinutes = time => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// true se lo slot `next` ('HH:MM') inizia appena finito `prev`: serve per le
// prenotazioni di gruppo, che non possono scavalcare pause come quella di pranzo
function isFollowingSlot(prev, next) {
  return toMinutes(next) - toMinutes(prev) === APPOINTMENT_MINUTES;
}

// ==================== FEEDBACK ====================

// Messaggio breve non bloccante: gli errori sono annunciati subito dagli screen reader
// (role="alert"), le conferme con cortesia (role="status")
function showToast(message, type = 'error') {
  const regionId = `toast-region-${type}`;
  let region = document.getElementById(regionId);
  if (!region) {
    region = document.createElement('div');
    region.id = regionId;
    region.className = 'toast-region';
    region.setAttribute('role', type === 'error' ? 'alert' : 'status');
    document.body.appendChild(region);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), type === 'error' ? 7000 : 4500);
}

// Pulsante in attesa: disabilitato, con aria-busy e un'etichetta che dice cosa succede
function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.dataset.label || button.textContent.trim();
    if (busyLabel) button.textContent = busyLabel;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
    delete button.dataset.label;
  }
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

// Messaggio di form in un elemento della pagina (role="alert" nell'HTML)
function showMessage(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

// ==================== SESSIONE ====================

async function getCurrentUser() {
  try {
    const response = await apiRequest('/auth/me');
    return response.user;
  } catch (error) {
    return null;
  }
}

// Al login, con la pagina attuale come destinazione dopo l'accesso
function redirectToLogin({ expired = false } = {}) {
  const params = new URLSearchParams({ next: location.pathname + location.search });
  if (expired) params.set('scaduta', '1');
  location.href = `/login?${params}`;
}

// Destinazione sicura dopo il login: solo percorsi di questo sito ("//x" e "/\x"
// sarebbero indirizzi di un altro dominio per il browser)
function safeNextPath(value) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null;
}

// Icone disegnate in SVG, tratto unico da 2px (niente emoji o glifi Unicode)
function icon(name) {
  const paths = {
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    phone:
      '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/>',
    mail: '<path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    repeat:
      '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/>'
  };
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">${paths[name]}</svg>`;
}

// Gli slot di un gruppo (stesso token, stesso giorno) sono un solo appuntamento per il
// cliente: { ...prima prenotazione, persone, ricorrente, slots }, in ordine di data
function groupBookings(bookings) {
  const groups = new Map();
  for (const b of [...bookings].sort(byDateTime)) {
    const key =
      b.token && b.tipo !== 'ricorrente' ? `${b.token} ${b.giorno}` : `${b.giorno} ${b.ora}`;
    const group = groups.get(key);
    if (group) {
      group.persone++;
      group.slots.push(b.ora);
    } else {
      groups.set(key, { ...b, persone: 1, ricorrente: b.tipo === 'ricorrente', slots: [b.ora] });
    }
  }
  return [...groups.values()];
}
