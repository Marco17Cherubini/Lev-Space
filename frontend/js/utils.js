// Utility functions
const API_BASE = '/api';

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Si è verificato un errore');
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

function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');

  setTimeout(() => {
    errorElement.classList.add('hidden');
  }, 5000);
}

function showSuccess(elementId, message) {
  const successElement = document.getElementById(elementId);
  successElement.textContent = message;
  successElement.classList.remove('hidden');

  setTimeout(() => {
    successElement.classList.add('hidden');
  }, 5000);
}

function hideMessage(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add('hidden');
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const months = [
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

  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${dayName} ${day} ${month} ${year}`;
}

function formatDateShort(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
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

function redirectToDashboard() {
  window.location.href = '/dashboard';
}
