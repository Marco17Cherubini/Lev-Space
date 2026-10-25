// ============================================================================
// SUBSCRIPTIONS.JS - Gestione selezione tipo abbonamento
// ============================================================================

(function () {
  'use strict';

  // Gestione selezione abbonamento
  function initSubscriptionCards() {
    const cards = document.querySelectorAll('.subscription-card');

    cards.forEach(card => {
      card.addEventListener('click', () => {
        const type = card.dataset.type;
        const weeks = parseInt(card.dataset.weeks);

        // Salva in sessionStorage
        sessionStorage.setItem('subscriptionType', type);
        sessionStorage.setItem('subscriptionWeeks', weeks);
        sessionStorage.setItem('subscriptionBookings', JSON.stringify([]));
        sessionStorage.setItem('subscriptionCurrentWeek', '0');

        // Redirect al calendario abbonamenti
        window.location.href = '/subscription-booking';
      });

      // Effetto hover migliorato
      card.addEventListener('mouseenter', () => {
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      card.addEventListener('mouseleave', () => {
        card.classList.remove('selected');
      });
    });
  }

  // Init
  async function init() {
    const user = await requireAuth();
    if (!user) return;

    initSubscriptionCards();
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
