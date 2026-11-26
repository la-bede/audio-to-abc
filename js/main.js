// Orchestration : réglages → métronome + micro → Basic Pitch → quantification → ABC → partition.

import { TUNE_TYPES, INSTRUMENTS, BEAT_CHOICES, parseFraction, defaultBeat, defaultGroup, beatSymbol, tuneTypeLabel } from './tunetypes.js';
import { t, getLang, setLang, applyStatic, syncUrl } from './i18n.js';
import { PlayDetector } from './tempo.js';
import { Metronome } from './metronome.js';
import { Recorder } from './recorder.js';
import { Transcriber } from './transcriber.js';
import { quantize, shouldAutoStop } from './quantize.js';
import { allKeys, keyFromId, detectKey, makeKey } from './key.js';
import { renderBars, layoutLinear, abcHeader, clipboardPayload } from './abc.js';
import { PlaybackCursor, eventAt } from './cursor.js';
import { simplify, layoutSimplified } from './structure.js';

const $ = (id) => document.getElementById(id);
const el = {
  status: $('status'), title: $('title'), tuneType: $('tuneType'), meter: $('meter'), unitL: $('unitL'),
  keySelect: $('keySelect'), bpm: $('bpm'), bpmRange: $('bpmRange'), beat: $('beat'), tempoLabel: $('tempoLabel'),
  countIn: $('countIn'), pickup: $('pickup'), clickMode: $('clickMode'), instrument: $('instrument'),
  noteSens: $('noteSens'), splitSens: $('splitSens'), minNote: $('minNote'), latency: $('latency'),
  grid: $('grid'), barsPerLine: $('barsPerLine'), autoAlign: $('autoAlign'), melodia: $('melodia'),
  recordBtn: $('recordBtn'), recordLabel: $('recordLabel'), beats: $('beats'), levelBar: $('levelBar'),
  position: $('position'), info: $('info'), keyInfo: $('keyInfo'), abcText: $('abcText'), paper: $('paper'),
  synth: $('synth'), copyBtn: $('copyBtn'), downloadAbcBtn: $('downloadAbcBtn'),
  recordingBox: $('recordingBox'), recAudio: $('recAudio'), downloadAudio: $('downloadAudio'),
  autoStop: $('autoStop'), simplifyBtn: $('simplifyBtn'), structureBox: $('structureBox'), structureInfo: $('structureInfo'),
  tolerance: $('tolerance'), settingsPanel: $('settingsPanel'), settingsSummary: $('settingsSummary'),
  tempoMode: $('tempoMode'), playerBar: $('playerBar'),
};

const transcriber = new Transcriber();
let ctx = null, metronome = null, recorder = null;
let session = null;       // instantané de l'enregistrement en cours / terminé
let state = 'loading';    // loading | idle | recording | stopping
let notes = [];
let pollTimer = null, rafId = null, wakeLock = null;
let synthControl = null, renderTimer = null, lastRendered = '';
let simplified = false;   // affichage de la version simplifiée (reprises / voltas)
let audioUrl = null;      // URL objet de l'enregistrement courant
let stopReason = null;     // { key, vars } : raison de l'arrêt automatique
let statusMsg = { key: 'status.loading' };
let infoMsg = null;
let lastQ = null;         // dernière quantification (événements, tempo suivi)
const cursor = new PlaybackCursor($('paper'));
let recTimings = null;    // positions des notes sur la partition (abcjs setTiming, 60 pulsations/min)
let recBeatLen = 0.25;    // durée d'une pulsation abcjs (fraction de ronde)
let recCursorRaf = null;       // message hors transcription (erreur micro, métrique invalide)
const desktop = window.matchMedia('(min-width: 1024px)');

// ---------------------------------------------------------------------------------------------
// Remplissage des listes
for (const id of Object.keys(TUNE_TYPES)) el.tuneType.add(new Option('', id));
for (const id of Object.keys(INSTRUMENTS)) el.instrument.add(new Option('', id));
for (const b of BEAT_CHOICES) el.beat.add(new Option('', String(b.value)));

const FIFTHS_ORDER = [2, 7, 9, 4, 0, 5, 11, 10, 3, 6, 1, 8];
const MODES = ['major', 'minor', 'dorian', 'mixolydian'];
for (const mode of MODES) {
  const g = document.createElement('optgroup');
  g.dataset.mode = mode;
  const keys = allKeys().filter(k => k.mode === mode)
    .sort((a, b) => FIFTHS_ORDER.indexOf(a.tonicPc) - FIFTHS_ORDER.indexOf(b.tonicPc));
  for (const k of keys) g.appendChild(new Option(k.session, k.id));
  el.keySelect.appendChild(g);
}

// Textes dépendant de la langue (les valeurs sélectionnées ne changent pas).
function translateUi() {
  applyStatic();
  for (const o of el.tuneType.options) o.textContent = tuneTypeLabel(o.value);
  for (const o of el.instrument.options) o.textContent = t(INSTRUMENTS[o.value].labelKey);
  BEAT_CHOICES.forEach((b, i) => { el.beat.options[i].textContent = t(b.labelKey); });
  for (const g of el.keySelect.querySelectorAll('optgroup')) g.label = t(`mode.${g.dataset.mode}`);
  for (const o of el.pickup.options) {
    o.textContent = o.value === 'auto' ? t('f.pickupAuto') : o.value === '0' ? t('f.pickupNone') : t('f.pickupN', { n: o.value });
  }
  for (const o of el.autoStop.options) {
    const n = Number(o.value);
    o.textContent = n === 0 ? t('f.autoStopOff') : t(n === 1 ? 'f.autoStopN1' : 'f.autoStopN', { n });
  }
  for (const b of document.querySelectorAll('.lang-switch .lang')) {
    const on = b.dataset.lang === getLang();
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  }
  refreshBeatUi();
  updateRecordLabel();
  updateSimplifyButton();
  renderStatus();
  updateSummary();
  if (session) regenerate();
  else { el.info.textContent = infoMsg ? t(infoMsg.key, infoMsg.vars) : ''; renderPreview(); }
}

function setStatus(key, vars) { statusMsg = { key, vars }; renderStatus(); }
function renderStatus() { el.status.textContent = t(statusMsg.key, statusMsg.vars); }
function setInfo(key, vars) { infoMsg = { key, vars }; el.info.textContent = t(key, vars); }

// Libellé du bouton principal selon l'état.
function updateRecordLabel() {
  el.recordLabel.textContent = t(state === 'recording' ? 'rec.stop'
    : state === 'stopping' && session ? 'rec.analysing'
      : session?.final ? 'rec.new' : 'rec.record');
  document.body.dataset.state = state === 'idle' && session?.final ? 'done' : state;
}

for (const b of document.querySelectorAll('.lang-switch .lang')) {
  b.addEventListener('click', () => { setLang(b.dataset.lang); syncUrl(); translateUi(); });
}

if (!window.isSecureContext) $('secureWarning').hidden = false;

// ---------------------------------------------------------------------------------------------
// Réglages
function selectBeat(value) {
  let best = el.beat.options[0];
  for (const o of el.beat.options) if (Math.abs(Number(o.value) - value) < Math.abs(Number(best.value) - value)) best = o;
  el.beat.value = best.value;
}

function applyTuneType() {
  const t = TUNE_TYPES[el.tuneType.value];
  const custom = el.tuneType.value === 'custom';
  el.meter.readOnly = !custom;
  el.unitL.disabled = !custom;
  if (!custom) {
    el.meter.value = t.M;
    el.unitL.value = t.L;
    selectBeat(t.beat);
    setBpm(t.bpm);
  }
  refreshBeatUi();
}

function setBpm(v) {
  v = Math.max(30, Math.min(240, Math.round(Number(v) || 90)));
  el.bpm.value = v;
  el.bpmRange.value = v;
}

function refreshBeatUi() {
  el.tempoLabel.textContent = t('f.tempo', { beat: beatSymbol(Number(el.beat.value)) });
  const s = readSettings();
  el.beats.innerHTML = '';
  for (let i = 0; i < (s ? s.beatsPerBar : 0); i++) {
    const d = document.createElement('span');
    if (i === 0) d.classList.add('first');
    el.beats.appendChild(d);
  }
}

function readSettings() {
  const meter = parseFraction(el.meter.value);
  const unit = parseFraction(el.unitL.value);
  if (!meter || !unit) return null;
  const typeId = el.tuneType.value;
  const type = TUNE_TYPES[typeId];
  let beat = Number(el.beat.value);
  let beatsPerBar = meter.value / beat;
  if (Math.abs(beatsPerBar - Math.round(beatsPerBar)) > 1e-6) { beat = defaultBeat(meter); beatsPerBar = meter.value / beat; }
  beatsPerBar = Math.round(beatsPerBar);
  const gridDiv = Number(el.grid.value);
  const unitsPerBar = meter.value / unit.value;
  const groupUnits = typeId === 'custom' || el.unitL.value !== '1/8' ? defaultGroup(meter, unit.value) : type.group;
  const ins = INSTRUMENTS[el.instrument.value];
  return {
    typeId, rhythm: typeId === 'custom' ? null : typeId,
    M: `${meter.num}/${meter.den}`, L: `${unit.num}/${unit.den}`, meter, unit: unit.value,
    beat, beatsPerBar, bpm: Number(el.bpm.value),
    countInBars: Number(el.countIn.value), pickup: el.pickup.value, clickMode: el.clickMode.value,
    gridDiv, barSteps: Math.round(unitsPerBar * gridDiv), groupSteps: Math.max(1, Math.round(groupUnits * gridDiv)),
    barsPerLine: Number(el.barsPerLine.value), keyId: el.keySelect.value, title: el.title.value.trim() || t('untitled'),
    autoStopBars: Number(el.autoStop.value), tolerance: el.tolerance.checked ? 1 : 0,
    tempoMode: el.tempoMode.value, track: el.tempoMode.value !== 'fixed',
    autoAlign: el.autoAlign.checked, extraLatency: Number(el.latency.value) / 1000,
    detect: {
      noteSensitivity: Number(el.noteSens.value), splitSensitivity: Number(el.splitSens.value),
      minNoteMs: Number(el.minNote.value), minMidi: ins.min, maxMidi: ins.max, melodia: el.melodia.checked,
    },
  };
}

// Persistance locale des réglages (confort uniquement).
const PERSIST = ['title', 'tuneType', 'meter', 'unitL', 'keySelect', 'bpm', 'beat', 'countIn', 'pickup', 'clickMode', 'instrument',
  'noteSens', 'splitSens', 'minNote', 'latency', 'grid', 'barsPerLine', 'autoAlign', 'melodia', 'autoStop', 'tolerance', 'tempoMode'];
function saveSettings() {
  updateSummary();
  try {
    const o = {};
    for (const k of PERSIST) o[k] = el[k].type === 'checkbox' ? el[k].checked : el[k].value;
    localStorage.setItem('audio2abc.settings', JSON.stringify(o));
  } catch (_) { /* stockage indisponible */ }
}
function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem('audio2abc.settings') || 'null');
    if (!o) return false;
    for (const k of PERSIST) if (k in o) { if (el[k].type === 'checkbox') el[k].checked = o[k]; else el[k].value = o[k]; }
    // v2 : le mode tempo par défaut devient « clic arrêté après 2 mesures transcrites ».
    if (localStorage.getItem('audio2abc.settingsVersion') !== '2') {
      if (el.tempoMode.value === 'track-level') el.tempoMode.value = 'track-abc';
      localStorage.setItem('audio2abc.settingsVersion', '2');
    }
    // Ancien titre par défaut : remplacé par le libellé traduit (champ vide).
    if (['Sans titre', 'Untitled'].includes(el.title.value)) el.title.value = '';
    return true;
  } catch (_) { return false; }
}

// Résumé affiché quand le panneau de réglages est replié (smartphone).
function updateSummary() {
  const s = readSettings();
  if (!s) return;
  const type = tuneTypeLabel(s.typeId).replace('…', '');
  const key = s.keyId === 'auto' ? t('summary.autoKey') : keyFromId(s.keyId).session;
  el.settingsSummary.textContent = `${type} · ${s.M} · ${beatSymbol(s.beat)} = ${s.bpm} · ${key}`;
}

// Sur bureau, le panneau de réglages reste toujours ouvert.
function syncPanel() { if (desktop.matches) el.settingsPanel.open = true; }
if (desktop.addEventListener) desktop.addEventListener('change', syncPanel);

// ---------------------------------------------------------------------------------------------
// Événements de l'interface
el.tuneType.addEventListener('change', () => { applyTuneType(); onSettingsChanged('quant'); });
el.meter.addEventListener('change', () => { refreshBeatUi(); onSettingsChanged('quant'); });
el.unitL.addEventListener('change', () => onSettingsChanged('quant'));
el.beat.addEventListener('change', () => { refreshBeatUi(); saveSettings(); });
el.bpm.addEventListener('change', () => { setBpm(el.bpm.value); saveSettings(); });
el.bpmRange.addEventListener('input', () => { setBpm(el.bpmRange.value); saveSettings(); });
for (const k of ['countIn', 'clickMode', 'autoStop']) el[k].addEventListener('change', saveSettings);
for (const k of ['pickup', 'keySelect', 'grid', 'barsPerLine', 'autoAlign', 'tolerance', 'tempoMode']) el[k].addEventListener('change', () => onSettingsChanged('quant'));
el.title.addEventListener('input', () => onSettingsChanged('quant'));
el.latency.addEventListener('input', () => { $('latencyOut').textContent = `${el.latency.value} ms`; onSettingsChanged('quant'); });
el.noteSens.addEventListener('input', () => { $('noteSensOut').textContent = Number(el.noteSens.value).toFixed(2); onSettingsChanged('detect'); });
el.splitSens.addEventListener('input', () => { $('splitSensOut').textContent = Number(el.splitSens.value).toFixed(2); onSettingsChanged('detect'); });
el.minNote.addEventListener('input', () => { $('minNoteOut').textContent = `${el.minNote.value} ms`; onSettingsChanged('detect'); });
for (const k of ['instrument', 'melodia']) el[k].addEventListener('change', () => onSettingsChanged('detect'));

let detectTimer = null;
function onSettingsChanged(kind) {
  saveSettings();
  if (!session) { renderPreview(); return; }
  if (state === 'recording' || state === 'stopping') return;
  if (kind === 'detect') {
    clearTimeout(detectTimer);
    detectTimer = setTimeout(() => {
      notes = transcriber.renotes(readSettings().detect);
      regenerate();
    }, 150);
  } else {
    regenerate();
  }
}

el.abcText.addEventListener('input', () => scheduleRender(el.abcText.value));
// Copie : HTML (une ligne ABC par paragraphe, pour Writer / Word) + texte brut en \r\n.
el.copyBtn.addEventListener('click', async () => {
  const { plain, html } = clipboardPayload(el.abcText.value);
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([plain], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
    } else {
      await navigator.clipboard.writeText(plain);
    }
    flash(el.copyBtn, t('out.copied'));
  } catch (_) {
    try { await navigator.clipboard.writeText(plain); flash(el.copyBtn, t('out.copied')); }
    catch (__) { el.abcText.select(); document.execCommand('copy'); flash(el.copyBtn, t('out.copied')); }
  }
});

// Aperçu avant enregistrement : l'en-tête ABC suit les réglages (titre, type, M:, L:, tonalité).
function renderPreview() {
  if (session) return;
  const s = readSettings();
  if (!s) return;
  const key = s.keyId !== 'auto' ? keyFromId(s.keyId) : makeKey(2, 'major');
  const abc = abcHeader({ header: { title: s.title, rhythm: s.rhythm, M: s.M, L: s.L }, key }) + '\n';
  el.abcText.value = abc;
  scheduleRender(abc);
}
el.downloadAbcBtn.addEventListener('click', () => {
  const name = (readSettings()?.title || 'transcription').replace(/[^\w\- ]+/g, '').trim() || 'transcription';
  downloadBlob(new Blob([el.abcText.value], { type: 'text/vnd.abc;charset=utf-8' }), `${name}.abc`);
});
el.recordBtn.addEventListener('click', () => { if (state === 'idle') startRecording(); else if (state === 'recording') stopRecording(null); });
el.simplifyBtn.addEventListener('click', () => {
  simplified = !simplified;
  updateSimplifyButton();
  regenerate();
});
function updateSimplifyButton() {
  el.simplifyBtn.textContent = t(simplified ? 'out.linear' : 'out.simplify');
  el.simplifyBtn.classList.toggle('active', simplified);
}

function flash(btn, text) {
  btn.textContent = text;
  setTimeout(() => { btn.textContent = t('out.copy'); }, 1200);
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------------------------------------
// Enregistrement
async function startRecording() {
  const s = readSettings();
  if (!s) { setInfo('info.badMeter'); return; }
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      metronome = new Metronome(ctx);
      recorder = new Recorder(ctx);
    }
    await ctx.resume();
    state = 'stopping'; // évite un double clic pendant la demande d'autorisation
    el.recordBtn.disabled = true;
    resetOutput();
    recorder.onSamples = (x) => transcriber.push(x);
    await recorder.start();
  } catch (err) {
    console.error(err);
    state = 'idle';
    el.recordBtn.disabled = false;
    updateRecordLabel();
    setInfo('info.micError', { err: err.message || err });
    return;
  }

  if (!desktop.matches) el.settingsPanel.open = false;
  const startTime = ctx.currentTime + 0.25;
  metronome.start({ bpm: s.bpm, beatsPerBar: s.beatsPerBar, countInBars: s.countInBars, startTime, sound: s.clickMode });
  session = {
    bpm: s.bpm, beat: s.beat, beatsPerBar: s.beatsPerBar, t0: metronome.t0,
    latency: recorder.roundTripLatency(), final: false, mode: s.tempoMode,
    barSec: s.beatsPerBar * (60 / s.bpm),
  };
  // Mode « clic arrêté après la mesure 2 » : début de jeu détecté au niveau du micro.
  const detector = s.tempoMode === 'track-level' ? new PlayDetector() : null;
  recorder.onLevel = detector ? (time, rms) => {
    if (session.clickStopPlanned || !metronome.clicking()) return;
    const start = detector.push(time - session.latency, rms);
    if (start !== null) planClickStop(start);
  } : null;
  state = 'recording';
  el.recordBtn.disabled = false;
  el.recordBtn.classList.add('recording');
  updateRecordLabel();
  setSettingsLocked(true);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (_) { wakeLock = null; }

  pollTimer = setInterval(async () => {
    if (transcriber.busy) return;
    const did = await transcriber.process(false);
    if (did && state === 'recording') {
      const st = readSettings();
      notes = transcriber.notes(st.detect, false);
      regenerate();
      const barUnits = st.meter.value / st.unit;
      const barSec = lastQ?.tempo ? barUnits * lastQ.tempo.unitSecNow : (st.meter.value / session.beat) * (60 / session.bpm);
      const auto = shouldAutoStop({
        notes, analyzedSec: transcriber.analyzedSec(), captureStart: recorder.firstTime ?? session.t0,
        t0: session.t0, barSec, bars: st.autoStopBars, latency: session.latency + st.extraLatency,
      });
      // Mode « clic arrêté après 2 mesures transcrites ».
      if (session.mode === 'track-abc' && !session.clickStopPlanned && metronome.clicking()
          && lastQ && lastQ.events.some(e => e.midi != null && e.pos >= 2 * st.barSteps)) {
        session.clickStopPlanned = true;
        metronome.stopAt(metronome.nextDownbeatAfter(ctx.currentTime + 0.2));
      }
      updateClickState();
      if (auto.stop && state === 'recording') {
        const n = st.autoStopBars;
        stopRecording({ key: n > 1 ? 'info.autoStopped' : 'info.autoStopped1', vars: { n } });
      }
    }
  }, 250);
  animate();
}

// Arrêt du clic deux mesures après le début de jeu détecté (hors levée) : si le jeu commence
// pendant le décompte ou dans la 1re moitié d'une mesure, cette mesure compte comme la 1re.
function planClickStop(playStart) {
  const rel = (playStart - session.t0) / session.barSec;
  const startBar = rel < 0 ? 0 : Math.floor(rel) + (rel - Math.floor(rel) >= 0.5 ? 1 : 0);
  session.clickStopPlanned = true;
  metronome.stopAt(session.t0 + (startBar + 2) * session.barSec);
}

function updateClickState() {
  document.body.dataset.click = metronome && metronome.clicking() ? 'on' : 'off';
}

// Remet à zéro la sortie avant une nouvelle transcription (sans recharger la page).
function resetOutput() {
  transcriber.reset();
  notes = [];
  simplified = false;
  stopReason = null;
  infoMsg = null;
  session = null;
  lastQ = null;
  updateSimplifyButton();
  el.simplifyBtn.hidden = true;
  el.structureBox.hidden = true;
  destroySynth();
  stopRecordingCursor();
  cursor.hide();
  recTimings = null;
  el.paper.innerHTML = '';
  el.recordingBox.hidden = true;
  el.recAudio.pause();
  el.recAudio.removeAttribute('src');
  el.recAudio.load();
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  el.keyInfo.textContent = '';
  el.info.textContent = '';
  el.abcText.readOnly = true;
}

async function stopRecording(reason = null) {
  if (state !== 'recording') return;
  state = 'stopping';
  stopReason = reason;
  el.recordBtn.disabled = true;
  updateRecordLabel();
  clearInterval(pollTimer);
  metronome.stop();
  recorder.onLevel = null;
  updateClickState();
  const blob = await recorder.stop();
  while (transcriber.busy) await new Promise(r => setTimeout(r, 30));
  await transcriber.process(true);
  session.final = true;
  notes = transcriber.notes(readSettings().detect, true);
  cancelAnimationFrame(rafId);
  [...el.beats.children].forEach(b => b.classList.remove('on'));
  el.levelBar.style.width = '0';
  try { await wakeLock?.release(); } catch (_) { /* rien */ }

  if (blob && blob.size) {
    audioUrl = URL.createObjectURL(blob);
    el.recAudio.src = audioUrl;
    el.downloadAudio.href = audioUrl;
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    el.downloadAudio.download = `${t('file.recording')}.${ext}`;
    el.recordingBox.hidden = false;
  }
  state = 'idle';
  el.recordBtn.disabled = false;
  el.recordBtn.classList.remove('recording');
  updateRecordLabel();
  el.position.textContent = '—';
  el.simplifyBtn.hidden = false;
  el.abcText.readOnly = false;
  setSettingsLocked(false);
  regenerate();
}

// Tempo, pulsation et décompte sont figés pour l'enregistrement en cours (la grille en dépend).
function setSettingsLocked(locked) {
  for (const k of ['bpm', 'bpmRange', 'beat', 'countIn', 'clickMode', 'tuneType', 'meter', 'unitL', 'tempoMode']) el[k].disabled = locked;
  if (!locked) applyTuneTypeLockState();
}
function applyTuneTypeLockState() {
  const custom = el.tuneType.value === 'custom';
  el.meter.readOnly = !custom;
  el.unitL.disabled = !custom;
}

// ---------------------------------------------------------------------------------------------
// Transcription → ABC
function regenerate() {
  if (!session) return;
  const s = readSettings();
  if (!s) return;
  // Durée d'une unité L avec le tempo et la pulsation utilisés à l'enregistrement.
  const unitSec = (s.unit / session.beat) * (60 / session.bpm);
  const q = quantize(notes, {
    captureStart: recorder.firstTime ?? session.t0, t0: session.t0,
    latency: session.latency + s.extraLatency, unitSec, gridDiv: s.gridDiv,
    barSteps: s.barSteps, pickup: s.pickup, autoAlign: s.autoAlign, final: session.final, track: s.track,
  });
  lastQ = q;
  let key;
  if (s.keyId !== 'auto') {
    key = keyFromId(s.keyId);
    el.keyInfo.textContent = t('key.forced', { key: key.session });
  } else {
    const last = [...q.events].reverse().find(e => e.midi != null);
    key = detectKey(q.events, { finalPc: session.final && last ? last.midi % 12 : undefined });
    if (key) {
      const conf = t(key.margin > 0.08 ? 'key.conf.clear' : key.margin > 0.03 ? 'key.conf.likely' : 'key.conf.uncertain');
      el.keyInfo.textContent = t('key.detected', { key: key.session, conf, alt: key.alternatives.join(', ') });
    } else {
      key = makeKey(2, 'major');
      el.keyInfo.textContent = t('key.waiting');
    }
  }
  const r = renderBars({
    events: q.events, barSteps: s.barSteps, gridDiv: s.gridDiv, groupSteps: s.groupSteps, key,
    header: { title: s.title, rhythm: s.rhythm, M: s.M, L: s.L },
  });
  let abc;
  const showStructure = simplified && session.final;
  if (showStructure) {
    const res = simplify(r.bars, { tolerance: s.tolerance });
    abc = res.repeated ? layoutSimplified(r, res, s.barsPerLine) : layoutLinear(r, s.barsPerLine, true);
    el.structureInfo.textContent = res.summary;
  } else {
    abc = layoutLinear(r, s.barsPerLine, session.final);
  }
  el.structureBox.hidden = !showStructure;
  el.abcText.value = abc;
  const lag = transcriber.backlogSec();
  const parts = [
    t('info.notes', { n: q.noteCount }),
    t('info.latency', { ms: Math.round((session.latency + s.extraLatency) * 1000) }),
    q.tempo ? tempoInfo(q.tempo, unitSec) : null,
    !q.tempo && s.autoAlign ? t('info.shift', { ms: `${q.shiftMs >= 0 ? '+' : ''}${q.shiftMs}` }) : null,
    q.pickupSteps ? t('info.pickup', { n: q.pickupSteps / s.gridDiv }) : t('info.noPickup'),
    state === 'recording' ? t('info.analysis', { ms: transcriber.lastInferMs.toFixed(0), lag: lag.toFixed(1) }) : null,
    t('info.engine', { b: transcriber.backend }),
    session.final && stopReason ? t(stopReason.key, stopReason.vars) : null,
  ].filter(Boolean);
  el.info.textContent = parts.join(' · ');
  scheduleRender(abc);
}

// « tempo suivi : blanche = 92 (88–97) » dans l'unité de pulsation choisie.
function tempoInfo(tempo, unitSec) {
  const bpm = (u) => Math.round(session.bpm * (unitSec / u));
  return t('info.tempo', {
    beat: beatSymbol(session.beat), now: bpm(tempo.unitSecNow), min: bpm(tempo.unitSecMax), max: bpm(tempo.unitSecMin),
  });
}

function scheduleRender(abc) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => render(abc), state === 'recording' ? 0 : 120);
}

function render(abc) {
  if (!window.ABCJS) return;
  if (abc === lastRendered && synthControl) return;
  lastRendered = abc;
  const visual = window.ABCJS.renderAbc('paper', abc, { responsive: 'resize', add_classes: true, paddingleft: 8, paddingright: 8 })[0];
  cursor.hide();
  if (state !== 'recording' && session?.final && visual) {
    // Positions des notes à 60 pulsations/min (copie : le lecteur abcjs recalcule les siennes).
    try {
      recBeatLen = visual.getBeatLength();
      recTimings = visual.setTiming(60, 0).filter(e => e.type === 'event' && e.left != null).slice();
    } catch (_) { recTimings = null; }
    setupSynth(visual);
  }
}

function setupSynth(visual) {
  if (!window.ABCJS.synth || !window.ABCJS.synth.supportsAudio()) return;
  if (!synthControl) {
    synthControl = new window.ABCJS.synth.SynthController();
    const cursorControl = {
      beatSubdivisions: 2,
      onStart() { el.recAudio.pause(); },
      onEvent(ev) { if (ev && ev.left != null) cursor.draw(ev); },
      onFinished() { cursor.hide(); },
    };
    synthControl.load('#synth', cursorControl, { displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true, displayLoop: true });
    el.playerBar.hidden = false;
  }
  const s = readSettings();
  // Tempo de lecture : tempo moyen suivi, sinon celui du métronome.
  const barSec = lastQ?.tempo ? (s.meter.value / s.unit) * lastQ.tempo.unitSecMean : (s.meter.value / session.beat) * (60 / session.bpm);
  synthControl.setTune(visual, false, { millisecondsPerMeasure: barSec * 1000 }).catch(err => console.warn('synth', err));
}

function destroySynth() {
  if (synthControl) { try { synthControl.destroy(); } catch (_) { /* rien */ } }
  synthControl = null;
  el.synth.innerHTML = '';
  el.playerBar.hidden = true;
  lastRendered = '';
}

// ---------------------------------------------------------------------------------------------
// Animation : voyants de pulsation, position, niveau micro
function animate() {
  rafId = requestAnimationFrame(animate);
  if (!metronome || !session) return;
  const now = ctx.currentTime - (ctx.outputLatency || 0);
  let pos = (now - session.t0) / (60 / session.bpm);
  // Clic arrêté : les voyants suivent le tempo de l'interprète (extrapolation du suivi).
  if (!metronome.clicking() && lastQ?.tempo) {
    const st = readSettings();
    pos = lastQ.tempo.toUnits(now - session.t0) * (st.unit / session.beat);
  }
  updateClickState();
  const beatsPerBar = session.beatsPerBar;
  const beatIdx = ((Math.floor(pos) % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const frac = pos - Math.floor(pos);
  [...el.beats.children].forEach((b, i) => b.classList.toggle('on', i === beatIdx && frac < 0.35 && now >= metronome.startTime));
  if (now < metronome.startTime) el.position.textContent = t('pos.ready');
  else if (pos < 0) el.position.textContent = t('pos.countIn', { n: Math.ceil(-pos / beatsPerBar) });
  else el.position.textContent = t('pos.bar', { n: Math.floor(pos / beatsPerBar) + 1 });
  el.levelBar.style.width = `${Math.min(100, Math.round(Math.sqrt(recorder.peak) * 100))}%`;
}

// ---------------------------------------------------------------------------------------------
// Initialisation
setLang(getLang());
translateUi();
if (!loadSettings()) { el.tuneType.value = 'reel'; applyTuneType(); }
applyTuneTypeLockState();
setBpm(el.bpm.value);
refreshBeatUi();
$('noteSensOut').textContent = Number(el.noteSens.value).toFixed(2);
$('splitSensOut').textContent = Number(el.splitSens.value).toFixed(2);
$('minNoteOut').textContent = `${el.minNote.value} ms`;
$('latencyOut').textContent = `${el.latency.value} ms`;
translateUi();
syncPanel();
renderPreview();

// Hauteur du lecteur collé en haut → variable CSS (colonne gauche collante, défilement du curseur).
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    const h = el.playerBar.hidden ? 0 : el.playerBar.offsetHeight;
    document.documentElement.style.setProperty('--player-h', `${h}px`);
  }).observe(el.playerBar);
}

// ---------------------------------------------------------------------------------------------
// Curseur pendant la lecture de l'enregistrement : temps du média → position dans l'air → partition.
function recordingCursorFrame() {
  recCursorRaf = requestAnimationFrame(recordingCursorFrame);
  if (!recTimings || !recTimings.length || !lastQ?.toSteps || !session || simplified) { cursor.hide(); return; }
  const s = readSettings();
  const rel = (recorder.firstTime ?? session.t0) + el.recAudio.currentTime - session.latency - s.extraLatency - session.t0;
  const steps = lastQ.toSteps(rel) - lastQ.origin + lastQ.pickupSteps;   // depuis le début de l'air (levée comprise)
  if (steps < 0) { cursor.hide(); return; }
  const wholes = (steps / s.gridDiv) * s.unit;
  const ms = (wholes / recBeatLen) * 1000;                                 // setTiming(60) : 1 pulsation = 1 s
  const last = recTimings[recTimings.length - 1];
  if (ms > last.milliseconds + 2000) { cursor.hide(); return; }
  cursor.draw(eventAt(recTimings, ms));
}
function stopRecordingCursor() {
  if (recCursorRaf) cancelAnimationFrame(recCursorRaf);
  recCursorRaf = null;
}
el.recAudio.addEventListener('play', () => {
  if (synthControl) { try { synthControl.pause(); } catch (_) { /* rien */ } }
  stopRecordingCursor();
  recordingCursorFrame();
});
el.recAudio.addEventListener('pause', () => { stopRecordingCursor(); cursor.hide(); });
el.recAudio.addEventListener('ended', () => { stopRecordingCursor(); cursor.hide(); });

(async () => {
  try {
    const url = new URL('../vendor/basic-pitch/model/model.json', import.meta.url).href;
    const backend = await transcriber.load(url, (p) => setStatus('status.loadingPct', { pct: Math.round(p * 100) }));
    setStatus('status.ready', { backend: t(backend === 'webgl' ? 'status.gpu' : 'status.cpu'), ms: Math.round(transcriber.warmupMs) });
    state = 'idle';
    el.recordBtn.disabled = false;
    updateRecordLabel();
  } catch (err) {
    console.error(err);
    setStatus('status.failed', { err: err.message || err });
  }
})();
