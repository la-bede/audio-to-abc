// Tonalités au format thesession (Dmajor, Ador, Gmixolydian, Eminor…) : armure, orthographe des notes,
// détection automatique par corrélation de profils (Krumhansl-Schmuckler étendu aux modes trad).

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

export const MODES = {
  major:      { abc: 'maj', label: 'major',      offset: 0, degree: 0 },
  minor:      { abc: 'min', label: 'minor',      offset: 9, degree: 5 },
  dorian:     { abc: 'dor', label: 'dorian',     offset: 2, degree: 1 },
  mixolydian: { abc: 'mix', label: 'mixolydian', offset: 7, degree: 4 },
};

// Nom de la gamme majeure « parente » pour chaque classe de hauteur (armure la plus simple).
const PARENT_MAJOR = { 0: 'C', 7: 'G', 2: 'D', 9: 'A', 4: 'E', 11: 'B', 6: 'F#', 1: 'Db', 8: 'Ab', 3: 'Eb', 10: 'Bb', 5: 'F' };

function parseName(name) {
  return { letter: name[0], alt: name.includes('#') ? 1 : name.includes('b') ? -1 : 0 };
}

function majorScale(parentName) {
  const { letter, alt } = parseName(parentName);
  const rootPc = (NATURAL_PC[letter] + alt + 12) % 12;
  const li = LETTERS.indexOf(letter);
  return MAJOR_STEPS.map((step, i) => {
    const l = LETTERS[(li + i) % 7];
    const pc = (rootPc + step) % 12;
    let a = pc - NATURAL_PC[l];
    if (a > 6) a -= 12;
    if (a < -6) a += 12;
    return { letter: l, alt: a, pc };
  });
}

function accName(alt) { return alt === 1 ? '#' : alt === -1 ? 'b' : ''; }

export function makeKey(tonicPc, mode) {
  const m = MODES[mode];
  const parentPc = (tonicPc - m.offset + 12) % 12;
  const scale = majorScale(PARENT_MAJOR[parentPc]);
  const t = scale[m.degree];
  const tonicName = t.letter + accName(t.alt);
  const sig = {};
  for (const s of scale) sig[s.letter] = s.alt;
  const nSharps = scale.filter(s => s.alt === 1).length;
  const nFlats = scale.filter(s => s.alt === -1).length;
  return {
    tonicPc, mode, tonicName, sig, nSharps, nFlats,
    abc: tonicName + m.abc,                 // K: Dmaj, Ador, Gmix, Emin
    session: tonicName + m.label,          // Dmajor, Adorian (format thesession)
    id: `${tonicPc}-${mode}`,
  };
}

export function allKeys() {
  const out = [];
  for (const mode of Object.keys(MODES)) for (let pc = 0; pc < 12; pc++) out.push(makeKey(pc, mode));
  return out;
}

export function keyFromId(id) {
  const [pc, mode] = id.split('-');
  return makeKey(parseInt(pc, 10), mode);
}

// Orthographe d'une note MIDI dans une tonalité : lettre, altération réelle, octave.
export function spellMidi(midi, key) {
  const pc = ((midi % 12) + 12) % 12;
  for (const l of LETTERS) {
    if ((NATURAL_PC[l] + key.sig[l] + 12) % 12 === pc) return finish(midi, l, key.sig[l]);
  }
  const cands = [];
  for (const l of LETTERS) for (const a of [-1, 0, 1]) {
    if ((NATURAL_PC[l] + a + 12) % 12 === pc) cands.push({ l, a });
  }
  // Préférence : bécarre (ex. C naturel en ré majeur), puis dièses en tonalité à dièses, bémols sinon.
  const natural = cands.find(c => c.a === 0);
  let pick = natural;
  if (!pick) {
    const preferFlat = key.nFlats > 0;
    pick = cands.find(c => c.a === (preferFlat ? -1 : 1)) || cands[0];
  }
  return finish(midi, pick.l, pick.a);
}

function finish(midi, letter, alt) {
  const octave = Math.floor((midi - alt) / 12) - 1; // C4 = 60
  return { letter, alt, octave };
}

export function abcPitch(letter, octave) {
  if (octave >= 5) return letter.toLowerCase() + "'".repeat(octave - 5);
  return letter + ','.repeat(Math.max(0, 4 - octave));
}

// --- Détection --------------------------------------------------------------------------------
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const swap = (arr, i, j) => { const a = arr.slice(); [a[i], a[j]] = [a[j], a[i]]; return a; };
const PROFILES = {
  major: KK_MAJOR,
  minor: KK_MINOR,
  dorian: swap(KK_MINOR, 8, 9),       // 6te majeure
  mixolydian: swap(KK_MAJOR, 10, 11), // 7e mineure
};
// Tonalités fréquentes en musique irlandaise : léger bonus a priori.
const COMMON = new Set(['2-major', '7-major', '9-major', '0-major', '5-major', '9-dorian', '4-dorian', '2-dorian', '7-dorian', '11-dorian',
  '4-minor', '9-minor', '11-minor', '2-minor', '9-mixolydian', '2-mixolydian', '7-mixolydian']);

function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/**
 * events : [{midi, len, onDownbeat}] (len en pas de grille)
 * opts.finalPc : classe de hauteur de la dernière note (si l'enregistrement est terminé)
 */
export function detectKey(events, opts = {}) {
  const hist = new Array(12).fill(0);
  let firstDownbeatPc = null;
  for (const e of events) {
    if (e.midi == null) continue;
    const pc = e.midi % 12;
    hist[pc] += e.len * (e.onDownbeat ? 1.5 : 1);
    if (firstDownbeatPc === null && e.onDownbeat) firstDownbeatPc = pc;
  }
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let best = null;
  const ranking = [];
  for (const mode of Object.keys(PROFILES)) {
    for (let t = 0; t < 12; t++) {
      const rotated = hist.map((_, i) => hist[(i + t) % 12]);
      let score = pearson(rotated, PROFILES[mode]);
      const id = `${t}-${mode}`;
      if (COMMON.has(id)) score += 0.03;
      if (opts.finalPc === t) score += 0.08;
      if (firstDownbeatPc === t) score += 0.03;
      ranking.push({ id, score });
      if (!best || score > best.score) best = { id, score };
    }
  }
  ranking.sort((a, b) => b.score - a.score);
  const key = keyFromId(best.id);
  key.confidence = Math.max(0, Math.min(1, best.score));
  key.margin = ranking.length > 1 ? best.score - ranking[1].score : 1;
  key.alternatives = ranking.slice(1, 4).map(r => keyFromId(r.id).session);
  return key;
}
