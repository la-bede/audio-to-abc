// Interface bilingue : anglais par défaut, français au choix ; le choix est mémorisé (localStorage).

const STORAGE_KEY = 'audio2abc.lang';
export const LANGS = ['en', 'fr'];

// Fenêtre « outil non maintenu » : lien vers Cadence et icône « Modules » de Cadence (grille de 4 carrés).
const CADENCE = '<a href="https://batpapa.github.io/Cadence/" target="_blank" rel="noopener">Cadence</a>';
const MODULES_ICON = '<span class="mod-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg></span>';

const DICT = {
  en: {
    'status.loading': 'Loading the Basic Pitch model…',
    'status.loadingPct': 'Loading the Basic Pitch model… {pct} %',
    'status.ready': 'Model ready ({backend}, warm-up {ms} ms).',
    'status.gpu': 'GPU / WebGL',
    'status.cpu': 'CPU — slower',
    'status.failed': 'Model failed to load: {err}',
    'warn.insecure': 'This page is not served over HTTPS (nor on <code>localhost</code>): the browser will refuse microphone access.',

    'dep.title': 'This tool is no longer maintained',
    'dep.body': `<p>Audio → ABC is no longer updated. Please use the <strong>Transcription</strong> tool of ${CADENCE} instead.</p>`
      + '<ol>'
      + `<li>Open ${CADENCE} and <strong>sign in</strong>.</li>`
      + `<li>Click the <strong>Modules</strong> icon ${MODULES_ICON}.</li>`
      + '<li>Click <strong>Transcription</strong>.</li>'
      + '</ol>',
    'dep.go': 'Open Cadence',
    'dep.close': 'Continue anyway',

    'rec.record': 'Record',
    'rec.stop': 'Stop',
    'rec.analysing': 'Analysing…',
    'rec.new': 'New transcription',
    'pos.ready': 'Ready…',
    'pos.countIn': 'Count-in {n}',
    'pos.bar': 'Bar {n}',

    'settings': 'Settings',
    'settings.reset': '↺ Reset to default settings',
    'settings.resetConfirm': 'Reset all settings to their default values? (The language is kept.)',
    'h.tune': 'The tune',
    'h.metronome': 'Metronome',
    'h.metronomeStart': 'Start-only metronome',
    'f.title': 'Title (T:)',
    'f.rhythm': 'Type (R:)',
    'f.rhythmPh': 'optional: reel, jig, bourrée…',
    'f.meter': 'Meter (M:)',
    'f.meterOther': 'Other…',
    'mhint.2/4': 'polka',
    'mhint.3/4': 'waltz',
    'mhint.4/4': 'reel, hornpipe',
    'mhint.3/8': 'bourrée',
    'mhint.6/8': 'jig',
    'mhint.9/8': 'slip jig',
    'mhint.12/8': 'slide',
    'mhint.3/2': 'three-two',
    'f.meterCustom': 'Other meter (M:)',
    'f.unit': 'Note length (L:)',
    'f.unitHint': 'L:1/8 is the standard: 99.8 % of the settings on thesession.org use it.',
    'f.key': 'Key (K:)',
    'f.keyAuto': 'Auto (detect)',
    'f.tempo': 'Tempo ({beat}) =',
    'f.beat': 'Beat',
    'f.countIn': 'Count-in (bars)',
    'f.pickup': 'Pickup',
    'f.pickupAuto': 'Auto',
    'f.pickupNone': 'None',
    'f.pickupN': '{n} × L',
    'f.click': 'Click',
    'f.clickAlways': 'Always (headphones advised)',
    'f.clickCountin': 'Count-in only',
    'f.clickOff': 'Visual only',
    'f.autoStop': 'Auto stop',
    'f.autoStopOff': 'Off',
    'f.autoStopN1': 'after 1 silent bar',
    'f.autoStopN': 'after {n} silent bars',
    'f.instrument': 'Instrument',
    'f.tempoMode': 'Tempo mode',
    'f.tempoTrackLevel': 'Follow my tempo — click stops after bar 2',
    'f.tempoTrackAbc': 'Follow my tempo — click stops after 2 transcribed bars',
    'f.tempoFixed': 'Continuous metronome, fixed tempo',
    'f.advanced': 'Advanced settings',
    'h.metronomeAdv': 'Metronome and recording',
    'h.notation': 'ABC notation',
    'h.detection': 'Detection (NeuralNote / Basic Pitch)',
    'f.noteSens': 'Note sensitivity:',
    'f.splitSens': 'Split sensitivity:',
    'f.minNote': 'Min. note length:',
    'f.latency': 'Extra latency:',
    'f.grid': 'Rhythmic grid',
    'f.grid1': '= L (eighths for L:1/8)',
    'f.grid2': 'L/2 (sixteenths)',
    'f.barsPerLine': 'Bars per line',
    'f.autoAlign': 'Automatic alignment to the grid',
    'f.melodia': 'Slurred notes without attack (“melodia trick”)',
    'untitled': 'Untitled',

    'mode.major': 'Major',
    'mode.minor': 'Minor',
    'mode.dorian': 'Dorian',
    'mode.mixolydian': 'Mixolydian',
    'beat.half': 'half note',
    'beat.dottedHalf': 'dotted half',
    'beat.quarter': 'quarter note',
    'beat.dottedQuarter': 'dotted quarter',
    'beat.eighth': 'eighth note',
    'ins.generic': 'Generic',
    'ins.whistle': 'Flute / tin whistle (D)',
    'ins.fiddle': 'Fiddle',
    'ins.accordion': 'Accordion / concertina',
    'ins.banjo': 'Banjo / mandolin',
    'ins.pipes': 'Uilleann pipes',
    'ins.voice': 'Voice',

    'out.simplify': 'Simplify (repeats)',
    'out.linear': 'Linear version',
    'out.copy': 'Copy',
    'out.copied': 'Copied ✓',
    'out.tolerance': 'Tolerance: 1 differing bar allowed outside part endings',
    'out.recording': 'Recording',
    'out.downloadAudio': 'Download audio',
    'file.recording': 'recording',

    'info.notes': '{n} notes',
    'info.latency': 'latency compensation {ms} ms',
    'info.shift': 'alignment {ms} ms',
    'info.pickup': 'pickup {n} × L',
    'info.noPickup': 'no pickup',
    'info.analysis': 'analysis: {ms} ms / window, lag {lag} s',
    'info.engine': 'engine {b}',
    'info.tempo': 'tempo followed: {beat} = {now} ({min}–{max})',
    'info.autoStopped1': 'automatic stop after 1 bar without notes',
    'info.autoStopped': 'automatic stop after {n} bars without notes',
    'info.badMeter': 'Invalid meter or note length (expected format: 6/8).',
    'info.micError': 'Microphone unavailable: {err}',
    'key.forced': 'Key set: {key}',
    'key.detected': 'Detected key: {key} ({conf}) — other candidates: {alt}',
    'key.conf.clear': 'clear',
    'key.conf.likely': 'likely',
    'key.conf.uncertain': 'uncertain',
    'key.waiting': 'Key: waiting for notes (Dmajor by default)',
    'summary.autoKey': 'auto key',

    'struct.none': 'No repetition found.',
    'struct.parts': 'Parts of {n} bars',
    'struct.exact': '{p}: exact repeat',
    'struct.volta1': '{p}: repeat with 1-bar endings',
    'struct.volta': '{p}: repeat with {n}-bar endings',
    'struct.plain1': '{p}: 1 bar, not repeated',
    'struct.plain': '{p}: {n} bars, not repeated',
    'struct.tours': '{n} rounds detected, 1 kept',

    'foot': 'Transcription: <a href="https://github.com/spotify/basic-pitch">Basic Pitch</a> model (the engine of <a href="https://github.com/DamRsn/NeuralNote">NeuralNote</a>) · Score: <a href="https://github.com/paulrosen/abcjs">abcjs</a> · ABC in <a href="https://thesession.org">thesession.org</a> style · Source code: <a href="https://github.com/la-bede/audio-to-abc">github.com/la-bede/audio-to-abc</a>',
  },

  fr: {
    'status.loading': 'Chargement du modèle Basic Pitch…',
    'status.loadingPct': 'Chargement du modèle Basic Pitch… {pct} %',
    'status.ready': 'Modèle prêt ({backend}, préchauffage {ms} ms).',
    'status.gpu': 'GPU / WebGL',
    'status.cpu': 'CPU — plus lent',
    'status.failed': 'Échec du chargement du modèle : {err}',
    'warn.insecure': 'Cette page n\'est pas servie en HTTPS (ni sur <code>localhost</code>) : le navigateur refusera l\'accès au micro.',

    'dep.title': 'Cet outil n\'est plus maintenu',
    'dep.body': `<p>Audio → ABC n'est plus mis à jour. Il est préférable d'utiliser l'outil <strong>Transcription</strong> de ${CADENCE}.</p>`
      + '<ol>'
      + `<li>Ouvrez ${CADENCE} et <strong>connectez-vous</strong>.</li>`
      + `<li>Cliquez sur l'icône <strong>Modules</strong> ${MODULES_ICON}.</li>`
      + '<li>Cliquez sur <strong>Transcription</strong>.</li>'
      + '</ol>',
    'dep.go': 'Ouvrir Cadence',
    'dep.close': 'Continuer quand même',

    'rec.record': 'Enregistrer',
    'rec.stop': 'Arrêter',
    'rec.analysing': 'Analyse…',
    'rec.new': 'Nouvelle transcription',
    'pos.ready': 'Prêt…',
    'pos.countIn': 'Décompte {n}',
    'pos.bar': 'Mesure {n}',

    'settings': 'Réglages',
    'settings.reset': '↺ Rétablir les réglages par défaut',
    'settings.resetConfirm': 'Remettre tous les réglages à leurs valeurs par défaut ? (La langue est conservée.)',
    'h.tune': 'L\'air',
    'h.metronome': 'Métronome',
    'h.metronomeStart': 'Métronome de départ',
    'f.title': 'Titre (T:)',
    'f.rhythm': 'Type (R:)',
    'f.rhythmPh': 'facultatif : reel, jig, bourrée…',
    'f.meter': 'Métrique (M:)',
    'f.meterOther': 'Autre…',
    'mhint.3/4': 'valse',
    'f.meterCustom': 'Autre métrique (M:)',
    'f.unit': 'Note de base (L:)',
    'f.unitHint': 'L:1/8 est la norme : 99,8 % des versions sur thesession.org l\'utilisent.',
    'f.key': 'Tonalité (K:)',
    'f.keyAuto': 'Auto (détection)',
    'f.tempo': 'Tempo ({beat}) =',
    'f.beat': 'Pulsation',
    'f.countIn': 'Décompte (mesures)',
    'f.pickup': 'Levée',
    'f.pickupAuto': 'Auto',
    'f.pickupNone': 'Aucune',
    'f.pickupN': '{n} unité(s) L',
    'f.click': 'Clic',
    'f.clickAlways': 'Toujours (casque conseillé)',
    'f.clickCountin': 'Décompte seulement',
    'f.clickOff': 'Visuel seulement',
    'f.autoStop': 'Arrêt auto',
    'f.autoStopOff': 'Désactivé',
    'f.autoStopN1': 'après 1 mesure de silence',
    'f.autoStopN': 'après {n} mesures de silence',
    'f.instrument': 'Instrument',
    'f.tempoMode': 'Mode tempo',
    'f.tempoTrackLevel': 'Suivre mon tempo — clic arrêté après la mesure 2',
    'f.tempoTrackAbc': 'Suivre mon tempo — clic arrêté après 2 mesures transcrites',
    'f.tempoFixed': 'Métronome continu, tempo fixe',
    'f.advanced': 'Réglages avancés',
    'h.metronomeAdv': 'Métronome et enregistrement',
    'h.notation': 'Notation ABC',
    'h.detection': 'Détection (NeuralNote / Basic Pitch)',
    'f.noteSens': 'Sensibilité notes :',
    'f.splitSens': 'Sensibilité séparation :',
    'f.minNote': 'Durée min. de note :',
    'f.latency': 'Latence supplémentaire :',
    'f.grid': 'Grille rythmique',
    'f.grid1': '= L (croches pour L:1/8)',
    'f.grid2': 'L/2 (doubles croches)',
    'f.barsPerLine': 'Mesures par ligne',
    'f.autoAlign': 'Recalage automatique sur la grille',
    'f.melodia': 'Notes liées sans attaque (« melodia trick »)',
    'untitled': 'Sans titre',

    'mode.major': 'Majeur',
    'mode.minor': 'Mineur',
    'mode.dorian': 'Dorien',
    'mode.mixolydian': 'Mixolydien',
    'beat.half': 'blanche',
    'beat.dottedHalf': 'blanche pointée',
    'beat.quarter': 'noire',
    'beat.dottedQuarter': 'noire pointée',
    'beat.eighth': 'croche',
    'ins.generic': 'Générique',
    'ins.whistle': 'Flûte / tin whistle (D)',
    'ins.fiddle': 'Violon',
    'ins.accordion': 'Accordéon / concertina',
    'ins.banjo': 'Banjo / mandoline',
    'ins.pipes': 'Uilleann pipes',
    'ins.voice': 'Voix',

    'out.simplify': 'Simplifier (reprises)',
    'out.linear': 'Version linéaire',
    'out.copy': 'Copier',
    'out.copied': 'Copié ✓',
    'out.tolerance': 'Tolérance : 1 mesure différente admise hors fins de partie',
    'out.recording': 'Enregistrement',
    'out.downloadAudio': 'Télécharger l\'audio',
    'file.recording': 'enregistrement',

    'info.notes': '{n} notes',
    'info.latency': 'latence compensée {ms} ms',
    'info.shift': 'recalage {ms} ms',
    'info.pickup': 'levée {n} × L',
    'info.noPickup': 'pas de levée',
    'info.analysis': 'analyse : {ms} ms / fenêtre, retard {lag} s',
    'info.engine': 'moteur {b}',
    'info.tempo': 'tempo suivi : {beat} = {now} ({min}–{max})',
    'info.autoStopped1': 'arrêt automatique après 1 mesure sans note',
    'info.autoStopped': 'arrêt automatique après {n} mesures sans note',
    'info.badMeter': 'Métrique ou note de base invalide (format attendu : 6/8).',
    'info.micError': 'Micro inaccessible : {err}',
    'key.forced': 'Tonalité imposée : {key}',
    'key.detected': 'Tonalité détectée : {key} ({conf}) — autres possibilités : {alt}',
    'key.conf.clear': 'nette',
    'key.conf.likely': 'probable',
    'key.conf.uncertain': 'incertaine',
    'key.waiting': 'Tonalité : en attente de notes (Dmajor par défaut)',
    'summary.autoKey': 'tonalité auto',

    'struct.none': 'Aucune répétition trouvée.',
    'struct.parts': 'Parties de {n} mesures',
    'struct.exact': '{p} : reprise exacte',
    'struct.volta1': '{p} : reprise avec voltas (1 mesure)',
    'struct.volta': '{p} : reprise avec voltas ({n} mesures)',
    'struct.plain1': '{p} : 1 mesure sans reprise',
    'struct.plain': '{p} : {n} mesures sans reprise',
    'struct.tours': '{n} tours détectés, 1 conservé',

    'foot': 'Transcription : modèle <a href="https://github.com/spotify/basic-pitch">Basic Pitch</a> (moteur de <a href="https://github.com/DamRsn/NeuralNote">NeuralNote</a>) · Partition : <a href="https://github.com/paulrosen/abcjs">abcjs</a> · ABC au format <a href="https://thesession.org">thesession.org</a> · Code source : <a href="https://github.com/la-bede/audio-to-abc">github.com/la-bede/audio-to-abc</a>',
  },
};

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(v) ? v : null;
  } catch (_) { return null; }
}

// Langue imposée par l'adresse (?lang=fr / ?lang=en) : prioritaire, puis mémorisée.
function readUrl() {
  try {
    const v = new URLSearchParams(window.location.search).get('lang');
    return LANGS.includes(v) ? v : null;
  } catch (_) { return null; }
}

const fromUrl = readUrl();
let lang = fromUrl || readStored() || 'en';
if (fromUrl) { try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch (_) { /* stockage indisponible */ } }

/** Met l'adresse affichée en accord avec la langue (?lang=xx), sans recharger la page. */
export function syncUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    window.history.replaceState(null, '', url);
  } catch (_) { /* adresse non modifiable (aperçu, iframe…) */ }
}

export function getLang() { return lang; }

export function setLang(l) {
  if (!LANGS.includes(l)) return;
  lang = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch (_) { /* stockage indisponible */ }
  document.documentElement.lang = l;
}

/** Traduction avec interpolation : t('pos.bar', { n: 3 }) → « Bar 3 ». */
export function t(key, vars) {
  let s = DICT[lang][key] ?? DICT.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/**
 * Applique les traductions aux éléments marqués :
 *  data-i18n="clé" (texte), data-i18n-html="clé" (HTML de confiance, issu du dictionnaire),
 *  data-i18n-attr="attribut:clé".
 */
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  for (const e of root.querySelectorAll('[data-i18n]')) e.textContent = t(e.dataset.i18n);
  for (const e of root.querySelectorAll('[data-i18n-html]')) e.innerHTML = t(e.dataset.i18nHtml);
  for (const e of root.querySelectorAll('[data-i18n-attr]')) {
    const [attr, key] = e.dataset.i18nAttr.split(':');
    e.setAttribute(attr, t(key));
  }
}
