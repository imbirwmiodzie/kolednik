import { useEffect, useState } from 'react';
import type { Song, SongMeta } from '@kolednik/shared';

let metaPromise: Promise<SongMeta[]> | null = null;
const songCache = new Map<string, Promise<Song>>();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchSongs(): Promise<SongMeta[]> {
  metaPromise ??= getJson<SongMeta[]>('/api/songs').catch((e) => {
    metaPromise = null;
    throw e;
  });
  return metaPromise;
}

export function fetchSong(slug: string): Promise<Song> {
  let p = songCache.get(slug);
  if (!p) {
    p = getJson<Song>(`/api/songs/${encodeURIComponent(slug)}`);
    p.catch(() => songCache.delete(slug));
    songCache.set(slug, p);
  }
  return p;
}

export function useSongs(): SongMeta[] | null {
  const [songs, setSongs] = useState<SongMeta[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchSongs()
        .then((s) => alive && setSongs(s))
        .catch(() => alive && setTimeout(load, 2000));
    load();
    return () => {
      alive = false;
    };
  }, []);
  return songs;
}

export function useSong(slug: string | undefined): Song | null {
  const [song, setSong] = useState<Song | null>(null);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    fetchSong(slug).then((s) => alive && setSong(s));
    return () => {
      alive = false;
    };
  }, [slug]);
  return slug && song?.slug === slug ? song : null;
}
