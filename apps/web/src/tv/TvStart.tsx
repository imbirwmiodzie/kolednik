import { useEffect, useState } from 'react';
import { getSocket } from '../net/socket';
import { navigate } from '../router';
import { hostSettings } from '../settings';
import { loadRaw, save } from '../storage';
import { applyTheme } from '../themes/themes';
import { Backdrop } from '../ui/Backdrop';
import { ThemePicker } from './Settings';

export type HostSessionRef = { sessionId: string; hostToken: string; groupName: string; startedAt: number };
export const HOST_SESSION_KEY = 'kolednik:host-session';
const EVENING_MS = 14 * 60 * 60 * 1000;

/** Ekran startowy: nazwa grupy = „konto” (F40), wybór motywu, start wieczoru. */
export function TvStart() {
  const settings = hostSettings.use();
  const [name, setName] = useState(settings.lastGroupName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const previous = loadRaw<HostSessionRef>(HOST_SESSION_KEY);
  const canResume = previous && Date.now() - previous.startedAt < EVENING_MS;

  useEffect(() => {
    applyTheme(settings.theme);
    document.body.className = 'tv';
  }, [settings.theme]);

  const start = async () => {
    if (!name.trim()) return setError('Wpiszcie nazwę grupy, np. „Rodzina Kowalskich”.');
    setBusy(true);
    setError(null);
    try {
      const r = await getSocket()
        .timeout(8000)
        .emitWithAck('host:create', { groupName: name, theme: settings.theme });
      if (!r.ok) return setError(r.error);
      hostSettings.set({ lastGroupName: name.trim() });
      save(HOST_SESSION_KEY, {
        sessionId: r.sessionId,
        hostToken: r.hostToken,
        groupName: name.trim(),
        startedAt: Date.now(),
      } satisfies HostSessionRef);
      navigate(`/tv/${r.sessionId}`);
    } catch {
      setError('Brak połączenia z serwerem. Spróbujcie za chwilę.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen start">
      <Backdrop theme={settings.theme} />
      <div className="start-card">
        <div className="brand-big">
          <span className="brand-star">✦</span> Kolędnik
        </div>
        <p className="start-sub">
          Kolędowanie przy telewizorze. Głosujcie telefonami, śpiewajcie, bijcie rekordy!
        </p>
        <form
          className="start-form"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <label htmlFor="group">Kto dziś kolęduje?</label>
          <input
            id="group"
            autoFocus
            maxLength={60}
            placeholder="np. Rodzina Kowalskich"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="hint">
            Ta nazwa to wasze „konto” — wpiszcie ją za rok, a rekordy będą na was czekać.
          </p>
          <ThemePicker value={settings.theme} onChange={(theme) => hostSettings.set({ theme })} />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-xl" disabled={busy}>
            {busy ? 'Zapalamy świeczki…' : 'Zaczynamy wieczór'}
          </button>
          {canResume && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate(`/tv/${previous.sessionId}`)}
            >
              Wróć do wieczoru „{previous.groupName}”
            </button>
          )}
        </form>
        <p className="join-hint">
          Jesteś gościem z telefonem? <a href="/j">Dołącz kodem z telewizora</a>
        </p>
      </div>
    </div>
  );
}
