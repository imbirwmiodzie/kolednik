import { describe, expect, it } from 'vitest';
import { syllableRange, syllabify } from '../../packages/shared/src/syllables.js';
import { songSchema, type Song } from '../../packages/shared/src/song.js';
import { alignUnit, timeline } from './align.js';
import { harmonize, type TimedNote } from './harmony.js';
import { importSong } from './import.js';
import { parseScore, syllableGroups } from './lilypond.js';

describe('sylaby', () => {
  it('dzieli polskie słowa i trzyma dwuznaki razem', () => {
    expect(syllabify('Lulajże, Jezuniu')).toEqual(['Lu', 'laj', 'że, ', 'Je', 'zu', 'niu']);
    expect(syllabify('Przybieżeli')).toEqual(['Przy', 'bie', 'że', 'li']);
    expect(syllabify('w ubóstwie')).toEqual(['w u', 'bóst', 'wie']);
  });

  it('„i” po r/l/t/d to osobna sylaba, po innych spółgłoskach zmiękcza', () => {
    expect(syllabify('Gloria')).toEqual(['Glo', 'ri', 'a']);
    expect(syllabify('kiedy')).toEqual(['kie', 'dy']);
    // „Ma-ry-ja” vs „Ma-ri-a”: zmiękczające „i” można wydzielić, gdy melodia ma więcej nut
    expect(syllableRange('Jezuniu')).toEqual([3, 4]);
    expect(syllabify('Jezuniu', 4)).toEqual(['Je', 'zu', 'ni', 'u']);
  });

  it('sklejone sylaby dają cały tekst', () => {
    const t = 'Anioł pasterzom mówił: Chrystus się wam narodził';
    expect(syllabify(t).join('')).toBe(t);
  });
});

describe('LilyPond', () => {
  it('czyta tonację, metrum, tempo, powtórzenia i łuki', () => {
    const s = parseScore(`{\\key g \\major \\time 3/4 \\tempo 4 = 96 \\partial 4
      d'4 \\repeat volta 2 { g'4. (a'8) b'4 } c''2 r4 }`);
    expect(s.key).toEqual({ tonic: 7, mode: 'major' });
    expect(s.meter).toEqual([3, 4]);
    expect(s.bpm).toBe(96);
    expect(s.partial).toBe(1);
    expect(s.sections.map((x) => x.repeat)).toEqual([1, 2, 1]);
    // łuk g–a to jedna sylaba
    const groups = syllableGroups(s.sections[1]!.events);
    expect(groups.map((g) => g.notes.map((n) => n.midi))).toEqual([[67, 69], [71]]);
    expect(groups[0]!.dur).toBe(2);
  });

  it('rozumie \\relative i nazwy holenderskie', () => {
    const s = parseScore(`\\relative c' { \\key f \\major f4 bes c a' }`);
    const midi = s.sections.flatMap((x) => x.events).map((e) => (e.kind === 'note' ? e.midi : 0));
    expect(midi).toEqual([65, 70, 72, 81]);
  });
});

const notesOf = (bars: number[][], beat = 1): TimedNote[] => {
  const out: TimedNote[] = [];
  let t = 0;
  for (const bar of bars)
    for (const m of bar) {
      out.push({ midi: m, start: t, dur: beat * (4 / bar.length) });
      t += beat * (4 / bar.length);
    }
  return out;
};

describe('harmonizacja', () => {
  it('dobiera T–S–D–T do prostej melodii w C-dur', () => {
    // C E G C | F A F A | G B D G | C(cała)
    const notes = notesOf([[60, 64, 67, 72], [65, 69, 65, 69], [67, 71, 74, 67], [72]]);
    const chords = harmonize(notes, {
      tonic: 0,
      mode: 'major',
      meter: [4, 4],
      partial: 0,
      total: 16,
      phraseEnds: [16],
      flats: false,
    });
    expect(chords.map((c) => c.chord)).toEqual(['C', 'F', 'G7', 'C']);
    expect(chords.map((c) => c.start)).toEqual([0, 4, 8, 12]);
  });

  it('dźwięk spoza skali daje dominantę wtrąconą (D7 → G w C-dur)', () => {
    const notes = notesOf([[60, 64, 67, 64], [62, 66, 62, 66], [67, 67, 67, 67], [71, 74, 67, 65], [64]]);
    const chords = harmonize(notes, {
      tonic: 0,
      mode: 'major',
      meter: [4, 4],
      partial: 0,
      total: 20,
      phraseEnds: [20],
      flats: false,
    });
    expect(chords.map((c) => c.chord)).toContain('D7');
    expect(chords.at(-1)!.chord).toBe('C');
  });
});

describe('dopasowanie tekstu do nut', () => {
  const score = parseScore(`{\\key c \\major \\time 4/4
    \\repeat volta 2 { c'4 d'4 e'4 c'4 } e'4 f'4 g'2 }`);
  const secs = timeline(score);

  it('powtórzenie melodii bierze kolejne wersy, akord trafia na pierwszą sylabę', () => {
    const out = alignUnit(
      [
        { text: 'Jezus mały,', from: 'verse' },
        { text: 'w żłobie leży', from: 'verse' },
        { text: 'kolęda', from: 'verse' },
      ],
      secs,
      [
        { start: 0, chord: 'C' },
        // oś czasu harmonii: każda sekcja raz (powtórzenie gra te same akordy)
        { start: 4, chord: 'G' },
        { start: 6, chord: 'C' },
      ],
    );
    expect(out.map((l) => l.syl.length)).toEqual([4, 4, 3]);
    expect(out[2]!.chords).toEqual([
      [0, 0, 'G'],
      [2, 2, 'C'],
    ]);
    expect(out[0]!.notes.map((n) => n[0])).toEqual([60, 62, 64, 60]);
  });

  it('za dużo sylab w wersie: dzieli najdłuższą nutę (półnuta → dwie ćwierćnuty)', () => {
    const out = alignUnit(
      [
        { text: 'Jezus mały,', from: 'verse' },
        { text: 'Jezus mały,', from: 'verse' },
        { text: 'gwiazdeczko', from: 'verse' },
      ],
      secs,
      [{ start: 0, chord: 'C' }],
    );
    expect(out[2]!.syl).toEqual(['gwiaz', 'decz', 'ko']);
    const four = alignUnit(
      [
        { text: 'Jezus mały,', from: 'verse' },
        { text: 'Jezus mały,', from: 'verse' },
        { text: 'Gloria, Panie', from: 'verse' },
      ],
      secs,
      [{ start: 0, chord: 'C' }],
    );
    expect(four[2]!.syl.length).toBe(5);
    expect(four[2]!.notes.reduce((a, n) => a + n[1], 0)).toBe(4);
  });
});

describe('import kolędy', () => {
  it('daje poprawny plik kolędy z nutami i akordami w wygodnej tonacji', () => {
    const song: Song = songSchema.parse({
      slug: 'test',
      title: 'Test',
      art: { motif: 'star', hue: 10 },
      bpm: 80,
      key: 'Eb',
      stanzas: [{ type: 'verse', lines: [{ text: 'Śpiewaj Panu' }, { text: 'wszystka ziemia' }] }],
      choruses: {},
    });
    const wiki = `<score>{\\key es \\major \\time 4/4 \\tempo 4 = 72
      es'4 g'4 bes'4 g'4 as'4 f'4 d'4 es'4}</score>`;
    const out = importSong(song, wiki, { title: 'Test' });
    expect(out.bpm).toBe(72);
    expect(out.music?.meter).toEqual([4, 4]);
    // E♭ → tonacja z otwartymi chwytami
    expect(['C', 'D', 'E', 'G', 'A']).toContain(out.key);
    const lines = out.stanzas[0]!.type === 'verse' ? out.stanzas[0]!.lines : [];
    expect(lines.map((l) => l.music!.syl.length)).toEqual([4, 4]);
    expect(lines[0]!.music!.chords[0]).toEqual([0, 0, out.key]);
  });
});
