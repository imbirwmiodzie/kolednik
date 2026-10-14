import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTIVE_THRESHOLD_DB,
  flattenSong,
  lineDurationMs,
  scorePerformance,
  verseCount,
  type AdvanceMode,
  type FlatLine,
  type Frame,
  type PublicState,
  type Song,
} from '@kolednik/shared';
import { mic, useMic } from '../audio/mic';
import { useSong } from '../net/api';
import { getSocket, toServerTime } from '../net/socket';
import { estimateSpeechMs, narrator, promptText } from '../narrator/narrator';
import { usePlayer, type PlayerPos } from '../lyrics/usePlayer';
import { hostSettings } from '../settings';

const INTRO_SEC = 3;

export function Sing(props: { slug: string; mode: AdvanceMode; conductor: PublicState['conductor'] }) {
  const song = useSong(props.slug);
  if (!song) return <div className="screen center loading">Otwieramy śpiewnik…</div>;
  return <SingSong song={song} mode={props.mode} conductor={props.conductor} />;
}

export function blockLabel(line: FlatLine | undefined, verses: number) {
  if (!line) return '';
  return line.part === 'chorus' ? 'Refren' : `Zwrotka ${line.verse + 1} z ${verses}`;
}

function SingSong({
  song,
  mode,
  conductor,
}: {
  song: Song;
  mode: AdvanceMode;
  conductor: PublicState['conductor'];
}) {
  const settings = hostSettings.use();
  const micState = useMic();
  const lines = useMemo(() => flattenSong(song), [song]);
  const verses = useMemo(() => verseCount(song), [song]);
  const durations = useMemo(
    () => lines.map((l) => lineDurationMs(l, song.bpm, settings.tempo)),
    [lines, song.bpm, settings.tempo],
  );
  const [intro, setIntro] = useState(INTRO_SEC);
  const running = intro === 0;
  const frames = useRef<Frame[]>([]);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    narrator.cancel();
    const m = mic.getSnapshot();
    const metrics =
      m.status === 'on' && m.noiseDb !== null && frames.current.length >= 20
        ? scorePerformance(frames.current, m.noiseDb)
        : null;
    getSocket().emit('host:song:finish', { metrics, tempo: hostSettings.get().tempo });
  }, []);

  const player = usePlayer({ lines, durations, mode, running, onFinish: finish });
  const { pos } = player;
  const posRef = useRef(pos);
  posRef.current = pos;
  const playerRef = useRef(player);
  playerRef.current = player;

  // Odliczanie przed startem; narrator podpowiada pierwszy wers.
  useEffect(() => {
    if (intro === INTRO_SEC && hostSettings.get().narrator) {
      const s = hostSettings.get();
      narrator.say(promptText(lines[0]!.text, s.narratorWhat), {
        volume: s.narratorVolume,
        rate: s.narratorRate,
      });
    }
    if (intro === 0) {
      playerRef.current.go(0);
      return;
    }
    const t = setTimeout(() => setIntro((i) => i - 1), 1000);
    return () => clearTimeout(t);
  }, [intro, lines]);

  // Pozycja w tekście → serwer → telefony (F20).
  useEffect(() => {
    const startedAt = running
      ? pos.paused
        ? Date.now() - pos.pausedElapsed
        : pos.startedAt
      : Date.now() + intro * 1000;
    getSocket().emit('host:song:position', {
      index: running ? pos.index : 0,
      startedAt: toServerTime(startedAt),
      durationMs: durations[running ? pos.index : 0] ?? 0,
      paused: pos.paused,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, running, durations]);

  // Narrator: następny wers z wyprzedzeniem (F26, F28).
  useEffect(() => {
    if (!running || pos.paused || !settings.narrator) return;
    const next = lines[pos.index + 1];
    if (!next) return;
    const text = promptText(next.text, settings.narratorWhat);
    const elapsed = Date.now() - pos.startedAt;
    const delay =
      (durations[pos.index] ?? 0) -
      settings.narratorLeadSec * 1000 -
      estimateSpeechMs(text, settings.narratorRate) -
      elapsed;
    const t = setTimeout(
      () => narrator.say(text, { volume: settings.narratorVolume, rate: settings.narratorRate }),
      Math.max(0, delay),
    );
    return () => clearTimeout(t);
  }, [running, pos, lines, durations, settings]);

  // Kolędometr: ramki co 50 ms, bez pauz i bez mowy narratora (F29, F32).
  const meterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (micState.status !== 'on') return;
    const t = setInterval(() => {
      const db = mic.readDb();
      if (db === null) return;
      const above = db - (mic.noiseDb ?? -60);
      if (meterRef.current) {
        meterRef.current.style.setProperty('--level', String(Math.min(1, Math.max(0, above / 36))));
        meterRef.current.classList.toggle('is-active', above > ACTIVE_THRESHOLD_DB);
      }
      if (!running || posRef.current.paused || narrator.isMasking()) return;
      frames.current.push({ db, line: posRef.current.index });
    }, 50);
    return () => clearInterval(t);
  }, [micState.status, running]);

  // Dyrygent z telefonu.
  useEffect(() => {
    const s = getSocket();
    const onStep = ({ delta }: { delta: 1 | -1 }) => {
      if (!running) return setIntro(0);
      if (delta > 0) playerRef.current.next();
      else playerRef.current.prev();
    };
    s.on('conductor:step', onStep);
    return () => {
      s.off('conductor:step', onStep);
    };
  }, [running]);

  // Klawiatura / pilot / prezenter (PageUp/PageDown).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = playerRef.current;
      if (!running) {
        if (['ArrowRight', 'PageDown', 'Enter', ' '].includes(e.key)) setIntro(0);
        return;
      }
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case 'Enter':
          p.next();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          p.prev();
          break;
        case 'ArrowDown':
          p.nextBlock();
          break;
        case 'ArrowUp':
          p.prevBlock();
          break;
        case ' ':
        case 'p':
          p.togglePause();
          break;
        case 'Escape':
          finish();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, finish]);

  useEffect(() => () => narrator.cancel(), []);

  const s = getSocket();
  const cur = lines[running ? pos.index : 0];

  return (
    <div className={`sing ${pos.paused ? 'is-paused' : ''}`}>
      <header className="sing-head">
        <div>
          <h1 className="sing-title">{song.title}</h1>
          <div className="sing-block">{blockLabel(cur, verses)}</div>
        </div>
        <div className="sing-chips">
          {conductor ? (
            <button
              className="chip chip-conductor"
              onClick={() => s.emit('host:song:mode', { advanceMode: 'auto' })}
            >
              🎼 Dyryguje: {conductor.nick} <small>(kliknij: auto)</small>
            </button>
          ) : (
            <span className="chip">⏱️ Auto · tempo {Math.round(settings.tempo * 100)}%</span>
          )}
          {settings.narrator && <span className="chip">🗣️ Narrator</span>}
        </div>
        {micState.status === 'on' && (
          <div className="meter" ref={meterRef} title="Kolędometr">
            <div className="meter-fill" />
            <span className="meter-label">🎤</span>
          </div>
        )}
      </header>

      {!running ? (
        <div className="sing-intro">
          <div className="intro-count">{intro}</div>
          <p className="line line-next">{lines[0]?.text}</p>
        </div>
      ) : (
        <Lines lines={lines} pos={pos} durations={durations} mode={mode} />
      )}

      <footer className="sing-foot">
        <div className="song-progress">
          <div style={{ width: `${(((running ? pos.index : -1) + 1) / lines.length) * 100}%` }} />
        </div>
        <div className="sing-controls">
          <button className="btn btn-small" onClick={() => player.prev()}>
            ◀ wers
          </button>
          <button className="btn btn-small" onClick={() => (running ? player.togglePause() : setIntro(0))}>
            {running ? (pos.paused ? '▶ wznów' : '⏸ pauza') : '▶ start'}
          </button>
          <button className="btn btn-small" onClick={() => player.next()}>
            wers ▶
          </button>
          <button className="btn btn-small" onClick={() => player.nextBlock()}>
            ⏭ następna zwrotka
          </button>
          <button className="btn btn-small btn-primary" onClick={finish}>
            ✓ koniec i ocena
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => s.emit('host:song:abort')}>
            ✕ przerwij
          </button>
          <span className="keys">← → wers · ↑ ↓ zwrotka · spacja pauza · Esc koniec · F pełny ekran</span>
        </div>
      </footer>
    </div>
  );
}

function Lines({
  lines,
  pos,
  durations,
  mode,
}: {
  lines: FlatLine[];
  pos: PlayerPos;
  durations: number[];
  mode: AdvanceMode;
}) {
  const cur = lines[pos.index];
  const prev = lines[pos.index - 1];
  const next = lines[pos.index + 1];
  const after = lines[pos.index + 2];
  const elapsed = pos.paused ? pos.pausedElapsed : Date.now() - pos.startedAt;
  const newBlock = next && cur && next.block !== cur.block;
  return (
    <div className="lines">
      <p className="line line-prev">{prev?.text ?? ' '}</p>
      <p
        className={`line line-cur ${cur?.part === 'chorus' ? 'is-chorus' : ''}`}
        key={`${pos.index}-${pos.startedAt}`}
      >
        <span className="line-text">{cur?.text}</span>
        <span
          className={`line-progress ${mode === 'conductor' ? 'is-conductor' : ''}`}
          style={{
            animationDuration: `${durations[pos.index] ?? 1}ms`,
            animationDelay: `${-elapsed}ms`,
            animationPlayState: pos.paused ? 'paused' : 'running',
          }}
        />
      </p>
      {newBlock && (
        <p className="line-divider">{next.part === 'chorus' ? 'refren' : `zwrotka ${next.verse + 1}`}</p>
      )}
      <p className="line line-next">{next?.text ?? ' '}</p>
      <p className="line line-after">{after?.text ?? ' '}</p>
      {pos.paused && <div className="paused-badge">⏸ Pauza</div>}
    </div>
  );
}
