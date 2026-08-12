// ---------------------------------------------------------------------------
// Sound catalog
// ---------------------------------------------------------------------------
// `kind: 'noise'` sounds are generated procedurally in the browser (see
// public/worklets/noise-processor.js) and need no audio files.
//
// `kind: 'file'` sounds stream a looping audio file from /public/sounds/.
// See public/sounds/README.md for the exact CC0 files to add. The app
// works even if a file is missing — the card just reports it's unavailable
// when toggled instead of crashing anything else.
//
// To add a new sound: append an entry below with a unique `id`, then (for
// file-based sounds) drop the matching file into public/sounds/.
// ---------------------------------------------------------------------------

export type NoiseType = 'white' | 'pink' | 'brown';

export interface SoundDef {
  id: string;
  name: string;
  description: string;
  kind: 'noise' | 'file';
  noiseType?: NoiseType;
  file?: string; // relative to /sounds/
  /** Inner <svg> markup (stroke-based, 24x24 viewBox), no outer <svg> tag. */
  icon: string;
  defaultVolume: number; // 0..1
}

const ICONS = {
  waveform:
    '<path d="M2 12h2.5l1.5-6 3 16 3-13 2 8 1.5-5H21" stroke-linecap="round" stroke-linejoin="round"/>',
  waveSoft:
    '<path d="M2 13c2-3 4-3 6 0s4 3 6 0 4-3 6 0" stroke-linecap="round" stroke-linejoin="round"/>',
  waveDeep:
    '<path d="M2 12c2.5-5 5-5 7.5 0s5 5 7.5 0 2.5-5 5-5" stroke-linecap="round" stroke-linejoin="round"/>',
  rain: '<path d="M7 15a5 5 0 0 1 .3-9.98A6 6 0 0 1 18.5 8 4.5 4.5 0 0 1 18 15H7Z" stroke-linejoin="round"/><path d="M8 18.5 7 21M12 18.5l-1 2.5M16 18.5l-1 2.5" stroke-linecap="round"/>',
  thunder:
    '<path d="M7 14a5 5 0 0 1 .3-9.98A6 6 0 0 1 18.5 7 4.5 4.5 0 0 1 18 14H7Z" stroke-linejoin="round"/><path d="M13 13l-3 5h3l-2 4" stroke-linecap="round" stroke-linejoin="round"/>',
  ocean:
    '<path d="M2 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 21c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke-linecap="round" stroke-linejoin="round"/>',
  forest:
    '<path d="M12 2 7 10h2.5L6 16h4v6h4v-6h4l-3.5-6H17L12 2Z" stroke-linejoin="round"/>',
  cafe: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" stroke-linejoin="round"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" stroke-linecap="round"/><path d="M8 2.5c-.6.7-.6 1.3 0 2s.6 1.3 0 2M12 2.5c-.6.7-.6 1.3 0 2s.6 1.3 0 2" stroke-linecap="round"/>',
  fireplace:
    '<path d="M12 21c-3.5 0-6-2.4-6-5.7C6 12 8 10 8 7.5c1 1 1.5 2 1.5 3C10.5 8 10 5.5 12 3c0 2.5 1 3.5 2.5 5.5.7-1 1-2 .8-3.3C17 6.5 18 8.7 18 11c0 1.5-.7 2.6-1.5 3.5.4-1.6-.1-2.6-1-3.3.3 2-1 3-2 4.3-.6.8-.5 1.6.5 2.3-1 .3-1.3 1.7-2 3.2Z" stroke-linejoin="round"/>',
  fan: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c-1.5-2.8-.7-5.4 1-6.4 1.8-1 3.9 0 4 2 .1 2-2 3.3-5 4.4Z" stroke-linejoin="round"/><path d="M13.4 12.9c2.8 1.5 4 4 3.2 5.9-.8 1.9-3 2.3-4.6 1.1-1.6-1.2-1.5-3.7-1-7Z" stroke-linejoin="round"/><path d="M10.6 12.9c-2.8 1.5-5.4.7-6.4-1-1-1.8 0-3.9 2-4 2-.1 3.3 2 4.4 5Z" stroke-linejoin="round"/>',
  target:
    '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 1.5v3.2M12 19.3v3.2M1.5 12h3.2M19.3 12h3.2" stroke-linecap="round"/>',
  moon: '<path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7 7 0 0 0 10.2 10.2Z" stroke-linejoin="round"/>',
  book: '<path d="M4 4.8A2.3 2.3 0 0 1 6.3 2.5H20v17.8H6.3A2.3 2.3 0 0 0 4 22.6V4.8Z" stroke-linejoin="round"/><path d="M4 19.3A2.3 2.3 0 0 1 6.3 17H20" stroke-linecap="round"/>',
  plane: '<path d="m3 11 18-8-8 18-2-8-8-2Z" stroke-linejoin="round"/>',
  reset:
    '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" stroke-linecap="round"/><path d="M4 4v4h4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" stroke-linecap="round"/><path d="M20 20v-4h-4" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;

/** Reused by the mixer's "Reset" control — not tied to any single sound. */
export const RESET_ICON = ICONS.reset;

export const SOUNDS: SoundDef[] = [
  {
    id: 'white',
    name: 'White Noise',
    description: 'Full-spectrum static — blocks distractions and background chatter.',
    kind: 'noise',
    noiseType: 'white',
    icon: ICONS.waveform,
    defaultVolume: 0.5,
  },
  {
    id: 'pink',
    name: 'Pink Noise',
    description: 'Softer, deeper static — a gentle balance of high and low frequencies.',
    kind: 'noise',
    noiseType: 'pink',
    icon: ICONS.waveSoft,
    defaultVolume: 0.5,
  },
  {
    id: 'brown',
    name: 'Brown Noise',
    description: 'Deep, bassy rumble — soothing for deep focus and sleep.',
    kind: 'noise',
    noiseType: 'brown',
    icon: ICONS.waveDeep,
    defaultVolume: 0.5,
  },
  {
    id: 'rain',
    name: 'Rain',
    description: 'Steady rainfall for calm, comforting background sound.',
    kind: 'file',
    file: 'rain.mp3',
    icon: ICONS.rain,
    defaultVolume: 0.5,
  },
  {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    description: 'Distant rolling thunder with rain for deep relaxation.',
    kind: 'file',
    file: 'thunderstorm.mp3',
    icon: ICONS.thunder,
    defaultVolume: 0.4,
  },
  {
    id: 'ocean',
    name: 'Ocean Waves',
    description: 'Rhythmic waves rolling onto shore.',
    kind: 'file',
    file: 'ocean.mp3',
    icon: ICONS.ocean,
    defaultVolume: 0.5,
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Birdsong and rustling leaves in a quiet forest.',
    kind: 'file',
    file: 'forest.mp3',
    icon: ICONS.forest,
    defaultVolume: 0.5,
  },
  {
    id: 'cafe',
    name: 'Cafe',
    description: 'Murmuring chatter and clinking cups for a cozy focus vibe.',
    kind: 'file',
    file: 'cafe.mp3',
    icon: ICONS.cafe,
    defaultVolume: 0.4,
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    description: 'Crackling logs in a warm, glowing fire.',
    kind: 'file',
    file: 'fireplace.mp3',
    icon: ICONS.fireplace,
    defaultVolume: 0.5,
  },
  {
    id: 'fan',
    name: 'Fan',
    description: 'Steady mechanical hum, great for masking noise while you sleep.',
    kind: 'file',
    file: 'fan.mp3',
    icon: ICONS.fan,
    defaultVolume: 0.45,
  },
];

export interface Preset {
  id: string;
  name: string;
  description: string;
  mix: Partial<Record<string, number>>; // soundId -> volume (0..1); omitted ids are turned off
  /** Inner <svg> markup (stroke-based, 24x24 viewBox), no outer <svg> tag. */
  icon: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'deep-focus',
    name: 'Deep Focus',
    description: 'Brown noise with a touch of rain to hold your attention.',
    mix: { brown: 0.5, rain: 0.3 },
    icon: ICONS.target,
  },
  {
    id: 'rainy-cafe',
    name: 'Rainy Cafe',
    description: 'Rain against the window with soft cafe ambience.',
    mix: { rain: 0.45, cafe: 0.4, thunderstorm: 0.15 },
    icon: ICONS.cafe,
  },
  {
    id: 'sleep',
    name: 'Sleep',
    description: 'Brown noise, gentle waves, and a soft fan to drift off to.',
    mix: { brown: 0.35, ocean: 0.3, fan: 0.2 },
    icon: ICONS.moon,
  },
  {
    id: 'thunderstorm-night',
    name: 'Thunderstorm Night',
    description: 'Heavy rain and rolling thunder with a crackling fire.',
    mix: { rain: 0.5, thunderstorm: 0.45, fireplace: 0.2 },
    icon: ICONS.thunder,
  },
  {
    id: 'cozy-cabin',
    name: 'Cozy Cabin',
    description: 'A warm fire, quiet forest, and light rain outside.',
    mix: { fireplace: 0.55, forest: 0.25, rain: 0.2 },
    icon: ICONS.fireplace,
  },
  {
    id: 'beach-day',
    name: 'Beach Day',
    description: 'Rolling ocean waves with distant forest birdsong.',
    mix: { ocean: 0.6, forest: 0.15 },
    icon: ICONS.ocean,
  },
  {
    id: 'study-hall',
    name: 'Study Hall',
    description: 'Cafe murmur, white noise, and rain for heads-down work.',
    mix: { cafe: 0.35, white: 0.3, rain: 0.2 },
    icon: ICONS.book,
  },
  {
    id: 'forest-walk',
    name: 'Forest Walk',
    description: 'Birdsong and rustling leaves with light rain and distant waves.',
    mix: { forest: 0.6, rain: 0.2, ocean: 0.1 },
    icon: ICONS.forest,
  },
  {
    id: 'airplane-cabin',
    name: 'Airplane Cabin',
    description: 'A steady engine hum to mask cabin noise on a flight.',
    mix: { white: 0.45, fan: 0.4 },
    icon: ICONS.plane,
  },
];
