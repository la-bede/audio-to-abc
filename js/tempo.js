// Suivi du tempo de l'interprète et détection du début de jeu.
//
// Idée générale (inspirée de Cadence, https://github.com/Batpapa/Cadence — aucun code repris) :
// le tempo et la phase de départ sont connus grâce au décompte du métronome ; ensuite, une boucle à
// verrouillage de phase (PLL) suit les débuts de note fournis par Basic Pitch (y compris les notes
// liées sans attaque, grâce au « melodia trick »), unité par unité (croches pour L:1/8).

const DEFAULTS = {
  alpha: 0.3,        // correction de phase (part de l'erreur absorbée à chaque onset)
  beta: 0.08,        // correction de période
  tolerance: 0.3,    // |erreur| max (en fraction d'unité) pour qu'un onset serve au suivi
  minRatio: 0.7,     // période bornée à [0.7, 1.4] × période initiale
  maxRatio: 1.4,
  maxStep: 0.04,     // variation de période max par onset (4 %)
};

/**
 * @param {Array<{t:number, amp?:number}>} onsets temps en s, relatifs au temps 1 de la mesure 1
 *        (latence déjà compensée), triés ou non.
 * @param {object} o { unitSec (durée initiale d'une unité L), ...DEFAULTS }
 * @returns {{ toUnits(t:number):number, unitSecAt(t:number):number, unitSecNow:number,
 *            unitSecMean:number, unitSecMin:number, unitSecMax:number, anchors:Array }}
 */
export function trackTempo(onsets, o) {
  const p = { ...DEFAULTS, ...o };
  const T0 = p.unitSec;
  const anchors = [{ k: 0, t: 0, T: T0 }];
  let T = T0;
  const sorted = onsets.map(x => x.t).filter(Number.isFinite).sort((a, b) => a - b);
  for (const t of sorted) {
    const last = anchors[anchors.length - 1];
    if (t <= last.t) continue;                   // levée ou onset déjà dépassé
    const kf = last.k + (t - last.t) / T;
    const k = Math.round(kf);
    if (k <= last.k) continue;                   // même case que l'ancre précédente
    const err = (kf - k) * T;                    // > 0 : en retard sur la grille prévue
    if (Math.abs(err) > p.tolerance * T) continue; // ornement, triolet, note très décalée
    const n = k - last.k;
    const predicted = last.t + n * T;
    let newT = T + (p.beta * err) / n;
    newT = Math.min(T * (1 + p.maxStep), Math.max(T * (1 - p.maxStep), newT));
    newT = Math.min(T0 * p.maxRatio, Math.max(T0 * p.minRatio, newT));
    anchors.push({ k, t: predicted + p.alpha * err, T: newT });
    T = newT;
  }

  const first = anchors[0];
  const lastA = anchors[anchors.length - 1];
  function segment(t) {
    // Indice de l'ancre i telle que anchors[i].t <= t < anchors[i+1].t (recherche dichotomique).
    let lo = 0, hi = anchors.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (anchors[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function toUnits(t) {
    if (t <= first.t) return first.k + (t - first.t) / T0;        // avant la mesure 1 : tempo initial
    const i = segment(t);
    if (i >= anchors.length - 1) return lastA.k + (t - lastA.t) / T; // après la dernière ancre
    const a = anchors[i], b = anchors[i + 1];
    return a.k + ((t - a.t) / (b.t - a.t)) * (b.k - a.k);
  }
  function unitSecAt(t) {
    if (t <= first.t) return T0;
    const i = segment(t);
    if (i >= anchors.length - 1) return T;
    const a = anchors[i], b = anchors[i + 1];
    return (b.t - a.t) / (b.k - a.k);
  }
  const span = lastA.k - first.k;
  const periods = anchors.slice(1).map(a => a.T);
  return {
    toUnits,
    unitSecAt,
    unitSecNow: T,
    unitSecMean: span > 0 ? (lastA.t - first.t) / span : T0,
    unitSecMin: periods.length ? Math.min(...periods) : T0,
    unitSecMax: periods.length ? Math.max(...periods) : T0,
    anchors,
  };
}

/**
 * Détection du début de jeu à partir du niveau du micro (RMS par bloc) : un niveau nettement
 * au-dessus du bruit de fond, tenu au moins `minSustain` secondes. Les clics du métronome
 * (≈ 35 ms) sont trop brefs pour déclencher.
 */
export class PlayDetector {
  constructor(o = {}) {
    this.ratio = o.ratio ?? 4;            // seuil relatif au bruit de fond
    this.minLevel = o.minLevel ?? 0.003;  // seuil absolu minimal (RMS)
    this.loud = o.loud ?? 0.05;           // niveau franc qui suffit même sans bruit de fond estimé
    this.minSustain = o.minSustain ?? 0.15;
    this.levels = [];
    this.runStart = null;
    this.runTime = 0;
    this.lastTime = null;
    this.startTime = null;                // instant détecté du début de jeu
  }

  noiseFloor() {
    if (!this.levels.length) return 0;
    const s = this.levels.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length * 0.25)];
  }

  /** @returns {number|null} l'instant de début de jeu, dès qu'il est détecté */
  push(time, rms) {
    if (this.startTime !== null) return this.startTime;
    const dt = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    const floor = this.noiseFloor();
    const active = rms >= this.loud || (rms >= this.minLevel && rms >= this.ratio * floor && this.levels.length >= 5);
    if (active) {
      if (this.runStart === null) { this.runStart = time; this.runTime = 0; }
      else this.runTime += dt;
      if (this.runTime >= this.minSustain) this.startTime = this.runStart;
    } else {
      this.runStart = null;
      this.runTime = 0;
      this.levels.push(rms);
      if (this.levels.length > 400) this.levels.shift();
    }
    return this.startTime;
  }
}
