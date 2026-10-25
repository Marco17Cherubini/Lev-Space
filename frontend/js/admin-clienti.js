// Gestione Clienti: stato VIP e BAN con modifiche confermate in blocco
let allUsers = [];
let originalStatus = {}; // { email: { vip: bool, banned: bool } }
let pendingChanges = {}; // { email: { vip?: bool, banned?: bool } }

// Carica utenti
async function loadUsers() {
  try {
    const data = await apiRequest('/admin/users');
    allUsers = data.users || [];

    // Salva stato originale
    allUsers.forEach(user => {
      originalStatus[user.email] = {
        vip: user.vip === '1' || user.vip === 1 || user.vip === true,
        banned: user.banned === '1' || user.banned === 1 || user.banned === true
      };
    });

    pendingChanges = {};
    renderUsers(allUsers);
    updateConfirmBar();
  } catch (error) {
    console.error('Errore:', error);
    document.getElementById('users-list').innerHTML =
      '<div class="no-users">Errore nel caricamento degli utenti</div>';
  }
}

// Ottieni stato corrente (originale + pending)
function getCurrentStatus(email) {
  const original = originalStatus[email] || { vip: false, banned: false };
  const pending = pendingChanges[email] || {};
  return {
    vip: Object.hasOwn(pending, 'vip') ? pending.vip : original.vip,
    banned: Object.hasOwn(pending, 'banned') ? pending.banned : original.banned
  };
}

// Renderizza lista utenti
function renderUsers(users) {
  const container = document.getElementById('users-list');
  const countEl = document.getElementById('users-count');

  // Conta VIP e bannati
  let vipCount = 0,
    bannedCount = 0;
  users.forEach(u => {
    const status = getCurrentStatus(u.email);
    if (status.vip) vipCount++;
    if (status.banned) bannedCount++;
  });

  countEl.textContent = `${users.length} clienti (${vipCount} VIP, ${bannedCount} bannati)`;

  if (users.length === 0) {
    container.innerHTML = '<div class="no-users">Nessun cliente trovato</div>';
    return;
  }

  container.innerHTML = users
    .map(user => {
      const original = originalStatus[user.email] || { vip: false, banned: false };
      const current = getCurrentStatus(user.email);
      const pending = pendingChanges[user.email] || {};

      // Determina classi e badge pendenti
      let pendingClass = '';
      let pendingBadges = '';

      if (Object.hasOwn(pending, 'vip')) {
        if (pending.vip && !original.vip) {
          pendingClass += ' pending-vip-add';
          pendingBadges += '<span class="pending-badge vip-add">+ VIP</span>';
        } else if (!pending.vip && original.vip) {
          pendingClass += ' pending-vip-remove';
          pendingBadges += '<span class="pending-badge vip-remove">- VIP</span>';
        }
      }

      if (Object.hasOwn(pending, 'banned')) {
        if (pending.banned && !original.banned) {
          pendingClass += ' pending-ban-add';
          pendingBadges += '<span class="pending-badge ban-add">+ BAN</span>';
        } else if (!pending.banned && original.banned) {
          pendingClass += ' pending-ban-remove';
          pendingBadges += '<span class="pending-badge ban-remove">- BAN</span>';
        }
      }

      // Badge attuali
      let currentBadges = '';
      if (current.vip) currentBadges += '<span class="badge badge-vip">VIP</span>';
      if (current.banned) currentBadges += '<span class="badge badge-banned">BAN</span>';

      return `
              <div class="user-item${pendingClass}" data-email="${escapeHtml(user.email)}">
                  <div class="user-info">
                      <span class="user-name">${escapeHtml(user.cognome)} ${escapeHtml(user.nome)}</span>
                      <div class="user-badges">${currentBadges}</div>
                      ${pendingBadges}
                  </div>
                  <div class="user-actions">
                      <div class="action-group">
                          <span class="action-label vip">VIP</span>
                          <input type="checkbox" class="action-checkbox vip" 
                                 data-email="${escapeHtml(user.email)}" data-type="vip"
                                 ${current.vip ? 'checked' : ''}>
                      </div>
                      <div class="action-group">
                          <span class="action-label ban">BAN</span>
                          <input type="checkbox" class="action-checkbox ban" 
                                 data-email="${escapeHtml(user.email)}" data-type="banned"
                                 ${current.banned ? 'checked' : ''}>
                      </div>
                  </div>
              </div>
          `;
    })
    .join('');

  // Event listeners per checkbox
  document.querySelectorAll('.action-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleCheckboxChange);
  });
}

// Gestisce cambio checkbox
function handleCheckboxChange(e) {
  const email = e.target.dataset.email;
  const type = e.target.dataset.type; // 'vip' o 'banned'
  const newValue = e.target.checked;
  const originalValue = originalStatus[email]?.[type] || false;

  if (!pendingChanges[email]) {
    pendingChanges[email] = {};
  }

  // Se il nuovo valore è uguale all'originale, rimuovi dalle modifiche pendenti
  if (newValue === originalValue) {
    delete pendingChanges[email][type];
    // Se non ci sono più modifiche per questo utente, rimuovi l'oggetto
    if (Object.keys(pendingChanges[email]).length === 0) {
      delete pendingChanges[email];
    }
  } else {
    pendingChanges[email][type] = newValue;
  }

  // Re-render
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const filtered = query
    ? allUsers.filter(
        user =>
          user.nome.toLowerCase().includes(query) || user.cognome.toLowerCase().includes(query)
      )
    : allUsers;
  renderUsers(filtered);
  updateConfirmBar();
}

// Aggiorna barra conferma
function updateConfirmBar() {
  const bar = document.getElementById('confirm-bar');
  const countEl = document.getElementById('changes-count');

  let changeCount = 0;
  Object.values(pendingChanges).forEach(changes => {
    changeCount += Object.keys(changes).length;
  });

  if (changeCount > 0) {
    bar.classList.add('visible');
    countEl.textContent = changeCount === 1 ? '1 modifica' : `${changeCount} modifiche`;
  } else {
    bar.classList.remove('visible');
  }
}

// Conferma tutte le modifiche
async function confirmChanges() {
  const confirmBtn = document.getElementById('confirm-changes-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Salvataggio...';

  try {
    // Esegui tutte le modifiche
    for (const [email, changes] of Object.entries(pendingChanges)) {
      if (Object.hasOwn(changes, 'vip')) {
        await apiRequest(`/admin/users/${encodeURIComponent(email)}/vip`, { method: 'PUT' });
      }
      if (Object.hasOwn(changes, 'banned')) {
        await apiRequest(`/admin/users/${encodeURIComponent(email)}/banned`, { method: 'PUT' });
      }
    }

    // Ricarica utenti per avere stato aggiornato
    await loadUsers();
  } catch (error) {
    console.error('Errore:', error);
    alert('Errore nel salvataggio delle modifiche: ' + error.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Conferma';
  }
}

// Annulla modifiche
function cancelChanges() {
  pendingChanges = {};
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const filtered = query
    ? allUsers.filter(
        user =>
          user.nome.toLowerCase().includes(query) || user.cognome.toLowerCase().includes(query)
      )
    : allUsers;
  renderUsers(filtered);
  updateConfirmBar();
}

// Ricerca
document.getElementById('search-input').addEventListener('input', e => {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    renderUsers(allUsers);
    return;
  }

  const filtered = allUsers.filter(
    user => user.nome.toLowerCase().includes(query) || user.cognome.toLowerCase().includes(query)
  );

  renderUsers(filtered);
});

// Event listeners bottoni conferma
document.getElementById('confirm-changes-btn').addEventListener('click', confirmChanges);
document.getElementById('cancel-changes-btn').addEventListener('click', cancelChanges);

// Init
requireAuth({ admin: true }).then(user => user && loadUsers());
