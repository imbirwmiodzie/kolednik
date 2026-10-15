/**
 * Mały parser podzbioru LilyPond używanego w partyturach kolęd na Wikipedii (<score>):
 * nuty bezwzględne i \relative, pauzy, kropki, łuki (melizmaty), ligatury, \repeat volta, triole,
 * \key, \time, \tempo, \partial. Dynamikę, napisy i belkowanie pomijamy.
 */

export type NoteEvent = {
  kind: 'note';
  midi: number;
  /** Długość w ćwierćnutach. */
  dur: number;
  slurStart: boolean;
  slurEnd: boolean;
  tieToNext: boolean;
};
export type RestEvent = { kind: 'rest'; dur: number };
export type MusicEvent = NoteEvent | RestEvent;

export type Section = { repeat: number; events: MusicEvent[] };

export type Score = {
  /** Tonacja: prima (0–11) i tryb. */
  key: { tonic: number; mode: 'major' | 'minor' };
  meter: [number, number];
  /** Przedtakt w ćwierćnutach (0 = brak). */
  partial: number;
  /** Tempo w ćwierćnutach na minutę (jeśli podane). */
  bpm: number | null;
  tempoText: string | null;
  sections: Section[];
};

const STEPS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 };

/** „bes” → b♭, „fis” → f♯, „es”/„as” — holenderskie skróty. */
export function pitchClass(name: string): { step: string; alter: number } | null {
  const m = /^([a-h])((?:is|es|s)*)$/.exec(name);
  if (!m) return null;
  const step = m[1]!;
  let rest = m[2]!;
  let alter = 0;
  if ((step === 'e' || step === 'a') && rest.startsWith('s') && !rest.startsWith('is')) {
    alter -= 1;
    rest = rest.slice(1);
  }
  while (rest.length) {
    if (rest.startsWith('is')) alter += 1;
    else if (rest.startsWith('es')) alter -= 1;
    else return null;
    rest = rest.slice(2);
  }
  return { step, alter };
}

function tokenize(src: string): string[] {
  const out: string[] = [];
  const re =
    /%\{[\s\S]*?%\}|%[^\n]*|"(?:[^"\\]|\\.)*"|\\[A-Za-z]+|<<|>>|[{}()~<>|[\]]|[_^-](?="|\\)|[a-z]+[',]*[0-9]*\.*|[0-9]+(?:\/[0-9]+)?|=|\S/g;
  for (const m of src.matchAll(re)) {
    const t = m[0];
    if (t.startsWith('%')) continue;
    out.push(t);
  }
  return out;
}

const KEY_MODES = new Set(['\\major', '\\minor']);

export function parseScore(src: string): Score {
  // Część „\score { … \midi }” na Wikipedii powtarza muzykę z dokładnym tempem — bierzemy z niej tylko tempo.
  const midiTempo = /\\tempo\s+4\s*=\s*(\d+)/.exec(src);
  const display = src.split(/\\score\s*\{/)[0]!;
  const tokens = tokenize(display);
  const score: Score = {
    key: { tonic: 0, mode: 'major' },
    meter: [4, 4],
    partial: 0,
    bpm: midiTempo ? Number(midiTempo[1]) : null,
    tempoText: null,
    sections: [],
  };

  let dur = 1;
  let tupletScale = 1;
  let transpose = 0;
  let german = false;
  let relative: number | null = null; // poprzednia nuta w trybie \relative (midi)
  let i = 0;
  let current: Section = { repeat: 1, events: [] };
  const flush = () => {
    if (current.events.length) score.sections.push(current);
  };
  const lastNote = (): NoteEvent | undefined => {
    for (let k = current.events.length - 1; k >= 0; k--) {
      const e = current.events[k]!;
      if (e.kind === 'note') return e;
    }
    // łuk może zaczynać się w poprzedniej sekcji
    for (let s = score.sections.length - 1; s >= 0; s--) {
      const ev = score.sections[s]!.events;
      for (let k = ev.length - 1; k >= 0; k--) if (ev[k]!.kind === 'note') return ev[k] as NoteEvent;
    }
    return undefined;
  };
  // Stos klamr: co zamyka dana „}”.
  const stack: ('plain' | 'repeat' | 'tuplet' | 'relative' | 'skip')[] = [];

  const parseDuration = (s: string): number | null => {
    const m = /^([0-9]+)(\.*)$/.exec(s);
    if (!m) return null;
    let d = 4 / Number(m[1]);
    let add = d;
    for (let k = 0; k < m[2]!.length; k++) {
      add /= 2;
      d += add;
    }
    return d;
  };

  while (i < tokens.length) {
    const t = tokens[i++]!;
    if (t === '\\header' || t === '\\layout' || t === '\\midi' || t === '\\paper') {
      // pomiń cały blok { … }
      if (tokens[i] === '{') {
        let depth = 0;
        do {
          if (tokens[i] === '{') depth++;
          else if (tokens[i] === '}') depth--;
          i++;
        } while (depth > 0 && i < tokens.length);
      }
      continue;
    }
    if (t === '\\key') {
      const p = pitchClass(tokens[i++] ?? 'c');
      const mode = tokens[i] && KEY_MODES.has(tokens[i]!) ? tokens[i++] : '\\major';
      if (p) {
        score.key = {
          tonic: (((STEPS[p.step]! + p.alter + transpose) % 12) + 12) % 12,
          mode: mode === '\\minor' ? 'minor' : 'major',
        };
      }
      continue;
    }
    if (t === '\\time') {
      const [n, d] = (tokens[i++] ?? '4/4').split('/').map(Number);
      score.meter = [n ?? 4, d ?? 4];
      continue;
    }
    if (t === '\\partial') {
      score.partial = parseDuration(tokens[i++] ?? '4') ?? 0;
      continue;
    }
    if (t === '\\tempo') {
      const next = tokens[i];
      if (next?.startsWith('"')) {
        score.tempoText = next.slice(1, -1);
        i++;
      }
      if (/^[0-9]+$/.test(tokens[i] ?? '') && tokens[i + 1] === '=') {
        score.bpm ??= Number(tokens[i + 2]);
        i += 3;
      }
      continue;
    }
    if (t === '\\transpose') {
      const from = absolutePitch(tokens[i++] ?? 'c');
      const to = absolutePitch(tokens[i++] ?? 'c');
      if (from !== null && to !== null) transpose = to - from;
      continue;
    }
    if (t === '\\language') {
      german = (tokens[i++] ?? '').includes('deutsch');
      continue;
    }
    if (t === '\\set' || t === '\\override') {
      // \set Staff.x = #"…" / ##t — pomiń do wartości
      while (i < tokens.length && tokens[i] !== '=') i++;
      i += 2;
      continue;
    }
    if (t === '\\bar') {
      i++;
      continue;
    }
    if (t === '\\repeat') {
      const type = tokens[i++];
      const count = Number(tokens[i++] ?? 2);
      if (tokens[i] === '{') {
        i++;
        flush();
        current = { repeat: type === 'volta' || type === 'unfold' ? count : 1, events: [] };
        stack.push('repeat');
      }
      continue;
    }
    if (t === '\\times' || t === '\\tuplet') {
      const [a, b] = (tokens[i++] ?? '2/3').split('/').map(Number);
      tupletScale = t === '\\times' ? a! / b! : b! / a!;
      if (tokens[i] === '{') {
        i++;
        stack.push('tuplet');
      }
      continue;
    }
    if (t === '\\relative') {
      const ref = tokens[i];
      if (ref && /^[a-h]/.test(ref)) {
        relative = absolutePitch(ref) ?? 48;
        i++;
      } else relative = 48;
      if (tokens[i] === '{') {
        i++;
        stack.push('relative');
      }
      continue;
    }
    if (t === '{') {
      stack.push('plain');
      continue;
    }
    if (t === '}') {
      const what = stack.pop();
      if (what === 'repeat') {
        flush();
        current = { repeat: 1, events: [] };
      } else if (what === 'tuplet') tupletScale = 1;
      else if (what === 'relative') relative = null;
      continue;
    }
    if (t === '(') {
      const n = lastNote();
      if (n) n.slurStart = true;
      continue;
    }
    if (t === ')') {
      const n = lastNote();
      if (n) n.slurEnd = true;
      continue;
    }
    if (t === '~') {
      const n = lastNote();
      if (n) n.tieToNext = true;
      continue;
    }
    if (t === '_' || t === '^' || t === '-') {
      i++; // napis/artykulacja przy nucie
      continue;
    }
    if (t.startsWith('\\') || t.startsWith('"') || t === '|' || t === '=') continue;

    const m = /^([a-z]+)([',]*)([0-9]*\.*)$/.exec(t);
    if (!m) continue;
    const [, name, octs, durStr] = m;
    if (durStr) dur = parseDuration(durStr) ?? dur;
    const d = dur * tupletScale;
    if (name === 'r' || name === 's' || name === 'R') {
      current.events.push({ kind: 'rest', dur: d });
      continue;
    }
    // w notacji niemieckiej „b” to B♭, a „h” to H
    const pc = pitchClass(german && name === 'b' ? 'bes' : name!);
    if (!pc) continue;
    let midi: number;
    if (relative !== null) {
      midi = relativePitch(relative, pc, octs!);
      relative = midi;
    } else {
      midi = 48 + STEPS[pc.step]! + pc.alter + 12 * countOctaves(octs!);
    }
    current.events.push({
      kind: 'note',
      midi: midi + transpose,
      dur: d,
      slurStart: false,
      slurEnd: false,
      tieToNext: false,
    });
  }
  flush();
  return score;
}

function countOctaves(marks: string): number {
  let n = 0;
  for (const c of marks) n += c === "'" ? 1 : -1;
  return n;
}

function absolutePitch(tok: string): number | null {
  const m = /^([a-z]+)([',]*)/.exec(tok);
  const pc = m && pitchClass(m[1]!);
  if (!m || !pc) return null;
  return 48 + STEPS[pc.step]! + pc.alter + 12 * countOctaves(m[2]!);
}

/** Tryb \relative: najbliższa nuta o danej nazwie względem poprzedniej, plus znaki oktaw. */
function relativePitch(prev: number, pc: { step: string; alter: number }, octs: string): number {
  let candidate = Math.floor(prev / 12) * 12 + STEPS[pc.step]! + pc.alter;
  while (candidate - prev > 6) candidate -= 12;
  while (prev - candidate > 6) candidate += 12;
  return candidate + 12 * countOctaves(octs);
}

/** Grupy nut śpiewanych na jednej sylabie (łuki i ligatury). */
export type NoteGroup = { notes: NoteEvent[]; dur: number; /** pauza po grupie */ restAfter: number };

export function syllableGroups(events: MusicEvent[]): NoteGroup[] {
  const groups: NoteGroup[] = [];
  let open = false; // trwa łuk/ligatura
  for (const e of events) {
    if (e.kind === 'rest') {
      const g = groups.at(-1);
      if (g) g.restAfter += e.dur;
      open = false;
      continue;
    }
    const g = groups.at(-1);
    if (open && g && g.restAfter === 0) {
      g.notes.push(e);
      g.dur += e.dur;
    } else {
      groups.push({ notes: [e], dur: e.dur, restAfter: 0 });
    }
    if (e.slurStart || e.tieToNext) open = true;
    if (e.slurEnd && !e.tieToNext) open = false;
  }
  return groups;
}
