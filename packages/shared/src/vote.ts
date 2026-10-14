export type VoteResult = {
  slug: string;
  /** Kandydaci, spośród których losowano (remis albo brak głosów); pojedynczy, gdy wygrał wprost. */
  candidates: string[];
  viaTiebreak: boolean;
};

export function tally(ballots: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const slug of ballots) counts[slug] = (counts[slug] ?? 0) + 1;
  return counts;
}

export function pickRandom<T>(items: readonly T[], rng: () => number = Math.random): T {
  if (items.length === 0) throw new Error('Pusta pula');
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** Zwycięzca głosowania; remis i brak głosów rozstrzyga losowanie (F8, F14). */
export function resolveVote(
  ballots: Iterable<string>,
  pool: readonly string[],
  rng: () => number = Math.random,
): VoteResult {
  const counts = tally([...ballots].filter((s) => pool.includes(s)));
  const max = Math.max(0, ...Object.values(counts));
  const top = max === 0 ? [...pool] : pool.filter((s) => counts[s] === max);
  if (top.length === 1) return { slug: top[0]!, candidates: top, viaTiebreak: false };
  return { slug: pickRandom(top, rng), candidates: top, viaTiebreak: true };
}
