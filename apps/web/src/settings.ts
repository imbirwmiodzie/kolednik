import type { ThemeId } from '@kolednik/shared';
import type { InstrumentId, MelodyId } from './audio/accompaniment';
import { createStore } from './storage';

/** Ustawienia gospodarza (TV), pamiętane między uruchomieniami. */
export const hostSettings = createStore('kolednik:settings', {
  theme: 'classic' as ThemeId,
  narrator: true,
  narratorVolume: 0.9,
  /** Ile sekund przed końcem wersu narrator kończy podpowiedź. */
  narratorLeadSec: 0.6,
  narratorWhat: 'line' as 'line' | 'start',
  narratorRate: 1.25,
  voteDurationSec: 20,
  tempo: 1,
  lastGroupName: '',
  /** Akordy nad tekstem i chwyty gitarowe (opcjonalne). */
  chords: false,
  chordDiagrams: true,
  // Zaawansowane: podkład muzyczny.
  accompaniment: false,
  /** Instrumenty akompaniamentu grające razem (można łączyć). */
  instruments: ['piano', 'bass'] as InstrumentId[],
  /** Instrument prowadzący melodię (albo bez melodii). */
  melody: 'flute' as MelodyId,
  accompanimentVolume: 0.7,
  /** Zmiana tonacji (półtony) zapamiętana dla każdej kolędy osobno (F24). */
  keyBySong: {} as Record<string, number>,
});

export type HostSettings = ReturnType<typeof hostSettings.get>;

export function songKeyShift(slug: string): number {
  return hostSettings.get().keyBySong[slug] ?? 0;
}

export function setSongKeyShift(slug: string, keyShift: number) {
  hostSettings.set({ keyBySong: { ...hostSettings.get().keyBySong, [slug]: keyShift } });
}

/** Samouczek pokazujemy przy pierwszym uruchomieniu. */
export const tutorialState = createStore('kolednik:tutorial', { done: false });

// Starsze ustawienia miały jeden instrument — przenosimy go do listy.
{
  const legacy = (hostSettings.get() as { instrument?: InstrumentId }).instrument;
  if (legacy && legacy !== 'piano' && hostSettings.get().instruments.join() === 'piano') {
    hostSettings.set({ instruments: [legacy] });
  }
}
