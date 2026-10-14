import { useEffect, useState } from 'react';
import type { PublicState, SongMeta } from '@kolednik/shared';
import { SongArt } from '../art/SongArt';
import { getSocket, serverNow } from '../net/socket';
import { JoinCard } from './JoinCard';

export function useCountdown(endsAt: number | undefined) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)));
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [endsAt]);
  return left;
}

/** Wyniki głosowania na żywo (F12). */
export function Voting({ state, bySlug }: { state: PublicState; bySlug: Map<string, SongMeta> }) {
  const vote = state.vote;
  const left = useCountdown(vote?.endsAt);
  if (!vote) return null;
  const ranked = Object.entries(vote.counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = Math.max(1, ...ranked.map(([, n]) => n));
  const online = state.participants.filter((p) => p.connected).length;

  return (
    <div className="voting">
      <header className="voting-head">
        <div>
          <h1 className="headline">Głosujcie na telefonach!</h1>
          <p className="voting-sub">
            Zagłosowało {vote.voters} z {online}
          </p>
        </div>
        <div className="countdown" style={{ ['--p' as string]: left }}>
          {left}
        </div>
        <JoinCard state={state} compact />
      </header>

      <ol className="vote-bars">
        {ranked.length === 0 && <li className="vote-empty">Czekamy na pierwsze głosy… 🎶</li>}
        {ranked.map(([slug, n]) => {
          const song = bySlug.get(slug);
          if (!song) return null;
          return (
            <li key={slug} className="vote-bar">
              <SongArt song={song} className="vote-art" />
              <div className="vote-main">
                <div className="vote-title">{song.title}</div>
                <div className="vote-track">
                  <div className="vote-fill" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </div>
              <div className="vote-count">{n}</div>
            </li>
          );
        })}
      </ol>
      <div className="row center">
        <button className="btn" onClick={() => getSocket().emit('host:vote:end')}>
          Zakończ głosowanie
        </button>
      </div>
    </div>
  );
}
