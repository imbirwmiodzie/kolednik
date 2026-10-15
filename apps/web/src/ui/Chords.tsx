import {
  GUITAR_SHAPES,
  polishChordName,
  transposeChord,
  type FlatLine,
  type LineMusic,
} from '@kolednik/shared';

/** Akordy wersu po transpozycji. */
export function shiftChords(chords: string[], keyShift: number, songKey: string | undefined) {
  return chords.map((c) => transposeChord(c, keyShift, songKey ?? 'C'));
}

/** Rząd nazw akordów nad wersem (rozłożone równo, jak w podkładzie). */
export function ChordRow({ chords, className = '' }: { chords: string[]; className?: string }) {
  if (!chords.length) return null;
  return (
    <span
      className={`chord-row ${className}`}
      aria-label={`Akordy: ${chords.map(polishChordName).join(', ')}`}
    >
      {chords.map((c, i) => (
        <span key={i} className="chord-name">
          {polishChordName(c)}
        </span>
      ))}
    </span>
  );
}

/** Diagram chwytu gitarowego (6 strun, 5 progów). Nieznany chwyt — sama nazwa. */
export function ChordDiagram({ chord }: { chord: string }) {
  const shape = GUITAR_SHAPES[chord];
  const name = polishChordName(chord);
  if (!shape) {
    return (
      <figure className="chord-diagram is-unknown">
        <figcaption>{name}</figcaption>
      </figure>
    );
  }
  const fretted = shape.filter((f) => f > 0);
  const maxFret = Math.max(...fretted, 1);
  const base = maxFret > 4 ? Math.min(...fretted) : 1;
  const barre = fretted.length >= 5 && shape.filter((f) => f === Math.min(...fretted)).length >= 3;
  const minFret = Math.min(...fretted);
  const x = (s: number) => 8 + s * 10;
  const y = (f: number) => 14 + (f - base + 0.5) * 12;
  return (
    <figure className="chord-diagram">
      <figcaption>{name}</figcaption>
      <svg viewBox="0 0 66 80" role="img" aria-label={`Chwyt ${name}`}>
        {base === 1 ? (
          <rect x={7} y={12} width={52} height={3} rx={1} className="nut" />
        ) : (
          <text x={0} y={y(base) + 3} className="fret-no">
            {base}
          </text>
        )}
        {Array.from({ length: 6 }, (_, f) => (
          <line key={`f${f}`} x1={8} x2={58} y1={14 + f * 12} y2={14 + f * 12} className="fret" />
        ))}
        {Array.from({ length: 6 }, (_, s) => (
          <line key={`s${s}`} x1={x(s)} x2={x(s)} y1={14} y2={74} className="string" />
        ))}
        {barre && (
          <rect
            x={x(shape.indexOf(minFret)) - 4}
            y={y(minFret) - 4}
            width={x(5) - x(shape.indexOf(minFret)) + 8}
            height={8}
            rx={4}
            className="dot"
          />
        )}
        {shape.map((f, s) =>
          f === -1 ? (
            <text key={s} x={x(s)} y={9} className="mute">
              ×
            </text>
          ) : f === 0 ? (
            <circle key={s} cx={x(s)} cy={6} r={2.6} className="open" />
          ) : barre && f === minFret ? null : (
            <circle key={s} cx={x(s)} cy={y(f)} r={4} className="dot" />
          ),
        )}
      </svg>
    </figure>
  );
}

/** Początek każdej sylaby w ćwierćnutach od początku wersu. */
export function syllableStarts(music: LineMusic): number[] {
  const starts: number[] = new Array(music.syl.length).fill(-1);
  let t = 0;
  for (const [midi, d, s] of music.notes) {
    if (midi > 0 && starts[s] === -1) starts[s] = t;
    t += d;
  }
  for (let i = 0; i < starts.length; i++) if (starts[i] === -1) starts[i] = i > 0 ? starts[i - 1]! : 0;
  return starts;
}

/**
 * Wers z nut: sylaby z akordami dokładnie nad tą sylabą, na którą wypada zmiana akordu,
 * i (opcjonalnie) podświetlanie sylab w rytm melodii — jak w karaoke.
 */
export function SylLine({
  line,
  keyShift,
  songKey,
  showChords,
  karaoke,
}: {
  line: FlatLine;
  keyShift: number;
  songKey: string | undefined;
  showChords: boolean;
  /** czas wersu: ile ms minęło, długość ćwierćnuty, pauza */
  karaoke?: { elapsedMs: number; quarterMs: number; paused: boolean };
}) {
  const m = line.music;
  if (!m) {
    return (
      <>
        {showChords && <ChordRow chords={shiftChords(line.chords, keyShift, songKey)} />}
        <span className="line-text">{line.text}</span>
      </>
    );
  }
  const starts = karaoke ? syllableStarts(m) : null;
  return (
    <span className={`line-text syl-line ${showChords ? 'has-chords' : ''}`}>
      {m.syl.map((syl, i) => {
        const chords = showChords
          ? m.chords.filter((c) => c[0] === i).map((c) => transposeChord(c[2], keyShift, songKey ?? 'C'))
          : [];
        const style = starts
          ? {
              animationDelay: `${starts[i]! * karaoke!.quarterMs - karaoke!.elapsedMs}ms`,
              animationPlayState: karaoke!.paused ? 'paused' : 'running',
            }
          : undefined;
        return (
          <span key={i} className={`syl ${starts ? 'karaoke' : ''}`} style={style}>
            {chords.length > 0 && (
              // nazwa akordu z CSS (attr), żeby nie mieszała się z tekstem wersu (czytniki ekranu, kopiowanie)
              <span
                className="chord-at"
                data-chord={chords.map(polishChordName).join(' ')}
                aria-hidden="true"
              />
            )}
            {syl}
          </span>
        );
      })}
    </span>
  );
}
