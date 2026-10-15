import { useEffect, useMemo, useRef, useState } from 'react';
import { flattenSong, verseCount, type PublicState, type SongMeta } from '@kolednik/shared';
import { SongArt } from '../art/SongArt';
import { useSong, useSongs } from '../net/api';
import { getSocket, serverNow, useConnected, useSessionState } from '../net/socket';
import { navigate } from '../router';
import { createStore, randomId } from '../storage';
import { applyTheme } from '../themes/themes';
import { Backdrop } from '../ui/Backdrop';
import { SPIN_MS } from '../tv/Reveal';
import { ScoreBlock } from '../tv/Summary';
import { useCountdown } from '../tv/Voting';
import { blockLabel } from '../tv/Sing';

// `?gosc=2` w adresie = osobny gość w tej karcie — do testów kilku „telefonów” na jednym komputerze.
const guest = new URLSearchParams(location.search).get('gosc');
const phone = createStore(guest ? `kolednik:phone:${guest}` : 'kolednik:phone', {
  clientId: '',
  nick: '',
  fontScale: 1,
});
if (!phone.get().clientId) phone.set({ clientId: randomId() });

export function PhoneApp({ code: urlCode }: { code: string | undefined }) {
  const state = useSessionState();
  const connected = useConnected();
  const settings = phone.use();
  const [code, setCode] = useState(urlCode?.toUpperCase() ?? '');
  const [joinedCode, setJoinedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.className = 'phone';
  }, []);

  useEffect(() => {
    if (state) applyTheme(state.theme);
  }, [state]);

  // Po zerwaniu połączenia telefon sam wraca do wieczoru (N7).
  useEffect(() => {
    if (!joinedCode) return;
    const s = getSocket();
    const rejoin = () =>
      s.emit(
        'phone:join',
        { code: joinedCode, clientId: phone.get().clientId, nick: phone.get().nick },
        (r) => {
          if (!r.ok) {
            setError(r.error);
            setJoinedCode(null);
          }
        },
      );
    s.on('connect', rejoin);
    return () => {
      s.off('connect', rejoin);
    };
  }, [joinedCode]);

  const join = (c: string) => {
    setError(null);
    getSocket().emit('phone:join', { code: c, clientId: settings.clientId, nick: settings.nick }, (r) => {
      if (!r.ok) return setError(r.error);
      setJoinedCode(c);
      if (urlCode !== c) navigate(`/j/${c}${location.search}`, true);
    });
  };

  // Link z kodu QR — od razu dołączamy.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (urlCode && !autoJoined.current) {
      autoJoined.current = true;
      join(urlCode.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode]);

  if (!joinedCode || !state) {
    return (
      <div className="screen phone-join">
        <div className="card">
          <div className="brand-big">
            <span className="brand-star">✦</span> Kolędnik
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              join(code.trim().toUpperCase());
            }}
          >
            <label htmlFor="code">Kod z telewizora</label>
            <input
              id="code"
              className="code-input"
              value={code}
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
            />
            <label htmlFor="nick">Twoje imię (opcjonalnie)</label>
            <input
              id="nick"
              value={settings.nick}
              maxLength={30}
              onChange={(e) => phone.set({ nick: e.target.value })}
              placeholder="np. Ciocia Basia"
            />
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-xl" disabled={code.trim().length !== 4}>
              Dołącz
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="screen phone-screen">
      <Backdrop theme={state.theme} density={0.4} />
      {!connected && <div className="offline-banner">Łączenie…</div>}
      <header className="phone-head">
        <span className="brand">✦ {state.groupName}</span>
        <NickEdit />
      </header>
      <main className="phone-main">
        <PhonePhase state={state} />
      </main>
    </div>
  );
}

function NickEdit() {
  const { nick } = phone.use();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nick);
  if (!editing) {
    return (
      <button className="chip" onClick={() => setEditing(true)}>
        {nick || 'Podaj imię'} ✎
      </button>
    );
  }
  return (
    <form
      className="nick-form"
      onSubmit={(e) => {
        e.preventDefault();
        phone.set({ nick: value.trim() });
        getSocket().emit('phone:nick', { nick: value.trim() });
        setEditing(false);
      }}
    >
      <input autoFocus value={value} maxLength={30} onChange={(e) => setValue(e.target.value)} />
      <button className="btn btn-small">OK</button>
    </form>
  );
}

function PhonePhase({ state }: { state: PublicState }) {
  const songs = useSongs();
  const bySlug = useMemo(() => new Map<string, SongMeta>((songs ?? []).map((s) => [s.slug, s])), [songs]);
  if (!songs) return <p className="loading">Ładowanie…</p>;
  switch (state.phase) {
    case 'LOBBY':
      return <PhoneLobby state={state} bySlug={bySlug} />;
    case 'VOTING':
      return <PhoneVote state={state} songs={songs} />;
    case 'REVEAL':
      return state.reveal ? (
        <PhoneReveal key={state.reveal.slug + state.reveal.via} state={state} bySlug={bySlug} />
      ) : null;
    case 'SINGING':
      return state.song ? <PhoneLyrics state={state} /> : null;
    case 'SUMMARY':
      return <PhoneSummary state={state} bySlug={bySlug} />;
  }
}

function PhoneLobby({ state, bySlug }: { state: PublicState; bySlug: Map<string, SongMeta> }) {
  return (
    <div className="phone-card">
      <h2>Jesteś w środku! 🎄</h2>
      <p>Gospodarz zaraz otworzy głosowanie albo wybierze kolędę.</p>
      {state.sung.length > 0 && (
        <>
          <h3>Zaśpiewane dziś</h3>
          <ul className="sung-list">
            {state.sung.map((slug) => (
              <li key={slug}>✓ {bySlug.get(slug)?.title ?? slug}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PhoneVote({ state, songs }: { state: PublicState; songs: SongMeta[] }) {
  const left = useCountdown(state.vote?.endsAt);
  const [mine, setMine] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const sung = new Set(state.sung);
  const norm = (s: string) =>
    s.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');
  const pool = songs.filter((s) => !sung.has(s.slug) && norm(s.title).includes(norm(q)));
  const counts = state.vote?.counts ?? {};
  return (
    <div className="phone-vote">
      <div className="phone-vote-head">
        <h2>{mine ? 'Głos oddany! Możesz go zmienić.' : 'Na co głosujesz?'}</h2>
        <span className="countdown small">{left}</span>
      </div>
      <input
        className="search"
        placeholder="Szukaj kolędy…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="vote-list">
        {pool.map((song) => (
          <li key={song.slug}>
            <button
              className={`vote-item ${mine === song.slug ? 'is-mine' : ''}`}
              onClick={() => {
                setMine(song.slug);
                navigator.vibrate?.(30);
                getSocket().emit('phone:vote', { slug: song.slug });
              }}
            >
              <SongArt song={song} className="vote-item-art" />
              <span className="vote-item-title">{song.title}</span>
              {counts[song.slug] ? <span className="badge">{counts[song.slug]}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhoneReveal({ state, bySlug }: { state: PublicState; bySlug: Map<string, SongMeta> }) {
  const r = state.reveal!;
  const spin = r.viaTiebreak && r.candidates.length > 1;
  const [shown, setShown] = useState(!spin);
  useEffect(() => {
    if (!spin) return;
    const t = setTimeout(() => setShown(true), SPIN_MS + 400);
    return () => clearTimeout(t);
  }, [spin]);
  const song = bySlug.get(r.slug);
  if (!shown)
    return (
      <div className="phone-card center">
        <h2 className="pulse">🎲 Losowanie… patrzcie na telewizor!</h2>
      </div>
    );
  return (
    <div className="phone-card center">
      <p>Śpiewamy:</p>
      {song && <SongArt song={song} className="phone-reveal-art" />}
      <h2>{song?.title}</h2>
    </div>
  );
}

/** Tekst kolędy zsynchronizowany z TV (F20) + przyciski dyrygenta (F18). */
function PhoneLyrics({ state }: { state: PublicState }) {
  const song = useSong(state.song!.slug);
  const { clientId, fontScale } = phone.use();
  const lines = useMemo(() => (song ? flattenSong(song) : []), [song]);
  const verses = song ? verseCount(song) : 0;
  const pos = state.song!.position;
  const curRef = useRef<HTMLParagraphElement>(null);
  const isConductor = state.conductor?.id === clientId;
  const s = getSocket();

  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [pos?.index, song]);

  if (!song) return <p className="loading">Otwieramy śpiewnik…</p>;
  const elapsed = pos ? Math.max(0, serverNow() - pos.startedAt) : 0;

  let lastBlock = -1;
  return (
    <div className="phone-lyrics-wrap">
      <div className="phone-lyrics-head">
        <strong>{song.title}</strong>
        <span>{blockLabel(lines[pos?.index ?? 0], verses)}</span>
        <span className="font-ctl">
          <button
            className="btn btn-small"
            onClick={() => phone.set({ fontScale: Math.max(0.8, fontScale - 0.15) })}
          >
            A−
          </button>
          <button
            className="btn btn-small"
            onClick={() => phone.set({ fontScale: Math.min(2, fontScale + 0.15) })}
          >
            A+
          </button>
        </span>
      </div>
      <div className="phone-lyrics" style={{ fontSize: `${fontScale * 1.25}rem` }}>
        {lines.map((l) => {
          const header = l.block !== lastBlock;
          lastBlock = l.block;
          const isCur = pos?.index === l.index;
          return (
            <div key={l.index}>
              {header && (
                <div className="phone-block-label">{l.part === 'chorus' ? 'Refren' : `${l.verse + 1}.`}</div>
              )}
              <p
                ref={isCur ? curRef : undefined}
                className={`pl ${isCur ? 'is-cur' : ''} ${pos && l.index < pos.index ? 'is-past' : ''} ${l.part === 'chorus' ? 'is-chorus' : ''}`}
              >
                {l.text}
                {isCur && pos && (
                  <span
                    key={pos.startedAt}
                    className="line-progress"
                    style={{
                      animationDuration: `${pos.durationMs || 1}ms`,
                      animationDelay: `${-elapsed}ms`,
                      animationPlayState: pos.paused ? 'paused' : 'running',
                    }}
                  />
                )}
              </p>
            </div>
          );
        })}
      </div>
      <div className="conductor-bar">
        {isConductor ? (
          <>
            <button
              className="btn btn-big"
              onClick={() => s.emit('phone:conductor:step', { delta: -1 })}
              aria-label="Poprzedni wers"
            >
              ◀
            </button>
            <button
              className="btn btn-primary btn-big grow"
              onClick={() => {
                navigator.vibrate?.(15);
                s.emit('phone:conductor:step', { delta: 1 });
              }}
            >
              Następny wers ▶
            </button>
            <button
              className="btn btn-big btn-ghost"
              onClick={() => s.emit('phone:conductor:release')}
              aria-label="Oddaj batutę"
              title="Oddaj batutę"
            >
              ✋
            </button>
          </>
        ) : (
          <>
            <span className="conductor-info">
              {state.conductor ? `🎼 Dyryguje: ${state.conductor.nick}` : '⏱️ Tekst leci automatycznie'}
            </span>
            <button className="btn btn-small" onClick={() => s.emit('phone:conductor:claim')}>
              🎼 Zostań dyrygentem
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PhoneSummary({ state, bySlug }: { state: PublicState; bySlug: Map<string, SongMeta> }) {
  const sum = state.summary;
  if (!sum) return null;
  return (
    <div className="phone-card center">
      <p>{bySlug.get(sum.slug)?.title}</p>
      {sum.metrics ? <ScoreBlock m={sum.metrics} compact /> : <h2>Brawo! 👏</h2>}
      {sum.record?.isNew && <p className="record is-new">🏆 NOWY REKORD!</p>}
    </div>
  );
}
