// Report: grafico delle prenotazioni per giorno con navigazione tra i periodi
/* global Chart -- caricato da /vendor/chart.umd.min.js */
// Global state
let chart = null;
let currentChartData = null;
let currentPeriodOffset = 0;

function updatePeriodNavigation() {
  document.getElementById('next-period').disabled = currentPeriodOffset >= 0;
}

async function loadStats(period = 'weekly', offset = currentPeriodOffset) {
  try {
    currentChartData = await apiRequest(
      `/admin/reports/bookings-stats?period=${period}&offset=${offset}`
    );
    renderChart(currentChartData);
    updateStats(currentChartData);
  } catch (error) {
    console.error('Errore:', error);
  }
}

function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (isDark) {
    return {
      grid: '#60a5fa', // Light Blue Grid
      text: '#ffffff', // White Text
      barBg: '#60a5fa', // Light Blue Bars (matching requested style)
      barBorder: '#3b82f6'
    };
  }

  return {
    grid: '#e5e7eb',
    text: '#666666',
    barBg: '#fef3c7',
    barBorder: '#f59e0b'
  };
}

function renderChart(data) {
  if (!data) return;

  const ctx = document.getElementById('bookings-chart').getContext('2d');
  const colors = getChartColors();

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Tagli Effettuati',
          data: data.counts,
          backgroundColor: colors.barBg,
          borderColor: colors.barBorder,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: colors.text
          },
          grid: {
            color: colors.grid,
            borderColor: colors.grid
          }
        },
        x: {
          ticks: {
            color: colors.text
          },
          grid: {
            color: colors.grid,
            borderColor: colors.grid
          }
        }
      }
    }
  });
}

function updateStats(data) {
  const total = data.counts.reduce((a, b) => a + b, 0);
  const avg = data.counts.length > 0 ? (total / data.counts.length).toFixed(1) : 0;
  const max = Math.max(...data.counts, 0);

  document.getElementById('total-bookings').textContent = total;
  document.getElementById('avg-bookings').textContent = avg;
  document.getElementById('max-bookings').textContent = max;
}

// Period navigation
document.getElementById('previous-period').addEventListener('click', () => {
  currentPeriodOffset -= 1;
  updatePeriodNavigation();
  loadStats(document.getElementById('period-filter').value);
});

document.getElementById('next-period').addEventListener('click', () => {
  if (currentPeriodOffset < 0) {
    currentPeriodOffset += 1;
    updatePeriodNavigation();
    loadStats(document.getElementById('period-filter').value);
  }
});

document.getElementById('period-filter').addEventListener('change', e => {
  currentPeriodOffset = 0;
  updatePeriodNavigation();
  loadStats(e.target.value);
});

// Listen for theme changes to redraw chart
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
      if (currentChartData) {
        renderChart(currentChartData);
      }
    }
  });
});

observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});

// Init
updatePeriodNavigation();
requireAuth({ admin: true }).then(user => user && loadStats('weekly'));
