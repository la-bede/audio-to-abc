// Curseur de lecture : barre verticale dessinée sur la partition (SVG abcjs), partagée par la
// lecture de l'ABC synthétisé (CursorControl d'abcjs) et celle de l'enregistrement.

const SVG_NS = 'http://www.w3.org/2000/svg';

export class PlaybackCursor {
  /** @param {HTMLElement} paper conteneur de la partition rendue par abcjs */
  constructor(paper) {
    this.paper = paper;
    this.line = null;
    this.lastTop = null;
    this.lit = [];            // éléments SVG de la note en cours (affichée en rouge)
  }

  // Note en cours en rouge : ev.elements = groupes d'éléments SVG de la note (abcjs).
  highlight(ev) {
    for (const e of this.lit) e.classList.remove('abcjs-playing');
    this.lit = [];
    for (const group of ev.elements || []) {
      for (const e of group || []) { e.classList.add('abcjs-playing'); this.lit.push(e); }
    }
  }

  /** ev : { left, top, height } en coordonnées SVG (événement abcjs ou entrée de noteTimings). */
  draw(ev) {
    if (!ev || ev.left == null || ev.top == null) return;
    const svg = this.paper.querySelector('svg');
    if (!svg) return;
    if (!this.line || !svg.contains(this.line)) {
      this.line = document.createElementNS(SVG_NS, 'line');
      this.line.setAttribute('class', 'abcjs-cursor');
      svg.appendChild(this.line);
      this.lastTop = null;
    }
    this.highlight(ev);
    const x = ev.left - 2;
    this.line.setAttribute('x1', x);
    this.line.setAttribute('x2', x);
    this.line.setAttribute('y1', ev.top);
    this.line.setAttribute('y2', ev.top + ev.height);
    if (ev.top !== this.lastTop) {   // nouvelle ligne de portée : la garder visible
      this.lastTop = ev.top;
      this.keepVisible();
    }
  }

  hide() {
    for (const e of this.lit) e.classList.remove('abcjs-playing');
    this.lit = [];
    if (this.line) this.line.remove();
    this.line = null;
    this.lastTop = null;
  }

  // Fait défiler la page pour garder la ligne jouée dans le haut de l'écran, au-dessus des barres
  // fixées en bas (lecteur, et barre d'enregistrement sur smartphone).
  keepVisible() {
    if (!this.line) return;
    const r = this.line.getBoundingClientRect();
    const css = getComputedStyle(document.documentElement);
    const bottomBars = (parseFloat(css.getPropertyValue('--player-h')) || 0)
      + (parseFloat(css.getPropertyValue('--transport-h')) || 0);
    const top = 8;
    const bottom = window.innerHeight - bottomBars - 8;
    if (r.top < top || r.bottom > bottom) {
      window.scrollBy({ top: r.top - (top + (bottom - top) / 4), behavior: 'smooth' });
    }
  }
}

/**
 * Événement de partition le plus proche (dernier dont le début est ≤ ms) dans des noteTimings abcjs.
 * @param {Array} timings entrées { milliseconds, left, top, height, type }
 */
export function eventAt(timings, ms) {
  let lo = 0, hi = timings.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timings[mid].milliseconds <= ms) { best = timings[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}
