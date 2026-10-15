import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import {
  flattenSong,
  type AdminEvent,
  type AdminStats,
  type ClientToServerEvents,
  type PublicState,
  type ServerToClientEvents,
} from '@kolednik/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { SongLibrary } from './songs/library.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

describe('biblioteka kolęd', () => {
  const lib = SongLibrary.load(loadConfig().contentDir);
  it('wszystkie pliki są poprawne', () => {
    expect(lib.slugs.length).toBeGreaterThanOrEqual(10);
  });
  it.each(lib.slugs)('%s ma niepuste wersy', (slug) => {
    const lines = flattenSong(lib.get(slug)!);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(l.text.trim()).toBe(l.text);
  });
});

describe('sesja przez Socket.IO', () => {
  let built: Awaited<ReturnType<typeof buildApp>>;
  let url: string;
  const clients: Client[] = [];

  beforeAll(async () => {
    built = await buildApp({ ...loadConfig(), webDist: undefined }, { dbFile: ':memory:' });
    await built.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const c of clients) c.close();
    await built.app.close();
  });

  // Każdy klient zbiera wszystkie stany w kolejce; nextState zużywa je po kolei aż do pasującego.
  const queues = new WeakMap<Client, { states: PublicState[]; wake?: () => void }>();
  const joinInfo = new WeakMap<Client, { code: string; token: string }>();
  const client = async (headers?: Record<string, string>) => {
    const c: Client = connect(url, { transports: ['websocket'], forceNew: true, extraHeaders: headers });
    const q: { states: PublicState[]; wake?: () => void } = { states: [] };
    queues.set(c, q);
    c.on('state', (s) => {
      q.states.push(s);
      q.wake?.();
    });
    c.on('join-info', (info) => joinInfo.set(c, info));
    clients.push(c);
    await new Promise<void>((r) => c.once('connect', () => r()));
    return c;
  };
  const nextState = async (
    c: Client,
    pred: (s: PublicState) => boolean = () => true,
  ): Promise<PublicState> => {
    const q = queues.get(c)!;
    for (;;) {
      const s = q.states.shift();
      if (s) {
        if (pred(s)) return s;
        continue;
      }
      await new Promise<void>((r) => (q.wake = r));
    }
  };

  it('pełny wieczór: konto z hasłem, dołączenie z QR, głosowanie, dyrygent, rekord', async () => {
    const tv = await client();
    const tooShort = await tv.emitWithAck('host:create', {
      groupName: 'Rodzina Testowa',
      password: 'ab',
      theme: 'winter',
    });
    expect(tooShort.ok).toBe(false);
    const created = await tv.emitWithAck('host:create', {
      groupName: '  Rodzina Testowa ',
      password: 'opłatek24',
      theme: 'winter',
    });
    expect(created).toMatchObject({ ok: true, created: true });
    if (!created.ok) return;

    const lobby = await nextState(tv);
    expect(lobby.groupName).toBe('Rodzina Testowa');
    expect(lobby).not.toHaveProperty('code'); // kod i klucz idą tylko do TV
    const info = joinInfo.get(tv)!;
    expect(info.code).toMatch(/^[A-Z]{6}$/);
    expect(info.token.length).toBeGreaterThanOrEqual(24);

    const p1 = await client();
    const p2 = await client();
    expect(
      (await p1.emitWithAck('phone:join', { token: info.token, clientId: 'phone-0001', nick: 'Ania' })).ok,
    ).toBe(true);
    expect(
      (
        await p2.emitWithAck('phone:join', {
          code: info.code.toLowerCase(),
          clientId: 'phone-0002',
          nick: '',
        })
      ).ok,
    ).toBe(true);
    expect(
      (await p1.emitWithAck('phone:join', { token: 'zgadywany-token', clientId: 'phone-0003', nick: '' })).ok,
    ).toBe(false);
    // Powrót po zerwaniu połączenia działa tylko dla telefonu, który już był w wieczorze.
    expect(
      (await p1.emitWithAck('phone:join', { sessionId: created.sessionId, clientId: 'phone-0001', nick: '' }))
        .ok,
    ).toBe(true);
    expect(
      (
        await p1.emitWithAck('phone:join', {
          sessionId: created.sessionId,
          clientId: 'obcy-telefon',
          nick: '',
        })
      ).ok,
    ).toBe(false);
    expect(
      (await p1.emitWithAck('phone:join', { sessionId: created.sessionId, clientId: 'phone-0001', nick: '' }))
        .ok,
    ).toBe(true);

    // Głosowanie: obaj głosują → koniec przed czasem.
    const voting = nextState(tv, (s) => s.phase === 'VOTING');
    tv.emit('host:vote:start', { durationSec: 60 });
    await voting;
    const revealed = nextState(tv, (s) => s.phase === 'REVEAL');
    p1.emit('phone:vote', { slug: 'cicha-noc' });
    p2.emit('phone:vote', { slug: 'cicha-noc' });
    const reveal = await revealed;
    expect(reveal.reveal).toMatchObject({ slug: 'cicha-noc', via: 'vote', viaTiebreak: false });

    // Telefon nie może udawać TV.
    p1.emit('host:song:start', { slug: 'bog-sie-rodzi', advanceMode: 'auto' });

    const singing = nextState(tv, (s) => s.phase === 'SINGING');
    tv.emit('host:song:start', { slug: 'cicha-noc', advanceMode: 'auto', keyShift: -2 });
    const sing = await singing;
    expect(sing.song).toMatchObject({ slug: 'cicha-noc', keyShift: -2 });
    tv.emit('host:song:key', { keyShift: 1 });
    expect((await nextState(tv, (s) => s.song?.keyShift === 1)).song?.keyShift).toBe(1);

    // Każdy może zostać dyrygentem; przejęcie włącza tryb z telefonu.
    const conducted = nextState(tv, (s) => s.conductor?.id === 'phone-0002');
    p2.emit('phone:conductor:claim');
    const cs = await conducted;
    expect(cs.song?.advanceMode).toBe('conductor');

    const step = new Promise((r) => tv.once('conductor:step', r));
    p1.emit('phone:conductor:step', { delta: 1 }); // nie-dyrygent — ignorowane
    p2.emit('phone:conductor:step', { delta: 1 });
    expect(await step).toEqual({ delta: 1 });

    const metrics = {
      score: 72,
      aboveNoiseDb: 20,
      displayDb: 55,
      peakDb: 30,
      coverage: 0.9,
      stars: 4,
      candles: 7,
      title: 'x',
    };
    const summary = nextState(tv, (s) => s.phase === 'SUMMARY');
    tv.emit('host:song:finish', { metrics });
    const sum = await summary;
    expect(sum.summary?.record).toEqual({ previousBest: null, previousAt: null, isNew: true });
    expect(sum.sung).toEqual(['cicha-noc']);

    // Zaśpiewana kolęda znika z głosowania.
    tv.emit('host:summary:close');
    await nextState(tv, (s) => s.phase === 'LOBBY');
    tv.emit('host:vote:start', { durationSec: 60 });
    await nextState(tv, (s) => s.phase === 'VOTING');
    p1.emit('phone:vote', { slug: 'cicha-noc' });
    p2.emit('phone:vote', { slug: 'bog-sie-rodzi' });
    p1.emit('phone:vote', { slug: 'bog-sie-rodzi' });
    const r2 = await nextState(tv, (s) => s.phase === 'REVEAL');
    expect(r2.reveal?.slug).toBe('bog-sie-rodzi');

    // Nowy kod: stary link przestaje działać, dołączeni zostają.
    const rotated = new Promise<{ code: string; token: string }>((r) => tv.once('join-info', r));
    tv.emit('host:rotate-code');
    const fresh = await rotated;
    expect(fresh.token).not.toBe(info.token);
    expect(
      (await p2.emitWithAck('phone:join', { token: info.token, clientId: 'phone-0009', nick: '' })).ok,
    ).toBe(false);
    expect(
      (await p2.emitWithAck('phone:join', { token: fresh.token, clientId: 'phone-0002', nick: '' })).ok,
    ).toBe(true);

    // Rekordy grupy w Złotej księdze; ta sama nazwa inaczej zapisana = to samo konto, ale tylko z hasłem.
    const book = await tv.emitWithAck('host:book');
    expect(book.ok && book.book.records[0]).toMatchObject({ slug: 'cicha-noc', best: 72, times: 1 });

    const tv2 = await client();
    const wrong = await tv2.emitWithAck('host:create', {
      groupName: 'RODZINA testowa',
      password: 'zle',
      theme: 'classic',
    });
    expect(wrong).toMatchObject({ ok: false, error: 'Złe hasło dla tej grupy.' });
    const again = await tv2.emitWithAck('host:create', {
      groupName: 'RODZINA testowa',
      password: 'opłatek24',
      theme: 'classic',
    });
    expect(again).toMatchObject({ ok: true, created: false });
    const book2 = await tv2.emitWithAck('host:book');
    expect(book2.ok && book2.book.records).toHaveLength(1);
    const evening = await nextState(tv2);
    expect(evening.sung).toEqual([]); // nowy wieczór — pusta lista zaśpiewanych
  });

  it('blokuje zgadywanie hasła i kodów', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.7' };
    const tv = await client(headers);
    await tv.emitWithAck('host:create', { groupName: 'Sejf', password: 'tajne123', theme: 'classic' });
    const attacker = await client(headers);
    for (let i = 0; i < 8; i++) {
      await attacker.emitWithAck('host:create', { groupName: 'Sejf', password: `zle${i}`, theme: 'classic' });
    }
    const blocked = await attacker.emitWithAck('host:create', {
      groupName: 'Sejf',
      password: 'tajne123',
      theme: 'classic',
    });
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.error).toMatch(/Za dużo prób/);

    for (let i = 0; i < 20; i++) {
      await attacker.emitWithAck('phone:join', {
        code: `AAAAA${'BCDEFGHJKLMNPRSTUWXYZ'[i]}`,
        clientId: 'atak-0001',
        nick: '',
      });
    }
    const joinBlocked = await attacker.emitWithAck('phone:join', {
      code: 'ABCDEF',
      clientId: 'atak-0001',
      nick: '',
    });
    expect(!joinBlocked.ok && joinBlocked.error).toMatch(/Za dużo błędnych kodów/);
  });

  it('TV wraca do wieczoru po odświeżeniu', async () => {
    const tv = await client();
    const created = await tv.emitWithAck('host:create', {
      groupName: 'Powrót',
      password: 'kolęda',
      theme: 'tree',
    });
    if (!created.ok) throw new Error(created.error);
    tv.close();
    const tv2 = await client();
    expect(
      (await tv2.emitWithAck('host:resume', { sessionId: created.sessionId, hostToken: 'zły' })).ok,
    ).toBe(false);
    expect((await tv2.emitWithAck('host:resume', created)).ok).toBe(true);
  });

  it('panel admina: logowanie, statystyki i dziennik', async () => {
    expect((await fetch(`${url}/admin/api/stats`)).status).toBe(401);
    const bad = await fetch(`${url}/admin/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: 'lama', password: 'zle' }),
    });
    expect(bad.status).toBe(401);
    const login = await fetch(`${url}/admin/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: 'lama', password: 'bezdomna' }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    const auth = { cookie: cookie.split(';')[0]! };

    const stats = (await (await fetch(`${url}/admin/api/stats`, { headers: auth })).json()) as AdminStats;
    expect(stats.totals.groups).toBeGreaterThanOrEqual(3);
    expect(stats.totals.performances).toBeGreaterThanOrEqual(1);
    expect(stats.totals.failedLogins7d).toBeGreaterThanOrEqual(9);
    expect(stats.daily).toHaveLength(30);
    expect(stats.topSongs[0]).toMatchObject({ slug: 'cicha-noc', title: 'Cicha noc' });
    expect(stats.live.tvs).toBeGreaterThanOrEqual(1);

    const events = (await (
      await fetch(`${url}/admin/api/events?type=login_failed`, { headers: auth })
    ).json()) as AdminEvent[];
    expect(events.length).toBeGreaterThanOrEqual(8);
    expect(events[0]).toMatchObject({ type: 'login_failed', group: 'Sejf', ip: '203.0.113.x' });

    await fetch(`${url}/admin/api/logout`, { method: 'POST', headers: auth });
    expect((await fetch(`${url}/admin/api/stats`, { headers: auth })).status).toBe(401);
  });
});
