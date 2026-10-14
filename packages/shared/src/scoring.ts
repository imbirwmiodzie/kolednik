/** Ramka pomiaru mikrofonu (~50 ms). */
export type Frame = { db: number; line: number };

export type Metrics = {
  score: number;
  /** Średni poziom śpiewu ponad tło (dB). */
  aboveNoiseDb: number;
  /** Szacunkowy poziom w „dB” do pokazania na ekranie. */
  displayDb: number;
  peakDb: number;
  /** Odsetek wersów, w których słychać było śpiew (0..1). */
  coverage: number;
  stars: number;
  candles: number;
  title: string;
};

/** O ile ponad tło musi być ramka, żeby uznać ją za śpiew. */
export const ACTIVE_THRESHOLD_DB = 8;
/** Zakładany poziom cichego pokoju — tylko do „efektownych” dB na ekranie. */
const ROOM_BASE_DB = 35;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const scale = (x: number, from: number, to: number) => clamp01((x - from) / (to - from));

export const TITLES: { min: number; title: string }[] = [
  { min: 90, title: 'Chór anielski' },
  { min: 75, title: 'Kolędnicy z gwiazdą' },
  { min: 60, title: 'Rozśpiewana szopka' },
  { min: 45, title: 'Pasterze po kolacji' },
  { min: 30, title: 'Nieśmiałe pastuszki' },
  { min: 1, title: 'Cicha noc… aż za cicha' },
  { min: 0, title: 'Czy ktoś tu w ogóle śpiewał?' },
];

export function titleFor(score: number): string {
  return TITLES.find((t) => score >= t.min)!.title;
}

export function scorePerformance(frames: Frame[], noiseDb: number): Metrics {
  const above = frames.map((f) => ({ line: f.line, a: f.db - noiseDb }));
  const active = above.filter((f) => f.a > ACTIVE_THRESHOLD_DB);

  const aboveNoiseDb = active.length ? active.reduce((s, f) => s + f.a, 0) / active.length : 0;
  const peakDb = above.length ? Math.max(0, ...above.map((f) => f.a)) : 0;

  const perLine = new Map<number, { total: number; active: number }>();
  for (const f of above) {
    const e = perLine.get(f.line) ?? { total: 0, active: 0 };
    e.total++;
    if (f.a > ACTIVE_THRESHOLD_DB) e.active++;
    perLine.set(f.line, e);
  }
  const lines = [...perLine.values()];
  const covered = lines.filter((l) => l.active / l.total >= 0.4);
  const coverage = lines.length ? covered.length / lines.length : 0;
  const coveredTotal = covered.reduce((s, l) => s + l.total, 0);
  const continuity = coveredTotal ? covered.reduce((s, l) => s + l.active, 0) / coveredTotal : 0;

  const loudness = active.length ? scale(aboveNoiseDb, 6, 30) : 0;
  const energy = 0.5 * scale(peakDb, 10, 40) + 0.5 * continuity;
  const score = Math.round(100 * (0.5 * loudness + 0.35 * coverage + 0.15 * energy));

  return {
    score,
    aboveNoiseDb: round1(aboveNoiseDb),
    displayDb: Math.round(ROOM_BASE_DB + aboveNoiseDb),
    peakDb: round1(peakDb),
    coverage: round1(coverage * 100) / 100,
    stars: score === 0 ? 0 : Math.min(5, 1 + Math.floor(score / 20)),
    candles: Math.round(score / 10),
    title: titleFor(score),
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
