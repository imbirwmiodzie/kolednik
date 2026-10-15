/**
 * Import melodii z partytur Wikipedii do plików kolęd.
 *
 *   pnpm import:music <katalog-z-plikami-.wiki>
 *
 * Dla każdej kolędy z mapy SOURCES: bierze <score> z artykułu, łączy z tekstem z content/songs/<slug>.json,
 * dobiera akordy do melodii, przenosi do wygodnej tonacji na gitarę i zapisuje nuty w pliku kolędy.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { noteName, transposeChord } from '../../packages/shared/src/chords.js';
import { songSchema, type Song } from '../../packages/shared/src/song.js';
import { alignUnit, timeline, type InLine, type OutLine } from './align.js';
import { harmonize, type TimedNote } from './harmony.js';
import { parseScore, type Score } from './lilypond.js';

export type Source = {
  title: string;
  lang?: 'pl' | 'en';
  /** która partytura w artykule */
  score?: number;
  /** tempo (ćwierćnuty na minutę), gdy w partyturze jest za wolne do wspólnego śpiewu */
  bpm?: number;
};

/** slug → artykuł z partyturą (nazwa pliku .wiki). */
export const SOURCES: Record<string, string | Source> = {
  'cicha-noc': { title: 'Silent Night', lang: 'en', score: 2, bpm: 84 },
  'wsrod-nocnej-ciszy': 'Wśród nocnej ciszy',
  'bog-sie-rodzi': 'Pieśń o Narodzeniu Pańskim',
  'lulajze-jezuniu': 'Lulajże, Jezuniu',
  'dzisiaj-w-betlejem': 'Dzisiaj w Betlejem',
  'gdy-sie-chrystus-rodzi': 'Gdy się Chrystus rodzi',
  'jezus-malusienki': 'Jezus malusieńki',
  'przybiezeli-do-betlejem': 'Przybieżeli do Betlejem',
  'w-zlobie-lezy': 'W żłobie leży',
  'gdy-sliczna-panna': 'Gdy śliczna Panna',
  'aniol-pasterzom-mowil': 'Anioł pasterzom mówił',
};

const TEMPO_WORDS: Record<string, number> = {
  wolno: 66,
  zwolna: 72,
  umiarkowanie: 92,
  'z siłą': 96,
  żywo: 120,
  wesoło: 112,
};

export function extractScore(wikitext: string, index = 0): string | null {
  const all = [...wikitext.matchAll(/<score[^>]*>([\s\S]*?)<\/score>/g)];
  return all[index]?.[1] ?? null;
}

/** Trudność chwytu na gitarze (0 = otwarty, łatwy). */
const EASY = new Set(['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'E7', 'A7', 'D7', 'G7', 'B7', 'C7']);
const MEDIUM = new Set(['F', 'Bm', 'F#m', 'Bb', 'Cm', 'Gm', 'F7', 'Am7', 'Em7', 'Dm7']);
const chordCost = (c: string) => (EASY.has(c) ? 0 : MEDIUM.has(c) ? 1 : 2.5);

/** Przesunięcie (półtony) do tonacji wygodnej na gitarę, przy zachowaniu śpiewnej skali melodii. */
export function friendlyShift(score: Score, chords: string[], notes: number[], keyName: string): number {
  let best = 0;
  let bestCost = Infinity;
  const lo = Math.min(...notes);
  const hi = Math.max(...notes);
  for (let s = -5; s <= 6; s++) {
    let cost = chords.reduce((sum, c) => sum + chordCost(transposeChord(c, s, keyName)), 0) / chords.length;
    // grupowy śpiew: mniej więcej B3–E5
    cost += Math.max(0, hi + s - 76) * 0.6 + Math.max(0, 59 - (lo + s)) * 0.6;
    cost += Math.abs(s) * 0.05;
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  void score;
  return best;
}

/** Zwrotki razem z refrenem po nich — jednostki, na które przypada cała melodia. */
function units(song: Song): InLine[][] {
  const out: InLine[][] = [];
  for (const st of song.stanzas) {
    if (st.type === 'verse') out.push(st.lines.map((l) => ({ text: l.text, from: 'verse' as const })));
    else {
      const ch = song.choruses[st.ref]!.lines.map((l) => ({ text: l.text, from: 'chorus' as const }));
      if (out.length) out.at(-1)!.push(...ch);
      else out.push(ch);
    }
  }
  return out;
}

export function importSong(song: Song, wikitext: string, source: Source): Song {
  const src = extractScore(wikitext, source.score ?? 0);
  if (!src) throw new Error(`${song.slug}: brak <score> w artykule`);
  const score = parseScore(src);
  const secs = timeline(score);
  const total = secs.at(-1)!.end;
  const notes: TimedNote[] = secs.flatMap((s) =>
    s.groups.flatMap((g) => {
      let t = g.start;
      return g.notes.map((n) => {
        const r = { midi: n.midi, start: t, dur: n.dur };
        t += n.dur;
        return r;
      });
    }),
  );
  const flats =
    [1, 3, 5, 8, 10].includes(score.key.tonic) ||
    (score.key.mode === 'minor' && [0, 2, 5, 7].includes(score.key.tonic));
  const phraseEnds = secs.flatMap((s) => s.groups.filter((g) => g.restAfter > 0).map((g) => g.start + g.dur));
  phraseEnds.push(...secs.map((s) => s.end));
  const chords = harmonize(notes, {
    tonic: score.key.tonic,
    mode: score.key.mode,
    meter: score.meter,
    partial: score.partial,
    total,
    phraseEnds,
    flats,
  });

  const keyName = noteName(score.key.tonic, flats) + (score.key.mode === 'minor' ? 'm' : '');
  const shift = friendlyShift(
    score,
    chords.map((c) => c.chord),
    notes.map((n) => n.midi),
    keyName,
  );
  const tr = (c: string) => transposeChord(c, shift, keyName);

  const aligned: OutLine[][] = units(song).map((u) => alignUnit(u, secs, chords));
  const toLine = (l: OutLine) => ({
    text: l.text,
    music: {
      syl: l.syl,
      notes: l.notes.map(([m, d, s]) => [m === 0 ? 0 : m + shift, d, s] as [number, number, number]),
      chords: l.chords.map(([s, at, c]) => [s, at, tr(c)] as [number, number, string]),
    },
  });

  // Nowe zwrotki w kolejności śpiewania: kolejne wersy zwrotki → blok zwrotki, wersy refrenu → odwołanie do refrenu.
  const stanzas: Song['stanzas'] = [];
  const choruses: Song['choruses'] = {};
  for (const unit of aligned) {
    let i = 0;
    while (i < unit.length) {
      const from = unit[i]!.from;
      const run: OutLine[] = [];
      while (i < unit.length && unit[i]!.from === from) run.push(unit[i++]!);
      if (from === 'verse') stanzas.push({ type: 'verse', lines: run.map(toLine) });
      else {
        // refren może być śpiewany dwa razy z rzędu (powtórzenie w nutach)
        const ref = 'refren';
        const len = Object.values(song.choruses)[0]?.lines.length ?? run.length;
        choruses[ref] ??= { lines: run.slice(0, len).map(toLine) };
        for (let k = 0; k < run.length; k += len) stanzas.push({ type: 'chorus', ref });
      }
    }
  }

  const tempo = source.bpm ?? score.bpm ?? TEMPO_WORDS[score.tempoText?.toLocaleLowerCase('pl') ?? ''] ?? 84;
  const next: Song = {
    ...song,
    bpm: tempo,
    key:
      noteName(score.key.tonic + shift, keyPrefersFlats(score.key.tonic + shift, score.key.mode)) +
      (score.key.mode === 'minor' ? 'm' : ''),
    music: {
      meter: score.meter,
      source: `https://${source.lang ?? 'pl'}.wikipedia.org/wiki/${encodeURIComponent(source.title.replace(/ /g, '_'))}`,
    },
    stanzas,
    choruses,
  };
  return songSchema.parse(next);
}

function keyPrefersFlats(tonic: number, mode: 'major' | 'minor') {
  const t = ((tonic % 12) + 12) % 12;
  return mode === 'major' ? [1, 3, 5, 8, 10].includes(t) : [0, 2, 5, 7].includes(t);
}

// CLI
if (process.argv[1]?.endsWith('import.ts')) {
  const wikiDir = process.argv[2];
  if (!wikiDir) {
    console.error('Użycie: pnpm import:music <katalog z plikami .wiki>');
    process.exit(1);
  }
  const songsDir = path.resolve('content/songs');
  let failed = 0;
  for (const [slug, entry] of Object.entries(SOURCES)) {
    const source: Source = typeof entry === 'string' ? { title: entry } : entry;
    const file = path.join(songsDir, `${slug}.json`);
    try {
      const song = songSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      const dir = source.lang && source.lang !== 'pl' ? `${wikiDir}-${source.lang}` : wikiDir;
      const wiki = readFileSync(path.join(dir, `${source.title}.wiki`), 'utf8');
      const out = importSong(song, wiki, source);
      writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
      const lines = out.stanzas.length;
      console.log(`✓ ${slug}: tonacja ${out.key}, ${out.bpm} BPM, ${lines} bloków`);
    } catch (e) {
      failed++;
      console.log(`✗ ${slug}: ${(e as Error).message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
