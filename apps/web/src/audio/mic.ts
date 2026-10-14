import { useSyncExternalStore } from 'react';

export type MicStatus = 'off' | 'starting' | 'on' | 'denied' | 'unsupported';

/**
 * Mikrofon przy TV. Dźwięk jest analizowany wyłącznie lokalnie — nic nie jest nagrywane ani wysyłane (N4).
 * Automatyczne wzmocnienie jest wyłączone, bo spłaszczyłoby głośność i pomiar dB nie miałby sensu.
 */
class Mic {
  status: MicStatus = 'off';
  /** Poziom tła z kalibracji (dBFS). */
  noiseDb: number | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private stream: MediaStream | null = null;
  private listeners = new Set<() => void>();
  private snapshot = { status: this.status, noiseDb: this.noiseDb };

  private emit() {
    this.snapshot = { status: this.status, noiseDb: this.noiseDb };
    for (const l of this.listeners) l();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = () => this.snapshot;

  async start(): Promise<boolean> {
    if (this.status === 'on') return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status = 'unsupported';
      this.emit();
      return false;
    }
    this.status = 'starting';
    this.emit();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
      this.ctx = new AudioContext();
      await this.ctx.resume();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      src.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.status = 'on';
      this.emit();
      return true;
    } catch {
      this.status = 'denied';
      this.emit();
      return false;
    }
  }

  /** Bieżący poziom w dBFS albo null, gdy mikrofon nie działa. */
  readDb(): number | null {
    if (!this.analyser || !this.buf) return null;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i]! * this.buf[i]!;
    const rms = Math.sqrt(sum / this.buf.length);
    return Math.max(-100, 20 * Math.log10(rms || 1e-10));
  }

  /** Pomiar ciszy w pokoju (F35): mediana z kilku sekund. */
  async calibrate(ms = 3000, onProgress?: (p: number) => void): Promise<number | null> {
    if (this.status !== 'on') return null;
    const samples: number[] = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const t = setInterval(() => {
        const db = this.readDb();
        if (db !== null) samples.push(db);
        const p = (performance.now() - start) / ms;
        onProgress?.(Math.min(1, p));
        if (p >= 1) {
          clearInterval(t);
          resolve();
        }
      }, 50);
    });
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] ?? -70;
    // Bardzo „cyfrowa” cisza dałaby absurdalnie niskie tło — ograniczamy od dołu.
    this.noiseDb = Math.max(-75, median);
    this.emit();
    return this.noiseDb;
  }
}

export const mic = new Mic();

export function useMic() {
  return useSyncExternalStore(mic.subscribe, mic.getSnapshot);
}
