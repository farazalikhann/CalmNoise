import { SOUNDS, PRESETS, type SoundDef, type Preset } from '../config/sounds';
import { BASE } from '../utils/base';
import { parseSharedMix } from '../utils/mix-share';

const STORAGE_KEY = 'calmnoise:mix:v1';
// Base-aware — resolves correctly whether deployed at the domain root or
// under a GitHub Pages project path like /CalmNoise/.
const WORKLET_URL = `${BASE}worklets/noise-processor.js`;
// Fade duration for both starting and stopping a sound (including the
// individual per-sound stop the sleep timer triggers when it ends).
const FADE_SECONDS = 0.4;
const DEFAULT_MASTER_VOLUME = 0.8;

export interface SoundState {
  on: boolean;
  volume: number; // 0..1
  unavailable: boolean;
  loading: boolean;
}

interface PersistedState {
  masterVolume: number;
  sounds: Record<string, { on: boolean; volume: number }>;
}

interface SoundRuntime {
  def: SoundDef;
  gain: GainNode | null;
  source: AudioWorkletNode | AudioBufferSourceNode | ScriptProcessorNode | null;
  buffer: AudioBuffer | null;
  /** Loop boundaries (seconds) computed once a file is decoded — see
   *  findSeamlessLoopPoints() — so repeats don't click or gap. */
  loopStart: number;
  loopEnd: number;
  state: SoundState;
}

type Listener<T> = (detail: T) => void;

export class AudioEngine extends EventTarget {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sleepGain: GainNode | null = null;
  private workletLoaded = false;
  private workletSupported = true;

  private runtimes = new Map<string, SoundRuntime>();
  private masterVolume = DEFAULT_MASTER_VOLUME;
  private isRunning = false;

  private sleepEndsAt: number | null = null;
  private sleepFadeStartsAt: number | null = null;
  private sleepTimeouts: number[] = [];
  private sleepInterval: number | null = null;

  private persistTimeout: number | null = null;
  private mediaSessionReady = false;
  private sharedMixApplied = false;

  constructor() {
    super();
    for (const def of SOUNDS) {
      this.runtimes.set(def.id, {
        def,
        gain: null,
        source: null,
        buffer: null,
        loopStart: 0,
        loopEnd: 0,
        state: { on: false, volume: def.defaultVolume, unavailable: false, loading: false },
      });
    }
    this.loadInitialState();

    // Mobile browsers may suspend the AudioContext when the tab is
    // backgrounded despite an active Media Session; resume it once the user
    // comes back if playback is supposed to still be running. This never
    // pauses anything on hide — only recovers a suspended context on show.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.isRunning && this.ctx?.state === 'suspended') {
          void this.ctx.resume();
        }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Public read helpers
  // ---------------------------------------------------------------------

  get running() {
    return this.isRunning;
  }

  get master() {
    return this.masterVolume;
  }

  getSoundState(id: string): SoundState | undefined {
    return this.runtimes.get(id)?.state;
  }

  /** True when the current mix came from a shared-link `?mix=` URL param
   *  rather than localStorage or defaults — lets the UI show a distinct
   *  "shared mix ready" prompt instead of the usual "resume your last mix". */
  get restoredFromShare(): boolean {
    return this.sharedMixApplied;
  }

  get sleepRemainingMs(): number | null {
    if (!this.sleepEndsAt) return null;
    return Math.max(0, this.sleepEndsAt - Date.now());
  }

  // ---------------------------------------------------------------------
  // Context / graph setup
  // ---------------------------------------------------------------------

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextCtor();

    const master = ctx.createGain();
    master.gain.value = this.masterVolume;

    const sleep = ctx.createGain();
    sleep.gain.value = 1;

    master.connect(sleep);
    sleep.connect(ctx.destination);

    this.ctx = ctx;
    this.masterGain = master;
    this.sleepGain = sleep;

    this.setupMediaSession();

    return ctx;
  }

  /**
   * Lets the OS/lock-screen/notification-shade show playback controls and
   * treat this tab as active media, which is also what keeps mobile browsers
   * from aggressively suspending audio when the app is backgrounded.
   */
  private setupMediaSession() {
    if (this.mediaSessionReady) return;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    this.mediaSessionReady = true;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'CalmNoise — Ambient Mix',
        artist: 'White noise, nature sounds & focus mixer',
        album: 'CalmNoise',
        artwork: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        void this.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        void this.pause();
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        void this.pause();
      });
    } catch {
      // Media Session is progressive enhancement — ignore unsupported browsers.
    }
  }

  private updatePlaybackState() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = this.isRunning ? 'playing' : 'paused';
    } catch {
      // Ignore — progressive enhancement only.
    }
  }

  private async ensureWorklet(ctx: AudioContext): Promise<boolean> {
    if (this.workletLoaded) return true;
    if (!this.workletSupported || !ctx.audioWorklet) {
      this.workletSupported = false;
      return false;
    }
    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      this.workletLoaded = true;
      return true;
    } catch {
      this.workletSupported = false;
      return false;
    }
  }

  private getOrCreateGain(runtime: SoundRuntime): GainNode {
    if (runtime.gain && this.ctx) return runtime.gain;
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterGain!);
    runtime.gain = gain;
    return gain;
  }

  // ---------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------

  /** Must be called from within a user-gesture event handler. */
  async play(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this.isRunning = true;

    const startups: Promise<void>[] = [];
    for (const runtime of this.runtimes.values()) {
      if (runtime.state.on && !runtime.source) {
        startups.push(this.startSound(runtime));
      }
    }
    await Promise.all(startups);
    this.emitMaster();
  }

  async pause(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
    this.isRunning = false;
    this.emitMaster();
  }

  setMasterVolume(value: number) {
    this.masterVolume = clamp01(value);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.01);
    }
    this.schedulePersist();
    this.emitMaster();
  }

  // ---------------------------------------------------------------------
  // Per-sound control
  // ---------------------------------------------------------------------

  async toggleSound(id: string): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this.isRunning = true;

    if (runtime.state.on) {
      this.stopSound(runtime);
      runtime.state.on = false;
    } else {
      runtime.state.on = true;
      await this.startSound(runtime);
    }

    this.emitSound(runtime);
    this.emitMaster();
    this.schedulePersist();
  }

  setSoundVolume(id: string, value: number) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.state.volume = clamp01(value);
    if (runtime.gain && this.ctx) {
      runtime.gain.gain.setTargetAtTime(runtime.state.volume, this.ctx.currentTime, 0.01);
    }
    this.schedulePersist();
  }

  private async startSound(runtime: SoundRuntime): Promise<void> {
    const ctx = this.ensureContext();
    const gain = this.getOrCreateGain(runtime);

    runtime.state.loading = true;
    this.emitSound(runtime);

    try {
      if (runtime.def.kind === 'noise') {
        const node = await this.createNoiseNode(ctx, runtime.def.noiseType!);
        node.connect(gain);
        runtime.source = node;
      } else {
        const buffer = await this.getBuffer(ctx, runtime.def);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = runtime.loopStart;
        source.loopEnd = runtime.loopEnd;
        source.connect(gain);
        source.start(0);
        runtime.source = source;
      }

      runtime.state.unavailable = false;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(runtime.state.volume, ctx.currentTime + FADE_SECONDS);
    } catch {
      runtime.state.on = false;
      runtime.state.unavailable = true;
      runtime.source = null;
    } finally {
      runtime.state.loading = false;
      this.emitSound(runtime);
    }
  }

  private stopSound(runtime: SoundRuntime) {
    const { source, gain } = runtime;
    if (!source) return;

    const ctx = this.ctx;
    if (gain && ctx) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    }

    // Let the fade finish audibly before actually tearing down the node.
    window.setTimeout(
      () => {
        try {
          if (source instanceof AudioBufferSourceNode) {
            source.stop();
          }
          source.disconnect();
        } catch {
          // Already stopped/disconnected — safe to ignore.
        }
      },
      FADE_SECONDS * 1000 + 50
    );

    runtime.source = null;
  }

  private async createNoiseNode(
    ctx: AudioContext,
    type: 'white' | 'pink' | 'brown'
  ): Promise<AudioWorkletNode | ScriptProcessorNode> {
    const hasWorklet = await this.ensureWorklet(ctx);

    if (hasWorklet) {
      return new AudioWorkletNode(ctx, 'noise-processor', {
        processorOptions: { type },
      });
    }

    // Fallback for browsers without AudioWorklet support.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    let lastOut = 0;
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;

    node.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0);
      for (let i = 0; i < output.length; i++) {
        const white = Math.random() * 2 - 1;
        let sample: number;
        if (type === 'pink') {
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.969 * b2 + white * 0.153852;
          b3 = 0.8665 * b3 + white * 0.3104856;
          b4 = 0.55 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.016898;
          sample = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          b6 = white * 0.115926;
          sample *= 0.11;
        } else if (type === 'brown') {
          sample = (lastOut + 0.02 * white) / 1.02;
          lastOut = sample;
          sample *= 3.5;
        } else {
          sample = white * 0.9;
        }
        output[i] = Math.max(-1, Math.min(1, sample));
      }
    };

    return node;
  }

  /** Fetches, decodes, and caches a sound's buffer (and its loop points) the
   *  first time it's needed — never on page load — so re-toggling later is
   *  instant. */
  private async getBuffer(ctx: AudioContext, def: SoundDef): Promise<AudioBuffer> {
    const runtime = this.runtimes.get(def.id)!;
    if (runtime.buffer) return runtime.buffer;

    const response = await fetch(`${BASE}sounds/${def.file}`);
    if (!response.ok) {
      throw new Error(`Missing audio file: ${def.file}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const { loopStart, loopEnd } = findSeamlessLoopPoints(buffer);

    runtime.buffer = buffer;
    runtime.loopStart = loopStart;
    runtime.loopEnd = loopEnd;
    return buffer;
  }

  // ---------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------

  async applyPreset(preset: Preset): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this.isRunning = true;

    const tasks: Promise<void>[] = [];
    for (const runtime of this.runtimes.values()) {
      const targetVolume = preset.mix[runtime.def.id];
      if (typeof targetVolume === 'number') {
        // runtime.state.volume is set to the preset's value FIRST, before
        // either branch below runs, and nothing after this point ever
        // resets it back to def.defaultVolume — startSound() (for a
        // sound that's off or still lazy-loading) ramps its gain to
        // whatever runtime.state.volume holds once ready, which is this
        // preset value; the in-place ramp branch below uses the same
        // `targetVolume` directly. Either way the preset value is final.
        runtime.state.volume = targetVolume;
        if (runtime.state.on && runtime.source) {
          // Already playing and staying on — cross-fade to the new volume
          // in place rather than restarting it (avoids an audible restart
          // and a leaked duplicate source playing underneath).
          const gain = this.getOrCreateGain(runtime);
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(targetVolume, ctx.currentTime + FADE_SECONDS);
        } else {
          runtime.state.on = true;
          tasks.push(this.startSound(runtime));
        }
      } else if (runtime.state.on) {
        this.stopSound(runtime);
        runtime.state.on = false;
      }
    }
    await Promise.all(tasks);

    for (const runtime of this.runtimes.values()) {
      this.emitSound(runtime);
    }
    this.emitMaster();
    this.schedulePersist();
  }

  /** Stops everything (with the usual fade), restores every sound and the
   *  master volume to their defaults, cancels any sleep timer, and clears
   *  the saved mix so a refresh doesn't bring the old mix back. */
  async resetAll(): Promise<void> {
    this.cancelSleepTimer(false);

    for (const runtime of this.runtimes.values()) {
      if (runtime.state.on) {
        this.stopSound(runtime);
        runtime.state.on = false;
      }
      runtime.state.volume = runtime.def.defaultVolume;
      runtime.state.unavailable = false;
      this.emitSound(runtime);
    }

    this.masterVolume = DEFAULT_MASTER_VOLUME;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.01);
    }

    this.isRunning = false;
    this.emitMaster();
    this.emitSleep();

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked — nothing to clear.
    }
  }

  // ---------------------------------------------------------------------
  // Sleep timer
  // ---------------------------------------------------------------------

  startSleepTimer(minutes: number) {
    this.cancelSleepTimer(false);

    const totalMs = Math.max(1, minutes) * 60_000;
    const fadeMs = Math.min(20_000, totalMs * 0.2);
    const now = Date.now();
    this.sleepEndsAt = now + totalMs;
    this.sleepFadeStartsAt = now + totalMs - fadeMs;

    const fadeTimeout = window.setTimeout(() => {
      if (this.sleepGain && this.ctx) {
        this.sleepGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.sleepGain.gain.setValueAtTime(this.sleepGain.gain.value, this.ctx.currentTime);
        this.sleepGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeMs / 1000);
      }
    }, Math.max(0, totalMs - fadeMs));

    const endTimeout = window.setTimeout(() => {
      for (const runtime of this.runtimes.values()) {
        if (runtime.state.on) {
          this.stopSound(runtime);
          runtime.state.on = false;
          this.emitSound(runtime);
        }
      }
      if (this.sleepGain && this.ctx) {
        this.sleepGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.sleepGain.gain.setValueAtTime(1, this.ctx.currentTime);
      }
      this.ctx?.suspend();
      this.isRunning = false;
      this.sleepEndsAt = null;
      this.sleepFadeStartsAt = null;
      this.emitMaster();
      this.emitSleep();
      this.schedulePersist();
    }, totalMs);

    this.sleepTimeouts = [fadeTimeout, endTimeout];

    this.sleepInterval = window.setInterval(() => this.emitSleep(), 1000);
    this.emitSleep();
  }

  cancelSleepTimer(notify = true) {
    for (const id of this.sleepTimeouts) window.clearTimeout(id);
    this.sleepTimeouts = [];
    if (this.sleepInterval !== null) {
      window.clearInterval(this.sleepInterval);
      this.sleepInterval = null;
    }
    if (this.sleepGain && this.ctx) {
      this.sleepGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.sleepGain.gain.setValueAtTime(1, this.ctx.currentTime);
    }
    this.sleepEndsAt = null;
    this.sleepFadeStartsAt = null;
    if (notify) this.emitSleep();
  }

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------

  /** A shared-link mix (?mix=id:vol,...&vol=NN) takes priority over
   *  localStorage for this page load. This only ever sets in-memory state
   *  (on/volume) — it never starts audio, since that requires a user
   *  gesture; the transport stays paused until the user presses play. */
  private loadInitialState() {
    const shared = typeof window !== 'undefined' ? parseSharedMix(new URLSearchParams(window.location.search)) : null;

    if (shared) {
      for (const [id, volume] of Object.entries(shared.sounds)) {
        const runtime = this.runtimes.get(id);
        if (!runtime) continue;
        runtime.state.on = true;
        runtime.state.volume = volume;
      }
      if (shared.masterVolume !== null) {
        this.masterVolume = shared.masterVolume;
      }
      this.sharedMixApplied = true;
      return;
    }

    this.loadPersisted();
  }

  private loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: PersistedState = JSON.parse(raw);
      if (typeof parsed.masterVolume === 'number') {
        this.masterVolume = clamp01(parsed.masterVolume);
      }
      for (const [id, saved] of Object.entries(parsed.sounds || {})) {
        const runtime = this.runtimes.get(id);
        if (!runtime) continue;
        runtime.state.on = Boolean(saved.on);
        if (typeof saved.volume === 'number') {
          runtime.state.volume = clamp01(saved.volume);
        }
      }
    } catch {
      // Corrupt/blocked storage — fall back to defaults silently.
    }
  }

  private schedulePersist() {
    if (this.persistTimeout !== null) window.clearTimeout(this.persistTimeout);
    this.persistTimeout = window.setTimeout(() => this.persistNow(), 300);
  }

  private persistNow() {
    const sounds: PersistedState['sounds'] = {};
    for (const runtime of this.runtimes.values()) {
      sounds[runtime.def.id] = { on: runtime.state.on, volume: runtime.state.volume };
    }
    const payload: PersistedState = { masterVolume: this.masterVolume, sounds };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full/blocked — nothing we can do, skip silently.
    }
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  onSoundChange(listener: Listener<{ id: string; state: SoundState }>) {
    this.addEventListener('soundchange', (e) => listener((e as CustomEvent).detail));
  }

  onMasterChange(listener: Listener<{ isRunning: boolean; masterVolume: number }>) {
    this.addEventListener('masterchange', (e) => listener((e as CustomEvent).detail));
  }

  onSleepUpdate(listener: Listener<{ remainingMs: number | null }>) {
    this.addEventListener('sleepupdate', (e) => listener((e as CustomEvent).detail));
  }

  private emitSound(runtime: SoundRuntime) {
    this.dispatchEvent(
      new CustomEvent('soundchange', { detail: { id: runtime.def.id, state: { ...runtime.state } } })
    );
  }

  private emitMaster() {
    this.updatePlaybackState();
    this.dispatchEvent(
      new CustomEvent('masterchange', { detail: { isRunning: this.isRunning, masterVolume: this.masterVolume } })
    );
  }

  private emitSleep() {
    this.dispatchEvent(new CustomEvent('sleepupdate', { detail: { remainingMs: this.sleepRemainingMs } }));
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Picks loop boundaries that avoid both a silent gap and an audible
 * click/pop at the seam: trims any near-silent padding at each edge, then
 * snaps to the lowest-amplitude sample nearby (close to a zero-crossing) so
 * the signal value doesn't jump discontinuously when the loop wraps.
 * Approximated on channel 0 only — a reasonable simplification for the
 * ambient/texture source material this app uses.
 */
function findSeamlessLoopPoints(buffer: AudioBuffer): { loopStart: number; loopEnd: number } {
  const data = buffer.getChannelData(0);
  const length = data.length;
  const sampleRate = buffer.sampleRate;

  const silenceThreshold = 0.015;
  const maxTrim = Math.min(length >> 1, Math.floor(sampleRate * 0.5)); // trim at most 0.5s per edge

  let start = 0;
  while (start < maxTrim && Math.abs(data[start]) < silenceThreshold) start++;

  let end = length - 1;
  const minEnd = length - maxTrim;
  while (end > minEnd && Math.abs(data[end]) < silenceThreshold) end--;

  const searchWindow = Math.min(2000, Math.floor(sampleRate * 0.05));
  start = snapToLowAmplitude(data, start, searchWindow, 1);
  end = snapToLowAmplitude(data, end, searchWindow, -1);

  if (end <= start) {
    return { loopStart: 0, loopEnd: buffer.duration };
  }

  return { loopStart: start / sampleRate, loopEnd: end / sampleRate };
}

/** Searches up to `searchWindow` samples in `direction` for a lower-amplitude
 *  sample than the one at `index`, to land the loop edge near a zero
 *  crossing instead of an arbitrary (possibly high-amplitude) sample. */
function snapToLowAmplitude(data: Float32Array, index: number, searchWindow: number, direction: 1 | -1): number {
  let best = index;
  let bestAbs = Math.abs(data[index] ?? 0);
  const limit = direction === 1 ? Math.min(data.length - 1, index + searchWindow) : Math.max(0, index - searchWindow);

  for (let i = index; direction === 1 ? i <= limit : i >= limit; i += direction) {
    const value = Math.abs(data[i]);
    if (value < bestAbs) {
      bestAbs = value;
      best = i;
    }
    if (value < 0.001) break;
  }

  return best;
}

export { SOUNDS, PRESETS };
