import { useEffect, useRef, useState } from 'react';
import type { Reveal as RevealT, SongMeta } from '@kolednik/shared';
import { SongArt } from '../art/SongArt';
import { getSocket } from '../net/socket';

export const SPIN_MS = 4200;

/** Animowane losowanie (F7) i ogłoszenie zwycięzcy (F13), potem start kolędy. */
export function Reveal({ reveal, bySlug }: { reveal: RevealT; bySlug: Map<string, SongMeta> }) {
  const spin = reveal.viaTiebreak && reveal.candidates.length > 1;
  const [highlight, setHighlight] = useState(spin ? reveal.candidates[0]! : reveal.slug);
  const [landed, setLanded] = useState(!spin);
  const [count, setCount] = useState(3);
  const started = useRef(false);

  // Ruletka: podświetlenie skacze po kandydatach coraz wolniej i staje na wylosowanej.
  useEffect(() => {
    if (!spin) return;
    const c = reveal.candidates;
    const target = c.indexOf(reveal.slug);
    const steps = c.length * 3 + ((target - 0 + c.length) % c.length);
    const times: number[] = [];
    let t = 0;
    for (let i = 0; i <= steps; i++) {
      t += 60 + 340 * (i / steps) ** 3;
      times.push(t);
    }
    const scale = SPIN_MS / t;
    const timers = times.map((at, i) => setTimeout(() => setHighlight(c[i % c.length]!), at * scale));
    timers.push(setTimeout(() => setLanded(true), SPIN_MS + 400));
    return () => timers.forEach(clearTimeout);
  }, [spin, reveal]);

  useEffect(() => {
    if (!landed) return;
    if (count === 0) {
      if (!started.current) {
        started.current = true;
        getSocket().emit('host:song:start', { slug: reveal.slug, advanceMode: 'auto' });
      }
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1200);
    return () => clearTimeout(t);
  }, [landed, count, reveal.slug]);

  const winner = bySlug.get(reveal.slug);

  if (!landed) {
    return (
      <div className="reveal">
        <h1 className="headline">
          {reveal.via === 'random'
            ? 'Losujemy…'
            : reveal.noVotes
              ? 'Nikt nie zagłosował — losujemy!'
              : 'Remis! Rozstrzyga los…'}
        </h1>
        <div className="roulette">
          {reveal.candidates.map((slug) => {
            const song = bySlug.get(slug);
            return (
              song && (
                <div key={slug} className={`roulette-item ${highlight === slug ? 'is-on' : ''}`}>
                  <SongArt song={song} className="tile-art" />
                  <span>{song.title}</span>
                </div>
              )
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="reveal reveal-win">
      <p className="reveal-kicker">
        {reveal.via === 'random' ? 'Los wybrał' : reveal.viaTiebreak ? 'Po remisie wygrywa' : 'Wygrywa'}
      </p>
      {winner && (
        <div className="winner-card">
          <SongArt song={winner} className="winner-art" />
          <h1 className="winner-title">{winner.title}</h1>
        </div>
      )}
      <p className="reveal-count">{count > 0 ? `Śpiewamy za ${count}…` : 'Śpiewamy!'}</p>
    </div>
  );
}
