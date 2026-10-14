import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import {
  flattenSong,
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
  const client = async () => {
    const c: Client = connect(url, { transports: ['websocket'], forceNew: true });
    const q: { states: PublicState[]; wake?: () => void } = { states: [] };
    queues.set(c, q);
    c.on('state', (s) => {
      q.states.push(s);
      q.wake?.();
    });
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

  it('pełny wieczór: dołączenie, głosowanie, śpiew z dyrygentem, rekord', async () => {
    const tv = await client();
    const created = await tv.emitWithAck('host:create', { groupName: '  Rodzina Testowa ', theme: 'winter' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const lobby = await nextState(tv);
    expect(lobby.groupName).toBe('Rodzina Testowa');
    expect(lobby.code).toMatch(/^[A-Z]{4}$/);

    const p1 = await client();
    const p2 = await client();
    expect(
      (
        await p1.emitWithAck('phone:join', {
          code: lobby.code.toLowerCase(),
          clientId: 'phone-0001',
          nick: 'Ania',
        })
      ).ok,
    ).toBe(true);
    expect(
      (await p2.emitWithAck('phone:join', { code: lobby.code, clientId: 'phone-0002', nick: '' })).ok,
    ).toBe(true);
    expect((await p1.emitWithAck('phone:join', { code: 'ZZZZ', clientId: 'phone-0003', nick: '' })).ok).toBe(
      false,
    );

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
    tv.emit('host:song:start', { slug: 'cicha-noc', advanceMode: 'auto' });
    expect((await singing).song?.slug).toBe('cicha-noc');

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

    // Rekordy grupy w Złotej księdze; ta sama nazwa inaczej zapisana = to samo konto.
    const book = await tv.emitWithAck('host:book');
    expect(book.ok && book.book.records[0]).toMatchObject({ slug: 'cicha-noc', best: 72, times: 1 });

    const tv2 = await client();
    const again = await tv2.emitWithAck('host:create', { groupName: 'RODZINA testowa', theme: 'classic' });
    expect(again.ok).toBe(true);
    const book2 = await tv2.emitWithAck('host:book');
    expect(book2.ok && book2.book.records).toHaveLength(1);
    const fresh = await nextState(tv2);
    expect(fresh.sung).toEqual([]); // nowy wieczór — pusta lista zaśpiewanych
  });

  it('TV wraca do wieczoru po odświeżeniu', async () => {
    const tv = await client();
    const created = await tv.emitWithAck('host:create', { groupName: 'Powrót', theme: 'tree' });
    if (!created.ok) throw new Error(created.error);
    tv.close();
    const tv2 = await client();
    expect(
      (await tv2.emitWithAck('host:resume', { sessionId: created.sessionId, hostToken: 'zły' })).ok,
    ).toBe(false);
    expect((await tv2.emitWithAck('host:resume', created)).ok).toBe(true);
  });
});
