import { describe, expect, it } from 'vitest';
import {
  countSyllables,
  flattenSong,
  lineDurationMs,
  normalizeGroupName,
  resolveVote,
  scorePerformance,
  songSchema,
  type Frame,
} from './index.js';

describe('countSyllables', () => {
  it.each([
    ['Bóg', 1],
    ['się', 1],
    ['pasterze', 3],
    ['aniołowie', 4],
    ['Wśród nocnej ciszy głos się rozchodzi:', 10],
    ['Lulajże, Jezuniu, moja perełko,', 11],
  ])('%s → %i', (text, n) => expect(countSyllables(text)).toBe(n));
});

describe('flattenSong', () => {
  const song = songSchema.parse({
    slug: 'test',
    title: 'Test',
    art: { motif: 'star', hue: 10 },
    bpm: 120,
    stanzas: [
      { type: 'verse', lines: [{ text: 'raz dwa' }, { text: 'trzy', beats: 4 }] },
      { type: 'chorus', ref: 'r' },
      { type: 'verse', lines: [{ text: 'cztery' }] },
      { type: 'chorus', ref: 'r' },
    ],
    choruses: { r: { lines: [{ text: 'refren' }] } },
  });

  it('rozwija refreny po każdej zwrotce', () => {
    const lines = flattenSong(song);
    expect(lines.map((l) => [l.text, l.part, l.verse, l.block])).toEqual([
      ['raz dwa', 'verse', 0, 0],
      ['trzy', 'verse', 0, 0],
      ['refren', 'chorus', 0, 1],
      ['cztery', 'verse', 1, 2],
      ['refren', 'chorus', 1, 3],
    ]);
  });

  it('liczy czas z sylab albo z beats', () => {
    const [a, b] = flattenSong(song);
    expect(lineDurationMs(a!, 120)).toBe(1750); // 2 sylaby + 1.5 przerwy
    expect(lineDurationMs(b!, 120)).toBe(2000);
    expect(lineDurationMs(b!, 120, 2)).toBe(1000);
  });

  it('odrzuca brakujący refren', () => {
    expect(() =>
      songSchema.parse({ ...song, choruses: {}, stanzas: [{ type: 'chorus', ref: 'x' }] }),
    ).toThrow();
  });
});

describe('resolveVote', () => {
  const pool = ['a', 'b', 'c'];
  it('wygrywa najwięcej głosów', () => {
    expect(resolveVote(['a', 'b', 'b'], pool)).toEqual({ slug: 'b', candidates: ['b'], viaTiebreak: false });
  });
  it('remis rozstrzyga losowanie spośród remisujących', () => {
    const r = resolveVote(['a', 'c'], pool, () => 0.99);
    expect(r).toEqual({ slug: 'c', candidates: ['a', 'c'], viaTiebreak: true });
  });
  it('brak głosów → losowanie z całej puli', () => {
    expect(resolveVote([], pool, () => 0).candidates).toEqual(pool);
  });
  it('ignoruje głosy spoza puli (już zaśpiewane)', () => {
    expect(resolveVote(['x', 'x', 'a'], pool).slug).toBe('a');
  });
});

describe('scorePerformance', () => {
  const frames = (perLine: number, lines: number, db: (line: number, i: number) => number): Frame[] =>
    Array.from({ length: lines * perLine }, (_, k) => ({
      line: Math.floor(k / perLine),
      db: db(Math.floor(k / perLine), k % perLine),
    }));

  it('cisza daje 0', () => {
    const m = scorePerformance(frames(20, 5, () => -60), -60);
    expect(m.score).toBe(0);
    expect(m.stars).toBe(0);
  });

  it('głośniejszy śpiew daje wyższy wynik', () => {
    const quiet = scorePerformance(frames(20, 5, () => -48), -60);
    const loud = scorePerformance(frames(20, 5, () => -32), -60);
    expect(loud.score).toBeGreaterThan(quiet.score);
    expect(loud.coverage).toBe(1);
  });

  it('nie zależy od poziomu tła', () => {
    const a = scorePerformance(frames(20, 5, () => -40), -60);
    const b = scorePerformance(frames(20, 5, () => -20), -40);
    expect(a.score).toBe(b.score);
  });

  it('pominięte wersy obniżają pokrycie', () => {
    const m = scorePerformance(
      frames(20, 4, (line) => (line % 2 ? -60 : -35)),
      -60,
    );
    expect(m.coverage).toBe(0.5);
  });
});

describe('normalizeGroupName', () => {
  it('ignoruje wielkość liter i spacje', () => {
    expect(normalizeGroupName('  Rodzina   KOWALSKICH ')).toBe(normalizeGroupName('rodzina kowalskich'));
    expect(normalizeGroupName('ŻÓŁW')).toBe('żółw');
  });
});
