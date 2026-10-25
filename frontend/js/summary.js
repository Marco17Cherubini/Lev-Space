let currentUser = null;
let selectedDate = null;
let selectedTime = null;
let selectedGroupSize = 1;

// Inizializzazione
async function init() {
  try {
    // Verifica autenticazione
    currentUser = await getCurrentUser();
    if (!currentUser) {
      redirectToLogin();
      return;
    }

    // Recupera dati da sessionStorage
    selectedDate = sessionStorage.getItem('selectedDate');
    selectedTime = sessionStorage.getItem('selectedTime');
    selectedGroupSize = parseInt(sessionStorage.getItem('selectedGroupSize')) || 1;

    if (!selectedDate || !selectedTime) {
      // Torna alla dashboard se mancano dati
      window.location.href = '/dashboard';
      return;
    }

    // Mostra riepilogo
    displaySummary();
  } catch (error) {
    console.error('Errore inizializzazione:', error);
    redirectToLogin();
  }
}

// Mostra riepilogo
function displaySummary() {
  // Dati prenotazione
  const formattedDate = formatDate(selectedDate);
  document.getElementById('booking-date').textContent = formattedDate;
  document.getElementById('booking-time').textContent = selectedTime;

  // Dati per il modal
  document.getElementById('modal-date').textContent = formattedDate;
  document.getElementById('modal-time').textContent = selectedTime;

  // Dati cliente
  document.getElementById('customer-name').textContent =
    `${currentUser.nome} ${currentUser.cognome}`;
  document.getElementById('customer-email').textContent = currentUser.email;
  document.getElementById('customer-phone').textContent = currentUser.telefono;
}

// Mostra modal di conferma
function showConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('hidden');
}

// Nascondi modal di conferma
function hideConfirmModal() {
  document.getElementById('confirm-modal').classList.add('hidden');
}

// Click su "Completa Prenotazione" - mostra modal
document.getElementById('complete-booking-btn').addEventListener('click', () => {
  showConfirmModal();
});

// Click su "Annulla" nel modal
document.getElementById('modal-cancel').addEventListener('click', () => {
  hideConfirmModal();
});

// Click sull'overlay del modal - chiude
document.querySelector('.modal-overlay').addEventListener('click', () => {
  hideConfirmModal();
});

// Click su "Sì, Conferma" nel modal - procede con prenotazione
document.getElementById('modal-confirm').addEventListener('click', async () => {
  try {
    const button = document.getElementById('modal-confirm');
    button.disabled = true;
    button.textContent = 'Conferma...';

    hideMessage('error-message');

    // In modifica il server sposta la prenotazione in un'unica operazione:
    // se il nuovo orario non è valido, quella vecchia resta invariata
    const editingBooking = JSON.parse(sessionStorage.getItem('editingBooking') || 'null');
    const newBooking = {
      data: selectedDate,
      orario: selectedTime,
      numPersone: selectedGroupSize
    };

    const response = await apiRequest('/bookings', {
      method: editingBooking ? 'PUT' : 'POST',
      body: JSON.stringify(
        editingBooking
          ? { ...newBooking, oldGiorno: editingBooking.giorno, oldOra: editingBooking.ora }
          : newBooking
      )
    });

    if (response.success) {
      sessionStorage.removeItem('editingBooking');

      // Pulisci sessionStorage
      sessionStorage.removeItem('selectedDate');
      sessionStorage.removeItem('selectedTime');
      sessionStorage.removeItem('selectedGroupSize');

      // Nascondi modal
      hideConfirmModal();

      // Mostra messaggio di conferma
      showSuccessModal();
    }
  } catch (error) {
    console.error('Errore completamento prenotazione:', error);
    hideConfirmModal();
    showError('error-message', error.message);

    const button = document.getElementById('modal-confirm');
    button.disabled = false;
    button.textContent = 'Sì, Conferma';
  }
});

// Mostra modal di successo
function showSuccessModal() {
  // Sostituisci il contenuto del modal con messaggio di successo
  const modalContent = document.querySelector('.modal-content');
  modalContent.innerHTML = `
    <div style="font-size: 4rem; margin-bottom: 20px;">✓</div>
    <h3 class="modal-title" style="color: #000;">Prenotazione Confermata!</h3>
    <p class="modal-text">
      La tua prenotazione è stata registrata con successo.<br><br>
      <strong>Ti aspettiamo da Lev Space!</strong>
    </p>
    <button id="go-home-btn" class="btn" style="background-color: #000; color: #fff; min-width: 150px;">
      Torna alla Home
    </button>
  `;

  document.getElementById('confirm-modal').classList.remove('hidden');

  document.getElementById('go-home-btn').addEventListener('click', () => {
    window.location.href = '/home';
  });
}

// Pulsante indietro - torna al calendario
document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = '/dashboard';
});

// Utility functions locali
// Avvia inizializzazione
init();
