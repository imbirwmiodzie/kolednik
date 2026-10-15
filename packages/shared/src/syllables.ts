/**
 * Podział polskiego tekstu na sylaby do śpiewu. „i” przed samogłoską zwykle tylko zmiękcza
 * („się”, „niu”), ale w śpiewie bywa osobną sylabą („Glo-ri-a”, „Ma-ry-ja”) — stąd elastyczny podział.
 */

const VOWELS = 'aąeęioóuyAĄEĘIOÓUY';
const isVowel = (c: string | undefined) => c !== undefined && VOWELS.includes(c);

type Nucleus = {
  start: number;
  end: number;
  /** „i” przed samogłoską: można je rozdzielić (zmiękczające) albo złączyć (obce, np. „Glo-ri-a”) */
  splittable: boolean;
  /** domyślnie osobna sylaba (obce „i”: po r, l, t, d, h — „Ma-ri-a”, „Glo-ri-a”) */
  foreign?: boolean;
};

/** Po tych spółgłoskach „i+samogłoska” jest w polszczyźnie obce i śpiewa się je osobno. */
const FOREIGN_I = new Set(['r', 'l', 't', 'd', 'h', 'x']);

function nuclei(text: string): Nucleus[] {
  const out: Nucleus[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (!isVowel(c)) continue;
    const lower = c.toLocaleLowerCase('pl');
    const next = text[i + 1];
    if (lower === 'i' && isVowel(next) && /\p{L}/u.test(text[i - 1] ?? '')) {
      const prev = text[i - 1]!.toLocaleLowerCase('pl');
      const dz = text.slice(i - 2, i).toLocaleLowerCase('pl') === 'dz';
      if (FOREIGN_I.has(prev) && !dz) {
        // obce „i” (Glo-ri-a): domyślnie dwie sylaby, ale w śpiewie bywa złączone
        out.push({ start: i, end: i + 1, splittable: false, foreign: true });
        continue;
      }
      // „i” zmiękczające: należy do następnej samogłoski (ale można je wydzielić)
      out.push({ start: i, end: i + 2, splittable: true });
      i++;
      continue;
    }
    out.push({ start: i, end: i + 1, splittable: false });
  }
  return out;
}

/** Ile sylab może mieć tekst: [najmniej, najwięcej]. */
export function syllableRange(text: string): [number, number] {
  const n = nuclei(text);
  const flex = n.filter((x) => x.splittable).length;
  return [Math.max(1, n.length), Math.max(1, n.length + flex)];
}

const DIGRAPHS = ['ch', 'cz', 'dz', 'dź', 'dż', 'rz', 'sz'];

/** Gdzie dzielić zbitkę spółgłosek między samogłoskami: przed ostatnią spółgłoską (dwuznak = jedna). */
function boundaryIn(text: string, from: number, to: number): number {
  const gap = text.slice(from, to);
  const space = gap.indexOf(' ');
  if (space >= 0) {
    // granica słowa: sylaba zaczyna się od pierwszej litery po spacji
    let k = from + space + 1;
    while (k < to && !/\p{L}/u.test(text[k]!)) k++;
    return k;
  }
  let k = to;
  // „i” zmiękczające należy do nagłosu następnej sylaby
  if (text[k - 1]?.toLocaleLowerCase('pl') === 'i' && k - 1 > from) k--;
  const two = text.slice(k - 2, k).toLocaleLowerCase('pl');
  if (k - 2 >= from && DIGRAPHS.includes(two)) return k - 2;
  if (k - 1 >= from && /\p{L}/u.test(text[k - 1]!)) return k - 1;
  return to;
}

/**
 * Dzieli tekst na dokładnie `count` sylab (jeśli się da), np. „Lulajże, Jezuniu” → ["Lu","laj","że, ","Je","zu","niu"].
 * Sklejone fragmenty dają cały tekst. Gdy `count` jest poza zakresem — zwraca podział domyślny.
 */
export function syllabify(text: string, count?: number): string[] {
  let n = nuclei(text);
  if (count !== undefined) {
    // rozdzielamy „i+samogłoska” od lewej, aż liczba się zgodzi
    let need = count - n.length;
    if (need > 0) {
      const out: Nucleus[] = [];
      for (const x of n) {
        if (need > 0 && x.splittable) {
          out.push({ start: x.start, end: x.start + 1, splittable: false });
          out.push({ start: x.start + 1, end: x.end, splittable: false });
          need--;
        } else out.push(x);
      }
      n = out;
    }
  }
  if (n.length <= 1) return [text];
  const cuts: number[] = [0];
  for (let k = 1; k < n.length; k++) {
    cuts.push(boundaryIn(text, n[k - 1]!.end, n[k]!.start));
  }
  cuts.push(text.length);
  const parts: string[] = [];
  for (let k = 0; k < cuts.length - 1; k++) parts.push(text.slice(cuts[k], cuts[k + 1]));
  return parts.filter((p, i) => p.length > 0 || i === 0);
}
