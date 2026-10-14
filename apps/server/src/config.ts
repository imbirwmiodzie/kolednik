import { existsSync } from 'node:fs';
import path from 'node:path';

/** Szuka katalogu w górę od bieżącego (dev: apps/server → repo root). */
function findUp(name: string, from = process.cwd()): string | undefined {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export type Config = {
  port: number;
  host: string;
  contentDir: string;
  dataDir: string;
  webDist: string | undefined;
};

export function loadConfig(env = process.env): Config {
  const contentDir = env.CONTENT_DIR ?? findUp('content');
  if (!contentDir) throw new Error('Nie znaleziono katalogu content/ (ustaw CONTENT_DIR)');
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    contentDir,
    dataDir: env.DATA_DIR ?? path.join(path.dirname(contentDir), 'data'),
    webDist: env.WEB_DIST ?? findUp('apps/web/dist'),
  };
}
