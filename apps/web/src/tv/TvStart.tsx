import { useEffect, useState } from 'react';
import { getSocket } from '../net/socket';
import { navigate } from '../router';
import { hostSettings, tutorialState } from '../settings';
import { loadRaw, save } from '../storage';
import { applyTheme } from '../themes/themes';
import { Backdrop } from '../ui/Backdrop';
import { ThemePicker } from './Settings';
import { Tutorial } from './Tutorial';

export type HostSessionRef = {
  sessionId: string;
  hostToken: string;
  groupName: string;
  startedAt: number;
  /** Konto zostało właśnie założone — TV pokaże powitanie. */
  created?: boolean;
};
export const HOST_SESSION_KEY = 'kolednik:host-session';
const EVENING_MS = 14 * 60 * 60 * 1000;

/** Ekran startowy: logowanie grupy (nazwa + hasło), wybór motywu, start wieczoru. */
export function TvStart() {
  const settings = hostSettings.use();
  const tutorial = tutorialState.use();
  const [showTutorial, setShowTutorial] = useState(!tutorial.done);
  const [name, setName] = useState(settings.lastGroupName);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Krok 1: konto (nazwa + hasło), krok 2: motyw i start. */
  const [step, setStep] = useState<1 | 2>(1);
  const previous = loadRaw<HostSessionRef>(HOST_SESSION_KEY);
  const canResume = previous && Date.now() - previous.startedAt < EVENING_MS;

  useEffect(() => {
    applyTheme(settings.theme);
    document.body.className = 'tv';
  }, [settings.theme]);

  const validate = () => {
    if (!name.trim()) {
      setError('Wpiszcie nazwę grupy, np. „Rodzina Kowalskich”.');
      return false;
    }
    if (!password) {
      setError('Wpiszcie hasło grupy (nowa grupa: wymyślcie je teraz).');
      return false;
    }
    setError(null);
    return true;
  };

  const start = async () => {
    if (!validate()) return setStep(1);
    setBusy(true);
    setError(null);
    try {
      const r = await getSocket()
        .timeout(8000)
        .emitWithAck('host:create', { groupName: name, password, theme: settings.theme });
      if (!r.ok) {
        setStep(1);
        return setError(r.error);
      }
      hostSettings.set({ lastGroupName: name.trim() });
      save(HOST_SESSION_KEY, {
        sessionId: r.sessionId,
        hostToken: r.hostToken,
        groupName: name.trim(),
        startedAt: Date.now(),
        created: r.created,
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
        <div className="start-steps" aria-label="Kroki">
          <span className={step === 1 ? 'is-on' : ''}>1. Wasze konto</span>
          <span className={step === 2 ? 'is-on' : ''}>2. Motyw i start</span>
        </div>
        {step === 1 ? (
          <form
            className="start-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (validate()) setStep(2);
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
              onKeyDown={(e) => {
                // Enter w nazwie przechodzi do hasła, a nie od razu dalej.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  document.getElementById('password')?.focus();
                }
              }}
            />
            <label htmlFor="password">Hasło grupy</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              maxLength={200}
              placeholder="nowa grupa? wymyślcie hasło (min. 4 znaki)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="hint">
              Nazwa i hasło to wasze konto — za rok wpiszcie je znowu, a rekordy będą na was czekać. Nowa
              nazwa zakłada nowe konto.
            </p>
            {error && <p className="error">{error}</p>}
            <div className="start-actions">
              <button className="btn btn-primary btn-xl">Dalej ▶</button>
              {canResume && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => navigate(`/tv/${previous.sessionId}`)}
                >
                  Wróć do wieczoru „{previous.groupName}”
                </button>
              )}
            </div>
          </form>
        ) : (
          <form
            className="start-form"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <label>Wybierzcie motyw dla „{name.trim()}”</label>
            <ThemePicker value={settings.theme} onChange={(theme) => hostSettings.set({ theme })} />
            {error && <p className="error">{error}</p>}
            <div className="start-actions">
              <button type="button" className="btn" onClick={() => setStep(1)}>
                ◀ Wstecz
              </button>
              <button className="btn btn-primary btn-xl" autoFocus disabled={busy}>
                {busy ? 'Zapalamy świeczki…' : 'Zaczynamy wieczór 🎄'}
              </button>
            </div>
          </form>
        )}
        <p className="join-hint">
          Jesteś gościem z telefonem? <a href="/j">Dołącz kodem z telewizora</a> ·{' '}
          <button type="button" className="link" onClick={() => setShowTutorial(true)}>
            Jak to działa?
          </button>
        </p>
      </div>
      {showTutorial && (
        <Tutorial
          onClose={() => {
            tutorialState.set({ done: true });
            setShowTutorial(false);
          }}
        />
      )}
    </div>
  );
}
