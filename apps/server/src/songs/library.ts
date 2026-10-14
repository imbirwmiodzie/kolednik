import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { songMeta, songSchema, type Song, type SongMeta } from '@kolednik/shared';

export class SongLibrary {
  readonly songs = new Map<string, Song>();

  constructor(songs: Song[]) {
    for (const s of songs) this.songs.set(s.slug, s);
  }

  static load(contentDir: string): SongLibrary {
    const dir = path.join(contentDir, 'songs');
    const songs = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => {
        const raw = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
        const parsed = songSchema.safeParse(raw);
        if (!parsed.success) throw new Error(`Błędny plik kolędy ${f}: ${parsed.error.message}`);
        if (`${parsed.data.slug}.json` !== f) throw new Error(`Slug w ${f} nie zgadza się z nazwą pliku`);
        return parsed.data;
      });
    return new SongLibrary(songs);
  }

  get slugs(): string[] {
    return [...this.songs.keys()];
  }

  has(slug: string): boolean {
    return this.songs.has(slug);
  }

  get(slug: string): Song | undefined {
    return this.songs.get(slug);
  }

  meta(): SongMeta[] {
    return [...this.songs.values()].map(songMeta).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
  }
}
