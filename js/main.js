// Orchestration : réglages → métronome + micro → Basic Pitch → quantification → ABC → partition.

import { TUNE_TYPES, INSTRUMENTS, BEAT_CHOICES, parseFraction, defaultBeat, defaultGroup, beatSymbol } from './tunetypes.js';
import { Metronome } from './metronome.js';
import { Recorder } from './recorder.js';
import { Transcriber } from './transcriber.js';
import { quantize, shouldAutoStop } from './quantize.js';
import { allKeys, keyFromId, detectKey, makeKey } from './key.js';
import { renderBars, layoutLinear } from './abc.js';
import { simplify, layoutSimplified } from './structure.js';

const $ = (id) => document.getElementById(id);
const el = {
  status: $('status'), title: $('title'), tuneType: $('tuneType'), meter: $('meter'), unitL: $('unitL'),
  keySelect: $('keySelect'), bpm: $('bpm'), bpmRange: $('bpmRange'), beat: $('beat'), beatSym: $('beatSym'),
  countIn: $('countIn'), pickup: $('pickup'), clickMode: $('clickMode'), instrument: $('instrument'),
  noteSens: $('noteSens'), splitSens: $('splitSens'), minNote: $('minNote'), latency: $('latency'),
  grid: $('grid'), barsPerLine: $('barsPerLine'), autoAlign: $('autoAlign'), melodia: $('melodia'),
  recordBtn: $('recordBtn'), recordLabel: $('recordLabel'), beats: $('beats'), levelBar: $('levelBar'),
  position: $('position'), info: $('info'), keyInfo: $('keyInfo'), abcText: $('abcText'), paper: $('paper'),
  synth: $('synth'), copyBtn: $('copyBtn'), downloadAbcBtn: $('downloadAbcBtn'),
  recordingBox: $('recordingBox'), recAudio: $('recAudio'), downloadAudio: $('downloadAudio'),
  autoStop: $('autoStop'), simplifyBtn: $('simplifyBtn'), structureBox: $('structureBox'), structureInfo: $('structureInfo'),
  tolerance: $('tolerance'), settingsPanel: $('settingsPanel'), settingsSummary: $('settingsSummary'),
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
let stopReason = '';
const desktop = window.matchMedia('(min-width: 1024px)');

// ---------------------------------------------------------------------------------------------
// Remplissage des listes
for (const [id, t] of Object.entries(TUNE_TYPES)) el.tuneType.add(new Option(t.label, id));
for (const [id, ins] of Object.entries(INSTRUMENTS)) el.instrument.add(new Option(ins.label, id));
for (const b of BEAT_CHOICES) el.beat.add(new Option(b.label, String(b.value)));

const FIFTHS_ORDER = [2, 7, 9, 4, 0, 5, 11, 10, 3, 6, 1, 8];
const MODE_LABELS = { major: 'Majeur', minor: 'Mineur', dorian: 'Dorien', mixolydian: 'Mixolydien' };
for (const mode of Object.keys(MODE_LABELS)) {
  const g = document.createElement('optgroup');
  g.label = MODE_LABELS[mode];
  const keys = allKeys().filter(k => k.mode === mode)
    .sort((a, b) => FIFTHS_ORDER.indexOf(a.tonicPc) - FIFTHS_ORDER.indexOf(b.tonicPc));
  for (const k of keys) g.appendChild(new Option(k.session, k.id));
  el.keySelect.appendChild(g);
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
  el.beatSym.textContent = beatSymbol(Number(el.beat.value));
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
    barsPerLine: Number(el.barsPerLine.value), keyId: el.keySelect.value, title: el.title.value.trim(),
    autoStopBars: Number(el.autoStop.value), tolerance: el.tolerance.checked ? 1 : 0,
    autoAlign: el.autoAlign.checked, extraLatency: Number(el.latency.value) / 1000,
    detect: {
      noteSensitivity: Number(el.noteSens.value), splitSensitivity: Number(el.splitSens.value),
      minNoteMs: Number(el.minNote.value), minMidi: ins.min, maxMidi: ins.max, melodia: el.melodia.checked,
    },
  };
}

// Persistance locale des réglages (confort uniquement).
const PERSIST = ['title', 'tuneType', 'meter', 'unitL', 'keySelect', 'bpm', 'beat', 'countIn', 'pickup', 'clickMode', 'instrument',
  'noteSens', 'splitSens', 'minNote', 'latency', 'grid', 'barsPerLine', 'autoAlign', 'melodia', 'autoStop', 'tolerance'];
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
    return true;
  } catch (_) { return false; }
}

// Résumé affiché quand le panneau de réglages est replié (smartphone).
function updateSummary() {
  const s = readSettings();
  if (!s) return;
  const type = TUNE_TYPES[s.typeId].label.replace('…', '');
  const key = s.keyId === 'auto' ? 'tonalité auto' : keyFromId(s.keyId).session;
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
for (const k of ['pickup', 'keySelect', 'grid', 'barsPerLine', 'autoAlign', 'tolerance']) el[k].addEventListener('change', () => onSettingsChanged('quant'));
el.title.addEventListener('input', () => onSettingsChanged('quant'));
el.latency.addEventListener('input', () => { $('latencyOut').textContent = `${el.latency.value} ms`; onSettingsChanged('quant'); });
el.noteSens.addEventListener('input', () => { $('noteSensOut').textContent = Number(el.noteSens.value).toFixed(2); onSettingsChanged('detect'); });
el.splitSens.addEventListener('input', () => { $('splitSensOut').textContent = Number(el.splitSens.value).toFixed(2); onSettingsChanged('detect'); });
el.minNote.addEventListener('input', () => { $('minNoteOut').textContent = `${el.minNote.value} ms`; onSettingsChanged('detect'); });
for (const k of ['instrument', 'melodia']) el[k].addEventListener('change', () => onSettingsChanged('detect'));

let detectTimer = null;
function onSettingsChanged(kind) {
  saveSettings();
  if (!session || state === 'recording' || state === 'stopping') return;
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
el.copyBtn.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(el.abcText.value); flash(el.copyBtn, 'Copié ✓'); }
  catch (_) { el.abcText.select(); document.execCommand('copy'); flash(el.copyBtn, 'Copié ✓'); }
});
el.downloadAbcBtn.addEventListener('click', () => {
  const name = (readSettings()?.title || 'transcription').replace(/[^\w\- ]+/g, '').trim() || 'transcription';
  downloadBlob(new Blob([el.abcText.value], { type: 'text/vnd.abc;charset=utf-8' }), `${name}.abc`);
});
el.recordBtn.addEventListener('click', () => { if (state === 'idle') startRecording(); else if (state === 'recording') stopRecording('manuel'); });
el.simplifyBtn.addEventListener('click', () => {
  simplified = !simplified;
  updateSimplifyButton();
  regenerate();
});
function updateSimplifyButton() {
  el.simplifyBtn.textContent = simplified ? 'Version linéaire' : 'Simplifier (reprises)';
  el.simplifyBtn.classList.toggle('active', simplified);
}

function flash(btn, text) {
  const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200);
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
  if (!s) { el.info.textContent = 'Métrique ou note de base invalide (format attendu : 6/8).'; return; }
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
    el.info.textContent = `Micro inaccessible : ${err.message || err}`;
    return;
  }

  if (!desktop.matches) el.settingsPanel.open = false;
  const startTime = ctx.currentTime + 0.25;
  metronome.start({ bpm: s.bpm, beatsPerBar: s.beatsPerBar, countInBars: s.countInBars, startTime, sound: s.clickMode });
  session = {
    bpm: s.bpm, beat: s.beat, beatsPerBar: s.beatsPerBar, t0: metronome.t0,
    latency: recorder.roundTripLatency(), final: false,
  };
  state = 'recording';
  el.recordBtn.disabled = false;
  el.recordBtn.classList.add('recording');
  el.recordLabel.textContent = 'Arrêter';
  setSettingsLocked(true);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (_) { wakeLock = null; }

  pollTimer = setInterval(async () => {
    if (transcriber.busy) return;
    const did = await transcriber.process(false);
    if (did && state === 'recording') {
      const st = readSettings();
      notes = transcriber.notes(st.detect, false);
      regenerate();
      const barSec = (st.meter.value / session.beat) * (60 / session.bpm);
      const auto = shouldAutoStop({
        notes, analyzedSec: transcriber.analyzedSec(), captureStart: recorder.firstTime ?? session.t0,
        t0: session.t0, barSec, bars: st.autoStopBars, latency: session.latency + st.extraLatency,
      });
      if (auto.stop && state === 'recording') {
        stopRecording(`arrêt automatique après ${st.autoStopBars} mesure${st.autoStopBars > 1 ? 's' : ''} sans note`);
      }
    }
  }, 250);
  animate();
}

// Remet à zéro la sortie avant une nouvelle transcription (sans recharger la page).
function resetOutput() {
  transcriber.reset();
  notes = [];
  simplified = false;
  stopReason = '';
  updateSimplifyButton();
  el.simplifyBtn.hidden = true;
  el.structureBox.hidden = true;
  destroySynth();
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

async function stopRecording(reason = '') {
  if (state !== 'recording') return;
  state = 'stopping';
  stopReason = reason === 'manuel' ? '' : reason;
  el.recordBtn.disabled = true;
  el.recordLabel.textContent = 'Analyse…';
  clearInterval(pollTimer);
  metronome.stop();
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
    el.downloadAudio.download = `enregistrement.${ext}`;
    el.recordingBox.hidden = false;
  }
  state = 'idle';
  el.recordBtn.disabled = false;
  el.recordBtn.classList.remove('recording');
  el.recordLabel.textContent = 'Nouvelle transcription';
  el.position.textContent = '—';
  el.simplifyBtn.hidden = false;
  el.abcText.readOnly = false;
  setSettingsLocked(false);
  regenerate();
}

// Tempo, pulsation et décompte sont figés pour l'enregistrement en cours (la grille en dépend).
function setSettingsLocked(locked) {
  for (const k of ['bpm', 'bpmRange', 'beat', 'countIn', 'clickMode', 'tuneType', 'meter', 'unitL']) el[k].disabled = locked;
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
    barSteps: s.barSteps, pickup: s.pickup, autoAlign: s.autoAlign, final: session.final,
  });
  let key;
  if (s.keyId !== 'auto') {
    key = keyFromId(s.keyId);
    el.keyInfo.textContent = `Tonalité imposée : ${key.session}`;
  } else {
    const last = [...q.events].reverse().find(e => e.midi != null);
    key = detectKey(q.events, { finalPc: session.final && last ? last.midi % 12 : undefined });
    if (key) {
      const conf = key.margin > 0.08 ? 'nette' : key.margin > 0.03 ? 'probable' : 'incertaine';
      el.keyInfo.textContent = `Tonalité détectée : ${key.session} (${conf}) — autres possibilités : ${key.alternatives.join(', ')}`;
    } else {
      key = makeKey(2, 'major');
      el.keyInfo.textContent = 'Tonalité : en attente de notes (Dmajor par défaut)';
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
    `${q.noteCount} notes`,
    `latence compensée ${Math.round((session.latency + s.extraLatency) * 1000)} ms`,
    s.autoAlign ? `recalage ${q.shiftMs >= 0 ? '+' : ''}${q.shiftMs} ms` : null,
    q.pickupSteps ? `levée ${q.pickupSteps / s.gridDiv} × L` : 'pas de levée',
    state === 'recording' ? `analyse : ${transcriber.lastInferMs.toFixed(0)} ms / fenêtre, retard ${lag.toFixed(1)} s` : null,
    `moteur ${transcriber.backend}`,
    session.final && stopReason ? stopReason : null,
  ].filter(Boolean);
  el.info.textContent = parts.join(' · ');
  scheduleRender(abc);
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
  if (state !== 'recording' && session?.final && visual) setupSynth(visual);
}

function setupSynth(visual) {
  if (!window.ABCJS.synth || !window.ABCJS.synth.supportsAudio()) return;
  if (!synthControl) {
    synthControl = new window.ABCJS.synth.SynthController();
    synthControl.load('#synth', null, { displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true, displayLoop: true });
  }
  const s = readSettings();
  const barSec = (s.meter.value / session.beat) * (60 / session.bpm);
  synthControl.setTune(visual, false, { millisecondsPerMeasure: barSec * 1000 }).catch(err => console.warn('synth', err));
}

function destroySynth() {
  if (synthControl) { try { synthControl.destroy(); } catch (_) { /* rien */ } }
  synthControl = null;
  el.synth.innerHTML = '';
  lastRendered = '';
}

// ---------------------------------------------------------------------------------------------
// Animation : voyants de pulsation, position, niveau micro
function animate() {
  rafId = requestAnimationFrame(animate);
  if (!metronome || !session) return;
  const now = ctx.currentTime - (ctx.outputLatency || 0);
  const pos = (now - session.t0) / (60 / session.bpm);
  const beatsPerBar = session.beatsPerBar;
  const beatIdx = ((Math.floor(pos) % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const frac = pos - Math.floor(pos);
  [...el.beats.children].forEach((b, i) => b.classList.toggle('on', i === beatIdx && frac < 0.35 && now >= metronome.startTime));
  if (now < metronome.startTime) el.position.textContent = 'Prêt…';
  else if (pos < 0) el.position.textContent = `Décompte ${Math.ceil(-pos / beatsPerBar)}`;
  else el.position.textContent = `Mesure ${Math.floor(pos / beatsPerBar) + 1}`;
  el.levelBar.style.width = `${Math.min(100, Math.round(Math.sqrt(recorder.peak) * 100))}%`;
}

// ---------------------------------------------------------------------------------------------
// Initialisation
if (!loadSettings()) { el.tuneType.value = 'reel'; applyTuneType(); }
applyTuneTypeLockState();
setBpm(el.bpm.value);
refreshBeatUi();
$('noteSensOut').textContent = Number(el.noteSens.value).toFixed(2);
$('splitSensOut').textContent = Number(el.splitSens.value).toFixed(2);
$('minNoteOut').textContent = `${el.minNote.value} ms`;
$('latencyOut').textContent = `${el.latency.value} ms`;
updateSummary();
syncPanel();
el.abcText.value = 'X: 1\nT: Sans titre\nR: reel\nM: 4/4\nL: 1/8\nK: Dmaj\n';

(async () => {
  try {
    const url = new URL('../vendor/basic-pitch/model/model.json', import.meta.url).href;
    const backend = await transcriber.load(url, (p) => { el.status.textContent = `Chargement du modèle Basic Pitch… ${Math.round(p * 100)} %`; });
    el.status.textContent = `Modèle prêt (${backend === 'webgl' ? 'GPU / WebGL' : 'CPU — plus lent'}, préchauffage ${Math.round(transcriber.warmupMs)} ms).`;
    state = 'idle';
    el.recordBtn.disabled = false;
  } catch (err) {
    console.error(err);
    el.status.textContent = `Échec du chargement du modèle : ${err.message || err}`;
  }
})();
