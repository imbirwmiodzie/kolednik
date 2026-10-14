import { useEffect, useState } from 'react';
import type { Metrics, Summary as SummaryT, SongMeta } from '@kolednik/shared';
import { getSocket } from '../net/socket';
import { Fireworks } from '../ui/Backdrop';

export function useCountUp(target: number, ms = 1800) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

/** Podsumowanie kolędy: kolędometr (F34) i porównanie z rekordem (F37–F38). */
export function Summary({ summary, bySlug }: { summary: SummaryT; bySlug: Map<string, SongMeta> }) {
  const song = bySlug.get(summary.slug);
  const m = summary.metrics;
  const isNew = summary.record?.isNew ?? false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')
        getSocket().emit('host:summary:close');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="summary">
      {isNew && <Fireworks />}
      <p className="reveal-kicker">{song?.title}</p>
      {m ? <ScoreBlock m={m} /> : <h1 className="headline">Brawo! 👏</h1>}
      {!m && <p className="hint">Mikrofon był wyłączony — tym razem bez oceny.</p>}
      {summary.record && (
        <div className={`record ${isNew ? 'is-new' : ''}`}>
          {isNew ? (
            <>
              <strong>NOWY REKORD!</strong>
              {summary.record.previousBest !== null && (
                <span> Poprzedni: {summary.record.previousBest} pkt</span>
              )}
            </>
          ) : (
            summary.record.previousBest !== null && (
              <span>
                Rekord: <strong>{summary.record.previousBest} pkt</strong>
                {summary.record.previousAt && <> ({formatDate(summary.record.previousAt)})</>}
              </span>
            )
          )}
        </div>
      )}
      <button
        className="btn btn-primary btn-xl"
        autoFocus
        onClick={() => getSocket().emit('host:summary:close')}
      >
        Następna kolęda ▶
      </button>
    </div>
  );
}

export function ScoreBlock({ m, compact = false }: { m: Metrics; compact?: boolean }) {
  const score = useCountUp(m.score);
  return (
    <div className={`score-block ${compact ? 'compact' : ''}`}>
      <div className="score">
        {score}
        <small>/100</small>
      </div>
      <div className="stars" aria-label={`${m.stars} na 5 gwiazdek`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={i < m.stars ? 'on' : ''}>
            ★
          </span>
        ))}
      </div>
      <h2 className="score-title">{m.title}</h2>
      {!compact && (
        <>
          <Candles lit={m.candles} />
          <div className="stats">
            <div>
              <strong>~{m.displayDb} dB</strong>
              <span>głośność śpiewu</span>
            </div>
            <div>
              <strong>+{Math.round(m.peakDb)} dB</strong>
              <span>szczyt ponad ciszę</span>
            </div>
            <div>
              <strong>{Math.round(m.coverage * 100)}%</strong>
              <span>zaśpiewanych wersów</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Candles({ lit }: { lit: number }) {
  return (
    <div className="candles" aria-label={`${lit} z 10 świeczek`}>
      {Array.from({ length: 10 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 48"
          className={i < lit ? 'candle is-lit' : 'candle'}
          style={{ animationDelay: `${i * 0.12}s` }}
        >
          <path className="flame" d="M10 2 C14 9 14 13 10 16 C6 13 6 9 10 2 Z" />
          <rect x="5" y="18" width="10" height="28" rx="2" className="wax" />
        </svg>
      ))}
    </div>
  );
}
