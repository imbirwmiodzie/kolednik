import { randomBytes, randomInt, randomUUID } from 'node:crypto';
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
import type { Db, EventInput } from '../db/db.js';
import { clientIp, maskIp } from '../security/ip.js';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { RateLimiter } from '../security/rateLimit.js';
import type { SongLibrary } from '../songs/library.js';
import { Session } from './session.js';

export type SocketData = { role?: 'host' | 'phone'; sessionId?: string; clientId?: string };
export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Kod do wpisania ręcznie: 6 liter z 22 = ~113 mln kombinacji, plus limit prób. */
export const CODE_LENGTH = 6;
export const MIN_PASSWORD = 4;

const themeSchema = z.enum(THEMES);
const modeSchema = z.enum(['auto', 'conductor']);
const keySchema = z.number().int().min(-6).max(6);
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
  create: z.object({
    groupName: z.string().trim().min(1).max(60),
    password: z.string().max(200),
    theme: themeSchema,
  }),
  resume: z.object({ sessionId: z.string().max(64), hostToken: z.string().max(128) }),
  join: z.object({
    token: z.string().max(64).optional(),
    code: z.string().trim().toUpperCase().max(12).optional(),
    sessionId: z.string().max(64).optional(),
    clientId: z.string().min(8).max(64),
    nick: z.string().max(30),
  }),
  nick: z.object({ nick: z.string().max(30) }),
  theme: z.object({ theme: themeSchema }),
  voteStart: z.object({ durationSec: z.number().int().min(5).max(120) }),
  slug: z.object({ slug: z.string().max(80) }),
  songStart: z.object({ slug: z.string().max(80), advanceMode: modeSchema, keyShift: keySchema.optional() }),
  key: z.object({ keyShift: keySchema }),
  position: z.object({
    index: z.number().int().min(0),
    startedAt: z.number(),
    durationMs: z.number().min(0).max(120_000),
    paused: z.boolean(),
  }),
  mode: z.object({ advanceMode: modeSchema }),
  finish: z.object({
    metrics: metricsSchema.nullable(),
    keyShift: keySchema.optional(),
    tempo: z.number().min(0.25).max(4).optional(),
  }),
  step: z.object({ delta: z.union([z.literal(1), z.literal(-1)]) }),
};

const IDLE_MS = 12 * 60 * 60 * 1000;
const cryptoRng = () => randomInt(0, 2 ** 32) / 2 ** 32;
const newJoinToken = () => randomBytes(18).toString('base64url');

/** Sesje w pamięci + obsługa zdarzeń Socket.IO. Serwer jest źródłem prawdy o fazie, głosach i dyrygencie. */
export class Hub {
  readonly sessions = new Map<string, Session>();
  private byCode = new Map<string, string>();
  private byToken = new Map<string, string>();
  private voteTimers = new Map<string, NodeJS.Timeout>();
  private cleanup: NodeJS.Timeout;
  // Ochrona przed zgadywaniem haseł i kodów (N8).
  private loginByIp = new RateLimiter(30, 15 * 60_000);
  private loginByGroup = new RateLimiter(8, 15 * 60_000);
  private joinByIp = new RateLimiter(20, 10 * 60_000);

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

  /** Bieżące użycie do panelu admina. */
  live() {
    let tvs = 0;
    let phones = 0;
    let sessions = 0;
    for (const s of this.sessions.values()) {
      const p = s.connectedParticipants().length;
      if (s.hostSockets || p) sessions++;
      tvs += s.hostSockets;
      phones += p;
    }
    return { sessions, tvs, phones };
  }

  private log(e: EventInput) {
    this.db.logEvent(e);
    const where = [e.sessionId?.slice(0, 8), e.ip].filter(Boolean).join(' ');
    console.log(
      `[zdarzenie] ${e.type}${where ? ` (${where})` : ''}${e.data ? ` ${JSON.stringify(e.data)}` : ''}`,
    );
  }

  private freeCode(preferred?: string): string {
    if (preferred && preferred.length === CODE_LENGTH && !this.byCode.has(preferred)) return preferred;
    for (;;) {
      const c = randomCode(cryptoRng, CODE_LENGTH);
      if (!this.byCode.has(c)) return c;
    }
  }

  private register(s: Session) {
    this.sessions.set(s.id, s);
    this.byCode.set(s.code, s.id);
    this.byToken.set(s.joinToken, s.id);
  }

  private sendJoinInfo(s: Session) {
    this.io.to(`h:${s.id}`).emit('join-info', { code: s.code, token: s.joinToken });
  }

  /** Nowy kod i klucz linku — stare przestają działać (np. gdy link wyciekł poza rodzinę). */
  private rotateJoin(s: Session) {
    if (this.byCode.get(s.code) === s.id) this.byCode.delete(s.code);
    if (this.byToken.get(s.joinToken) === s.id) this.byToken.delete(s.joinToken);
    s.code = this.freeCode();
    s.joinToken = newJoinToken();
    this.byCode.set(s.code, s.id);
    this.byToken.set(s.joinToken, s.id);
    this.db.setJoin(s.id, s.code, s.joinToken);
  }

  /** Sesja z pamięci, a po restarcie serwera — odtworzona z bazy. */
  private loadSession(id: string): Session | undefined {
    const live = this.sessions.get(id);
    if (live) return live;
    const row = this.db.getSession(id);
    if (!row) return undefined;
    const code = this.freeCode(row.code);
    const token = row.join_token && !this.byToken.has(row.join_token) ? row.join_token : newJoinToken();
    if (code !== row.code || token !== row.join_token) this.db.setJoin(row.id, code, token);
    const s = new Session(
      row.id,
      code,
      row.group_id,
      row.display_name,
      row.host_token,
      token,
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
        if (this.byToken.get(s.joinToken) === id) this.byToken.delete(s.joinToken);
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
    if (!s.endVote()) return;
    this.log({
      type: 'vote_ended',
      groupId: s.groupId,
      sessionId: s.id,
      data: { winner: s.reveal?.slug, tiebreak: s.reveal?.viaTiebreak, noVotes: s.reveal?.noVotes },
    });
    this.broadcast(s);
  }

  /**
   * Logowanie grupy (F40 + bezpieczeństwo): nowa nazwa zakłada konto z hasłem,
   * istniejąca wymaga zgodnego hasła. Hasła trzymamy jako skrót scrypt.
   */
  private authGroup(
    name: string,
    password: string,
    ip: string,
  ): { ok: true; groupId: number; displayName: string; created: boolean } | { ok: false; error: string } {
    const displayName = cleanDisplayName(name);
    const norm = normalizeGroupName(displayName);
    const groupKey = `g:${norm}`;
    if (!this.loginByIp.allowed(ip) || !this.loginByGroup.allowed(groupKey)) {
      const ms = Math.max(this.loginByIp.retryAfterMs(ip), this.loginByGroup.retryAfterMs(groupKey));
      this.log({ type: 'login_blocked', ip: maskIp(ip), data: { group: displayName } });
      return { ok: false, error: `Za dużo prób. Spróbujcie za ${Math.ceil(ms / 60_000)} min.` };
    }
    const existing = this.db.getGroup(norm);
    if (!existing) {
      if (password.length < MIN_PASSWORD) {
        return { ok: false, error: `Nowa grupa — wymyślcie hasło (min. ${MIN_PASSWORD} znaki).` };
      }
      const groupId = this.db.createGroup(norm, displayName, hashPassword(password));
      this.log({ type: 'group_created', groupId, ip: maskIp(ip) });
      return { ok: true, groupId, displayName, created: true };
    }
    if (!existing.password_hash) {
      // Konto sprzed haseł — pierwsze logowanie ustawia hasło.
      if (password.length < MIN_PASSWORD) {
        return { ok: false, error: `Ustawcie hasło dla tej grupy (min. ${MIN_PASSWORD} znaki).` };
      }
      this.db.setGroupPassword(existing.id, hashPassword(password));
    } else if (!verifyPassword(password, existing.password_hash)) {
      this.loginByIp.fail(ip);
      this.loginByGroup.fail(groupKey);
      this.log({ type: 'login_failed', groupId: existing.id, ip: maskIp(ip) });
      return { ok: false, error: 'Złe hasło dla tej grupy.' };
    }
    this.loginByGroup.reset(groupKey);
    if (existing.display_name !== displayName) this.db.setGroupDisplayName(existing.id, displayName);
    return { ok: true, groupId: existing.id, displayName, created: false };
  }

  private onConnection(socket: Sock) {
    const ip = clientIp(socket.handshake.headers, socket.handshake.address);
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
      if (!p.success) return ack?.({ ok: false, error: 'Podaj nazwę grupy i hasło' });
      const auth = this.authGroup(p.data.groupName, p.data.password, ip);
      if (!auth.ok) return ack?.(auth);
      const id = randomUUID();
      const hostToken = randomBytes(24).toString('base64url');
      const code = this.freeCode();
      const joinToken = newJoinToken();
      this.db.createSession({
        id,
        group_id: auth.groupId,
        code,
        host_token: hostToken,
        join_token: joinToken,
        theme: p.data.theme,
        started_at: Date.now(),
      });
      const s = new Session(
        id,
        code,
        auth.groupId,
        auth.displayName,
        hostToken,
        joinToken,
        p.data.theme,
        [],
        () => this.library.slugs,
      );
      this.register(s);
      this.attachHost(socket, s);
      this.log({
        type: 'session_created',
        groupId: auth.groupId,
        sessionId: id,
        ip: maskIp(ip),
        data: { theme: p.data.theme, newGroup: auth.created },
      });
      ack?.({ ok: true, sessionId: id, hostToken, created: auth.created });
      this.sendJoinInfo(s);
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
      this.sendJoinInfo(s);
      this.broadcast(s);
    });

    socket.on('phone:join', (raw, ack) => {
      const p = schemas.join.safeParse(raw);
      if (!p.success) return ack?.({ ok: false, error: 'Błędne dane' });
      const { token, code, sessionId, clientId } = p.data;
      let s: Session | undefined;
      let via: 'qr' | 'code' | 'rejoin' = 'qr';
      if (sessionId) {
        // Powrót po zerwaniu połączenia — tylko telefon, który już był w tym wieczorze.
        const known = this.sessions.get(sessionId);
        if (known?.participants.has(clientId)) s = known;
        via = 'rejoin';
      }
      if (!s && token) {
        const id = this.byToken.get(token);
        s = id ? this.sessions.get(id) : undefined;
        via = 'qr';
      }
      if (!s && code) {
        if (!this.joinByIp.allowed(ip)) {
          return ack?.({ ok: false, error: 'Za dużo błędnych kodów. Zeskanujcie kod QR z telewizora.' });
        }
        const id = this.byCode.get(code);
        s = id ? this.sessions.get(id) : undefined;
        via = 'code';
      }
      if (!s) {
        if (code || token) this.joinByIp.fail(ip);
        this.log({ type: 'join_failed', ip: maskIp(ip), data: { via } });
        return ack?.({
          ok: false,
          error: sessionId && !code && !token ? 'Wieczór się skończył' : 'Nie ma wieczoru o takim kodzie',
        });
      }
      if (socket.data.role === 'phone' && socket.data.sessionId) this.detach(socket);
      const isNew = !s.participants.has(clientId);
      socket.data = { role: 'phone', sessionId: s.id, clientId };
      s.join(clientId, cleanDisplayName(p.data.nick, 30));
      socket.join(`s:${s.id}`);
      if (isNew)
        this.log({
          type: 'phone_joined',
          groupId: s.groupId,
          sessionId: s.id,
          ip: maskIp(ip),
          data: { via },
        });
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
    socket.on(
      'phone:conductor:claim',
      asPhone(null, (s, id) => {
        if (!s.claimConductor(id)) return false;
        this.log({ type: 'conductor_claimed', groupId: s.groupId, sessionId: s.id });
      }),
    );
    socket.on(
      'phone:conductor:release',
      asPhone(null, (s, id) => s.releaseConductor(id)),
    );
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
        this.log({ type: 'theme_changed', groupId: s.groupId, sessionId: s.id, data: { theme: p.theme } });
      }),
    );
    socket.on(
      'host:rotate-code',
      asHost((s) => {
        this.rotateJoin(s);
        this.sendJoinInfo(s);
        this.log({ type: 'code_rotated', groupId: s.groupId, sessionId: s.id });
        return false;
      }),
    );
    socket.on(
      'host:vote:start',
      hostWith(schemas.voteStart, (s, p) => {
        if (!s.startVote(p.durationSec)) return false;
        this.log({ type: 'vote_started', groupId: s.groupId, sessionId: s.id });
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
      asHost((s) => s.random(cryptoRng)),
    );
    socket.on(
      'host:song:start',
      hostWith(schemas.songStart, (s, p) => {
        if (!this.library.has(p.slug)) return false;
        const via = s.reveal?.slug === p.slug ? s.reveal.via : 'tile';
        if (!s.startSong(p.slug, s.conductorId ? 'conductor' : p.advanceMode, p.keyShift ?? 0)) return false;
        this.log({ type: 'song_started', groupId: s.groupId, sessionId: s.id, data: { slug: p.slug, via } });
      }),
    );
    socket.on(
      'host:song:key',
      hostWith(schemas.key, (s, p) => s.setKey(p.keyShift)),
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
        const slug = s.song.slug;
        const record = this.db.addPerformance({
          sessionId: s.id,
          groupId: s.groupId,
          slug,
          metrics: p.metrics,
          keyShift: p.keyShift ?? s.song.keyShift,
          tempo: p.tempo ?? 1,
        });
        s.finishSong({ metrics: p.metrics, record });
        this.log({
          type: 'song_finished',
          groupId: s.groupId,
          sessionId: s.id,
          data: { slug, score: p.metrics?.score ?? null, record: record?.isNew ?? false },
        });
      }),
    );
    socket.on(
      'host:song:abort',
      asHost((s) => {
        this.log({ type: 'song_aborted', groupId: s.groupId, sessionId: s.id, data: { slug: s.song?.slug } });
        s.abortSong();
      }),
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
