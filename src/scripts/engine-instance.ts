import { AudioEngine } from './audio-engine';

/**
 * Single shared AudioEngine for the whole page. The mixer UI and the
 * Pomodoro timer UI both need to reference the SAME engine — the timer
 * ducks the mixer's output during breaks — so it's created once here rather
 * than each UI module instantiating its own separate engine. ES modules are
 * cached by Vite/the browser, so every importer gets this same instance.
 */
export const engine = new AudioEngine();
