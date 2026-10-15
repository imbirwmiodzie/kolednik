import type { ThemeId } from '@kolednik/shared';
import { useSyncExternalStore } from 'react';
import { flattenSong } from '@kolednik/shared';
import {
  accompaniment,
  ENSEMBLES,
  INSTRUMENTS,
  type InstrumentId,
  type MelodyId,
} from '../audio/accompaniment';
import { fetchSong } from '../net/api';
import { mic, useMic } from '../audio/mic';
import { getSocket } from '../net/socket';
import { NARRATOR_VOICES, narrator, type NarratorVoice } from '../narrator/narrator';
import { hostSettings } from '../settings';
import { THEME_LIST } from '../themes/themes';
import { Modal } from '../ui/Modal';

/** Wers do odsłuchu głosu narratora (jest w nagraniach, bo pochodzi z kolędy). */
const SAMPLE_LINE = 'Wśród nocnej ciszy głos się rozchodzi:';

export function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (t: ThemeId) => void }) {
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Motyw kolorystyczny">
      {THEME_LIST.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          className={`theme-swatch ${value === t.id ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}
          style={{
            background: `linear-gradient(135deg, ${t.swatch[0]} 55%, ${t.swatch[1]} 55% 78%, ${t.swatch[2]} 78%)`,
          }}
        >
          <span>{t.name}</span>
        </button>
      ))}
    </div>
  );
}

export function SettingsModal({
  onClose,
  onTheme,
  onCalibrate,
  onTutorial,
}: {
  onClose: () => void;
  onTheme: (t: ThemeId) => void;
  onCalibrate: () => void;
  onTutorial: () => void;
}) {
  const s = hostSettings.use();
  const m = useMic();
  const loading = useSyncExternalStore(accompaniment.subscribe, accompaniment.getLoading);
  return (
    <Modal title="Ustawienia" onClose={onClose}>
      <section className="settings-section">
        <h3>Motyw</h3>
        <ThemePicker value={s.theme} onChange={onTheme} />
      </section>

      <section className="settings-section">
        <h3>Narrator (podpowiada następny wers)</h3>
        <label className="row">
          <input
            type="checkbox"
            checked={s.narrator}
            onChange={(e) => hostSettings.set({ narrator: e.target.checked })}
          />
          Włączony
        </label>
        <label className="row">
          Głos:
          <select
            value={s.narratorVoice}
            onChange={(e) => hostSettings.set({ narratorVoice: e.target.value as NarratorVoice })}
          >
            {NARRATOR_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              narrator.unlock();
              narrator.say(SAMPLE_LINE, {
                volume: s.narratorVolume,
                rate: s.narratorRate,
                voice: s.narratorVoice,
              });
            }}
          >
            ▶ Odsłuchaj
          </button>
          {s.narratorVoice === 'browser' && narrator.supported && !narrator.hasPolishVoice && (
            <span className="warn">
              {' '}
              — brak polskiego głosu w tej przeglądarce (spróbujcie Chrome lub Edge)
            </span>
          )}
        </label>
        <label className="row">
          Co czytać:
          <select
            value={s.narratorWhat}
            onChange={(e) => hostSettings.set({ narratorWhat: e.target.value as 'line' | 'start' })}
          >
            <option value="line">cały następny wers</option>
            <option value="start">tylko początek wersu</option>
          </select>
        </label>
        <Range
          label="Głośność"
          min={0.1}
          max={1}
          step={0.05}
          value={s.narratorVolume}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(narratorVolume) => hostSettings.set({ narratorVolume })}
        />
        <Range
          label="Wyprzedzenie"
          min={0}
          max={3}
          step={0.1}
          value={s.narratorLeadSec}
          format={(v) => `${v.toFixed(1)} s przed końcem wersu`}
          onChange={(narratorLeadSec) => hostSettings.set({ narratorLeadSec })}
        />
        <Range
          label="Szybkość mowy"
          min={0.8}
          max={1.8}
          step={0.05}
          value={s.narratorRate}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(narratorRate) => hostSettings.set({ narratorRate })}
        />
      </section>

      <section className="settings-section">
        <h3>Śpiewanie</h3>
        <Range
          label="Tempo przewijania"
          min={0.6}
          max={1.6}
          step={0.05}
          value={s.tempo}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(tempo) => hostSettings.set({ tempo })}
        />
        <Range
          label="Czas głosowania"
          min={10}
          max={60}
          step={5}
          value={s.voteDurationSec}
          format={(v) => `${v} s`}
          onChange={(voteDurationSec) => hostSettings.set({ voteDurationSec })}
        />
        <p className="hint">
          Wersy przewijają się automatycznie. Żeby prowadzić je z telefonu, ktoś klika na telefonie „Zostań
          dyrygentem”.
        </p>
      </section>

      <section className="settings-section">
        <h3>Akordy na gitarę</h3>
        <label className="row">
          <input
            type="checkbox"
            checked={s.chords}
            onChange={(e) => hostSettings.set({ chords: e.target.checked })}
          />
          Pokazuj akordy nad tekstem (na TV; na telefonach każdy włącza sam)
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={s.chordDiagrams}
            disabled={!s.chords}
            onChange={(e) => hostSettings.set({ chordDiagrams: e.target.checked })}
          />
          Pokazuj chwyty (diagramy gryfu)
        </label>
        <p className="hint">Akordy przesuwają się razem ze zmianą tonacji (♭/♯ na ekranie śpiewania).</p>
      </section>

      <section className="settings-section">
        <h3>Mikrofon i kolędometr</h3>
        <p>
          Stan: <strong>{MIC_LABEL[m.status]}</strong>
          {m.noiseDb !== null && <> · tło {Math.round(m.noiseDb)} dBFS</>}
        </p>
        <div className="row">
          {m.status !== 'on' ? (
            <button className="btn" onClick={() => void mic.start().then((ok) => ok && onCalibrate())}>
              Włącz mikrofon
            </button>
          ) : (
            <button className="btn" onClick={onCalibrate}>
              Zmierz ciszę ponownie
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => void document.documentElement.requestFullscreen?.()}
          >
            Pełny ekran (F)
          </button>
        </div>
        <p className="hint">
          Dźwięk jest analizowany tylko w tej przeglądarce — nic nie jest nagrywane ani wysyłane.
        </p>
      </section>

      <section className="settings-section">
        <h3>Dołączanie i bezpieczeństwo</h3>
        <p className="hint">
          Link w kodzie QR zawiera tajny klucz tylko tego wieczoru. Jeśli kod lub link trafił do kogoś obcego,
          wygenerujcie nowy — stary przestanie działać, a osoby już dołączone zostaną.
        </p>
        <div className="row">
          <button className="btn" onClick={() => getSocket().emit('host:rotate-code')}>
            🔒 Nowy kod i link
          </button>
          <button className="btn btn-ghost" onClick={onTutorial}>
            ❓ Pokaż samouczek
          </button>
        </div>
      </section>

      <details className="settings-section advanced">
        <summary>
          <h3>Zaawansowane: podkład muzyczny</h3>
        </summary>
        <label className="row">
          <input
            type="checkbox"
            checked={s.accompaniment}
            onChange={(e) => hostSettings.set({ accompaniment: e.target.checked })}
          />
          Graj podkład: melodia i akompaniament z nut kolędy, nagranymi instrumentami
        </label>
        <p className="hint">Gotowe zestawy:</p>
        <div className="instrument-picker" aria-label="Zestawy">
          {ENSEMBLES.map((e) => (
            <button
              key={e.name}
              type="button"
              className={`chip ${e.instruments.join() === s.instruments.join() && e.melody === s.melody ? 'is-active' : ''}`}
              onClick={() => {
                hostSettings.set({ instruments: e.instruments, melody: e.melody });
                void preview(e.instruments, e.melody, s.accompanimentVolume);
              }}
            >
              {e.instruments.map((i) => icon(i)).join('')} {e.name}
            </button>
          ))}
        </div>
        <p className="hint">Melodię prowadzi:</p>
        <div className="instrument-picker" role="radiogroup" aria-label="Melodia">
          {[{ id: 'none' as const, name: 'bez melodii', icon: '🔇' }, ...INSTRUMENTS].map((inst) => (
            <button
              key={inst.id}
              type="button"
              role="radio"
              aria-checked={s.melody === inst.id}
              className={`chip ${s.melody === inst.id ? 'is-active' : ''}`}
              onClick={() => {
                hostSettings.set({ melody: inst.id });
                if (inst.id !== 'none') void preview([], inst.id, s.accompanimentVolume);
              }}
            >
              {inst.icon} {inst.name}
            </button>
          ))}
        </div>
        <p className="hint">Akompaniament (można łączyć kilka):</p>
        <div className="instrument-picker" role="group" aria-label="Instrumenty">
          {INSTRUMENTS.map((inst) => {
            const on = s.instruments.includes(inst.id);
            return (
              <button
                key={inst.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`chip ${on ? 'is-active' : ''}`}
                onClick={() => {
                  const next = on ? s.instruments.filter((i) => i !== inst.id) : [...s.instruments, inst.id];
                  hostSettings.set({ instruments: next });
                  if (!on) void preview([inst.id], 'none', s.accompanimentVolume);
                }}
              >
                {inst.icon} {inst.name}
              </button>
            );
          })}
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void preview(s.instruments, s.melody, s.accompanimentVolume)}
          >
            ▶ Posłuchaj (Cicha noc)
          </button>
          {loading > 0 && <span className="hint">Ładowanie instrumentów… ({loading})</span>}
        </div>
        <Range
          label="Głośność podkładu"
          min={0.05}
          max={1}
          step={0.05}
          value={s.accompanimentVolume}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(accompanimentVolume) => {
            hostSettings.set({ accompanimentVolume });
            accompaniment.setVolume(accompanimentVolume);
          }}
        />
        <p className="hint">
          Tonację zmieniacie w trakcie kolędy przyciskami ♭/♯ — zapamięta się dla każdej kolędy osobno.
          Podkład z głośników słychać też w mikrofonie, więc kolędometr może zawyżać wynik — dla uczciwej
          rywalizacji grajcie ciszej albo bez podkładu. Instrumenty: Musyng Kite SoundFont (CC BY-SA 3.0).
          Nuty kolęd: partytury z Wikipedii (CC BY-SA 4.0).
        </p>
      </details>
    </Modal>
  );
}

const MIC_LABEL = {
  off: 'wyłączony',
  starting: 'włączanie…',
  on: 'działa',
  denied: 'brak zgody — zezwólcie na mikrofon w pasku adresu',
  unsupported: 'niedostępny w tej przeglądarce',
} as const;

function Range(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output>{props.format(props.value)}</output>
    </label>
  );
}

const icon = (id: InstrumentId) => INSTRUMENTS.find((i) => i.id === id)?.icon ?? '';

/** Próbka brzmienia: pierwsze dwa wersy „Cichej nocy” z nut. */
async function preview(instruments: InstrumentId[], melody: MelodyId, volume: number) {
  accompaniment.setVolume(volume);
  await accompaniment.preload([...instruments, ...(melody === 'none' ? [] : [melody])]);
  const song = await fetchSong('cicha-noc');
  const lines = flattenSong(song);
  const quarterMs = 60_000 / song.bpm;
  const meter = (song.music?.meter ?? [4, 4]) as [number, number];
  const first = lines[0]!;
  const job = (l: typeof first) => ({
    chords: l.chords,
    music: l.music,
    durationMs: l.beats * quarterMs,
    quarterMs,
    meter,
    instruments,
    melody,
    keyShift: 0,
  });
  accompaniment.playLine(job(first));
  const second = lines[1];
  if (second) setTimeout(() => accompaniment.playLine(job(second)), first.beats * quarterMs);
}
