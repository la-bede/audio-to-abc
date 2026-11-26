// Génération ABC selon les usages de thesession.org :
// en-tête X/T/R/M/L/K, armure implicite, accidents explicites seulement hors armure (valables
// jusqu'à la barre), notes groupées par temps (espace entre groupes), 4 mesures par ligne, levée
// avant la 1re barre, liaisons « - » pour les notes à cheval sur une barre ou de durée composée.

import { spellMidi, abcPitch } from './key.js';

const ACC = { 1: '^', 0: '=', '-1': '_' };

/**
 * @param {object} o
 *  events [{pos, len, midi|null}] (pas de grille, pos relative au temps 1 de la mesure 1)
 *  barSteps, gridDiv, groupSteps, key, final, barsPerLine
 *  header : { title, rhythm, M, L }
 */
export function buildAbc(o) {
  return layoutLinear(renderBars(o), o.barsPerLine, o.final);
}

export function abcHeader(o) {
  return [
    'X: 1',
    `T: ${o.header.title || 'Sans titre'}`,
    o.header.rhythm ? `R: ${o.header.rhythm}` : null,
    `M: ${o.header.M}`,
    `L: ${o.header.L}`,
    `K: ${o.key.abc}`,
  ].filter(Boolean).join('\n');
}

const HEADER_ORDER = ['X', 'T', 'R', 'M', 'L', 'K'];

/**
 * Remplace (ou ajoute, ou retire si `value` est vide) un champ d'en-tête — T: ou R: — dans un ABC
 * déjà affiché, sans toucher au reste : les retouches faites à la main dans le corps sont gardées.
 * Seul le premier champ de ce nom avant K: est concerné (titres alternatifs T: conservés).
 */
export function setHeaderField(abc, field, value) {
  const lines = abc.split('\n');
  const kIdx = lines.findIndex(l => /^K:/.test(l));
  const end = kIdx < 0 ? lines.length : kIdx;
  const idx = lines.slice(0, end).findIndex(l => l.startsWith(`${field}:`));
  const line = value ? `${field}: ${value}` : null;
  if (idx >= 0) {
    if (line) lines[idx] = line; else lines.splice(idx, 1);
  } else if (line) {
    // Insertion à la place habituelle : après le dernier champ qui le précède dans X T R M L K.
    const rank = HEADER_ORDER.indexOf(field);
    let at = 0;
    for (let i = 0; i < end; i++) {
      const r = HEADER_ORDER.indexOf((lines[i].match(/^([A-Za-z]):/) || [])[1]);
      if (r >= 0 && r < rank) at = i + 1;
    }
    lines.splice(at, 0, line);
  }
  return lines.join('\n');
}

/**
 * Rend chaque mesure indépendamment (les accidents repartent à zéro à chaque barre : deux chaînes
 * égales = deux mesures musicalement identiques).
 * @returns {{ head: string, pickup: string|null, bars: string[], lastComplete: boolean }}
 */
export function renderBars(o) {
  const head = abcHeader(o);
  if (!o.events.length) return { head, pickup: null, bars: [], lastComplete: true };
  const byBar = new Map(); // index de mesure → pièces
  const pieces = (b) => { if (!byBar.has(b)) byBar.set(b, []); return byBar.get(b); };
  for (const e of o.events) {
    let pos = e.pos, rest = e.len;
    while (rest > 0) {
      const bar = Math.floor(pos / o.barSteps);
      const barEnd = (bar + 1) * o.barSteps;
      const len = Math.min(rest, barEnd - pos);
      rest -= len;
      pieces(bar).push({ start: pos - bar * o.barSteps, len, midi: e.midi, tie: e.midi != null && rest > 0 });
      pos += len;
    }
  }
  const indexes = [...byBar.keys()].sort((a, b) => a - b);
  // La levée (mesures < 0) garde ses positions relatives à la mesure de décompte : groupement cohérent.
  const pickupParts = indexes.filter(b => b < 0).map(b => renderBar(byBar.get(b), o));
  const main = indexes.filter(b => b >= 0);
  const bars = main.map(b => renderBar(byBar.get(b), o));
  const lastPcs = main.length ? byBar.get(main[main.length - 1]) : null;
  return {
    head,
    pickup: pickupParts.length ? pickupParts.join('|') : null,
    bars,
    lastComplete: !lastPcs || barFilled(lastPcs, o.barSteps),
  };
}

/** Écriture linéaire : une barre après chaque mesure, barsPerLine mesures par ligne. */
export function layoutLinear(r, barsPerLine, final) {
  if (!r.bars.length && !r.pickup) return r.head + '\n';
  const lines = [];
  let line = r.pickup ? r.pickup + '|' : '';
  r.bars.forEach((bar, i) => {
    const isLast = i === r.bars.length - 1;
    line += bar;
    if (!isLast) line += '|';
    else if (final) line += '|]';
    else if (r.lastComplete) line += '|';
    if ((i + 1) % barsPerLine === 0 || isLast) { lines.push(line); line = ''; }
  });
  if (line) lines.push(line.replace(/\|$/, final ? '|]' : '|'));
  return r.head + '\n' + lines.join('\n') + '\n';
}

function barFilled(pcs, barSteps) {
  const last = pcs[pcs.length - 1];
  return last.start + last.len >= barSteps;
}

function renderBar(pcs, o) {
  const accState = new Map();
  let s = '';
  for (const p of pcs) {
    // Espace entre groupes (temps), sauf en début de mesure.
    if (s && p.start % o.groupSteps === 0) s += ' ';
    const parts = decompose(p.len, o.gridDiv);
    parts.forEach((len, i) => {
      const lastPart = i === parts.length - 1;
      if (p.midi == null) {
        s += 'z' + lenStr(len / o.gridDiv);
      } else {
        s += noteToken(p.midi, o.key, accState) + lenStr(len / o.gridDiv);
        if (!lastPart || p.tie) s += '-';
      }
    });
  }
  return s;
}

function noteToken(midi, key, accState) {
  const { letter, alt, octave } = spellMidi(midi, key);
  const id = letter + octave;
  const current = accState.has(id) ? accState.get(id) : key.sig[letter];
  let acc = '';
  if (alt !== current) {
    acc = ACC[alt];
    accState.set(id, alt);
  }
  return acc + abcPitch(letter, octave);
}

// Durées « simples » acceptées (en unités L), du plus long au plus court.
const SIMPLE = [8, 6, 4, 3, 2, 1.5, 1, 0.5];

function decompose(lenSteps, gridDiv) {
  const allowed = SIMPLE.map(x => x * gridDiv).filter(x => Number.isInteger(x) && x >= 1);
  const parts = [];
  let r = lenSteps;
  while (r > 0) {
    const a = allowed.find(x => x <= r) || 1;
    parts.push(a);
    r -= a;
  }
  return parts;
}

function lenStr(x) {
  if (x === 1) return '';
  if (x === 0.5) return '/';
  if (Number.isInteger(x)) return String(x);
  if (Number.isInteger(x * 2)) return `${x * 2}/2`;
  return String(x);
}

/**
 * Contenu du presse-papiers : texte avec fins de ligne Windows (\r\n) et HTML avec un paragraphe
 * par ligne. LibreOffice Writer ou Word utilisent la version HTML : chaque ligne ABC reste séparée.
 */
export function clipboardPayload(abc) {
  const lines = abc.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    plain: lines.join('\r\n') + '\r\n',
    html: lines.map(l => `<p style="margin:0;font-family:monospace">${l ? esc(l) : '&nbsp;'}</p>`).join(''),
  };
}
