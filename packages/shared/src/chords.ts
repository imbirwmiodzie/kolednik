/** Akordy: parsowanie, transpozycja, dźwięki do podkładu i chwyty gitarowe. */

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const ROOTS: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  H: 11,
};

/** Interwały (w półtonach od prymy) dla obsługiwanych rodzajów akordów. */
const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  dim: [0, 3, 6],
  '6': [0, 4, 7, 9],
};

export type ParsedChord = { root: number; quality: string };

export function parseChord(chord: string): ParsedChord | null {
  const m = /^([A-H])([#b]?)(.*)$/.exec(chord.trim());
  if (!m) return null;
  const root = ROOTS[m[1]! + m[2]!];
  if (root === undefined || !(m[3]! in QUALITIES)) return null;
  return { root, quality: m[3]! };
}

export function isValidChord(chord: string): boolean {
  return parseChord(chord) !== null;
}

/** Tonacje, w których zapis z bemolami jest naturalniejszy. */
function prefersFlats(keyRoot: number) {
  return [1, 3, 5, 8, 10].includes(keyRoot);
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function noteName(pc: number, flats = false): string {
  return (flats ? FLATS : SHARPS)[mod12(pc)]!;
}

/** Transponuje akord o `semis` półtonów; zapis (♯/♭) dobiera wg tonacji docelowej. */
export function transposeChord(chord: string, semis: number, songKey = 'C'): string {
  const p = parseChord(chord);
  if (!p) return chord;
  const key = parseChord(songKey)?.root ?? 0;
  return noteName(p.root + semis, prefersFlats(mod12(key + semis))) + p.quality;
}

export function transposeKey(key: string, semis: number): string {
  return transposeChord(key, semis, key);
}

export function splitChords(chords: string | undefined): string[] {
  return chords ? chords.trim().split(/\s+/).filter(Boolean) : [];
}

/**
 * Dźwięki akordu jako numery MIDI: bas (oktawa 2–3) i układ w oktawie 4.
 * `semis` przesuwa całość (zmiana tonacji podkładu).
 */
export function chordVoicing(chord: string, semis = 0): { bass: number; notes: number[] } | null {
  const p = parseChord(chord);
  if (!p) return null;
  const root = mod12(p.root + semis);
  const bass = 36 + root + (root > 7 ? -12 : 0) + 12; // C3..G3
  const base = 60 + root - (root > 6 ? 12 : 0); // wokół C4
  return { bass, notes: QUALITIES[p.quality]!.map((i) => base + i) };
}

export const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

/**
 * Chwyty gitarowe (struny E A D G H e; -1 = nie gramy, 0 = pusta).
 * Tylko popularne akordy — dla pozostałych pokazujemy samą nazwę.
 */
export const GUITAR_SHAPES: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0],
  'C#': [-1, 4, 6, 6, 6, 4],
  Db: [-1, 4, 6, 6, 6, 4],
  D: [-1, -1, 0, 2, 3, 2],
  Eb: [-1, -1, 1, 3, 4, 3],
  E: [0, 2, 2, 1, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  'F#': [2, 4, 4, 3, 2, 2],
  G: [3, 2, 0, 0, 0, 3],
  Ab: [4, 6, 6, 5, 4, 4],
  A: [-1, 0, 2, 2, 2, 0],
  Bb: [-1, 1, 3, 3, 3, 1],
  B: [-1, 2, 4, 4, 4, 2],
  Cm: [-1, 3, 5, 5, 4, 3],
  'C#m': [-1, 4, 6, 6, 5, 4],
  Dm: [-1, -1, 0, 2, 3, 1],
  Em: [0, 2, 2, 0, 0, 0],
  Fm: [1, 3, 3, 1, 1, 1],
  'F#m': [2, 4, 4, 2, 2, 2],
  Gm: [3, 5, 5, 3, 3, 3],
  'G#m': [4, 6, 6, 4, 4, 4],
  Am: [-1, 0, 2, 2, 1, 0],
  Bbm: [-1, 1, 3, 3, 2, 1],
  Bm: [-1, 2, 4, 4, 3, 2],
  C7: [-1, 3, 2, 3, 1, 0],
  D7: [-1, -1, 0, 2, 1, 2],
  E7: [0, 2, 0, 1, 0, 0],
  F7: [1, 3, 1, 2, 1, 1],
  G7: [3, 2, 0, 0, 0, 1],
  A7: [-1, 0, 2, 0, 2, 0],
  B7: [-1, 2, 1, 2, 0, 2],
  Am7: [-1, 0, 2, 0, 1, 0],
  Em7: [0, 2, 0, 0, 0, 0],
  Dm7: [-1, -1, 0, 2, 1, 1],
};

/** Polski zapis nazw (H zamiast B, B zamiast Bb), jak w śpiewnikach. */
export function polishChordName(chord: string): string {
  return chord
    .replace(/^Bb/, 'B♭')
    .replace(/^B(?!♭)/, 'H')
    .replace('#', '♯');
}
