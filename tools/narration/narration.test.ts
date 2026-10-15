import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NARRATION_VOICES,
  narrationKey,
  promptText,
  type NarrationManifest,
} from '../../packages/shared/src/narration.js';
import { narrationTexts } from './narration.js';

const dir = path.resolve(import.meta.dirname, '../../content/narration');

describe('nagrania narratora', () => {
  it('klucz nagrania zależy tylko od tekstu', () => {
    expect(narrationKey('Cicha noc, święta noc,')).toBe(narrationKey(' Cicha noc, święta noc, '));
    expect(narrationKey('Cicha noc, święta noc,')).not.toBe(narrationKey('Cicha noc, święta noc'));
    expect(narrationKey('Bóg się rodzi')).toMatch(/^[0-9a-f]{14}$/);
    expect(promptText('Bóg się rodzi, moc truchleje,', 'start')).toBe('Bóg się rodzi,…');
  });

  // Po zmianie tekstu kolędy trzeba uruchomić `pnpm narration`.
  it('każdy wers każdej kolędy ma nagranie w każdym głosie', () => {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as NarrationManifest;
    const keys = [...narrationTexts().keys()];
    for (const v of NARRATION_VOICES) {
      const missing = keys.filter(
        (k) => !manifest[v.id]?.clips[k] || !existsSync(path.join(dir, v.id, `${k}.mp3`)),
      );
      expect(missing, `brak nagrań głosu ${v.id} — uruchomcie pnpm narration`).toEqual([]);
    }
  });
});
