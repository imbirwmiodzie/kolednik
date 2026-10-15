/** Limit nieudanych prób (hasło, kod wieczoru, login admina) w oknie czasu — chroni przed zgadywaniem. */
export class RateLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Czy wolno spróbować (jeszcze nie przekroczono limitu). */
  allowed(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length < this.max;
  }

  /** Za ile ms limit się zwolni. */
  retryAfterMs(key: string, now = Date.now()): number {
    const list = this.recent(key, now);
    return list.length < this.max ? 0 : this.windowMs - (now - list[0]!);
  }

  fail(key: string, now = Date.now()) {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string) {
    this.failures.delete(key);
  }
}
