// Simplification d'une transcription selon les usages de thesession.org :
// - reprises |: … :| quand deux blocs de mesures consécutifs sont identiques ;
// - voltas |1 … :|2 … || quand seules les fins diffèrent : sur la dernière mesure, les 2 dernières
//   ou les 4 dernières (une différence sur 3 mesures est écrite avec des voltas de 4 mesures) ;
// - si l'air entier est joué plusieurs fois, un seul tour est conservé.
// Les mesures sont comparées sous forme de chaînes ABC (cf. renderBars dans abc.js).

const VOLTA_LENGTHS = [1, 2, 4];
const PART_LENGTHS = [8, 16, 4]; // à égalité de gain, l'ordre donne la préférence

function mismatches(a, b, n) {
  let m = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) m++;
  return m;
}

/**
 * Cherche comment écrire Y (bloc suivant X) comme reprise de X.
 * @returns {null | {volta: number}} volta = 0 pour une reprise exacte.
 */
function matchRepeat(X, Y, P, tolerance) {
  if (X.length !== P || !Y.length) return null;
  // Reprise exacte (la tolérance ne s'applique pas à la dernière mesure : c'est une fin de partie).
  if (Y.length === P && X[P - 1] === Y[P - 1] && mismatches(X, Y, P) <= tolerance) return { volta: 0 };
  for (const v of VOLTA_LENGTHS) {
    const body = P - v;
    if (body < P / 2) continue;                 // corps commun au moins égal à la moitié de la partie
    if (Y.length <= body) continue;             // il faut au moins une mesure de 2de fin
    if (mismatches(X, Y, body) <= tolerance) return { volta: v };
  }
  return null;
}

function sectionsFor(bars, P, tolerance) {
  const sections = [];
  let saved = 0;
  let i = 0;
  while (i < bars.length) {
    const X = bars.slice(i, i + P);
    const Y = bars.slice(i + P, i + 2 * P);
    const m = X.length === P ? matchRepeat(X, Y, P, tolerance) : null;
    if (m && m.volta === 0) {
      sections.push({ type: 'repeat', body: X });
      saved += P;
      i += P + Y.length;
    } else if (m) {
      const body = P - m.volta;
      sections.push({ type: 'volta', body: X.slice(0, body), end1: X.slice(body), end2: Y.slice(body) });
      saved += body;
      i += P + Y.length;
    } else {
      sections.push({ type: 'plain', body: X });
      i += X.length;
    }
  }
  // Fusion des blocs « plain » consécutifs.
  const merged = [];
  for (const s of sections) {
    const prev = merged[merged.length - 1];
    if (s.type === 'plain' && prev && prev.type === 'plain') prev.body = prev.body.concat(s.body);
    else merged.push(s);
  }
  return { sections: merged, saved };
}

function sameBars(a, b, tolerance) {
  if (a.length !== b.length) return false;
  return mismatches(a, b, a.length) <= tolerance;
}

// Deux sections identiques (la toute dernière section enregistrée peut différer par sa fin).
function sameSection(a, b, tolerance, lastOne) {
  if (a.type !== b.type && !(lastOne && a.type !== 'plain' && b.type !== 'plain')) return false;
  if (!sameBars(a.body, b.body, tolerance)) return false;
  if (lastOne) return true;
  if (a.type === 'volta') return sameBars(a.end1, b.end1, tolerance) && sameBars(a.end2, b.end2, tolerance);
  return true;
}

// Plus petite période k telle que la suite de sections se répète ; retourne {sections, tours}.
function keepOneTour(sections, tolerance) {
  const n = sections.length;
  for (let k = 1; k < n; k++) {
    let ok = true;
    for (let j = k; j < n && ok; j++) ok = sameSection(sections[j - k], sections[j], tolerance, j === n - 1);
    if (ok) return { sections: sections.slice(0, k), tours: Math.ceil(n / k) };
  }
  return { sections, tours: 1 };
}

/**
 * @param {string[]} bars mesures (sans la levée)
 * @param {{tolerance?: number}} opts
 * @returns {{ sections, partLength, tours, summary, repeated: boolean }}
 */
export function simplify(bars, opts = {}) {
  const tolerance = opts.tolerance || 0;
  let best = null;
  for (const P of PART_LENGTHS) {
    if (bars.length < P + 1) continue;
    const r = sectionsFor(bars, P, tolerance);
    if (!best || r.saved > best.saved) best = { ...r, P };
  }
  if (!best || best.saved === 0) {
    return { sections: [{ type: 'plain', body: bars.slice() }], partLength: null, tours: 1, repeated: false,
      summary: 'Aucune répétition trouvée.' };
  }
  const { sections, tours } = keepOneTour(best.sections, tolerance);
  const names = 'ABCDEFGHIJ';
  let letter = 0;
  const parts = sections.map((s) => {
    const name = names[letter++] || '?';
    if (s.type === 'repeat') return `${name} : reprise exacte`;
    if (s.type === 'volta') return `${name} : reprise avec voltas (${s.end1.length} mesure${s.end1.length > 1 ? 's' : ''})`;
    return `${name} : ${s.body.length} mesure${s.body.length > 1 ? 's' : ''} sans reprise`;
  });
  const summary = [`Parties de ${best.P} mesures`, ...parts, tours > 1 ? `${tours} tours détectés, 1 conservé` : null]
    .filter(Boolean).join(' · ');
  return { sections, partLength: best.P, tours, repeated: true, summary };
}

/**
 * Mise en page ABC de la version simplifiée : chaque partie commence une ligne,
 * barsPerLine mesures par ligne, 2de fin ajoutée en fin de ligne.
 */
export function layoutSimplified(r, result, barsPerLine) {
  const lines = [];
  let line = r.pickup || '';
  let count = 0;
  const flush = () => { if (line) lines.push(line); line = ''; count = 0; };
  const addBars = (bars, lastBarline, sepBarline = '|') => {
    bars.forEach((b, i) => {
      line += b + (i === bars.length - 1 ? lastBarline : sepBarline);
      count++;
      if (count === barsPerLine && i < bars.length - 1) { lines.push(line); line = ''; count = 0; }
    });
  };
  result.sections.forEach((s, idx) => {
    const isLastSection = idx === result.sections.length - 1;
    if (idx > 0) flush();
    if (s.type === 'plain') {
      // Barre de début seulement si la ligne ne contient que la levée.
      if (idx === 0 && line) line += '|';
      addBars(s.body, isLastSection ? '|]' : '|');
      return;
    }
    line += '|:';
    if (s.type === 'repeat') {
      addBars(s.body, ':|');
      return;
    }
    // Volta : corps, puis |1 fin1 :|2 fin2 ||
    addBars(s.body, '|');
    if (count >= barsPerLine) { lines.push(line); line = '[1 '; count = 0; }
    else line = line.replace(/\|$/, '') + '|1 ';
    addBars(s.end1, ':|');
    if (s.end1.length >= 4) { lines.push(line); line = '[2 '; count = 0; } else line += '2 ';
    s.end2.forEach((b, i) => { line += b + (i === s.end2.length - 1 ? (isLastSection ? '|]' : '||') : '|'); });
  });
  flush();
  // Nettoyage : une ligne qui finit par « | » suivie d'une ligne qui commence par « |: ».
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i + 1].startsWith('|:') && /[^:|]\|$/.test(lines[i])) lines[i] = lines[i].slice(0, -1);
  }
  return r.head + '\n' + lines.join('\n') + '\n';
}
