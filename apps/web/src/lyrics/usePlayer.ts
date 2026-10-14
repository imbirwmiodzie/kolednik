import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdvanceMode, FlatLine } from '@kolednik/shared';

export type PlayerPos = {
  index: number;
  /** Lokalny czas startu wersu (Date.now()). */
  startedAt: number;
  paused: boolean;
  /** Ile minęło z wersu w chwili pauzy. */
  pausedElapsed: number;
};

/**
 * Silnik przewijania tekstu: w trybie auto przechodzi do kolejnego wersu wg czasu,
 * w trybie dyrygenta czeka na „następny wers” z telefonu. Klawiatura działa zawsze (F18–F19).
 */
export function usePlayer(opts: {
  lines: FlatLine[];
  durations: number[];
  mode: AdvanceMode;
  running: boolean;
  onFinish: () => void;
}) {
  const { lines, durations, mode, running } = opts;
  const [pos, setPos] = useState<PlayerPos>({
    index: 0,
    startedAt: Date.now(),
    paused: false,
    pausedElapsed: 0,
  });
  const onFinish = useRef(opts.onFinish);
  onFinish.current = opts.onFinish;

  const go = useCallback(
    (index: number) => {
      if (index >= lines.length) {
        onFinish.current();
        return;
      }
      setPos({ index: Math.max(0, index), startedAt: Date.now(), paused: false, pausedElapsed: 0 });
    },
    [lines.length],
  );

  const next = useCallback(() => go(pos.index + 1), [go, pos.index]);
  const prev = useCallback(() => go(pos.index - 1), [go, pos.index]);

  const nextBlock = useCallback(() => {
    const block = lines[pos.index]?.block;
    const i = lines.findIndex((l) => l.index > pos.index && l.block !== block);
    go(i === -1 ? lines.length : i);
  }, [go, lines, pos.index]);

  const prevBlock = useCallback(() => {
    const cur = lines[pos.index];
    if (!cur) return;
    const blockStart = lines.findIndex((l) => l.block === cur.block);
    if (pos.index > blockStart) return go(blockStart);
    const prevBlockId = lines[blockStart - 1]?.block;
    go(prevBlockId === undefined ? 0 : lines.findIndex((l) => l.block === prevBlockId));
  }, [go, lines, pos.index]);

  const togglePause = useCallback(() => {
    setPos((p) =>
      p.paused
        ? { ...p, paused: false, startedAt: Date.now() - p.pausedElapsed, pausedElapsed: 0 }
        : { ...p, paused: true, pausedElapsed: Date.now() - p.startedAt },
    );
  }, []);

  const restart = useCallback(() => go(0), [go]);

  // Tryb auto: następny wers po upływie jego czasu.
  useEffect(() => {
    if (!running || mode !== 'auto' || pos.paused) return;
    const remaining = (durations[pos.index] ?? 0) - (Date.now() - pos.startedAt);
    const t = setTimeout(() => go(pos.index + 1), Math.max(0, remaining));
    return () => clearTimeout(t);
  }, [running, mode, pos, durations, go]);

  return { pos, next, prev, nextBlock, prevBlock, togglePause, restart, go };
}
