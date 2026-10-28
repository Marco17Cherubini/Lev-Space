// Report: tagli per giorno negli ultimi 7 o 30 giorni, con navigazione nei periodi
// precedenti. Il grafico prende i colori dal tema; i dati sono anche in tabella.
/* global Chart -- caricato da /vendor/chart.umd.min.js solo in questa pagina */
(async function () {
  if (!(await requireAuth({ admin: true }))) return;

  let chart = null;
  let data = null;
  let offset = 0;
  const period = () => document.querySelector('[data-period] input:checked').value;
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  async function load() {
    document.querySelector('[data-step="1"]').disabled = offset >= 0;
    try {
      data = await apiRequest(`/admin/reports/bookings-stats?period=${period()}&offset=${offset}`, {
        sessionRequired: true
      });
    } catch (error) {
      showToast(error.message);
      return;
    }
    renderFacts();
    renderChart();
    renderTable();
  }

  function renderFacts() {
    const total = data.counts.reduce((a, b) => a + b, 0);
    const best = Math.max(...data.counts, 0);
    const bestIndex = data.counts.indexOf(best);
    document.querySelector('[data-range]').textContent =
      `${formatDateShort(data.from)} – ${formatDateShort(data.to)}`;
    document.querySelector('[data-total]').textContent = total;
    document.querySelector('[data-avg]').textContent = (total / data.counts.length)
      .toFixed(1)
      .replace('.', ',');
    document.querySelector('[data-best]').innerHTML = best
      ? `${best} <span class="muted">${escapeHtml(formatDateShort(addDays(data.from, bestIndex)))}</span>`
      : '–';
    const ties = data.counts.filter(c => c === best).length;
    document.querySelector('[data-caption]').textContent = !total
      ? 'Nessun taglio registrato in questo periodo.'
      : ties > 1
        ? 'In evidenza i giorni con più tagli.'
        : 'In evidenza il giorno con più tagli.';
  }

  function renderChart() {
    const ink = css('--ink');
    const muted = css('--ink-2');
    const accent = css('--accent');
    const grid = css('--paper-2');
    const best = Math.max(...data.counts);
    const colors = data.counts.map(c => (c === best && best > 0 ? accent : ink));
    Chart.defaults.font.family = css('--font-ui');
    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('bookings-chart'), {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Tagli',
            data: data.counts,
            backgroundColor: colors,
            borderRadius: 0,
            maxBarThickness: 40
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? false
          : { duration: 250 },
        plugins: { legend: { display: false }, tooltip: { displayColors: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, color: muted },
            grid: { color: grid },
            border: { display: false }
          },
          x: {
            ticks: { color: muted, maxRotation: 0, autoSkip: true },
            grid: { display: false },
            border: { color: grid }
          }
        }
      }
    });
  }

  function renderTable() {
    document.querySelector('[data-table]').innerHTML = data.labels
      .map(
        (label, i) => `<tr><td>${escapeHtml(label)}</td><td class="num">${data.counts[i]}</td></tr>`
      )
      .join('');
  }

  document.querySelectorAll('[data-step]').forEach(button => {
    button.addEventListener('click', () => {
      offset = Math.min(0, offset + Number(button.dataset.step));
      load();
    });
  });
  document.querySelectorAll('[data-period] input').forEach(input => {
    input.addEventListener('change', () => {
      offset = 0;
      load();
    });
  });
  document.addEventListener('themechange', () => data && renderChart());

  load();
})();
