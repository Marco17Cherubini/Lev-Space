let currentUser = null;

// Inizializzazione
async function init() {
  try {
    currentUser = await requireAuth();
    if (!currentUser) return;

    // Carica prenotazioni
    await loadBookings();
  } catch (error) {
    console.error('Errore inizializzazione:', error);
    redirectToLogin();
  }
}

// Carica prenotazioni utente
async function loadBookings() {
  try {
    const response = await apiRequest('/bookings');

    const bookingsList = document.getElementById('bookings-list');
    const noBookings = document.getElementById('no-bookings');

    // Filtra solo prenotazioni future
    const now = new Date();
    const activeBookings = response.bookings
      .filter(booking => {
        // Costruisci data appuntamento (es. "2023-10-25T14:30:00")
        const bookingDate = new Date(`${booking.giorno}T${booking.ora}:00`);
        return bookingDate >= now;
      })
      .sort((a, b) => {
        // Ordina per data crescente (più vicini prima)
        return new Date(`${a.giorno}T${a.ora}:00`) - new Date(`${b.giorno}T${b.ora}:00`);
      });

    if (activeBookings.length === 0) {
      bookingsList.classList.add('hidden');
      noBookings.classList.remove('hidden');
      return;
    }

    bookingsList.innerHTML = activeBookings
      .map(booking => {
        return `
      <div class="card booking-card" data-giorno="${escapeHtml(booking.giorno)}" data-ora="${escapeHtml(booking.ora)}">
        <div class="booking-info">
          <div class="card-title">Appuntamento</div>
          <div class="booking-details">
            <div><strong>Data:</strong> ${escapeHtml(formatDate(booking.giorno))}</div>
            <div><strong>Orario:</strong> ${escapeHtml(booking.ora)}</div>
          </div>
        </div>
        <div class="booking-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn btn-edit" data-action="edit">
            Modifica
          </button>
          <button type="button" class="btn btn-cancel" data-action="delete">
            Cancella
          </button>
        </div>
      </div>
    `;
      })
      .join('');
  } catch (error) {
    console.error('Errore caricamento prenotazioni:', error);
    document.getElementById('bookings-list').innerHTML =
      '<div class="alert">Errore nel caricamento delle prenotazioni</div>';
  }
}

// Pulsanti Modifica/Cancella delle card (delegazione: le card vengono ridisegnate)
document.getElementById('bookings-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { giorno, ora } = button.closest('.booking-card').dataset;
  if (button.dataset.action === 'edit') {
    editBooking(giorno, ora);
  } else {
    showDeleteConfirm(giorno, ora);
  }
});

// Funzione per modificare una prenotazione
function editBooking(giorno, ora) {
  // Salva la prenotazione da modificare in sessionStorage
  sessionStorage.setItem('editingBooking', JSON.stringify({ giorno, ora }));

  // Reindirizza al calendario per selezionare nuovo appuntamento
  window.location.href = '/dashboard';
}

// Variabili per la cancellazione
let bookingToDelete = null;

// Mostra modal di conferma cancellazione
function showDeleteConfirm(giorno, ora) {
  bookingToDelete = { giorno, ora };

  // Popola i dettagli
  document.getElementById('delete-booking-details').innerHTML = `
    <div><strong>Data:</strong> ${escapeHtml(formatDate(giorno))}</div>
    <div><strong>Orario:</strong> ${escapeHtml(ora)}</div>
  `;

  // Mostra modal
  document.getElementById('delete-confirm-modal').classList.remove('hidden');
}

// Chiudi modal
function closeDeleteModal() {
  document.getElementById('delete-confirm-modal').classList.add('hidden');
  bookingToDelete = null;
}

// Event listeners per i pulsanti del modal
document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
document.getElementById('delete-confirm').addEventListener('click', executeDelete);

// Chiudi modal cliccando sull'overlay
document
  .querySelector('#delete-confirm-modal .modal-overlay')
  .addEventListener('click', closeDeleteModal);

// Esegui cancellazione
async function executeDelete() {
  if (!bookingToDelete) return;

  const deleteBtn = document.getElementById('delete-confirm');
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Cancellazione...';

  try {
    await apiRequest('/bookings', {
      method: 'DELETE',
      body: JSON.stringify(bookingToDelete)
    });

    // Chiudi modal e ricarica lista
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Sì, Cancella';
    closeDeleteModal();
    await loadBookings();
  } catch (error) {
    console.error('Errore cancellazione:', error);
    alert('Errore nella cancellazione: ' + error.message);
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Sì, Cancella';
  }
}

// Avvia inizializzazione
init();
