// Curseur de lecture : barre verticale dessinée sur la partition (SVG abcjs), partagée par la
// lecture de l'ABC synthétisé (CursorControl d'abcjs) et celle de l'enregistrement.

const SVG_NS = 'http://www.w3.org/2000/svg';

export class PlaybackCursor {
  /** @param {HTMLElement} paper conteneur de la partition rendue par abcjs */
  constructor(paper) {
    this.paper = paper;
    this.line = null;
    this.lastTop = null;
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
    if (this.line) this.line.remove();
    this.line = null;
    this.lastTop = null;
  }

  // Fait défiler la page si la ligne courante est masquée par le lecteur (haut) ou la barre
  // d'enregistrement fixée en bas (smartphone).
  keepVisible() {
    if (!this.line) return;
    const r = this.line.getBoundingClientRect();
    const playerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-h')) || 0;
    const transport = document.getElementById('transport');
    const bottomBar = transport && getComputedStyle(transport).position === 'fixed' ? transport.offsetHeight : 0;
    const top = playerH + 8;
    const bottom = window.innerHeight - bottomBar - 8;
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
