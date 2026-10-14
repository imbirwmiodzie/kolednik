import type { ThemeId } from '@kolednik/shared';
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
});

export type HostSettings = ReturnType<typeof hostSettings.get>;
