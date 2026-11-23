// Types d'airs de thesession.org → métrique (M:), note de base (L:), pulsation et tempo par défaut.
// beat = durée d'une pulsation du métronome en fraction de ronde (1/2 = blanche, 1/4 = noire, 3/8 = noire pointée).
// group = taille (en unités L) des groupes de notes séparés par une espace dans l'ABC.

export const TUNE_TYPES = {
  reel:        { label: 'Reel',        M: '4/4', L: '1/8', beat: 1 / 2, bpm: 90,  group: 4 },
  jig:         { label: 'Jig',         M: '6/8', L: '1/8', beat: 3 / 8, bpm: 100, group: 3 },
  'slip jig':  { label: 'Slip jig',    M: '9/8', L: '1/8', beat: 3 / 8, bpm: 100, group: 3 },
  hornpipe:    { label: 'Hornpipe',    M: '4/4', L: '1/8', beat: 1 / 2, bpm: 70,  group: 4 },
  polka:       { label: 'Polka',       M: '2/4', L: '1/8', beat: 1 / 4, bpm: 120, group: 2 },
  slide:       { label: 'Slide',       M: '12/8', L: '1/8', beat: 3 / 8, bpm: 120, group: 3 },
  waltz:       { label: 'Waltz',       M: '3/4', L: '1/8', beat: 1 / 4, bpm: 120, group: 2 },
  barndance:   { label: 'Barndance',   M: '4/4', L: '1/8', beat: 1 / 2, bpm: 80,  group: 4 },
  strathspey:  { label: 'Strathspey',  M: '4/4', L: '1/8', beat: 1 / 4, bpm: 110, group: 4 },
  'three-two': { label: 'Three-two',   M: '3/2', L: '1/8', beat: 1 / 2, bpm: 80,  group: 4 },
  mazurka:     { label: 'Mazurka',     M: '3/4', L: '1/8', beat: 1 / 4, bpm: 120, group: 2 },
  march:       { label: 'March',       M: '2/4', L: '1/8', beat: 1 / 4, bpm: 100, group: 2 },
  custom:      { label: 'Perso…',      M: '4/4', L: '1/8', beat: 1 / 4, bpm: 100, group: 4 },
};

export function parseFraction(str) {
  const m = String(str).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1], 10), den = parseInt(m[2], 10);
  if (!num || !den) return null;
  return { num, den, value: num / den };
}

// Pulsation par défaut pour une métrique perso : noire pointée en métrique composée, sinon 1/den.
export function defaultBeat(meter) {
  if (meter.den === 8 && meter.num % 3 === 0 && meter.num > 3) return 3 / 8;
  return 1 / meter.den;
}

// Groupement par défaut (unités L) pour une métrique perso.
export function defaultGroup(meter, unitL) {
  const beat = defaultBeat(meter);
  const g = Math.round(beat / unitL);
  return Math.max(1, g);
}

export function beatSymbol(beat) {
  if (Math.abs(beat - 1 / 2) < 1e-9) return 'blanche';
  if (Math.abs(beat - 3 / 8) < 1e-9) return '♩.';
  if (Math.abs(beat - 1 / 4) < 1e-9) return '♩';
  if (Math.abs(beat - 1 / 8) < 1e-9) return '♪';
  if (Math.abs(beat - 3 / 4) < 1e-9) return 'blanche pointée';
  return `1/${Math.round(1 / beat)}`;
}

export const BEAT_CHOICES = [
  { value: 1 / 2, label: 'blanche' },
  { value: 3 / 4, label: 'blanche pointée' },
  { value: 1 / 4, label: 'noire' },
  { value: 3 / 8, label: 'noire pointée' },
  { value: 1 / 8, label: 'croche' },
];

// Plages de hauteurs (MIDI) par instrument, pour filtrer harmoniques et clics du métronome.
export const INSTRUMENTS = {
  generic:   { label: 'Générique',              min: 50, max: 90 },
  whistle:   { label: 'Flûte / tin whistle (D)', min: 59, max: 90 },
  fiddle:    { label: 'Violon',                 min: 55, max: 90 },
  accordion: { label: 'Accordéon / concertina',  min: 52, max: 90 },
  banjo:     { label: 'Banjo / mandoline',       min: 55, max: 88 },
  pipes:     { label: 'Uilleann pipes',          min: 62, max: 88 },
  voice:     { label: 'Voix',                    min: 45, max: 81 },
};
