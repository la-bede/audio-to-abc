// Métronome Web Audio à planification anticipée (look-ahead) : horloge = AudioContext.currentTime.
// Les clics sont aigus (A6 / C7) pour rester hors de la tessiture filtrée et ne pas être transcrits.

export class Metronome {
  constructor(ctx) {
    this.ctx = ctx;
    this.running = false;
    this.timer = null;
    this.out = ctx.createGain();
    this.out.gain.value = 0.6;
    this.out.connect(ctx.destination);
  }

  /**
   * @param {object} o
   *  bpm, beatsPerBar, countInBars, startTime (temps ctx du 1er clic du décompte),
   *  sound: 'always' | 'countin' | 'off'
   */
  start(o) {
    this.stop();
    this.o = o;
    this.beatSec = 60 / o.bpm;
    this.startTime = o.startTime;
    this.t0 = o.startTime + o.countInBars * o.beatsPerBar * this.beatSec; // 1er temps de la mesure 1
    this.nextBeat = 0;
    this.running = true;
    this.clickTimes = [];
    const tick = () => this._schedule();
    tick();
    this.timer = setInterval(tick, 25);
  }

  _schedule() {
    const ahead = this.ctx.currentTime + 0.15;
    while (this.running) {
      const t = this.startTime + this.nextBeat * this.beatSec;
      if (t > ahead) break;
      const inCountIn = this.nextBeat < this.o.countInBars * this.o.beatsPerBar;
      const accent = this.nextBeat % this.o.beatsPerBar === 0;
      const audible = this.o.sound === 'always' || (this.o.sound === 'countin' && inCountIn);
      if (audible && t >= this.ctx.currentTime - 0.01) this._click(t, accent, inCountIn);
      this.clickTimes.push(t);
      this.nextBeat++;
    }
  }

  _click(t, accent, inCountIn) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = accent ? 2093 : 1760;
    const peak = inCountIn ? 0.9 : 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // Position musicale courante (en pulsations depuis t0, négative pendant le décompte).
  beatPosition(time = this.ctx.currentTime) {
    if (!this.running && this.t0 == null) return null;
    return (time - this.t0) / this.beatSec;
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
