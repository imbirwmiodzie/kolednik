import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AdminEvent, AdminStats, Book, Metrics, RecordInfo, ThemeId } from '@kolednik/shared';

const MIGRATIONS = [
  `CREATE TABLE groups (
     id INTEGER PRIMARY KEY,
     name_norm TEXT NOT NULL UNIQUE,
     display_name TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     group_id INTEGER NOT NULL REFERENCES groups(id),
     code TEXT NOT NULL,
     host_token TEXT NOT NULL,
     theme TEXT NOT NULL,
     started_at INTEGER NOT NULL
   );
   CREATE TABLE performances (
     id INTEGER PRIMARY KEY,
     session_id TEXT NOT NULL REFERENCES sessions(id),
     group_id INTEGER NOT NULL REFERENCES groups(id),
     song_slug TEXT NOT NULL,
     score INTEGER,
     display_db REAL,
     peak_db REAL,
     coverage REAL,
     key_shift INTEGER NOT NULL DEFAULT 0,
     tempo REAL NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX performances_group_song ON performances(group_id, song_slug);
   CREATE INDEX performances_session ON performances(session_id);`,
  // v2: hasła grup, tajny klucz linku dla telefonów, dziennik zdarzeń.
  `ALTER TABLE groups ADD COLUMN password_hash TEXT;
   ALTER TABLE sessions ADD COLUMN join_token TEXT;
   CREATE TABLE events (
     id INTEGER PRIMARY KEY,
     at INTEGER NOT NULL,
     type TEXT NOT NULL,
     group_id INTEGER,
     session_id TEXT,
     ip TEXT,
     data TEXT
   );
   CREATE INDEX events_at ON events(at);
   CREATE INDEX events_type_at ON events(type, at);`,
];

export type GroupRow = { id: number; name_norm: string; display_name: string; password_hash: string | null };

export type EventInput = {
  type: string;
  groupId?: number | null;
  sessionId?: string | null;
  ip?: string | null;
  data?: Record<string, unknown>;
};

export type SessionRow = {
  id: string;
  group_id: number;
  code: string;
  host_token: string;
  join_token: string | null;
  theme: ThemeId;
  started_at: number;
  display_name: string;
};

export class Db {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate() {
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN');
      this.db.exec(MIGRATIONS[v]!);
      this.db.exec(`PRAGMA user_version = ${v + 1}`);
      this.db.exec('COMMIT');
    }
  }

  getGroup(nameNorm: string): GroupRow | undefined {
    return this.db
      .prepare('SELECT id, name_norm, display_name, password_hash FROM groups WHERE name_norm = ?')
      .get(nameNorm) as GroupRow | undefined;
  }

  createGroup(nameNorm: string, displayName: string, passwordHash: string, now = Date.now()): number {
    const r = this.db
      .prepare('INSERT INTO groups (name_norm, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(nameNorm, displayName, passwordHash, now);
    return Number(r.lastInsertRowid);
  }

  /** Grupy sprzed wprowadzenia haseł dostają hasło przy pierwszym logowaniu. */
  setGroupPassword(id: number, passwordHash: string) {
    this.db.prepare('UPDATE groups SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  }

  setGroupDisplayName(id: number, displayName: string) {
    this.db.prepare('UPDATE groups SET display_name = ? WHERE id = ?').run(displayName, id);
  }

  createSession(s: Omit<SessionRow, 'display_name'>) {
    this.db
      .prepare(
        `INSERT INTO sessions (id, group_id, code, host_token, join_token, theme, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.id, s.group_id, s.code, s.host_token, s.join_token, s.theme, s.started_at);
  }

  setJoin(sessionId: string, code: string, joinToken: string) {
    this.db
      .prepare('UPDATE sessions SET code = ?, join_token = ? WHERE id = ?')
      .run(code, joinToken, sessionId);
  }

  getSession(id: string): SessionRow | undefined {
    return this.db
      .prepare(`SELECT s.*, g.display_name FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.id = ?`)
      .get(id) as SessionRow | undefined;
  }

  setTheme(sessionId: string, theme: ThemeId) {
    this.db.prepare('UPDATE sessions SET theme = ? WHERE id = ?').run(theme, sessionId);
  }

  sungInSession(sessionId: string): string[] {
    return (
      this.db
        .prepare('SELECT DISTINCT song_slug FROM performances WHERE session_id = ? ORDER BY id')
        .all(sessionId) as { song_slug: string }[]
    ).map((r) => r.song_slug);
  }

  /** Zapisuje wykonanie i zwraca porównanie z dotychczasowym rekordem grupy (F37). */
  addPerformance(p: {
    sessionId: string;
    groupId: number;
    slug: string;
    metrics: Metrics | null;
    keyShift: number;
    tempo: number;
    now?: number;
  }): RecordInfo | null {
    const prev = this.db
      .prepare(
        `SELECT score, created_at FROM performances
         WHERE group_id = ? AND song_slug = ? AND score IS NOT NULL
         ORDER BY score DESC, created_at ASC LIMIT 1`,
      )
      .get(p.groupId, p.slug) as { score: number; created_at: number } | undefined;
    const m = p.metrics;
    this.db
      .prepare(
        `INSERT INTO performances
         (session_id, group_id, song_slug, score, display_db, peak_db, coverage, key_shift, tempo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        p.sessionId,
        p.groupId,
        p.slug,
        m?.score ?? null,
        m?.displayDb ?? null,
        m?.peakDb ?? null,
        m?.coverage ?? null,
        p.keyShift,
        p.tempo,
        p.now ?? Date.now(),
      );
    if (!m) return null;
    return {
      previousBest: prev?.score ?? null,
      previousAt: prev?.created_at ?? null,
      isNew: m.score > 0 && (prev === undefined || m.score > prev.score),
    };
  }

  book(groupId: number, groupName: string): Book {
    const records = this.db
      .prepare(
        `SELECT song_slug AS slug, MAX(score) AS best, COUNT(*) AS times, MAX(created_at) AS lastAt,
           (SELECT p2.created_at FROM performances p2
             WHERE p2.group_id = p.group_id AND p2.song_slug = p.song_slug AND p2.score IS NOT NULL
             ORDER BY p2.score DESC, p2.created_at ASC LIMIT 1) AS bestAt
         FROM performances p WHERE group_id = ? GROUP BY song_slug ORDER BY best DESC NULLS LAST, times DESC`,
      )
      .all(groupId) as Book['records'];
    const evenings = this.db
      .prepare(
        `SELECT s.id AS sessionId, s.started_at AS startedAt, COUNT(p.id) AS songs, ROUND(AVG(p.score)) AS avgScore
         FROM sessions s JOIN performances p ON p.session_id = s.id
         WHERE s.group_id = ? GROUP BY s.id ORDER BY s.started_at DESC LIMIT 20`,
      )
      .all(groupId) as Book['evenings'];
    return { groupName, records: records.map((r) => ({ ...r })), evenings: evenings.map((e) => ({ ...e })) };
  }

  // ───────── Dziennik zdarzeń i statystyki (panel admina) ─────────

  logEvent(e: EventInput, now = Date.now()) {
    this.db
      .prepare('INSERT INTO events (at, type, group_id, session_id, ip, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        now,
        e.type,
        e.groupId ?? null,
        e.sessionId ?? null,
        e.ip ?? null,
        e.data ? JSON.stringify(e.data) : null,
      );
  }

  pruneEvents(olderThanMs: number, now = Date.now()) {
    this.db.prepare('DELETE FROM events WHERE at < ?').run(now - olderThanMs);
  }

  events(opts: { type?: string; limit: number; before?: number }): AdminEvent[] {
    const rows = this.db
      .prepare(
        `SELECT e.id, e.at, e.type, g.display_name AS "group", e.session_id AS sessionId, e.ip, e.data
         FROM events e LEFT JOIN groups g ON g.id = e.group_id
         WHERE (? IS NULL OR e.type = ?) AND (? IS NULL OR e.id < ?)
         ORDER BY e.id DESC LIMIT ?`,
      )
      .all(
        opts.type ?? null,
        opts.type ?? null,
        opts.before ?? null,
        opts.before ?? null,
        opts.limit,
      ) as (Omit<AdminEvent, 'data'> & { data: string | null })[];
    return rows.map((r) => ({ ...r, data: r.data ? (JSON.parse(r.data) as Record<string, unknown>) : null }));
  }

  stats(titles: Map<string, string>, now = Date.now()): Omit<AdminStats, 'live'> {
    const one = <T>(sql: string, ...args: (number | string)[]) => this.db.prepare(sql).get(...args) as T;
    const week = now - 7 * 86_400_000;
    const since = now - 30 * 86_400_000;
    const totals = {
      groups: one<{ n: number }>('SELECT COUNT(*) AS n FROM groups').n,
      sessions: one<{ n: number }>('SELECT COUNT(*) AS n FROM sessions').n,
      performances: one<{ n: number }>('SELECT COUNT(*) AS n FROM performances').n,
      avgScore: one<{ a: number | null }>('SELECT ROUND(AVG(score)) AS a FROM performances').a,
      phonesJoined: one<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE type = 'phone_joined'").n,
      failedLogins7d: one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM events WHERE type IN ('login_failed', 'admin_login_failed') AND at >= ?",
        week,
      ).n,
    };
    const day = (col: string) => `strftime('%Y-%m-%d', ${col} / 1000, 'unixepoch', 'localtime')`;
    const byDay = (sql: string) =>
      new Map(
        (this.db.prepare(sql).all(since) as { day: string; n: number }[]).map((r) => [r.day, r.n] as const),
      );
    const sessions = byDay(
      `SELECT ${day('started_at')} AS day, COUNT(*) AS n FROM sessions WHERE started_at >= ? GROUP BY day`,
    );
    const songs = byDay(
      `SELECT ${day('created_at')} AS day, COUNT(*) AS n FROM performances WHERE created_at >= ? GROUP BY day`,
    );
    const joins = byDay(
      `SELECT ${day('at')} AS day, COUNT(*) AS n FROM events WHERE type = 'phone_joined' AND at >= ? GROUP BY day`,
    );
    const daily: AdminStats['daily'] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      daily.push({
        day: key,
        sessions: sessions.get(key) ?? 0,
        songs: songs.get(key) ?? 0,
        joins: joins.get(key) ?? 0,
      });
    }
    const topSongs = (
      this.db
        .prepare(
          `SELECT song_slug AS slug, COUNT(*) AS times, ROUND(AVG(score)) AS avgScore, MAX(score) AS best
           FROM performances GROUP BY song_slug ORDER BY times DESC LIMIT 20`,
        )
        .all() as Omit<AdminStats['topSongs'][number], 'title'>[]
    ).map((r) => ({ ...r, title: titles.get(r.slug) ?? r.slug }));
    const topGroups = this.db
      .prepare(
        `SELECT g.display_name AS name, COUNT(DISTINCT s.id) AS sessions, COUNT(p.id) AS songs,
                MAX(p.score) AS best, MAX(COALESCE(p.created_at, s.started_at)) AS lastAt
         FROM groups g JOIN sessions s ON s.group_id = g.id LEFT JOIN performances p ON p.session_id = s.id
         GROUP BY g.id ORDER BY lastAt DESC LIMIT 20`,
      )
      .all() as AdminStats['topGroups'];
    const eventTypes = this.db
      .prepare('SELECT type, COUNT(*) AS count FROM events WHERE at >= ? GROUP BY type ORDER BY count DESC')
      .all(week) as AdminStats['eventTypes'];
    return {
      totals,
      daily,
      topSongs: topSongs.map((r) => ({ ...r })),
      topGroups: topGroups.map((r) => ({ ...r })),
      eventTypes: eventTypes.map((r) => ({ ...r })),
    };
  }

  close() {
    this.db.close();
  }
}
