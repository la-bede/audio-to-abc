// Capture micro : getUserMedia → passe-bas → AudioWorklet → rééchantillonnage à 22 050 Hz (Basic Pitch).
// Enregistre en parallèle le flux brut avec MediaRecorder pour la réécoute / le téléchargement.

export const TARGET_SR = 22050;

class StreamResampler {
  constructor(inRate, outRate) {
    this.ratio = inRate / outRate;
    this.pos = 0;          // position (en échantillons source) du prochain échantillon de sortie
    this.prev = 0;         // dernier échantillon source du bloc précédent
    this.consumed = 0;     // nombre d'échantillons source déjà consommés
  }
  push(input) {
    const out = [];
    const base = this.consumed - 1; // index source de this.prev
    const end = this.consumed + input.length - 1;
    while (Math.floor(this.pos) < end) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = i === base ? this.prev : input[i - this.consumed];
      const b = input[i + 1 - this.consumed];
      out.push(a + (b - a) * frac);
      this.pos += this.ratio;
    }
    this.prev = input[input.length - 1];
    this.consumed += input.length;
    return Float32Array.from(out);
  }
}

export class Recorder {
  constructor(ctx) {
    this.ctx = ctx;
    this.onSamples = null; // (Float32Array à 22 050 Hz) => void
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    const track = this.stream.getAudioTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    this.inputLatency = typeof settings.latency === 'number' ? settings.latency : 0;

    if (!this.workletLoaded) {
      await this.ctx.audioWorklet.addModule(new URL('./worklet-capture.js', import.meta.url));
      this.workletLoaded = true;
    }
    this.source = this.ctx.createMediaStreamSource(this.stream);
    // Anti-repliement avant décimation (2 biquads ≈ 24 dB/oct).
    const lp1 = this.ctx.createBiquadFilter();
    const lp2 = this.ctx.createBiquadFilter();
    for (const f of [lp1, lp2]) { f.type = 'lowpass'; f.frequency.value = 9500; f.Q.value = 0.707; }
    this.node = new AudioWorkletNode(this.ctx, 'capture-processor', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    this.mute = this.ctx.createGain();
    this.mute.gain.value = 0;
    this.source.connect(lp1).connect(lp2).connect(this.node).connect(this.mute).connect(this.ctx.destination);
    this.filters = [lp1, lp2];

    this.resampler = new StreamResampler(this.ctx.sampleRate, TARGET_SR);
    this.firstTime = null; // temps ctx du 1er échantillon capté
    this.peak = 0;
    this.node.port.onmessage = (e) => {
      const { frame, samples } = e.data;
      if (this.firstTime === null) this.firstTime = frame / this.ctx.sampleRate;
      let p = 0;
      for (let i = 0; i < samples.length; i++) { const v = Math.abs(samples[i]); if (v > p) p = v; }
      this.peak = Math.max(p, this.peak * 0.9);
      const out = this.resampler.push(samples);
      if (out.length && this.onSamples) this.onSamples(out);
    };

    // Enregistrement compressé pour la réécoute.
    this.chunks = [];
    this.mediaRecorder = null;
    if (window.MediaRecorder) {
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mimeType = types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
      try {
        this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
        this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
        this.mediaRecorder.start(1000);
      } catch (err) {
        console.warn('MediaRecorder indisponible', err);
      }
    }
  }

  // Latence totale estimée entre l'émission d'un clic et sa captation par le micro (s).
  roundTripLatency() {
    const out = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return out + (this.inputLatency || 0);
  }

  async stop() {
    if (this.node) this.node.port.postMessage('stop');
    let blob = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      blob = await new Promise((resolve) => {
        this.mediaRecorder.onstop = () => resolve(new Blob(this.chunks, { type: this.mediaRecorder.mimeType || 'audio/webm' }));
        this.mediaRecorder.stop();
      });
    }
    // Laisse le worklet vider son tampon avant de déconnecter.
    await new Promise(r => setTimeout(r, 100));
    try { this.source.disconnect(); } catch (_) { /* déjà déconnecté */ }
    try { this.node.disconnect(); } catch (_) { /* idem */ }
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    return blob;
  }
}
