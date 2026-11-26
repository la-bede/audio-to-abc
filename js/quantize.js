// Quantification : notes en secondes → événements sur la grille rythmique du métronome.
// Réduit la polyphonie à une mélodie, recale automatiquement le décalage micro/haut-parleur,
// détecte la levée et calcule les durées (jeu legato : une note dure jusqu'à l'onset suivant).
// Deux modes : tempo fixe (grille du métronome + recalage global) ou suivi du tempo de l'interprète
// (grille déformée par trackTempo, cf. tempo.js).

import { trackTempo } from './tempo.js';

/**
 * @param {Array} notes  [{start, dur, midi, amp}] (s depuis le 1er échantillon capté)
 * @param {object} t
 *   captureStart : temps ctx du 1er échantillon ; t0 : temps ctx du temps 1 de la mesure 1
 *   latency (s) ; unitSec : durée de L ; gridDiv : pas par unité L (1 ou 2)
 *   barSteps : pas par mesure ; pickup : 'auto' | nombre d'unités L ; autoAlign : bool ; final : bool
 *   track : bool — suivre le tempo de l'interprète (sinon grille fixe du métronome)
 *   trackOptions : réglages optionnels de trackTempo
 */
export function quantize(notes, t) {
  const stepSec = t.unitSec / t.gridDiv;
  const barSec = t.barSteps * stepSec;
  const forced = t.pickup !== 'auto';
  const earliest = forced ? -Number(t.pickup) * t.unitSec : -barSec;

  // 1. Temps relatifs au temps 1 de la mesure 1.
  let ns = notes
    .map(n => ({ t: t.captureStart + n.start - t.latency - t.t0, dur: n.dur, midi: n.midi, amp: n.amp }))
    .filter(n => n.t >= earliest - 0.5 * stepSec)
    .sort((a, b) => a.t - b.t);

  // 2. Réduction monophonique.
  const mono = [];
  const clash = Math.min(0.06, 0.4 * stepSec);
  for (const n of ns) {
    const k = mono[mono.length - 1];
    if (k) {
      // Fragment de fin d'une note tenue (même hauteur, collé, plus court qu'un demi-pas) → fusion.
      if (n.midi === k.midi && n.t - (k.t + k.dur) < 0.05 && n.dur < 0.6 * stepSec) {
        k.dur = Math.max(k.dur, n.t + n.dur - k.t);
        continue;
      }
      if (n.t - k.t < clash) {
        if (score(n) > score(k)) mono[mono.length - 1] = n;
        continue;
      }
      const iv = Math.abs(n.midi - k.midi);
      const inside = n.t + n.dur <= k.t + k.dur + 0.02;
      if (inside && n.amp < 0.6 * k.amp && (iv === 12 || iv === 19 || iv === 24)) continue; // harmonique
    }
    mono.push(n);
  }
  ns = mono;

  // 3a. Suivi du tempo : la grille suit les débuts de note de l'interprète.
  let tracker = null;
  if (t.track) tracker = trackTempo(ns, { unitSec: t.unitSec, ...(t.trackOptions || {}) });
  const toSteps = tracker
    ? (x) => tracker.toUnits(x) * t.gridDiv
    : (x) => (x - shift) / stepSec;

  // 3b. Tempo fixe : recalage automatique (moyenne circulaire de la phase des onsets sur la grille L).
  let shift = 0;
  if (!tracker && t.autoAlign && ns.length >= 6) {
    let sx = 0, sy = 0, w = 0;
    for (const n of ns) {
      const ph = n.t / t.unitSec;
      const a = 2 * Math.PI * (ph - Math.round(ph));
      sx += n.amp * Math.cos(a); sy += n.amp * Math.sin(a); w += n.amp;
    }
    const R = Math.hypot(sx, sy) / w;
    if (R > 0.25) {
      shift = (Math.atan2(sy, sx) / (2 * Math.PI)) * t.unitSec;
      if (Math.abs(shift) > 0.35 * t.unitSec) shift = 0;
    }
  }

  // 4. Position sur la grille ; une seule note par pas.
  const byPos = new Map();
  for (const n of ns) {
    const pos = Math.round(toSteps(n.t));
    if (!forced && pos < -t.barSteps) continue;
    const prev = byPos.get(pos);
    if (!prev || score(n) > score(prev)) byPos.set(pos, { ...n, pos });
  }
  const seq = [...byPos.values()].sort((a, b) => a.pos - b.pos);
  const tempo = tracker ? {
    unitSecNow: tracker.unitSecNow, unitSecMean: tracker.unitSecMean,
    unitSecMin: tracker.unitSecMin, unitSecMax: tracker.unitSecMax, toUnits: tracker.toUnits,
  } : null;
  if (seq.length === 0) return { events: [], pickupSteps: 0, shiftMs: Math.round(shift * 1000), noteCount: 0, tempo, origin: 0 };

  // 5. Origine de la mesure 1 et levée.
  const p0 = seq[0].pos;
  let origin;
  if (forced) {
    origin = p0 < 0 && Number(t.pickup) > 0 ? 0 : p0 + Number(t.pickup) * t.gridDiv;
  } else if (p0 < 0) {
    origin = 0;
  } else {
    const bar = Math.floor(p0 / t.barSteps);
    const within = p0 - bar * t.barSteps;
    origin = within === 0 ? bar * t.barSteps
      : within >= t.barSteps / 2 ? (bar + 1) * t.barSteps   // départ en 2de moitié de mesure → levée
      : bar * t.barSteps;                                    // départ après un silence
  }

  // 6. Durées.
  const restMin = 2 * t.gridDiv; // un silence n'est écrit qu'à partir d'une noire (L=1/8)
  const events = [];
  const firstRel = p0 - origin;
  if (firstRel > 0) events.push({ pos: 0, len: firstRel, midi: null });
  for (let i = 0; i < seq.length; i++) {
    const n = seq[i];
    const pos = n.pos - origin;
    const own = Math.max(1, Math.round(toSteps(n.t + n.dur) - toSteps(n.t)));
    if (i + 1 < seq.length) {
      const gap = seq[i + 1].pos - n.pos;
      if (gap - own >= restMin) {
        events.push({ pos, len: own, midi: n.midi });
        events.push({ pos: pos + own, len: gap - own, midi: null });
      } else {
        events.push({ pos, len: gap, midi: n.midi });
      }
    } else {
      events.push({ pos, len: own, midi: n.midi });
    }
  }
  const pickupSteps = Math.max(0, -Math.min(...events.map(e => e.pos)));
  for (const e of events) e.onDownbeat = ((e.pos % t.barSteps) + t.barSteps) % t.barSteps === 0;
  return { events, pickupSteps, shiftMs: Math.round(shift * 1000), noteCount: seq.length, tempo, origin };
}

function score(n) {
  return n.amp * Math.min(n.dur, 0.3);
}

/**
 * Arrêt automatique : vrai si au moins une note a été jouée (à partir de la dernière mesure du
 * décompte) et si l'audio analysé depuis la fin de la dernière note dépasse `bars` mesures.
 * Basé sur la transcription : les clics du métronome et le bruit (hors tessiture) sont ignorés.
 * @param {object} a { notes, analyzedSec, captureStart, t0, barSec, bars, latency }
 */
export function shouldAutoStop(a) {
  if (!a.bars) return { stop: false, silenceSec: 0 };
  let lastEnd = null;
  for (const n of a.notes) {
    const start = a.captureStart + n.start - a.latency;
    if (start < a.t0 - a.barSec) continue;
    const end = start + n.dur;
    if (lastEnd === null || end > lastEnd) lastEnd = end;
  }
  if (lastEnd === null) return { stop: false, silenceSec: 0 };
  const analyzedEnd = a.captureStart + a.analyzedSec - a.latency;
  const silenceSec = analyzedEnd - lastEnd;
  return { stop: silenceSec >= a.bars * a.barSec, silenceSec };
}
