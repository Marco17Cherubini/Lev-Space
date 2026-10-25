/**
 * Accessibilità dei modal (.modal) senza cambiarne markup o stile.
 * Le pagine aprono e chiudono i modal togliendo/aggiungendo la classe .hidden
 * (direttamente o tramite la classe Modal): qui si osserva quel cambio e si gestiscono
 * ruolo e titolo del dialog, focus iniziale, Tab confinato nel dialog,
 * Escape (equivale al pulsante di annullamento) e ritorno del focus alla chiusura.
 */
(function () {
  const FOCUSABLE = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function focusableIn(container) {
    return [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  }

  function setupDialog(modal) {
    const content = modal.querySelector('.modal-content') || modal;
    const title = modal.querySelector('.modal-title');

    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (title) {
      title.id = title.id || `${modal.id}-title`;
      modal.setAttribute('aria-labelledby', title.id);
    }
    content.setAttribute('tabindex', '-1');

    let previousFocus = null;

    function onKeydown(event) {
      if (event.key === 'Escape') {
        // I modal gestiti dalla classe Modal chiudono da soli; gli altri usano il loro
        // pulsante di annullamento (un modal senza annullamento richiede una scelta)
        const cancel = modal.querySelector('.modal-btn-cancel');
        if (!modal.hasAttribute('data-modal-managed') && cancel) {
          event.preventDefault();
          cancel.click();
        }
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusableIn(content);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onShown() {
      previousFocus = document.activeElement;
      modal.addEventListener('keydown', onKeydown);
      const target = content.querySelector('[autofocus]') || focusableIn(content)[0] || content;
      target.focus();
    }

    function onHidden() {
      modal.removeEventListener('keydown', onKeydown);
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus();
      }
      previousFocus = null;
    }

    const isOpen = () => !modal.classList.contains('hidden');
    let wasOpen = isOpen();
    if (wasOpen) onShown();

    new MutationObserver(() => {
      const open = isOpen();
      if (open !== wasOpen) {
        wasOpen = open;
        if (open) {
          onShown();
        } else {
          onHidden();
        }
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  document.querySelectorAll('.modal').forEach(setupDialog);
})();
