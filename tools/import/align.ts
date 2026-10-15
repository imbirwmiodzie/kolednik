/**
 * Łączy melodię z partytury z tekstem kolędy: dzieli tekst na sylaby, przypisuje je do nut
 * (z uwzględnieniem powtórzeń — gdy zwrotka ma mniej wersów niż przebiegów melodii, wersy się powtarzają)
 * i ustawia akordy nad sylabami, na które przypadają.
 */
import { syllableRange, syllabify } from '../../packages/shared/src/syllables.js';
import type { ChordAt } from './harmony.js';
import { syllableGroups, type NoteGroup, type Score } from './lilypond.js';

export type TimedGroup = NoteGroup & { start: number };
export type SectionTimeline = { repeat: number; start: number; end: number; groups: TimedGroup[] };

/** Sekcje ułożone po kolei (każda raz) na jednej osi czasu — do harmonizacji. */
export function timeline(score: Score): SectionTimeline[] {
  let t = 0;
  return score.sections.map((sec) => {
    const start = t;
    const groups: TimedGroup[] = [];
    // pauza na początku sekcji przesuwa start pierwszej nuty
    let lead = 0;
    for (const e of sec.events) {
      if (e.kind === 'rest') lead += e.dur;
      else break;
    }
    t += lead;
    for (const g of syllableGroups(sec.events)) {
      groups.push({ ...g, start: t });
      t += g.dur + g.restAfter;
    }
    return { repeat: sec.repeat, start, end: t, groups };
  });
}

export type InLine = { text: string; from: 'verse' | 'chorus' };
export type OutLine = InLine & {
  syl: string[];
  notes: [number, number, number][];
  chords: [number, number, string][];
};

export class AlignError extends Error {}

/** Rozkłada `total` sylab na wersy w ich zakresach [min, max], od lewej. */
function distribute(ranges: [number, number][], total: number): number[] | null {
  const counts = ranges.map((r) => r[0]);
  let left = total - counts.reduce((a, b) => a + b, 0);
  if (left < 0) return null;
  for (let i = 0; i < counts.length && left > 0; i++) {
    const add = Math.min(left, ranges[i]![1] - counts[i]!);
    counts[i]! += add;
    left -= add;
  }
  return left === 0 ? counts : null;
}

/**
 * Jedna „jednostka” = zwrotka razem z refrenem po niej. Zwraca wersy w kolejności śpiewania,
 * każdy z sylabami, nutami i akordami.
 */
export function alignUnit(lines: InLine[], sections: SectionTimeline[], chords: ChordAt[]): OutLine[] {
  const out: OutLine[] = [];
  let ptr = 0;
  const lastBySection = new Map<number, InLine[]>();
  const lastCounts = new Map<number, number[]>();
  const sizesBySection = new Map<number, number[]>();
  sections.forEach((sec, si) => {
    for (let pass = 0; pass < sec.repeat; pass++) {
      const G = sec.groups.length;
      let chosen: InLine[] | null = null;
      let counts: number[] | null = null;
      // Wersy, które mieszczą dokładnie G sylab. Koszt: rozdzielenie „i+samogłoska” (1,5)
      // albo dodatkowa nuta na tej samej sylabie — melizmat nieoznaczony łukiem (1, najwyżej 2 na przebieg).
      let bestCost = Infinity;
      for (let k = 1; ptr + k <= lines.length; k++) {
        const slice = lines.slice(ptr, ptr + k);
        const ranges = slice.map((l) => syllableRange(l.text));
        const min = ranges.reduce((a, r) => a + r[0], 0);
        const max = ranges.reduce((a, r) => a + r[1], 0);
        if (min > G + maxAdjust(G)) break;
        let c: number[] | null = null;
        let cost = Infinity;
        if (min > G) {
          // więcej sylab niż nut: dzielimy dłuższe nuty (np. „Kró-la nad kró-la-mi”)
          c = ranges.map((r) => r[0]);
          cost = (min - G) * 1.2;
        } else {
          // brakujące sylaby: najpierw melizmaty (do 2), resztę przez rozdzielenie „i+samogłoska”
          const need = G - min;
          const mel = Math.min(need, maxAdjust(G));
          const flex = distribute(ranges, min + (need - mel));
          if (flex) {
            c = flex;
            cost = mel + (need - mel) * 1.5;
          }
        }
        if (c && cost < bestCost) {
          chosen = slice;
          counts = c;
          bestCost = cost;
          if (cost === 0) break;
        }
        if (max >= G && min === G) break;
      }
      if (chosen && counts) {
        ptr += chosen.length;
      } else if (pass > 0 && lastBySection.has(si)) {
        // tekst się powtarza (np. „Czym prędzej się wybierajcie…” śpiewane dwa razy)
        chosen = lastBySection.get(si)!;
        counts = lastCounts.get(si)!;
      }
      if (!chosen || !counts) {
        const near = lines
          .slice(ptr, ptr + 3)
          .map((l) => `„${l.text}” (${syllableRange(l.text).join('–')})`)
          .join(', ');
        throw new AlignError(
          `Sekcja ${si + 1}, przebieg ${pass + 1}: ${G} nut-sylab, a kolejne wersy: ${near}`,
        );
      }
      lastBySection.set(si, chosen);
      lastCounts.set(si, counts);
      // Ile nut przypada na każdy wers: wzór z poprzedniego przebiegu tej melodii albo proporcjonalnie.
      const template = sizesBySection.get(si);
      const total = counts.reduce((a, b) => a + b, 0);
      let sizes: number[];
      if (template && template.length === counts.length) sizes = template;
      else if (total === G) sizes = counts;
      else sizes = phraseSizes(sec.groups, counts);
      if (total === G || !template) sizesBySection.set(si, sizes);
      let g = 0;
      chosen.forEach((line, li) => {
        const groups = sec.groups.slice(g, g + sizes[li]!);
        g += sizes[li]!;
        out.push(buildLine(line, counts![li]!, fitGroups(groups, counts![li]!), chords));
      });
    }
  });
  if (ptr < lines.length) {
    throw new AlignError(
      `Zostały wersy bez melodii: ${lines
        .slice(ptr)
        .map((l) => `„${l.text}”`)
        .join(', ')}`,
    );
  }
  return out;
}

function buildLine(line: InLine, n: number, groups: TimedGroup[], chords: ChordAt[]): OutLine {
  let syl = syllabify(line.text, n);
  if (syl.length !== n) {
    // awaryjnie: równy podział tekstu na n części po słowach — lepsze niż przesunięte akordy
    syl = evenSplit(line.text, n);
  }
  const notes: [number, number, number][] = [];
  groups.forEach((g, i) => {
    for (const nt of g.notes) notes.push([nt.midi, nt.dur, i]);
    if (g.restAfter > 0) notes.push([0, g.restAfter, i]);
  });
  const lineStart = groups[0]!.start;
  const lineEnd = groups.at(-1)!.start + groups.at(-1)!.dur + groups.at(-1)!.restAfter;
  const out: [number, number, string][] = [];
  const active = [...chords].reverse().find((c) => c.start <= lineStart + 1e-6);
  for (const c of chords) {
    if (c.start < lineStart - 1e-6 || c.start >= lineEnd - 1e-6) continue;
    // sylaba śpiewana w chwili zmiany akordu (w pauzie — następna sylaba)
    let idx = groups.findIndex((g) => c.start >= g.start - 1e-6 && c.start < g.start + g.dur - 1e-6);
    if (idx === -1) idx = groups.findIndex((g) => g.start >= c.start - 1e-6);
    if (idx === -1) idx = groups.length - 1;
    out.push([idx, round(c.start - lineStart), c.chord]);
  }
  if (active && (!out.length || out[0]![1] > 0)) out.unshift([0, 0, active.chord]);
  return { ...line, syl, notes, chords: out };
}

/**
 * Dopasowuje liczbę grup nut do liczby sylab: za dużo nut → najkrótsza dołącza do poprzedniej sylaby
 * (melizmat), za mało → najdłuższa nuta dzielona na dwie.
 */
function fitGroups(groups: TimedGroup[], n: number): TimedGroup[] {
  const gs = groups.map((g) => ({ ...g, notes: [...g.notes] }));
  while (gs.length < n) {
    let best = 0;
    for (let i = 1; i < gs.length; i++) if (gs[i]!.notes.length === 1 && gs[i]!.dur > gs[best]!.dur) best = i;
    const g = gs[best]!;
    const note = g.notes[0]!;
    const half = g.dur / 2;
    const a: TimedGroup = { ...g, notes: [{ ...note, dur: half }], dur: half, restAfter: 0 };
    const b: TimedGroup = { ...g, notes: [{ ...note, dur: half }], dur: half, start: g.start + half };
    gs.splice(best, 1, a, b);
  }
  while (gs.length > n && gs.length > 1) {
    // Melizmat: najchętniej krok sekundy, pod koniec wersu, druga nuta nie dłuższa od pierwszej.
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 1; i < gs.length; i++) {
      const prev = gs[i - 1]!;
      const cur = gs[i]!;
      if (prev.restAfter > 0) continue;
      const step = Math.abs(cur.notes[0]!.midi - prev.notes.at(-1)!.midi);
      const score =
        (i / gs.length) * 1.5 +
        (step === 0 ? -0.5 : step <= 2 ? 1.2 : step <= 4 ? 0.6 : -1) +
        (cur.dur <= prev.dur ? 0.4 : 0) +
        (i === gs.length - 1 ? -0.8 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === -1) break;
    const prev = gs[best - 1]!;
    const cur = gs[best]!;
    prev.notes.push(...cur.notes);
    prev.dur += cur.dur;
    prev.restAfter = cur.restAfter;
    gs.splice(best, 1);
  }
  return gs;
}

function evenSplit(text: string, n: number): string[] {
  const words = text.split(/(?<= )/);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push('');
  words.forEach((w, i) => {
    const k = Math.min(n - 1, Math.floor((i * n) / words.length));
    parts[k] += w;
  });
  return parts.map((p) => p || '·');
}

const round = (x: number) => Math.round(x * 1000) / 1000;
/** Ile nut może się różnić od liczby sylab w jednym przebiegu (melizmaty / dzielone nuty). */
const maxAdjust = (groups: number) => Math.max(2, Math.ceil(groups * 0.15));

/**
 * Podział grup nut na wersy, gdy liczba nut ≠ liczba sylab: granice wersów najchętniej po pauzach
 * i długich nutach (końce fraz), a długości wersów jak najbliżej liczby ich sylab.
 */
function phraseSizes(groups: TimedGroup[], counts: number[]): number[] {
  const G = groups.length;
  const k = counts.length;
  const durs = groups.map((g) => g.dur);
  const median = [...durs].sort((a, b) => a - b)[Math.floor(G / 2)] ?? 1;
  // koszt zakończenia wersu po grupie i (0 = koniec frazy)
  const endCost = groups.map((g) => (g.restAfter > 0 ? 0 : g.dur >= 1.5 * median && g.dur >= 1 ? 0.3 : 4));
  const INF = 1e9;
  // dp[j][i]: najlepszy koszt podziału pierwszych i grup na j wersów
  const dp = Array.from({ length: k + 1 }, () => new Array<number>(G + 1).fill(INF));
  const from = Array.from({ length: k + 1 }, () => new Array<number>(G + 1).fill(0));
  dp[0]![0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let i = j; i <= G; i++) {
      for (let p = j - 1; p < i; p++) {
        if (dp[j - 1]![p]! >= INF) continue;
        const len = i - p;
        const v = dp[j - 1]![p]! + Math.abs(len - counts[j - 1]!) * 1 + (i === G ? 0 : endCost[i - 1]!);
        if (v < dp[j]![i]!) {
          dp[j]![i] = v;
          from[j]![i] = p;
        }
      }
    }
  }
  const sizes: number[] = [];
  let i = G;
  for (let j = k; j > 0; j--) {
    const p = from[j]![i]!;
    sizes.unshift(i - p);
    i = p;
  }
  return sizes;
}
