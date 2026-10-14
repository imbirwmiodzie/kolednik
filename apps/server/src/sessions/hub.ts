import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  THEMES,
  cleanDisplayName,
  normalizeGroupName,
  randomCode,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@kolednik/shared';
import type { Db } from '../db/db.js';
import type { SongLibrary } from '../songs/library.js';
import { Session } from './session.js';

export type SocketData = { role?: 'host' | 'phone'; sessionId?: string; clientId?: string };
export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const themeSchema = z.enum(THEMES);
const modeSchema = z.enum(['auto', 'conductor']);
const metricsSchema = z.object({
  score: z.number().int().min(0).max(100),
  aboveNoiseDb: z.number(),
  displayDb: z.number(),
  peakDb: z.number(),
  coverage: z.number().min(0).max(1),
  stars: z.number().int().min(0).max(5),
  candles: z.number().int().min(0).max(10),
  title: z.string().max(80),
});
const schemas = {
  create: z.object({ groupName: z.string().trim().min(1).max(60), theme: themeSchema }),
  resume: z.object({ sessionId: z.string().max(64), hostToken: z.string().max(128) }),
  join: z.object({
    code: z.string().trim().toUpperCase().length(4),
    clientId: z.string().min(8).max(64),
    nick: z.string().max(30),
  }),
  nick: z.object({ nick: z.string().max(30) }),
  theme: z.object({ theme: themeSchema }),
  voteStart: z.object({ durationSec: z.number().int().min(5).max(120) }),
  slug: z.object({ slug: z.string().max(80) }),
  songStart: z.object({ slug: z.string().max(80), advanceMode: modeSchema }),
  position: z.object({
    index: z.number().int().min(0),
    startedAt: z.number(),
    durationMs: z.number().min(0).max(120_000),
    paused: z.boolean(),
  }),
  mode: z.object({ advanceMode: modeSchema }),
  finish: z.object({
    metrics: metricsSchema.nullable(),
    keyShift: z.number().int().min(-12).max(12).optional(),
    tempo: z.number().min(0.25).max(4).optional(),
  }),
  step: z.object({ delta: z.union([z.literal(1), z.literal(-1)]) }),
};

const IDLE_MS = 12 * 60 * 60 * 1000;

/** Sesje w pamięci + obsługa zdarzeń Socket.IO. Serwer jest źródłem prawdy o fazie, głosach i dyrygencie. */
export class Hub {
  readonly sessions = new Map<string, Session>();
  private byCode = new Map<string, string>();
  private voteTimers = new Map<string, NodeJS.Timeout>();
  private cleanup: NodeJS.Timeout;

  constructor(
    private io: IO,
    private db: Db,
    private library: SongLibrary,
  ) {
    io.on('connection', (socket) => this.onConnection(socket));
    this.cleanup = setInterval(() => this.dropIdle(), 10 * 60 * 1000);
    this.cleanup.unref();
  }

  close() {
    clearInterval(this.cleanup);
    for (const t of this.voteTimers.values()) clearTimeout(t);
  }

  private freeCode(preferred?: string): string {
    if (preferred && !this.byCode.has(preferred)) return preferred;
    for (;;) {
      const c = randomCode();
      if (!this.byCode.has(c)) return c;
    }
  }

  private register(s: Session) {
    this.sessions.set(s.id, s);
    this.byCode.set(s.code, s.id);
  }

  /** Sesja z pamięci, a po restarcie serwera — odtworzona z bazy. */
  private loadSession(id: string): Session | undefined {
    const live = this.sessions.get(id);
    if (live) return live;
    const row = this.db.getSession(id);
    if (!row) return undefined;
    const code = this.freeCode(row.code);
    const s = new Session(
      row.id,
      code,
      row.group_id,
      row.display_name,
      row.host_token,
      row.theme,
      this.db.sungInSession(row.id).filter((slug) => this.library.has(slug)),
      () => this.library.slugs,
    );
    this.register(s);
    return s;
  }

  private dropIdle(now = Date.now()) {
    for (const [id, s] of this.sessions) {
      if (s.hostSockets === 0 && s.connectedParticipants().length === 0 && now - s.lastActivity > IDLE_MS) {
        this.sessions.delete(id);
        if (this.byCode.get(s.code) === id) this.byCode.delete(s.code);
      }
    }
  }

  private broadcast(s: Session) {
    s.lastActivity = Date.now();
    this.io.to(`s:${s.id}`).emit('state', s.toPublic());
  }

  private scheduleVoteEnd(s: Session) {
    clearTimeout(this.voteTimers.get(s.id));
    if (!s.vote) return;
    const t = setTimeout(() => this.endVote(s), Math.max(0, s.vote.endsAt - Date.now()));
    this.voteTimers.set(s.id, t);
  }

  private endVote(s: Session) {
    clearTimeout(this.voteTimers.get(s.id));
    this.voteTimers.delete(s.id);
    if (s.endVote()) this.broadcast(s);
  }

  private onConnection(socket: Sock) {
    const session = () => (socket.data.sessionId ? this.sessions.get(socket.data.sessionId) : undefined);
    const asHost = (fn: (s: Session) => boolean | void) => () => {
      const s = session();
      if (socket.data.role !== 'host' || !s) return;
      if (fn(s) !== false) this.broadcast(s);
    };
    const hostWith =
      <T>(schema: z.ZodType<T>, fn: (s: Session, p: T) => boolean | void) =>
      (raw: unknown) => {
        const p = schema.safeParse(raw);
        if (p.success) asHost((s) => fn(s, p.data))();
      };
    const asPhone =
      <T>(schema: z.ZodType<T> | null, fn: (s: Session, clientId: string, p: T) => boolean | void) =>
      (raw?: unknown) => {
        const s = session();
        const clientId = socket.data.clientId;
        if (socket.data.role !== 'phone' || !s || !clientId) return;
        const p = schema ? schema.safeParse(raw) : { success: true as const, data: undefined as T };
        if (!p.success) return;
        if (fn(s, clientId, p.data) !== false) this.broadcast(s);
      };

    socket.on('time:ping', (ack) => typeof ack === 'function' && ack(Date.now()));

    socket.on('host:create', (raw, ack) => {
      const p = schemas.create.safeParse(raw);
      if (!p.success) return ack?.({ ok: false, error: 'Podaj nazwę grupy' });
      const displayName = cleanDisplayName(p.data.groupName);
      const groupId = this.db.upsertGroup(normalizeGroupName(displayName), displayName);
      const id = randomUUID();
      const hostToken = randomBytes(24).toString('base64url');
      const code = this.freeCode();
      this.db.createSession({
        id,
        group_id: groupId,
        code,
        host_token: hostToken,
        theme: p.data.theme,
        started_at: Date.now(),
      });
      const s = new Session(id, code, groupId, displayName, hostToken, p.data.theme, [], () => this.library.slugs);
      this.register(s);
      this.attachHost(socket, s);
      ack?.({ ok: true, sessionId: id, hostToken });
      this.broadcast(s);
    });

    socket.on('host:resume', (raw, ack) => {
      const p = schemas.resume.safeParse(raw);
      const s = p.success ? this.loadSession(p.data.sessionId) : undefined;
      if (!s || !p.success || s.hostToken !== p.data.hostToken) {
        return ack?.({ ok: false, error: 'Nie znaleziono wieczoru' });
      }
      this.attachHost(socket, s);
      ack?.({ ok: true });
      if (s.vote) this.scheduleVoteEnd(s);
      this.broadcast(s);
    });

    socket.on('phone:join', (raw, ack) => {
      const p = schemas.join.safeParse(raw);
      const id = p.success ? this.byCode.get(p.data.code) : undefined;
      const s = id ? this.sessions.get(id) : undefined;
      if (!p.success || !s) return ack?.({ ok: false, error: 'Nie ma wieczoru o takim kodzie' });
      if (socket.data.role === 'phone' && socket.data.sessionId) this.detach(socket);
      socket.data = { role: 'phone', sessionId: s.id, clientId: p.data.clientId };
      s.join(p.data.clientId, cleanDisplayName(p.data.nick, 30));
      socket.join(`s:${s.id}`);
      ack?.({ ok: true, sessionId: s.id });
      this.broadcast(s);
    });

    socket.on(
      'phone:nick',
      asPhone(schemas.nick, (s, id, p) => s.setNick(id, cleanDisplayName(p.nick, 30))),
    );
    socket.on(
      'phone:vote',
      asPhone(schemas.slug, (s, id, p) => {
        if (!s.castVote(id, p.slug)) return false;
        if (s.everyoneVoted()) {
          // Krótka chwila, żeby wszyscy zobaczyli ostatni głos na TV.
          clearTimeout(this.voteTimers.get(s.id));
          this.voteTimers.set(
            s.id,
            setTimeout(() => this.endVote(s), 1200),
          );
        }
      }),
    );
    socket.on('phone:conductor:claim', asPhone(null, (s, id) => s.claimConductor(id)));
    socket.on('phone:conductor:release', asPhone(null, (s, id) => s.releaseConductor(id)));
    socket.on(
      'phone:conductor:step',
      asPhone(schemas.step, (s, id, p) => {
        if (!s.isConductor(id) || s.phase !== 'SINGING') return false;
        this.io.to(`h:${s.id}`).emit('conductor:step', { delta: p.delta });
        return false;
      }),
    );

    socket.on(
      'host:theme',
      hostWith(schemas.theme, (s, p) => {
        s.theme = p.theme;
        this.db.setTheme(s.id, p.theme);
      }),
    );
    socket.on(
      'host:vote:start',
      hostWith(schemas.voteStart, (s, p) => {
        if (!s.startVote(p.durationSec)) return false;
        this.scheduleVoteEnd(s);
      }),
    );
    socket.on(
      'host:vote:end',
      asHost((s) => {
        this.endVote(s);
        return false;
      }),
    );
    socket.on(
      'host:random',
      asHost((s) => s.random()),
    );
    socket.on(
      'host:song:start',
      hostWith(schemas.songStart, (s, p) => {
        if (!this.library.has(p.slug)) return false;
        return s.startSong(p.slug, s.conductorId ? 'conductor' : p.advanceMode);
      }),
    );
    socket.on(
      'host:song:position',
      hostWith(schemas.position, (s, p) => s.setPosition(p)),
    );
    socket.on(
      'host:song:mode',
      hostWith(schemas.mode, (s, p) => {
        if (p.advanceMode === 'auto') s.conductorId = null;
        return s.setMode(p.advanceMode);
      }),
    );
    socket.on(
      'host:song:finish',
      hostWith(schemas.finish, (s, p) => {
        if (!s.song) return false;
        const record = this.db.addPerformance({
          sessionId: s.id,
          groupId: s.groupId,
          slug: s.song.slug,
          metrics: p.metrics,
          keyShift: p.keyShift ?? 0,
          tempo: p.tempo ?? 1,
        });
        s.finishSong({ metrics: p.metrics, record });
      }),
    );
    socket.on(
      'host:song:abort',
      asHost((s) => s.abortSong()),
    );
    socket.on(
      'host:summary:close',
      asHost((s) => s.closeSummary()),
    );
    socket.on(
      'host:reset-sung',
      asHost((s) => s.resetSung()),
    );
    socket.on('host:book', (ack) => {
      const s = session();
      if (socket.data.role !== 'host' || !s || typeof ack !== 'function') return;
      ack({ ok: true, book: this.db.book(s.groupId, s.groupName) });
    });

    socket.on('disconnect', () => this.detach(socket));
  }

  private attachHost(socket: Sock, s: Session) {
    if (socket.data.sessionId) this.detach(socket);
    socket.data = { role: 'host', sessionId: s.id };
    s.hostSockets++;
    socket.join([`s:${s.id}`, `h:${s.id}`]);
  }

  private detach(socket: Sock) {
    const s = socket.data.sessionId ? this.sessions.get(socket.data.sessionId) : undefined;
    if (!s) return;
    if (socket.data.role === 'host') s.hostSockets = Math.max(0, s.hostSockets - 1);
    if (socket.data.role === 'phone' && socket.data.clientId) s.leave(socket.data.clientId);
    socket.leave(`s:${s.id}`);
    socket.leave(`h:${s.id}`);
    socket.data = {};
    this.broadcast(s);
  }
}
