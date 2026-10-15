import { chordVoicing, midiToFreq } from '@kolednik/shared';

export const INSTRUMENTS = [
  { id: 'piano', name: 'Pianino' },
  { id: 'guitar', name: 'Gitara' },
  { id: 'organ', name: 'Organy' },
  { id: 'strings', name: 'Smyczki' },
  { id: 'musicbox', name: 'Pozytywka' },
  { id: 'bells', name: 'Dzwonki' },
] as const;
export type InstrumentId = (typeof INSTRUMENTS)[number]['id'];

type LineJob = {
  chords: string[];
  durationMs: number;
  /** Długość jednego uderzenia (ms) — rytm arpeggio/bicia. */
  beatMs: number;
  instrument: InstrumentId;
  keyShift: number;
  /** Ile ms wersu już minęło (np. po pauzie) — wcześniejsze dźwięki pomijamy. */
  offsetMs?: number;
};

/**
 * Podkład generowany na żywo z akordów kolędy (F21–F23): syntezator w przeglądarce, bez plików audio.
 * Zmiana tonacji to przesunięcie dźwięków, zmiana tempa — krótszy czas wersu.
 */
class Accompaniment {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private volume = 0.6;
  private pluckCache = new Map<number, AudioBuffer>();

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      // Delikatny pogłos „kościelny” z wygenerowanej odpowiedzi impulsowej.
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.2);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
      this.master.connect(this.reverb).connect(wet).connect(this.ctx.destination);
    }
    void this.ctx.resume();
    return this.ctx;
  }

  /** Przeglądarka pozwala na dźwięk dopiero po kliknięciu. */
  unlock() {
    this.ensure();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private freshBus(): GainNode {
    const ctx = this.ensure();
    this.bus = ctx.createGain();
    this.bus.connect(this.master!);
    return this.bus;
  }

  /** Wycisza wszystko, co zaplanowane (pauza, zmiana wersu, koniec). */
  stop() {
    if (!this.ctx || !this.bus) return;
    const bus = this.bus;
    const t = this.ctx.currentTime;
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 0.12);
    setTimeout(() => bus.disconnect(), 300);
    this.bus = null;
  }

  /** Zagraj akordy jednego wersu, rozłożone równo na jego czas. */
  playLine(job: LineJob) {
    if (!job.chords.length) return;
    this.stop();
    const ctx = this.ensure();
    const bus = this.freshBus();
    const offset = (job.offsetMs ?? 0) / 1000;
    const t0 = ctx.currentTime + 0.03 - offset;
    const seg = job.durationMs / 1000 / job.chords.length;
    const beat = Math.max(0.18, job.beatMs / 1000);
    job.chords.forEach((chord, i) => {
      const v = chordVoicing(chord, job.keyShift);
      if (!v) return;
      const start = t0 + i * seg;
      const end = start + seg;
      if (end <= ctx.currentTime) return;
      this.pattern(job.instrument, v, Math.max(start, ctx.currentTime + 0.01), end, beat, bus);
    });
  }

  /** Krótkie wejście przed kolędą: akord toniki na raz-dwa-trzy. */
  countIn(chord: string, keyShift: number, beatMs: number, instrument: InstrumentId) {
    this.playLine({ chords: [chord], durationMs: beatMs * 3, beatMs, instrument, keyShift });
  }

  private pattern(
    inst: InstrumentId,
    v: { bass: number; notes: number[] },
    start: number,
    end: number,
    beat: number,
    out: AudioNode,
  ) {
    const len = end - start;
    const beats = Math.max(1, Math.floor(len / beat));
    const [n0, n1, n2] = [v.notes[0]!, v.notes[1]!, v.notes[2]!];
    switch (inst) {
      case 'piano': {
        this.piano(v.bass, start, len, 0.5, out);
        const arp = [n0, n1, n2, n1 + 0, n0 + 12, n2];
        for (let b = 0; b < beats; b++)
          this.piano(arp[b % arp.length]!, start + b * beat, beat * 1.8, 0.28, out);
        break;
      }
      case 'guitar': {
        const strum = [v.bass - 12, v.bass - 5, n0, n1, n2, n0 + 12].filter((n) => n >= 40);
        for (let b = 0; b < beats; b += 2) {
          strum.forEach((n, k) => this.pluck(n, start + b * beat + k * 0.018, out, b === 0 ? 0.5 : 0.35));
        }
        break;
      }
      case 'organ':
        for (const n of [v.bass - 12, ...v.notes]) this.organ(n, start, len, out);
        break;
      case 'strings':
        for (const n of [v.bass, ...v.notes]) this.strings(n, start, len, out);
        break;
      case 'musicbox': {
        const arp = [n0 + 12, n1 + 12, n2 + 12, n1 + 12];
        for (let b = 0; b < beats * 2; b++)
          this.chime(arp[b % arp.length]!, start + (b * beat) / 2, out, 0.22);
        this.chime(v.bass + 12, start, out, 0.25);
        break;
      }
      case 'bells':
        for (let b = 0; b < beats; b += 2) {
          for (const n of v.notes) this.bell(n + 12, start + b * beat, out, b === 0 ? 0.22 : 0.14);
        }
        this.bell(v.bass, start, out, 0.25);
        break;
    }
  }

  private env(start: number, attack: number, peak: number, decay: number, out: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    g.connect(out);
    return g;
  }

  private osc(type: OscillatorType, freq: number, start: number, stop: number, out: AudioNode) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(out);
    o.start(start);
    o.stop(stop + 0.05);
    return o;
  }

  private piano(midi: number, start: number, dur: number, vel: number, out: AudioNode) {
    const f = midiToFreq(midi);
    const g = this.env(start, 0.005, vel * 0.5, Math.max(0.4, dur), out);
    this.osc('triangle', f, start, start + dur + 0.4, g);
    const g2 = this.env(start, 0.003, vel * 0.18, 0.35, out);
    this.osc('sine', f * 2, start, start + 0.5, g2);
  }

  private organ(midi: number, start: number, dur: number, out: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.07, start + 0.06);
    g.gain.setValueAtTime(0.07, start + dur - 0.08);
    g.gain.linearRampToValueAtTime(0, start + dur);
    g.connect(out);
    for (const [mult, level] of [
      [1, 1],
      [2, 0.5],
      [3, 0.25],
      [4, 0.2],
    ] as const) {
      const pg = ctx.createGain();
      pg.gain.value = level;
      pg.connect(g);
      this.osc('sine', midiToFreq(midi) * mult, start, start + dur, pg);
    }
  }

  private strings(midi: number, start: number, dur: number, out: AudioNode) {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.045, start + Math.min(0.5, dur / 3));
    g.gain.setValueAtTime(0.045, start + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, start + dur + 0.15);
    filter.connect(g).connect(out);
    for (const detune of [-7, 0, 7]) {
      const o = this.osc('sawtooth', midiToFreq(midi), start, start + dur + 0.2, filter);
      o.detune.value = detune;
    }
  }

  private chime(midi: number, start: number, out: AudioNode, vel: number) {
    const f = midiToFreq(midi);
    this.osc('sine', f, start, start + 1.2, this.env(start, 0.002, vel, 1.1, out));
    this.osc('sine', f * 3, start, start + 0.3, this.env(start, 0.001, vel * 0.25, 0.25, out));
  }

  private bell(midi: number, start: number, out: AudioNode, vel: number) {
    const f = midiToFreq(midi);
    for (const [mult, level, decay] of [
      [1, 1, 2.2],
      [2.76, 0.4, 1.2],
      [5.4, 0.2, 0.6],
    ] as const) {
      this.osc('sine', f * mult, start, start + decay, this.env(start, 0.002, vel * level, decay, out));
    }
  }

  /** Szarpana struna — algorytm Karplusa-Stronga, bufor liczony raz na dźwięk. */
  private pluck(midi: number, start: number, out: AudioNode, vel: number) {
    const ctx = this.ctx!;
    let buf = this.pluckCache.get(midi);
    if (!buf) {
      const sr = ctx.sampleRate;
      const n = Math.floor(sr * 2.5);
      buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      const period = Math.round(sr / midiToFreq(midi));
      for (let i = 0; i < period; i++) d[i] = Math.random() * 2 - 1;
      for (let i = period; i < n; i++) d[i] = 0.996 * 0.5 * (d[i - period]! + d[i - period + 1]!);
      this.pluckCache.set(midi, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vel * 0.45;
    src.connect(g).connect(out);
    src.start(start);
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    }
    return buf;
  }
}

export const accompaniment = new Accompaniment();
