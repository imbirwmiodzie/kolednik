import { z } from 'zod';
import { isValidChord, splitChords } from './chords.js';

export const MOTIFS = ['star', 'stable', 'angel', 'candle', 'tree', 'moon', 'crown', 'bells'] as const;
export type Motif = (typeof MOTIFS)[number];

/**
 * Nuty wersu (z partytury): sylaby, nuty i akordy we właściwych miejscach.
 * - `syl`: sylaby, które sklejone dają tekst wersu,
 * - `notes`: [wysokość MIDI (0 = pauza), długość w ćwierćnutach, indeks sylaby],
 * - `chords`: [indeks sylaby, moment od początku wersu w ćwierćnutach, akord].
 */
const lineMusicSchema = z.object({
  syl: z.array(z.string()).min(1),
  notes: z
    .array(z.tuple([z.number().int().min(0).max(127), z.number().positive(), z.number().int().min(0)]))
    .min(1),
  chords: z.array(z.tuple([z.number().int().min(0), z.number().min(0), z.string().refine(isValidChord)])),
});
export type LineMusic = z.infer<typeof lineMusicSchema>;

const lineSchema = z.object({
  text: z.string().min(1),
  music: lineMusicSchema.optional(),
  /** Czas wersu w uderzeniach; gdy brak — liczony z liczby sylab. */
  beats: z.number().positive().optional(),
  /** Akordy wersu oddzielone spacjami, rozłożone równo na czas wersu, np. "C G7 C". */
  chords: z
    .string()
    .optional()
    .refine((c) => splitChords(c).every(isValidChord), { message: 'Nieznany akord' }),
});

const stanzaSchema = z.union([
  z.object({ type: z.literal('verse'), lines: z.array(lineSchema).min(1) }),
  z.object({ type: z.literal('chorus'), ref: z.string() }),
]);

export const songSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    art: z.object({ motif: z.enum(MOTIFS), hue: z.number().min(0).max(360) }),
    image: z.string().optional(),
    /** Tempo: uderzenia na minutę (przy nutach — ćwierćnuty na minutę). */
    bpm: z.number().min(30).max(300),
    key: z.string().optional(),
    /** Skąd pochodzą melodia i tekst (gdy kolęda ma nuty). */
    music: z.object({ meter: z.tuple([z.number(), z.number()]), source: z.string() }).optional(),
    stanzas: z.array(stanzaSchema).min(1),
    choruses: z.record(z.string(), z.object({ lines: z.array(lineSchema).min(1) })).default({}),
  })
  .superRefine((song, ctx) => {
    for (const s of song.stanzas) {
      if (s.type === 'chorus' && !song.choruses[s.ref]) {
        ctx.addIssue({ code: 'custom', message: `Brak refrenu "${s.ref}"` });
      }
    }
  });

export type Song = z.infer<typeof songSchema>;

export type SongMeta = Pick<Song, 'slug' | 'title' | 'art' | 'image'> & {
  stanzaCount: number;
  lineCount: number;
  hasChords: boolean;
  hasMusic: boolean;
};

export type FlatLine = {
  index: number;
  /** Numer bloku (zwrotki lub refrenu) w kolejności śpiewania. */
  block: number;
  /** Numer zwrotki (0..), refren dostaje numer zwrotki, po której występuje. */
  verse: number;
  part: 'verse' | 'chorus';
  text: string;
  beats: number;
  chords: string[];
  music?: LineMusic;
};

const VOWELS = 'aąeęioóuy';

/** Przybliżona liczba sylab w polskim tekście: samogłoski, przy czym „i” przed samogłoską nie tworzy sylaby. */
export function countSyllables(text: string): number {
  const t = text.toLocaleLowerCase('pl');
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (!VOWELS.includes(c)) continue;
    const next = t[i + 1];
    if (c === 'i' && next !== undefined && VOWELS.includes(next)) continue;
    n++;
  }
  return Math.max(1, n);
}

/** Przerwa na oddech po każdym wersie (w uderzeniach). */
export const LINE_GAP_BEATS = 1.5;

export function flattenSong(song: Song): FlatLine[] {
  const out: FlatLine[] = [];
  let verse = -1;
  song.stanzas.forEach((stanza, block) => {
    const isChorus = stanza.type === 'chorus';
    if (!isChorus) verse++;
    const lines = isChorus ? song.choruses[stanza.ref]!.lines : stanza.lines;
    for (const line of lines) {
      out.push({
        index: out.length,
        block,
        verse: Math.max(0, verse),
        part: isChorus ? 'chorus' : 'verse',
        text: line.text,
        beats: line.music
          ? line.music.notes.reduce((sum, n) => sum + n[1], 0)
          : (line.beats ?? countSyllables(line.text) + LINE_GAP_BEATS),
        chords: line.music ? line.music.chords.map((c) => c[2]) : splitChords(line.chords),
        music: line.music,
      });
    }
  });
  return out;
}

export function lineDurationMs(line: FlatLine, bpm: number, tempo = 1): number {
  return Math.round((line.beats * 60_000) / (bpm * tempo));
}

export function verseCount(song: Song): number {
  return song.stanzas.filter((s) => s.type === 'verse').length;
}

export function songMeta(song: Song): SongMeta {
  return {
    slug: song.slug,
    title: song.title,
    art: song.art,
    image: song.image,
    stanzaCount: verseCount(song),
    lineCount: flattenSong(song).length,
    hasChords: flattenSong(song).some((l) => l.chords.length > 0),
    hasMusic: Boolean(song.music),
  };
}
