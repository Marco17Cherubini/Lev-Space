// Display a 7 segmenti dell'eliminacode, disegnato in SVG: ogni cifra ha sempre tutti i
// segmenti, accesi (.on) o spenti (.off, appena visibili come nei LED veri).
// L'SVG è decorativo: il testo leggibile sta in aria-label sul contenitore.
const SegmentDisplay = (function () {
  const W = 60; // larghezza di una cifra
  const H = 100;
  const GAP = 10;
  const COLON = 22;

  const h = (cy, x1, x2) =>
    `${x1},${cy} ${x1 + 6},${cy - 6} ${x2 - 6},${cy - 6} ${x2},${cy} ${x2 - 6},${cy + 6} ${x1 + 6},${cy + 6}`;
  const v = (cx, y1, y2) =>
    `${cx},${y1} ${cx + 6},${y1 + 6} ${cx + 6},${y2 - 6} ${cx},${y2} ${cx - 6},${y2 - 6} ${cx - 6},${y1 + 6}`;
  const SEGMENTS = {
    a: h(8, 12, 48),
    b: v(52, 12, 47),
    c: v(52, 53, 88),
    d: h(92, 12, 48),
    e: v(8, 53, 88),
    f: v(8, 12, 47),
    g: h(50, 12, 48)
  };
  const DIGITS = {
    0: 'abcdef',
    1: 'bc',
    2: 'abged',
    3: 'abgcd',
    4: 'fgbc',
    5: 'afgcd',
    6: 'afgedc',
    7: 'abc',
    8: 'abcdefg',
    9: 'abcdfg',
    '-': 'g',
    ' ': ''
  };

  function digit(char, x) {
    const lit = DIGITS[char] ?? '';
    return Object.entries(SEGMENTS)
      .map(
        ([name, points]) =>
          `<polygon class="${lit.includes(name) ? 'on' : 'off'}" points="${points}" transform="translate(${x} 0)"/>`
      )
      .join('');
  }

  // "14:45" → SVG. I due punti restano accesi; ogni altro carattere è una cifra.
  function svg(text) {
    let x = 0;
    const parts = [];
    for (const char of String(text)) {
      if (char === ',' || char === '.') {
        parts.push(`<rect class="on" x="${x + 2}" y="86" width="12" height="12"/>`);
        x += 20;
      } else if (char === ':') {
        parts.push(
          `<rect class="on" x="${x + 5}" y="28" width="12" height="12"/><rect class="on" x="${x + 5}" y="62" width="12" height="12"/>`
        );
        x += COLON;
      } else {
        parts.push(digit(char, x));
        x += W + GAP;
      }
    }
    const width = Math.max(x - GAP, 1);
    // Leggero corsivo, come i display a segmenti reali
    return `<svg viewBox="-8 0 ${width + 16} ${H}" aria-hidden="true" focusable="false"><g transform="skewX(-6) translate(6 0)">${parts.join('')}</g></svg>`;
  }

  function html(text, { label = text, className = '' } = {}) {
    return `<span class="seg ${className}" role="img" aria-label="${escapeHtml(label)}">${svg(text)}</span>`;
  }

  // Scrive il testo in un elemento .seg esistente
  function set(element, text, label = text) {
    element.classList.add('seg');
    element.innerHTML = svg(text);
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', label);
  }

  // Accensione del display: per un istante tutti i segmenti (88:88), poi il valore.
  // Succede una volta, all'arrivo del dato; con movimento ridotto si salta.
  function boot(element, text, label = text) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      set(element, text, label);
      return;
    }
    set(element, String(text).replace(/\d/g, '8'), label);
    setTimeout(() => set(element, text, label), 180);
  }

  return { html, set, boot };
})();
