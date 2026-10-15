import { chordVoicing, type LineMusic } from '@kolednik/shared';

/** Nagrane instrumenty (Musyng Kite SoundFont, CC BY-SA 3.0) — pliki w content/samples. */
export const INSTRUMENTS = [
  { id: 'piano', name: 'Fortepian', icon: '🎹' },
  { id: 'guitar', name: 'Gitara klasyczna', icon: '🎸' },
  { id: 'steel', name: 'Gitara akustyczna', icon: '🪕' },
  { id: 'organ', name: 'Organy', icon: '⛪' },
  { id: 'strings', name: 'Smyczki', icon: '🎻' },
  { id: 'choir', name: 'Chór', icon: '👼' },
  { id: 'flute', name: 'Flet', icon: '🪈' },
  { id: 'harp', name: 'Harfa', icon: '🎼' },
  { id: 'celesta', name: 'Czelesta', icon: '✨' },
  { id: 'musicbox', name: 'Pozytywka', icon: '🎁' },
  { id: 'bells', name: 'Dzwony', icon: '🔔' },
  { id: 'glockenspiel', name: 'Dzwonki', icon: '🎐' },
  { id: 'bass', name: 'Kontrabas', icon: '🎶' },
] as const;
export type InstrumentId = (typeof INSTRUMENTS)[number]['id'];
export type MelodyId = InstrumentId | 'none';

/** Gotowe zestawy: akompaniament + instrument prowadzący melodię. */
export const ENSEMBLES: { name: string; instruments: InstrumentId[]; melody: MelodyId }[] = [
  { name: 'Przy kominku', instruments: ['piano', 'bass'], melody: 'flute' },
  { name: 'Kolędnicy', instruments: ['steel', 'bass', 'glockenspiel'], melody: 'flute' },
  { name: 'Kościół', instruments: ['organ'], melody: 'choir' },
  { name: 'Orkiestra', instruments: ['strings', 'harp', 'bass'], melody: 'flute' },
  { name: 'Gitara', instruments: ['guitar'], melody: 'none' },
  { name: 'Pozytywka', instruments: ['musicbox', 'celesta'], melody: 'glockenspiel' },
];

/** Jak instrument gra akordy. */
const STYLE: Record<InstrumentId, 'oompah' | 'strum' | 'arpeggio' | 'pad' | 'bass' | 'bell'> = {
  piano: 'oompah',
  guitar: 'arpeggio',
  steel: 'strum',
  organ: 'pad',
  strings: 'pad',
  choir: 'pad',
  flute: 'pad',
  harp: 'arpeggio',
  celesta: 'bell',
  musicbox: 'arpeggio',
  bells: 'bell',
  glockenspiel: 'bell',
  bass: 'bass',
};
/** Instrumenty, których dźwięk trzymamy do końca nuty (reszta wybrzmiewa sama). */
const SUSTAIN = new Set<InstrumentId>(['organ', 'strings', 'choir', 'flute']);
const LEVEL: Partial<Record<InstrumentId, number>> = {
  organ: 0.45,
  strings: 0.5,
  choir: 0.55,
  bass: 0.9,
  bells: 0.45,
  glockenspiel: 0.5,
};

/** Nagrane nuty instrumentu i wzmocnienie każdej próbki (wyrównuje ciche nagrania do wspólnego poziomu). */
/** Wzmocnienie całości (suwak głośności 0–1 → poziom podkładu słyszalny obok śpiewu). */
const BOOST = 2;

type Manifest = Record<string, { notes: number[]; gains?: number[] }>;

export type LineJob = {
  /** Akordy (dla wersów bez nut — rozłożone równo) i nuty wersu, jeśli kolęda je ma. */
  chords: string[];
  music?: LineMusic;
  durationMs: number;
  /** Długość ćwierćnuty (ms). */
  quarterMs: number;
  meter: [number, number];
  instruments: InstrumentId[];
  melody: MelodyId;
  keyShift: number;
  /** Ile ms wersu już minęło (np. po pauzie) — wcześniejsze dźwięki pomijamy. */
  offsetMs?: number;
};

class Accompaniment {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private volume = 0.7;
  private manifest: Promise<Manifest> | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private ready = new Map<string, { buf: AudioBuffer; gain: number }>();
  private listeners = new Set<() => void>();
  loading = 0;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getLoading = () => this.loading;
  private emit() {
    for (const l of this.listeners) l();
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * BOOST;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      // ogranicznik na końcu: kilka instrumentów naraz nie przesteruje głośników
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      this.master.connect(comp).connect(limiter).connect(this.ctx.destination);
      // delikatny pogłos „kościelny” z wygenerowanej odpowiedzi impulsowej
      const reverb = this.ctx.createConvolver();
      reverb.buffer = this.impulse(2.4);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.22;
      this.master.connect(reverb).connect(wet).connect(comp);
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
    if (this.master) this.master.gain.value = v * BOOST;
  }

  /** Ładuje próbki instrumentów (raz; potem z pamięci). */
  async preload(ids: readonly InstrumentId[]) {
    const ctx = this.ensure();
    this.manifest ??= fetch('/content/samples/manifest.json').then((r) => r.json() as Promise<Manifest>);
    const manifest = await this.manifest;
    const jobs: Promise<unknown>[] = [];
    for (const id of ids) {
      const inst = manifest[id];
      for (const [i, n] of (inst?.notes ?? []).entries()) {
        const key = `${id}/${n}`;
        const gain = inst?.gains?.[i] ?? 1;
        if (this.buffers.has(key)) {
          jobs.push(this.buffers.get(key)!);
          continue;
        }
        this.loading++;
        const p = fetch(`/content/samples/${id}/${n}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((b) => ctx.decodeAudioData(b))
          .then((buf) => {
            this.ready.set(key, { buf, gain });
            return buf;
          })
          .catch(() => null)
          .finally(() => {
            this.loading--;
            this.emit();
          });
        this.buffers.set(key, p);
        jobs.push(p);
      }
    }
    this.emit();
    await Promise.all(jobs);
  }

  private nearest(id: InstrumentId, midi: number): { buf: AudioBuffer; gain: number; rate: number } | null {
    let best: number | null = null;
    for (const key of this.ready.keys()) {
      if (!key.startsWith(`${id}/`)) continue;
      const n = Number(key.slice(id.length + 1));
      if (best === null || Math.abs(n - midi) < Math.abs(best - midi)) best = n;
    }
    if (best === null) return null;
    return { ...this.ready.get(`${id}/${best}`)!, rate: 2 ** ((midi - best) / 12) };
  }

  /** Jedna nuta z próbki: transpozycja przez prędkość odtwarzania, obwiednia bez trzasków. */
  private note(id: InstrumentId, midi: number, when: number, dur: number, vel: number, out: AudioNode) {
    const s = this.nearest(id, midi);
    if (!s || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = s.rate;
    const g = this.ctx.createGain();
    const level = vel * (LEVEL[id] ?? 0.7) * s.gain;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + (SUSTAIN.has(id) ? 0.05 : 0.004));
    const release = SUSTAIN.has(id) ? 0.25 : 1.2;
    const end = when + Math.max(0.05, dur);
    g.gain.setValueAtTime(level, end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + release);
    src.connect(g).connect(out);
    src.start(when);
    src.stop(end + release + 0.05);
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
    bus.gain.linearRampToValueAtTime(0, t + 0.15);
    setTimeout(() => bus.disconnect(), 400);
    this.bus = null;
  }

  /** Zagraj wers: melodię z nut i akompaniament akordów od miejsc, w których się zmieniają. */
  playLine(job: LineJob) {
    if (!job.instruments.length && job.melody === 'none') return;
    this.stop();
    const ctx = this.ensure();
    const bus = this.freshBus();
    const q = job.quarterMs / 1000;
    const t0 = ctx.currentTime + 0.04 - (job.offsetMs ?? 0) / 1000;
    const now = ctx.currentTime;
    const at = (t: number) => t0 + t * q;

    // Melodia (nuty z partytury).
    if (job.music && job.melody !== 'none') {
      const mel = ctx.createGain();
      mel.gain.value = 0.9;
      mel.connect(bus);
      let t = 0;
      for (const [midi, d] of job.music.notes) {
        if (midi > 0 && at(t) >= now)
          this.note(job.melody, midi + job.keyShift, at(t), d * q * 0.95, 0.8, mel);
        t += d;
      }
    }

    // Odcinki akordów: [start, koniec] w ćwierćnutach.
    const total = job.durationMs / job.quarterMs;
    const segs: { start: number; end: number; chord: string }[] = [];
    if (job.music) {
      const ch = job.music.chords;
      ch.forEach(([, start, chord], i) => segs.push({ start, end: ch[i + 1]?.[1] ?? total, chord }));
    } else {
      job.chords.forEach((chord, i) =>
        segs.push({
          start: (i * total) / job.chords.length,
          end: ((i + 1) * total) / job.chords.length,
          chord,
        }),
      );
    }
    const beat = job.meter[1] === 8 ? 1.5 : 4 / job.meter[1]; // w 6/8 puls to ćwierćnuta z kropką
    const perBar = job.meter[1] === 8 ? job.meter[0] / 3 : job.meter[0];
    const layers = job.instruments.map((id) => {
      const g = ctx.createGain();
      g.gain.value = 0.75 / Math.sqrt(job.instruments.length);
      g.connect(bus);
      return { id, out: g };
    });
    for (const seg of segs) {
      const v = chordVoicing(seg.chord, job.keyShift);
      if (!v) continue;
      for (const l of layers) this.pattern(l.id, v, seg.start, seg.end, beat, perBar, at, now, l.out);
    }
  }

  private pattern(
    id: InstrumentId,
    v: { bass: number; notes: number[] },
    start: number,
    end: number,
    beat: number,
    perBar: number,
    at: (t: number) => number,
    now: number,
    out: AudioNode,
  ) {
    const q = at(1) - at(0) || 0.5;
    const play = (midi: number, t: number, d: number, vel: number) => {
      if (at(t) >= now - 0.01 && t < end - 1e-6) this.note(id, midi, Math.max(now, at(t)), d * q, vel, out);
    };
    const [n0, n1, n2] = [v.notes[0]!, v.notes[1]!, v.notes[2]!];
    const extra = v.notes[3];
    const beats: number[] = [];
    for (let t = start; t < end - 1e-6; t += beat) beats.push(t);
    switch (STYLE[id]) {
      case 'pad':
        for (const n of [v.bass, ...v.notes]) play(n, start, end - start, 0.55);
        break;
      case 'bass':
        beats.forEach((t, i) =>
          play(i % 2 === 0 || perBar < 3 ? v.bass - 12 : v.bass - 5, t, beat * 0.9, i === 0 ? 0.9 : 0.6),
        );
        break;
      case 'oompah':
        // bas na „raz”, akord na pozostałe miary (walczyk w 3/4, marsz w 2/4 i 4/4)
        beats.forEach((t, i) => {
          if (i % perBar === 0 || (perBar === 4 && i % perBar === 2)) play(v.bass, t, beat * 0.95, 0.75);
          else for (const n of [n0, n1, n2]) play(n, t, beat * 0.8, 0.5);
        });
        break;
      case 'strum':
        beats.forEach((t, i) => {
          const notes = [v.bass - 12, v.bass - 5, n0, n1, n2, ...(extra ? [extra] : [])].filter(
            (n) => n >= 40,
          );
          const down = i % perBar === 0;
          notes.forEach((n, k) =>
            play(n, t + (down ? k : notes.length - k) * 0.025, beat * 0.95, down ? 0.65 : 0.45),
          );
        });
        break;
      case 'arpeggio': {
        const arp = [v.bass - 12, n0, n1, n2, n0 + 12, n2];
        let k = 0;
        for (let t = start; t < end - 1e-6; t += beat / 2) play(arp[k++ % arp.length]!, t, beat, 0.55);
        break;
      }
      case 'bell':
        beats.forEach((t, i) => {
          if (i % perBar === 0) for (const n of [n0 + 12, n1 + 12, n2 + 12]) play(n, t, beat * perBar, 0.4);
        });
        break;
    }
  }

  /** Krótkie wejście przed kolędą: akord toniki przez jeden takt. */
  countIn(
    chord: string,
    keyShift: number,
    quarterMs: number,
    meter: [number, number],
    instruments: InstrumentId[],
  ) {
    const barQ = meter[0] * (4 / meter[1]);
    this.playLine({
      chords: [chord],
      durationMs: barQ * quarterMs,
      quarterMs,
      meter,
      instruments,
      melody: 'none',
      keyShift,
    });
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
