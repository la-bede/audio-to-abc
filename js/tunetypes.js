import { t } from './i18n.js';

// Métriques proposées avant l'enregistrement → pulsation et tempo par défaut du métronome. Dans la
// liste, chacune est suivie de ses rythmes les plus courants, pour se repérer (clés i18n « mhint.* »).
// Le type d'air (R:) n'intervient pas dans la transcription : il se renseigne après
// l'enregistrement, avec les suggestions de RHYTHM_SUGGESTIONS.
// beat = durée d'une pulsation du métronome en fraction de ronde (1/2 = blanche, 1/4 = noire, 3/8 = noire pointée).
// L'ordre des clés est celui de la liste affichée.
export const METERS = {
  '2/4':  { beat: 1 / 4, bpm: 120 },
  '3/4':  { beat: 1 / 4, bpm: 120 },
  '4/4':  { beat: 1 / 2, bpm: 90 },
  '3/8':  { beat: 3 / 8, bpm: 70 },
  '6/8':  { beat: 3 / 8, bpm: 100 },
  '9/8':  { beat: 3 / 8, bpm: 100 },
  '12/8': { beat: 3 / 8, bpm: 120 },
  '3/2':  { beat: 1 / 2, bpm: 80 },
};
export const DEFAULT_METER = '4/4';

// Suggestions pour R: selon la métrique : types thesession (march : 4/4 sur thesession, 2/4 ou
// 6/8 ailleurs), puis quelques danses du trad français. La saisie reste libre.
export const RHYTHM_SUGGESTIONS = {
  '4/4':  ['reel', 'hornpipe', 'barndance', 'strathspey', 'march', 'scottish'],
  '6/8':  ['jig', 'march'],
  '2/4':  ['polka', 'march', 'bourrée', 'scottish'],
  '3/4':  ['waltz', 'mazurka', 'valse'],
  '9/8':  ['slip jig'],
  '12/8': ['slide'],
  '3/2':  ['three-two'],
  '3/8':  ['bourrée', 'valse'],
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

// Taille (en unités L) des groupes de notes séparés par une espace dans l'ABC, comme sur
// thesession : demi-mesure en 4/4 et 2/2 (reel « eAAB eABB »), noire pointée en 3/8, 6/8, 9/8,
// 12/8 (jig « GAB c^cd »), sinon le temps (polka, valse : noire ; three-two : blanche).
export function defaultGroup(meter, unitL) {
  let wholes;
  if ((meter.num === 4 && meter.den === 4) || (meter.num === 2 && meter.den === 2)) wholes = 1 / 2;
  else if (meter.den === 8 && meter.num % 3 === 0) wholes = 3 / 8;
  else wholes = 1 / meter.den;
  return Math.max(1, Math.round(wholes / unitL));
}

// Libellé d'une entrée de la liste déroulante des métriques : « 4/4 — reel, hornpipe… » (les points de
// suspension disent que la liste des rythmes n'est pas exhaustive), ou « Autre… ».
export function meterLabel(id) {
  return METERS[id] ? `${id} — ${t(`mhint.${id}`)}…` : t('f.meterOther');
}

// Libellé affiché une fois le choix fait (liste fermée) : la métrique seule.
export function meterShortLabel(id) {
  return METERS[id] ? id : t('f.meterOther');
}

export function beatSymbol(beat) {
  const b = BEAT_CHOICES.find(c => Math.abs(c.value - beat) < 1e-9);
  return b ? t(b.labelKey) : `1/${Math.round(1 / beat)}`;
}

export const BEAT_CHOICES = [
  { value: 1 / 2, labelKey: 'beat.half' },
  { value: 3 / 4, labelKey: 'beat.dottedHalf' },
  { value: 1 / 4, labelKey: 'beat.quarter' },
  { value: 3 / 8, labelKey: 'beat.dottedQuarter' },
  { value: 1 / 8, labelKey: 'beat.eighth' },
];

// Plages de hauteurs (MIDI) par instrument, pour filtrer harmoniques et clics du métronome.
export const INSTRUMENTS = {
  generic:   { labelKey: 'ins.generic',   min: 50, max: 90 },
  whistle:   { labelKey: 'ins.whistle',   min: 59, max: 90 },
  fiddle:    { labelKey: 'ins.fiddle',    min: 55, max: 90 },
  accordion: { labelKey: 'ins.accordion', min: 52, max: 90 },
  banjo:     { labelKey: 'ins.banjo',     min: 55, max: 88 },
  pipes:     { labelKey: 'ins.pipes',     min: 62, max: 88 },
  voice:     { labelKey: 'ins.voice',     min: 45, max: 81 },
};
