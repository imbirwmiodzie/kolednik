import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AdminStats } from '@kolednik/shared';
import type { Db } from '../db/db.js';
import { clientIp, maskIp } from '../security/ip.js';
import { safeEqual } from '../security/passwords.js';
import { RateLimiter } from '../security/rateLimit.js';
import type { Hub } from '../sessions/hub.js';
import type { SongLibrary } from '../songs/library.js';

export type AdminCredentials = { user: string; password: string };

const COOKIE = 'kolednik_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;

export const DEFAULT_ADMIN: AdminCredentials = { user: 'lama', password: 'bezdomna' };

export function adminCredentials(env = process.env): AdminCredentials & { isDefault: boolean } {
  const user = env.ADMIN_USER || DEFAULT_ADMIN.user;
  const password = env.ADMIN_PASSWORD || DEFAULT_ADMIN.password;
  return { user, password, isDefault: !env.ADMIN_PASSWORD };
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Panel statystyk: osobne logowanie, sesja w ciasteczku HttpOnly, limit prób logowania. */
export function registerAdmin(
  app: FastifyInstance,
  deps: { db: Db; hub: Hub; library: SongLibrary; credentials: AdminCredentials },
) {
  const sessions = new Map<string, number>();
  const limiter = new RateLimiter(10, 15 * 60_000);
  const titles = new Map(deps.library.meta().map((s) => [s.slug, s.title] as const));

  const isAuthed = (req: FastifyRequest) => {
    const token = readCookie(req, COOKIE);
    const exp = token ? sessions.get(token) : undefined;
    if (!token || !exp) return false;
    if (exp < Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  };
  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthed(req)) return reply.code(401).send({ error: 'Zaloguj się' });
  };
  const cookie = (req: FastifyRequest, value: string, maxAgeSec: number) =>
    [
      `${COOKIE}=${value}`,
      'Path=/admin',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSec}`,
      ...(req.protocol === 'https' ? ['Secure'] : []),
    ].join('; ');

  app.post('/admin/api/login', async (req, reply) => {
    const ip = clientIp(req.headers, req.ip);
    if (!limiter.allowed(ip)) {
      return reply.code(429).send({ error: 'Za dużo prób logowania. Spróbuj za kwadrans.' });
    }
    const body = z.object({ user: z.string().max(100), password: z.string().max(200) }).safeParse(req.body);
    const ok =
      body.success &&
      safeEqual(body.data.user, deps.credentials.user) &&
      safeEqual(body.data.password, deps.credentials.password);
    if (!ok) {
      limiter.fail(ip);
      deps.db.logEvent({ type: 'admin_login_failed', ip: maskIp(ip) });
      return reply.code(401).send({ error: 'Zły login lub hasło' });
    }
    limiter.reset(ip);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + SESSION_MS);
    deps.db.logEvent({ type: 'admin_login', ip: maskIp(ip) });
    return reply.header('Set-Cookie', cookie(req, token, SESSION_MS / 1000)).send({ ok: true });
  });

  app.post('/admin/api/logout', async (req, reply) => {
    const token = readCookie(req, COOKIE);
    if (token) sessions.delete(token);
    return reply.header('Set-Cookie', cookie(req, '', 0)).send({ ok: true });
  });

  app.get('/admin/api/me', async (req) => ({ authed: isAuthed(req) }));

  app.get('/admin/api/stats', { preHandler: guard }, async (): Promise<AdminStats> => ({
    ...deps.db.stats(titles),
    live: deps.hub.live(),
  }));

  app.get('/admin/api/events', { preHandler: guard }, async (req) => {
    const q = z
      .object({
        type: z.string().max(40).optional(),
        before: z.coerce.number().int().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    return deps.db.events({ type: q.type || undefined, before: q.before, limit: q.limit });
  });
}
