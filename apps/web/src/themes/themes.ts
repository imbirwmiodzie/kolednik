import type { ThemeId } from '@kolednik/shared';

export type ThemeEffect = 'snow' | 'lights' | 'glow' | 'none';

export const THEME_LIST: {
  id: ThemeId;
  name: string;
  effect: ThemeEffect;
  swatch: [string, string, string];
}[] = [
  { id: 'classic', name: 'Klasyczny', effect: 'snow', swatch: ['#5b0f14', '#e8b04b', '#fff6e6'] },
  { id: 'winter', name: 'Zimowa noc', effect: 'snow', swatch: ['#0d1b3d', '#cfd8e8', '#7fb2ff'] },
  { id: 'tree', name: 'Choinka', effect: 'lights', swatch: ['#0f3d24', '#ffcf6b', '#e2463f'] },
  { id: 'nativity', name: 'Szopka', effect: 'glow', swatch: ['#3a2416', '#f3d9a4', '#ff9d3c'] },
  { id: 'contrast', name: 'Wysoki kontrast', effect: 'none', swatch: ['#000000', '#ffffff', '#ffe600'] },
];

export function themeInfo(id: ThemeId) {
  return THEME_LIST.find((t) => t.id === id) ?? THEME_LIST[0]!;
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', themeInfo(id).swatch[0]);
}
