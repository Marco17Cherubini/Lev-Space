// Sheet su <dialog> nativo: showModal() dà già focus confinato, Esc e inert sul resto
// della pagina. Qui si aggiungono la chiusura toccando lo sfondo, il ritorno del focus
// e il pulsante Indietro del telefono, che chiude lo sheet invece di lasciare la pagina.
const Sheet = (function () {
  const stack = [];

  function open(dialog) {
    if (dialog.open) return;
    dialog._returnFocus = document.activeElement;
    dialog.showModal();
    stack.push(dialog);
    history.pushState({ sheet: dialog.id }, '');
    const autofocus = dialog.querySelector('[autofocus]');
    if (autofocus) autofocus.focus();
  }

  // fromHistory: chiusura provocata dal pulsante Indietro (la voce è già stata tolta)
  function close(dialog, { fromHistory = false } = {}) {
    if (!dialog.open) return;
    dialog.close();
    const index = stack.indexOf(dialog);
    if (index !== -1) stack.splice(index, 1);
    if (!fromHistory && history.state && history.state.sheet === dialog.id) {
      history.back();
    }
    const target = dialog._returnFocus;
    if (target && document.contains(target)) target.focus();
  }

  window.addEventListener('popstate', () => {
    const top = stack[stack.length - 1];
    if (top) close(top, { fromHistory: true });
  });

  // Tocco sullo sfondo: il bersaglio è il dialog stesso, non il suo contenuto
  document.addEventListener('click', event => {
    if (event.target instanceof HTMLDialogElement && event.target.classList.contains('sheet')) {
      close(event.target);
    }
    const closer = event.target.closest('[data-sheet-close]');
    if (closer) close(closer.closest('dialog'));
  });

  // Esc chiude passando da close(), così anche la cronologia resta coerente
  document.addEventListener(
    'cancel',
    event => {
      if (event.target.classList && event.target.classList.contains('sheet')) {
        event.preventDefault();
        close(event.target);
      }
    },
    true
  );

  // Conferma per le azioni distruttive: risolve true solo con il pulsante di conferma
  function confirm({ title, message, confirmLabel, danger = true }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'sheet';
    dialog.id = `confirm-${Date.now()}`;
    dialog.setAttribute('aria-labelledby', `${dialog.id}-title`);
    dialog.innerHTML = `
      <div class="sheet__inner">
        <h2 id="${dialog.id}-title">${escapeHtml(title)}</h2>
        <p class="serif">${escapeHtml(message)}</p>
        <div class="actions">
          <button type="button" class="btn ${danger ? 'btn--danger-solid' : 'btn--primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
          <button type="button" class="btn" data-sheet-close autofocus>Annulla</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    return new Promise(resolve => {
      let confirmed = false;
      dialog.querySelector('[data-confirm]').addEventListener('click', () => {
        confirmed = true;
        close(dialog);
      });
      dialog.addEventListener('close', () => {
        resolve(confirmed);
        dialog.remove();
      });
      open(dialog);
    });
  }

  return { open, close, confirm };
})();
