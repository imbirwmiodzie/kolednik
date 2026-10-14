import type { PublicState, SongMeta } from '@kolednik/shared';
import { SongArt } from '../art/SongArt';
import { getSocket } from '../net/socket';
import { hostSettings } from '../settings';
import { JoinCard } from './JoinCard';

/** Ekran główny wieczoru: kafelki kolęd (F1), głosowanie, losowanie, rekordy. */
export function Lobby({
  state,
  songs,
  onSettings,
  onBook,
}: {
  state: PublicState;
  songs: SongMeta[];
  onSettings: () => void;
  onBook: () => void;
}) {
  const sung = new Set(state.sung);
  const left = songs.filter((s) => !sung.has(s.slug)).length;
  const s = getSocket();
  const start = (slug: string) => s.emit('host:song:start', { slug, advanceMode: 'auto' });

  return (
    <div className="lobby">
      <header className="lobby-head">
        <div>
          <div className="brand">
            <span className="brand-star">✦</span> Kolędnik
          </div>
          <div className="group-name">{state.groupName}</div>
          <div className="actions">
            <button
              className="btn btn-primary btn-xl"
              disabled={left === 0}
              onClick={() => s.emit('host:vote:start', { durationSec: hostSettings.get().voteDurationSec })}
            >
              🗳️ Głosujemy
            </button>
            <button className="btn btn-xl" disabled={left === 0} onClick={() => s.emit('host:random')}>
              🎲 Losuj
            </button>
            <button className="btn" onClick={onBook}>
              📖 Złota księga
            </button>
            <button className="btn btn-ghost" onClick={onSettings}>
              ⚙️ Ustawienia
            </button>
          </div>
          <p className="lobby-status">
            {left === 0 ? (
              <>
                Wszystko zaśpiewane! 🎉{' '}
                <button className="btn btn-small" onClick={() => s.emit('host:reset-sung')}>
                  Nowa runda
                </button>
              </>
            ) : (
              <>
                Zaśpiewane dziś: {state.sung.length} · zostało {left}. Kliknijcie kafelek, żeby zaśpiewać od
                razu.
              </>
            )}
          </p>
        </div>
        <JoinCard state={state} />
      </header>

      <div className="tiles">
        {songs.map((song) => (
          <button
            key={song.slug}
            className={`tile ${sung.has(song.slug) ? 'is-sung' : ''}`}
            onClick={() => start(song.slug)}
          >
            <SongArt song={song} className="tile-art" />
            <span className="tile-title">{song.title}</span>
            <span className="tile-meta">
              {song.stanzaCount} {plural(song.stanzaCount, 'zwrotka', 'zwrotki', 'zwrotek')}
            </span>
            {sung.has(song.slug) && <span className="tile-check">✓ zaśpiewana</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}
