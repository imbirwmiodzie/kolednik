/**
 * Nagrania narratora (F26): każdy wers kolęd przeczytany z góry neuronowym głosem (Piper)
 * i zapisany w content/narration/<głos>/<klucz>.mp3 — przeglądarka tylko je odtwarza.
 */

/** Głosy, w których generujemy nagrania (modele Piper, licencje w content/narration/LICENSE.txt). */
export const NARRATION_VOICES = [
  { id: 'gosia', name: 'Gosia (kobieta)', model: 'pl_PL-gosia-medium' },
  { id: 'bass', name: 'Bas (mężczyzna)', model: 'pl_PL-bass-high' },
] as const;
export type NarrationVoiceId = (typeof NARRATION_VOICES)[number]['id'];

/**
 * Tempo nagrań względem naturalnej mowy głosu: suflerka mówi szybko, więc nagrywamy od razu w tym tempie
 * i przeglądarka nie musi rozciągać dźwięku przy domyślnej szybkości.
 */
export const NARRATION_RECORDED_RATE = 1.25;

/** content/narration/manifest.json: dla każdego głosu długość (ms) każdego nagrania. */
export type NarrationManifest = Record<string, { clips: Record<string, number> }>;

export type NarrationWhat = 'line' | 'start';

/** Co narrator mówi: cały wers albo jego początek. */
export function promptText(line: string, what: NarrationWhat): string {
  if (what === 'line') return line;
  const words = line.split(/\s+/);
  return words.length <= 3 ? line : `${words.slice(0, 3).join(' ')}…`;
}

/** Klucz (nazwa pliku) nagrania tekstu — ten sam w generatorze i w przeglądarce (cyrb53, 14 znaków hex). */
export function narrationKey(text: string): string {
  const s = text.normalize('NFC').trim();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}
