import { useEffect, useState, type ReactNode } from 'react';
import type { Motif } from '@kolednik/shared';
import { ArtSvg } from '../art/SongArt';

type Step = { motif: Motif; hue: number; title: string; body: ReactNode };

const STEPS: Step[] = [
  {
    motif: 'star',
    hue: 225,
    title: 'Witajcie w Kolędniku!',
    body: (
      <>
        <p>Karaoke do kolęd: telewizor pokazuje tekst, telefony głosują, a Kolędnik ocenia, jak śpiewacie.</p>
        <p className="hint">
          Samouczek możecie przerwać w każdej chwili — przycisk „Pomiń” albo klawisz Esc.
        </p>
      </>
    ),
  },
  {
    motif: 'crown',
    hue: 40,
    title: 'Wasze konto rodzinne',
    body: (
      <>
        <p>
          Wpiszcie <strong>nazwę grupy</strong> (np. „Rodzina Kowalskich”) i <strong>hasło</strong>. Nowa
          nazwa zakłada konto, a za rok te same dane otworzą wasze rekordy.
        </p>
        <p className="hint">
          Hasło jest zapisane zaszyfrowane. Kilka złych prób z rzędu blokuje logowanie na kwadrans.
        </p>
      </>
    ),
  },
  {
    motif: 'bells',
    hue: 160,
    title: 'Goście dołączają telefonem',
    body: (
      <>
        <p>
          Na telewizorze pojawi się <strong>kod QR</strong>. Zeskanujcie go aparatem — link zawiera tajny
          klucz tylko waszego wieczoru, więc nikt obcy nie wejdzie.
        </p>
        <p className="hint">
          Nie działa aparat? Wejdźcie na stronę <strong>/j</strong> i wpiszcie 6-literowy kod z ekranu. Kod
          można w każdej chwili zmienić w Ustawieniach.
        </p>
      </>
    ),
  },
  {
    motif: 'stable',
    hue: 20,
    title: 'Wybór kolędy',
    body: (
      <>
        <p>
          <strong>🗳️ Głosujemy</strong> — każdy wybiera na telefonie, wyniki widać na żywo.{' '}
          <strong>🎲 Losuj</strong> — kręci ruletką. Można też po prostu kliknąć kafelek.
        </p>
        <p className="hint">Zaśpiewane dziś kolędy znikają z głosowania. Remis rozstrzyga los.</p>
      </>
    ),
  },
  {
    motif: 'angel',
    hue: 265,
    title: 'Śpiewamy!',
    body: (
      <>
        <p>
          Tekst przewija się sam, a <strong>narrator</strong> szepcze następny wers. Ktoś woli prowadzić? Na
          telefonie „<strong>Zostań dyrygentem</strong>” i przełącza wersy przyciskiem.
        </p>
        <p className="hint">Na TV: ← → wers, ↑ ↓ zwrotka, spacja pauza, Esc koniec, F pełny ekran.</p>
      </>
    ),
  },
  {
    motif: 'candle',
    hue: 30,
    title: 'Kolędometr i rekordy',
    body: (
      <>
        <p>
          Włączcie mikrofon — po każdej kolędzie dostaniecie ocenę 0–100, gwiazdki i świeczki. Pobity rekord =
          fajerwerki. Wszystko trafia do <strong>Złotej księgi</strong>.
        </p>
        <p className="hint">Dźwięk jest analizowany tylko w przeglądarce, nic nie jest nagrywane.</p>
      </>
    ),
  },
  {
    motif: 'tree',
    hue: 140,
    title: 'Dla zaawansowanych',
    body: (
      <>
        <p>
          W <strong>⚙️ Ustawieniach</strong> włączycie <strong>akordy na gitarę</strong> (z chwytami), a w
          sekcji zaawansowanej <strong>podkład muzyczny</strong> — pianino, gitara, organy, smyczki, pozytywka
          albo dzwonki — ze zmianą tonacji.
        </p>
        <p className="hint">Wesołych Świąt i dużo śpiewania! 🎄</p>
      </>
    ),
  },
];

/** Samouczek przy pierwszym otwarciu (kreator); można go przerwać w każdej chwili. */
export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(STEPS.length - 1, n + 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay">
      <div className="card tutorial" role="dialog" aria-modal aria-label="Samouczek">
        <button className="btn btn-ghost btn-small tutorial-skip" onClick={onClose}>
          Pomiń ✕
        </button>
        <ArtSvg motif={step.motif} hue={step.hue} className="tutorial-art" />
        <p className="tutorial-step">
          Krok {i + 1} z {STEPS.length}
        </p>
        <h2>{step.title}</h2>
        <div className="tutorial-body">{step.body}</div>
        <div className="tutorial-dots" role="tablist" aria-label="Kroki">
          {STEPS.map((s, n) => (
            <button
              key={s.title}
              role="tab"
              aria-selected={n === i}
              aria-label={`Krok ${n + 1}: ${s.title}`}
              className={`dot ${n === i ? 'is-on' : ''}`}
              onClick={() => setI(n)}
            />
          ))}
        </div>
        <div className="row center">
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
            ◀ Wstecz
          </button>
          <button className="btn btn-primary" autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Zaczynamy! 🎶' : 'Dalej ▶'}
          </button>
        </div>
      </div>
    </div>
  );
}
