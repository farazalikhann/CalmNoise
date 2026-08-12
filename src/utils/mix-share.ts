// Encoding/decoding for shareable mix links — kept separate from the audio
// engine since this is purely URL <-> state translation, not playback logic.
//
// Format: ?mix=id:vol,id:vol,...&vol=NN
//   - each `mix` entry is a sound id and its volume as an integer 0-100
//   - the top-level `vol` param is the master volume, also 0-100
//
// Example: ?mix=rain:50,cafe:30,brown:20&vol=80

import { SOUNDS } from '../config/sounds';

const MIX_PARAM = 'mix';
const MASTER_VOLUME_PARAM = 'vol';

export interface SharedMix {
  /** soundId -> volume, 0..1 */
  sounds: Record<string, number>;
  /** 0..1, or null if the URL didn't specify one */
  masterVolume: number | null;
}

/**
 * Defensively parses a shared-mix query string. Unknown sound ids are
 * silently dropped, volumes are clamped to 0-100, and malformed input never
 * throws — it just yields fewer (or zero) valid entries. Returns null if
 * there's no usable mix, so the caller can fall back to its normal default
 * state (e.g. localStorage) instead.
 */
export function parseSharedMix(params: URLSearchParams): SharedMix | null {
  const raw = params.get(MIX_PARAM);
  if (!raw) return null;

  const validIds = new Set(SOUNDS.map((s) => s.id));
  const sounds: Record<string, number> = {};

  for (const entry of raw.split(',')) {
    const [id, volumeRaw] = entry.split(':');
    if (!id || !validIds.has(id)) continue;
    const volume = Number(volumeRaw);
    if (!Number.isFinite(volume)) continue;
    sounds[id] = clampPercent(volume) / 100;
  }

  if (Object.keys(sounds).length === 0) return null;

  let masterVolume: number | null = null;
  const masterRaw = params.get(MASTER_VOLUME_PARAM);
  if (masterRaw !== null) {
    const parsed = Number(masterRaw);
    if (Number.isFinite(parsed)) masterVolume = clampPercent(parsed) / 100;
  }

  return { sounds, masterVolume };
}

/**
 * Builds a full shareable URL for the given mix, based on the page's current
 * location — so it naturally carries whatever origin/base path the app is
 * currently deployed under (e.g. a GitHub Pages project path).
 */
export function buildShareURL(
  activeSounds: { id: string; volumePercent: number }[],
  masterVolumePercent: number
): string {
  const url = new URL(window.location.href);
  url.search = '';

  const mixValue = activeSounds.map((s) => `${s.id}:${clampPercent(s.volumePercent)}`).join(',');
  if (mixValue) url.searchParams.set(MIX_PARAM, mixValue);
  url.searchParams.set(MASTER_VOLUME_PARAM, String(clampPercent(masterVolumePercent)));

  return url.toString();
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
