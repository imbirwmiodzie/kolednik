import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Book, Metrics, RecordInfo, ThemeId } from '@kolednik/shared';

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
];

export type SessionRow = {
  id: string;
  group_id: number;
  code: string;
  host_token: string;
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

  upsertGroup(nameNorm: string, displayName: string, now = Date.now()): number {
    this.db
      .prepare(
        `INSERT INTO groups (name_norm, display_name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(name_norm) DO UPDATE SET display_name = excluded.display_name`,
      )
      .run(nameNorm, displayName, now);
    return (this.db.prepare('SELECT id FROM groups WHERE name_norm = ?').get(nameNorm) as { id: number }).id;
  }

  createSession(s: Omit<SessionRow, 'display_name'>) {
    this.db
      .prepare(
        'INSERT INTO sessions (id, group_id, code, host_token, theme, started_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(s.id, s.group_id, s.code, s.host_token, s.theme, s.started_at);
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

  close() {
    this.db.close();
  }
}
