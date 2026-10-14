import { useEffect, useState } from 'react';
import { mic } from '../audio/mic';
import { narrator } from '../narrator/narrator';

/** Przeglądarka wymaga kliknięcia, zanim pozwoli na dźwięk i mikrofon. */
export function AudioGate({ onDone }: { onDone: (withMic: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="overlay">
      <div className="card gate">
        <h1>Gotowi do kolędowania?</h1>
        <p>
          Włączcie mikrofon — Kolędnik zmierzy, jak głośno śpiewacie, i wystawi ocenę. Dźwięk jest analizowany
          tylko w tej przeglądarce, nic nie jest nagrywane.
        </p>
        <div className="row center">
          <button
            className="btn btn-primary btn-xl"
            autoFocus
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              narrator.unlock();
              const ok = await mic.start();
              onDone(ok);
            }}
          >
            🎤 Włącz mikrofon
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              narrator.unlock();
              onDone(false);
            }}
          >
            Bez mikrofonu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Calibration({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void mic.calibrate(3000, (p) => alive && setProgress(p)).then(() => alive && onDone());
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [onDone]);
  return (
    <div className="overlay">
      <div className="card gate">
        <h1>Cisza na sali! 🤫</h1>
        <p>Mierzę szum w pokoju, żeby ocena była uczciwa.</p>
        <div className="calib-bar">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
