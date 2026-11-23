// Transcription incrémentale avec le modèle Basic Pitch (le moteur de NeuralNote), via TensorFlow.js.
// Le flux audio (22 050 Hz) est découpé en fenêtres de 2 s qui se chevauchent ; chaque fenêtre donne
// 142 trames utiles (après rognage de 15 trames de chaque côté), juxtaposées sans dérive temporelle.
// Le post-traitement (onsets → notes) reprend celui de basic-pitch / NeuralNote, appliqué par segments
// glissants : les notes terminées depuis plus d'1 s sont « validées » et ne sont plus recalculées.

import * as tf from '@tensorflow/tfjs';
import { outputToNotesPoly } from '../vendor/basic-pitch/toMidi.js';

const SR = 22050;
const HOP = 256;
const WIN = SR * 2 - HOP;          // 43 844 échantillons par fenêtre (entrée du modèle)
const TRIM = 15;                   // trames rognées de chaque côté
const FRAMES_PER_WIN = 142;        // 172 - 2 × 15
const WIN_HOP = FRAMES_PER_WIN * HOP; // 36 352 échantillons : pas entre fenêtres, aligné sur les trames
const PAD = TRIM * HOP;            // zéros ajoutés au début
export const FRAME_SEC = HOP / SR;
const SAFE_FRAMES = 86;            // ~1 s : marge avant validation définitive des notes

export class Transcriber {
  constructor() {
    this.model = null;
    this.reset();
  }

  async load(modelUrl, onProgress) {
    try {
      await tf.setBackend('webgl');
    } catch (_) { /* repli ci-dessous */ }
    await tf.ready();
    if (tf.getBackend() !== 'webgl') {
      await tf.setBackend('cpu');
      await tf.ready();
    }
    this.backend = tf.getBackend();
    this.model = await tf.loadGraphModel(modelUrl, { onProgress });
    // Préchauffage (compilation des shaders WebGL).
    const t0 = performance.now();
    await this._infer(new Float32Array(WIN));
    this.warmupMs = performance.now() - t0;
    return this.backend;
  }

  reset() {
    this.audio = new Float32Array(SR * 120);
    this.len = PAD;                 // les PAD premiers échantillons sont des zéros
    this.realSamples = 0;
    this.frames = [];
    this.onsets = [];
    this.nextWin = 0;
    this.busy = false;
    this.lastInferMs = 0;
    this._resetPost();
  }

  _resetPost() {
    this.committed = [];
    this.pending = [];
    this.commitFrame = 0;
  }

  push(samples) {
    if (this.len + samples.length > this.audio.length) {
      const bigger = new Float32Array(Math.max(this.audio.length * 2, this.len + samples.length));
      bigger.set(this.audio.subarray(0, this.len));
      this.audio = bigger;
    }
    this.audio.set(samples, this.len);
    this.len += samples.length;
    this.realSamples += samples.length;
  }

  // Secondes d'audio déjà analysées par le modèle.
  analyzedSec() {
    return this.frames.length * FRAME_SEC;
  }

  // Secondes d'audio reçues mais pas encore analysées (retard de la transcription).
  backlogSec() {
    return Math.max(0, this.realSamples / SR - this.frames.length * FRAME_SEC);
  }

  async _infer(windowSamples) {
    const [fr, on] = tf.tidy(() => {
      const x = tf.tensor(windowSamples, [1, WIN, 1]);
      const out = this.model.execute(x, ['Identity_1', 'Identity_2']); // frames, onsets
      return out.map(t => t.slice([0, TRIM, 0], [1, FRAMES_PER_WIN, -1]).reshape([FRAMES_PER_WIN, -1]));
    });
    const frArr = await fr.array();
    const onArr = await on.array();
    fr.dispose();
    on.dispose();
    return [frArr, onArr];
  }

  /** Analyse toutes les fenêtres complètes disponibles. final = true : complète la dernière avec des zéros. */
  async process(final = false) {
    if (this.busy || !this.model) return false;
    this.busy = true;
    let did = false;
    try {
      const totalFrames = Math.floor(this.realSamples / HOP);
      for (;;) {
        const start = this.nextWin * WIN_HOP;
        const haveFull = this.len >= start + WIN;
        const needMore = this.nextWin * FRAMES_PER_WIN < totalFrames;
        if (!haveFull && !(final && needMore)) break;
        let win;
        if (haveFull) win = this.audio.slice(start, start + WIN);
        else { win = new Float32Array(WIN); win.set(this.audio.subarray(start, this.len)); }
        const t0 = performance.now();
        const [fr, on] = await this._infer(win);
        this.lastInferMs = performance.now() - t0;
        for (let i = 0; i < FRAMES_PER_WIN; i++) { this.frames.push(fr[i]); this.onsets.push(on[i]); }
        this.nextWin++;
        did = true;
      }
      if (final && this.frames.length > totalFrames) {
        this.frames.length = totalFrames;
        this.onsets.length = totalFrames;
      }
    } finally {
      this.busy = false;
    }
    return did;
  }

  /**
   * Notes détectées (temps en s depuis le 1er échantillon capté).
   * p : { noteSensitivity, splitSensitivity, minNoteMs, minMidi, maxMidi, melodia }
   */
  notes(p, final = false) {
    this._advance(p, this.frames.length, final);
    return this.committed.concat(this.pending);
  }

  /** Recalcule toutes les notes (après changement des réglages de détection). */
  renotes(p) {
    this._resetPost();
    const E = this.frames.length;
    for (let upTo = Math.min(E, FRAMES_PER_WIN * 2); ; upTo = Math.min(E, upTo + FRAMES_PER_WIN * 2)) {
      this._advance(p, upTo, upTo >= E);
      if (upTo >= E) break;
    }
    return this.committed.concat(this.pending);
  }

  _advance(p, upTo, final) {
    const S = this.commitFrame;
    if (upTo - S < 8) return;
    const fr = this.frames.slice(S, upTo).map(r => r.slice());
    const on = this.onsets.slice(S, upTo).map(r => r.slice());
    const onsetThresh = 1 - p.noteSensitivity;
    const frameThresh = 1 - p.splitSensitivity;
    const minLen = Math.max(1, Math.round((p.minNoteMs / 1000) / FRAME_SEC));
    // basic-pitch tronque l'index (Array.fill) : décalages choisis pour garder [minMidi, maxMidi] inclus.
    const minHz = 440 * 2 ** ((p.minMidi + 0.5 - 69) / 12);
    const maxHz = 440 * 2 ** ((p.maxMidi + 1.5 - 69) / 12);
    let raw;
    try {
      raw = outputToNotesPoly(fr, on, onsetThresh, frameThresh, minLen, true, maxHz, minHz, p.melodia, 11);
    } catch (err) {
      console.warn('post-traitement', err);
      return;
    }
    const notes = raw.map(n => ({
      startFrame: S + n.startFrame,
      endFrame: S + n.startFrame + n.durationFrames,
      start: (S + n.startFrame) * FRAME_SEC,
      dur: n.durationFrames * FRAME_SEC,
      midi: n.pitchMidi,
      amp: n.amplitude,
    }));
    const safe = final ? Infinity : upTo - SAFE_FRAMES;
    const pending = [];
    for (const n of notes) {
      if (n.endFrame < safe) {
        // Évite les doublons avec une note déjà validée (même hauteur, chevauchement).
        const dup = this.committed.some(c => c.midi === n.midi && n.startFrame < c.endFrame && n.endFrame > c.startFrame);
        if (!dup) this.committed.push(n);
      } else {
        pending.push(n);
      }
    }
    this.pending = pending;
    if (!final) {
      let next = pending.length ? Math.min(...pending.map(n => n.startFrame)) : upTo - SAFE_FRAMES;
      next = Math.min(next, upTo - SAFE_FRAMES);
      this.commitFrame = Math.max(S, next);
    }
  }
}
