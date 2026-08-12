// Background scene catalog for the visual theme picker.
// Purely decorative/UI config — has no relationship to the sound catalog or
// audio engine. Persisted separately in localStorage (see
// src/scripts/theme-controls.ts) under its own key so it never touches the
// saved audio mix.

export interface BackgroundTheme {
  id: string;
  name: string;
  /** Optional CC0 photo filename, expected in /public/backgrounds/. */
  file: string;
}

export const BACKGROUND_THEMES: BackgroundTheme[] = [
  { id: 'rain', name: 'Rainy Window', file: 'rain.jpg' },
  { id: 'forest', name: 'Forest', file: 'forest.jpg' },
  { id: 'ocean', name: 'Ocean', file: 'ocean.jpg' },
  { id: 'night', name: 'Night Sky', file: 'night.jpg' },
  { id: 'mountains', name: 'Mountains at Dusk', file: 'mountains.jpg' },
  { id: 'fireplace', name: 'Cozy Fireplace', file: 'fireplace.jpg' },
];

export const DEFAULT_BACKGROUND_THEME = 'night';
