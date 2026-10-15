/**
 * Harmonizacja melodii: akordy dobrane takt po takcie (w 4/4 także co pół taktu), tak żeby pasowały
 * do nut melodii — z naciskiem na mocne części taktu — i tworzyły naturalne kadencje (D → T na końcu frazy).
 * Najlepszy ciąg akordów wybiera algorytm Viterbiego.
 */
import { noteName } from '../../packages/shared/src/chords.js';

export type TimedNote = { midi: number; start: number; dur: number };
export type ChordAt = { start: number; chord: string };

type Degree = {
  name: string;
  root: number;
  tones: number[];
  prior: number;
  fn: 'T' | 'S' | 'D' | 'other';
  /** dominanta wtrącona (np. A7 → D w G-dur) — tylko gdy melodia ma dźwięk spoza skali */
  secondary?: boolean;
};

const MAJOR: Degree[] = [
  { name: 'I', root: 0, tones: [0, 4, 7], prior: 0, fn: 'T' },
  { name: 'ii', root: 2, tones: [0, 3, 7], prior: 0.9, fn: 'S' },
  { name: 'iii', root: 4, tones: [0, 3, 7], prior: 1.6, fn: 'other' },
  { name: 'IV', root: 5, tones: [0, 4, 7], prior: 0.35, fn: 'S' },
  { name: 'V', root: 7, tones: [0, 4, 7, 10], prior: 0.25, fn: 'D' },
  { name: 'vi', root: 9, tones: [0, 3, 7], prior: 0.8, fn: 'other' },
  { name: 'V/V', root: 2, tones: [0, 4, 7, 10], prior: 0.6, fn: 'S', secondary: true },
];
const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10, 11] };
const MINOR: Degree[] = [
  { name: 'i', root: 0, tones: [0, 3, 7], prior: 0, fn: 'T' },
  { name: 'III', root: 3, tones: [0, 4, 7], prior: 0.8, fn: 'other' },
  { name: 'iv', root: 5, tones: [0, 3, 7], prior: 0.35, fn: 'S' },
  { name: 'V', root: 7, tones: [0, 4, 7, 10], prior: 0.25, fn: 'D' },
  { name: 'VI', root: 8, tones: [0, 4, 7], prior: 0.8, fn: 'other' },
  { name: 'VII', root: 10, tones: [0, 4, 7], prior: 1.0, fn: 'other' },
];

const mod12 = (n: number) => ((n % 12) + 12) % 12;

function fit(
  d: Degree,
  tonic: number,
  mode: 'major' | 'minor',
  notes: TimedNote[],
  segStart: number,
  segEnd: number,
  beat: number,
  phraseEnds: number[],
): number {
  let s = 0;
  let usedChromatic = false;
  for (const n of notes) {
    const a = Math.max(n.start, segStart);
    const b = Math.min(n.start + n.dur, segEnd);
    if (b <= a) continue;
    let w = b - a;
    const onDownbeat = Math.abs(n.start - segStart) < 1e-6;
    const onBeat = Math.abs(((n.start - segStart) / beat) % 1) < 1e-6;
    if (onDownbeat) w *= 1.8;
    else if (onBeat) w *= 1.2;
    // ostatnia nuta frazy decyduje o kadencji (np. „ob-na-żo-ny” na E → dominanta)
    if (phraseEnds.some((pe) => Math.abs(pe - (n.start + n.dur)) < 1e-6)) w *= 2.5;
    const pc = mod12(n.midi - tonic - d.root);
    // dźwięk spoza skali (np. podwyższona kwarta) mocno wskazuje akord, który go zawiera
    const chromatic = !SCALE[mode].includes(mod12(n.midi - tonic));
    if (chromatic) w *= 1.5;
    // septyma dominanty pasuje, ale słabiej niż składniki trójdźwięku
    const isTone = d.tones.includes(pc);
    const isSeventh = pc === 10 && d.tones.length === 4;
    if (isTone && !isSeventh) s += w;
    else if (isSeventh) s += 0.5 * w;
    else s -= (chromatic ? 1.8 : n.dur <= beat / 2 && !onBeat ? 0.35 : 0.9) * w;
    if (d.secondary && chromatic && isTone) usedChromatic = true;
  }
  if (d.secondary && !usedChromatic) return -Infinity;
  return s;
}

function transitionCost(a: Degree, b: Degree): number {
  if (a === b) return 0;
  if (a.fn === 'D' && b.fn === 'S') return 0.5; // D → S brzmi trochę wstecz
  if (a.fn === 'D' && b.fn === 'T') return -0.3;
  if (a.secondary) return b.fn === 'D' ? -0.4 : 0.8;
  if (a.fn === 'S' && b.fn === 'D') return -0.2;
  return 0.15;
}

/**
 * @param phraseEnds czasy końców fraz (wersów) — tam preferujemy toniką albo dominantę
 */
export function harmonize(
  notes: TimedNote[],
  opts: {
    tonic: number;
    mode: 'major' | 'minor';
    meter: [number, number];
    partial: number;
    total: number;
    phraseEnds: number[];
    flats: boolean;
  },
): ChordAt[] {
  const degrees = opts.mode === 'minor' ? MINOR : MAJOR;
  const beat = 4 / opts.meter[1];
  const bar = opts.meter[0] * beat;
  const splitBar = opts.meter[0] === 4 || opts.meter[0] === 6;
  const half = splitBar ? bar / 2 : bar;

  // Odcinki: przedtakt, potem takty (w 4/4 połówki taktów).
  const segs: [number, number][] = [];
  let t = 0;
  if (opts.partial > 0) {
    segs.push([0, opts.partial]);
    t = opts.partial;
  }
  while (t < opts.total - 1e-6) {
    const end = Math.min(opts.total, t + half);
    segs.push([t, end]);
    t = end;
  }

  // Ostatnia nuta w trakcie taktu (np. „mię-dzy na-mi” w 3/4) dostaje własny akord: kadencja D → T.
  const lastNote = notes.reduce((a, b) => (b.start > a.start ? b : a), notes[0]!);
  const [ls, le] = segs.at(-1)!;
  if (lastNote && lastNote.start > ls + 1e-6 && Math.abs(((lastNote.start - ls) / beat) % 1) < 1e-6) {
    segs.splice(-1, 1, [ls, lastNote.start], [lastNote.start, le]);
  }

  const n = segs.length;
  const D = degrees.length;
  const score: number[][] = Array.from({ length: n }, () => new Array(D).fill(-Infinity));
  const back: number[][] = Array.from({ length: n }, () => new Array(D).fill(0));
  const local = (i: number, k: number) => {
    const [s, e] = segs[i]!;
    const d = degrees[k]!;
    let v = fit(d, opts.tonic, opts.mode, notes, s, e, beat, opts.phraseEnds) - d.prior;
    if (i === n - 1) v += d.fn === 'T' ? 3 : -3; // koniec kolędy na tonice
    if (i === n - 2 && d.fn === 'D' && !d.secondary) v += 0.8; // … poprzedzonej dominantą (kadencja)
    if (i === 0 && opts.partial === 0) v += d.fn === 'T' ? 1 : 0;
    // koniec frazy w tym odcinku → T albo D
    if (opts.phraseEnds.some((pe) => pe > s + 1e-6 && pe <= e + 1e-6))
      v += d.fn === 'T' || d.fn === 'D' ? 0.6 : -0.4;
    // zmiana akordu w połowie taktu kosztuje (żeby nie skakać bez potrzeby)
    return v;
  };
  for (let k = 0; k < D; k++) score[0]![k] = local(0, k);
  for (let i = 1; i < n; i++) {
    const midBar = splitBar && Math.abs((((segs[i]![0] - opts.partial) / bar) % 1) - 0.5) < 1e-6;
    for (let k = 0; k < D; k++) {
      const l = local(i, k);
      for (let j = 0; j < D; j++) {
        const change = j !== k;
        const v =
          score[i - 1]![j]! + l - transitionCost(degrees[j]!, degrees[k]!) - (change && midBar ? 0.9 : 0);
        if (v > score[i]![k]!) {
          score[i]![k] = v;
          back[i]![k] = j;
        }
      }
    }
  }
  let best = 0;
  for (let k = 1; k < D; k++) if (score[n - 1]![k]! > score[n - 1]![best]!) best = k;
  const path = new Array<number>(n);
  path[n - 1] = best;
  for (let i = n - 1; i > 0; i--) path[i - 1] = back[i]![path[i]!]!;

  const out: ChordAt[] = [];
  path.forEach((k, i) => {
    const d = degrees[k]!;
    // następny inny akord (ten sam stopień w kilku odcinkach to jeden akord)
    let j = i + 1;
    while (j < n && path[j] === k) j++;
    const next = j < n ? degrees[path[j]!]! : null;
    // Dominanta przed toniką albo z septymą w melodii → akord septymowy.
    const [s] = segs[i]!;
    let runStart = i;
    while (runStart > 0 && path[runStart - 1] === k) runStart--;
    const from = segs[runStart]![0];
    const to = segs[j - 1]![1];
    const hasSeventh = notes.some(
      (nt) => nt.start < to && nt.start + nt.dur > from && mod12(nt.midi - opts.tonic - d.root) === 10,
    );
    const seventh = d.secondary || (d.fn === 'D' && (hasSeventh || next?.fn === 'T'));
    const name =
      noteName(opts.tonic + d.root, opts.flats) + (d.tones[1] === 3 ? 'm' : '') + (seventh ? '7' : '');
    if (out.at(-1)?.chord !== name) out.push({ start: s, chord: name });
  });
  return out;
}
