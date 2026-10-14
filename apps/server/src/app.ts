import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import type { Config } from './config.js';
import { Db } from './db/db.js';
import { Hub, type IO } from './sessions/hub.js';
import { SongLibrary } from './songs/library.js';

export async function buildApp(config: Config, opts: { dbFile?: string; logger?: boolean } = {}) {
  const library = SongLibrary.load(config.contentDir);
  const db = new Db(opts.dbFile ?? path.join(config.dataDir, 'kolednik.sqlite'));
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });

  app.get('/healthz', async () => ({ ok: true, songs: library.slugs.length }));
  app.get('/api/songs', async () => library.meta());
  app.get<{ Params: { slug: string } }>('/api/songs/:slug', async (req, reply) => {
    const song = library.get(req.params.slug);
    return song ?? reply.code(404).send({ error: 'Nie ma takiej kolędy' });
  });

  const images = path.join(config.contentDir, 'images');
  if (existsSync(images)) {
    await app.register(fastifyStatic, { root: images, prefix: '/content/images/', decorateReply: false });
  }

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: '/',
      setHeaders: (res, file) => {
        // Pliki z hashem w nazwie można cache'ować w Cloudflare na długo, index.html — nie.
        res.setHeader(
          'Cache-Control',
          file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
    );
  }

  const io: IO = new Server(app.server, {
    // Cloudflare zrywa bezczynne WebSockety po ~100 s — ping co 25 s trzyma połączenie (N7).
    pingInterval: 25_000,
    pingTimeout: 20_000,
    cors: { origin: false },
  });
  const hub = new Hub(io, db, library);

  app.addHook('onClose', async () => {
    hub.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    db.close();
  });

  return { app, io, hub, db, library };
}
