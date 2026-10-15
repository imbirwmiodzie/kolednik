import { useCallback, useEffect, useState } from 'react';
import type { AdminEvent, AdminStats } from '@kolednik/shared';
import { applyTheme } from '../themes/themes';

const EVENT_LABELS: Record<string, string> = {
  session_created: 'Nowy wieczór',
  group_created: 'Nowe konto grupy',
  login_failed: 'Złe hasło grupy',
  login_blocked: 'Logowanie zablokowane',
  phone_joined: 'Telefon dołączył',
  join_failed: 'Nieudane dołączenie',
  vote_started: 'Start głosowania',
  vote_ended: 'Koniec głosowania',
  song_started: 'Start kolędy',
  song_finished: 'Koniec kolędy',
  song_aborted: 'Przerwana kolęda',
  theme_changed: 'Zmiana motywu',
  conductor_claimed: 'Nowy dyrygent',
  code_rotated: 'Nowy kod wieczoru',
  admin_login: 'Logowanie do panelu',
  admin_login_failed: 'Złe hasło do panelu',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  if (res.status === 401) throw new Error('401');
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Błąd');
  return res.json() as Promise<T>;
}

/** Panel statystyk i dziennika zdarzeń (osobne logowanie). */
export function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    document.body.className = 'admin';
    applyTheme('winter');
    void api<{ authed: boolean }>('/admin/api/me').then((r) => setAuthed(r.authed));
  }, []);
  if (authed === null) return <div className="screen center loading">Ładowanie…</div>;
  return authed ? <Dashboard onLogout={() => setAuthed(false)} /> : <Login onOk={() => setAuthed(true)} />;
}

function Login({ onOk }: { onOk: () => void }) {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="screen center admin-login">
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await api('/admin/api/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ user, password }),
            });
            onOk();
          } catch (err) {
            setError((err as Error).message === '401' ? 'Zły login lub hasło' : (err as Error).message);
          }
        }}
      >
        <h1>✦ Kolędnik — panel</h1>
        <label htmlFor="admin-user">Login</label>
        <input
          id="admin-user"
          autoComplete="username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
        <label htmlFor="admin-pass">Hasło</label>
        <input
          id="admin-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary">Zaloguj</button>
      </form>
    </div>
  );
}

const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [type, setType] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        api<AdminStats>('/admin/api/stats'),
        api<AdminEvent[]>(`/admin/api/events?limit=150${type ? `&type=${encodeURIComponent(type)}` : ''}`),
      ]);
      setStats(s);
      setEvents(e);
      setError(null);
    } catch (err) {
      if ((err as Error).message === '401') onLogout();
      else setError((err as Error).message);
    }
  }, [type, onLogout]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const loadMore = async () => {
    const before = events.at(-1)?.id;
    if (!before) return;
    const more = await api<AdminEvent[]>(
      `/admin/api/events?limit=150&before=${before}${type ? `&type=${encodeURIComponent(type)}` : ''}`,
    );
    setEvents((prev) => [...prev, ...more]);
  };

  if (!stats) return <div className="screen center loading">{error ?? 'Liczę kolędy…'}</div>;
  const t = stats.totals;

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1>✦ Kolędnik — statystyki</h1>
        <div className="row">
          <span className="chip">odświeżanie co 15 s</span>
          <button
            className="btn btn-small"
            onClick={async () => {
              await api('/admin/api/logout', { method: 'POST' });
              onLogout();
            }}
          >
            Wyloguj
          </button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}

      <section className="tiles-row" aria-label="Teraz">
        <StatTile label="Wieczory teraz" value={stats.live.sessions} live />
        <StatTile label="Telewizory online" value={stats.live.tvs} live />
        <StatTile label="Telefony online" value={stats.live.phones} live />
      </section>
      <section className="tiles-row" aria-label="Łącznie">
        <StatTile label="Konta grup" value={t.groups} />
        <StatTile label="Wieczory" value={t.sessions} />
        <StatTile label="Zaśpiewane kolędy" value={t.performances} />
        <StatTile label="Średni wynik" value={t.avgScore ?? '—'} />
        <StatTile label="Dołączenia telefonów" value={t.phonesJoined} />
        <StatTile label="Złe hasła (7 dni)" value={t.failedLogins7d} warn={t.failedLogins7d > 20} />
      </section>

      <section className="admin-card">
        <h2>Ostatnie 30 dni</h2>
        <div className="multiples">
          <DailyBars
            title="Wieczory dziennie"
            data={stats.daily.map((d) => ({ day: d.day, n: d.sessions }))}
          />
          <DailyBars title="Kolędy dziennie" data={stats.daily.map((d) => ({ day: d.day, n: d.songs }))} />
          <DailyBars
            title="Dołączenia telefonów"
            data={stats.daily.map((d) => ({ day: d.day, n: d.joins }))}
          />
        </div>
      </section>

      <div className="admin-grid">
        <section className="admin-card">
          <h2>Najczęściej śpiewane</h2>
          <table className="book">
            <thead>
              <tr>
                <th>Kolęda</th>
                <th className="num">Razy</th>
                <th className="num">Średnio</th>
                <th className="num">Rekord</th>
              </tr>
            </thead>
            <tbody>
              {stats.topSongs.map((s) => (
                <tr key={s.slug}>
                  <td>{s.title}</td>
                  <td className="num">{s.times}</td>
                  <td className="num">{s.avgScore ?? '—'}</td>
                  <td className="num">{s.best ?? '—'}</td>
                </tr>
              ))}
              {stats.topSongs.length === 0 && (
                <tr>
                  <td colSpan={4}>Jeszcze nic nie zaśpiewano.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="admin-card">
          <h2>Grupy (ostatnio aktywne)</h2>
          <table className="book">
            <thead>
              <tr>
                <th>Grupa</th>
                <th className="num">Wieczory</th>
                <th className="num">Kolędy</th>
                <th className="num">Rekord</th>
                <th>Ostatnio</th>
              </tr>
            </thead>
            <tbody>
              {stats.topGroups.map((g) => (
                <tr key={g.name}>
                  <td>{g.name}</td>
                  <td className="num">{g.sessions}</td>
                  <td className="num">{g.songs}</td>
                  <td className="num">{g.best ?? '—'}</td>
                  <td>{fmtDateTime(g.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="admin-card">
        <div className="row admin-log-head">
          <h2>Dziennik zdarzeń</h2>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Rodzaj zdarzenia">
            <option value="">wszystkie (7 dni: {stats.eventTypes.reduce((s, e) => s + e.count, 0)})</option>
            {stats.eventTypes.map((e) => (
              <option key={e.type} value={e.type}>
                {EVENT_LABELS[e.type] ?? e.type} ({e.count})
              </option>
            ))}
          </select>
        </div>
        <table className="book log">
          <thead>
            <tr>
              <th>Kiedy</th>
              <th>Zdarzenie</th>
              <th>Grupa</th>
              <th>Szczegóły</th>
              <th>Adres</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className={/failed|blocked/.test(e.type) ? 'is-warn' : ''}>
                <td>{fmtDateTime(e.at)}</td>
                <td>{EVENT_LABELS[e.type] ?? e.type}</td>
                <td>{e.group ?? '—'}</td>
                <td className="mono">{e.data ? JSON.stringify(e.data) : ''}</td>
                <td className="mono">{e.ip ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length >= 150 && (
          <button className="btn btn-small" onClick={() => void loadMore()}>
            Starsze…
          </button>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  live,
  warn,
}: {
  label: string;
  value: number | string;
  live?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`stat-tile ${warn ? 'is-warn' : ''}`}>
      <div className="stat-value">
        {value}
        {live && <span className="live-dot" aria-label="na żywo" />}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** Słupki dzienne jednej miary (jedna seria = jeden kolor, bez legendy); dymek po najechaniu. */
function DailyBars({ title, data }: { title: string; data: { day: string; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);
  const W = 300;
  const H = 110;
  const bw = W / data.length;
  const h = hover !== null ? data[hover] : null;
  return (
    <figure className="daily">
      <figcaption>
        {title} <span className="muted">· razem {total}</span>
      </figcaption>
      <div className="daily-plot">
        <svg
          viewBox={`0 0 ${W} ${H + 16}`}
          role="img"
          aria-label={`${title}: ostatnie 30 dni, razem ${total}`}
        >
          <line x1={0} x2={W} y1={H} y2={H} className="axis" />
          {data.map((d, i) => {
            const bh = (d.n / max) * (H - 6);
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
                {d.n > 0 && (
                  <path
                    className={`bar ${hover === i ? 'is-hover' : ''}`}
                    d={roundedTop(i * bw + 1, H - bh, bw - 2, bh, Math.min(4, (bw - 2) / 2))}
                  />
                )}
              </g>
            );
          })}
          <text x={0} y={H + 13} className="tick">
            {data[0]?.day.slice(5)}
          </text>
          <text x={W} y={H + 13} className="tick" textAnchor="end">
            {data.at(-1)?.day.slice(5)}
          </text>
          <text x={0} y={10} className="tick">
            max {max}
          </text>
        </svg>
        {h && hover !== null && (
          <div className="tooltip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
            <strong>{h.n}</strong> · {h.day}
          </div>
        )}
      </div>
    </figure>
  );
}

/** Słupek zaokrąglony tylko u góry, przyklejony do osi. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
