// AudioWorklet : regroupe les blocs de 128 échantillons (canal 0) et les envoie au thread principal
// avec l'index d'échantillon (horloge du contexte) du premier échantillon.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 2048;
    this.buf = new Float32Array(this.size);
    this.n = 0;
    this.startFrame = null;
    this.active = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.active = false; };
  }

  process(inputs) {
    if (!this.active) {
      if (this.n > 0) this._flush();
      return false;
    }
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    // Le premier bloc reçu fixe l'origine temporelle.
    if (this.n === 0) this.startFrame = currentFrame;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.size) {
        this._flush();
        this.startFrame = currentFrame + i + 1;
      }
    }
    return true;
  }

  _flush() {
    const out = this.buf.slice(0, this.n);
    this.port.postMessage({ frame: this.startFrame, samples: out }, [out.buffer]);
    this.n = 0;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
