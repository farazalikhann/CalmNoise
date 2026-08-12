import { SOUNDS, PRESETS, type SoundDef, type Preset } from '../config/sounds';
import { BASE } from '../utils/base';

const STORAGE_KEY = 'calmnoise:mix:v1';
// Base-aware — resolves correctly whether deployed at the domain root or
// under a GitHub Pages project path like /CalmNoise/.
const WORKLET_URL = `${BASE}worklets/noise-processor.js`;
const RAMP_SECONDS = 0.05;

export interface SoundState {
  on: boolean;
  volume: number; // 0..1
  unavailable: boolean;
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
  private masterVolume = 0.8;
  private isRunning = false;

  private sleepEndsAt: number | null = null;
  private sleepFadeStartsAt: number | null = null;
  private sleepTimeouts: number[] = [];
  private sleepInterval: number | null = null;

  private persistTimeout: number | null = null;

  constructor() {
    super();
    for (const def of SOUNDS) {
      this.runtimes.set(def.id, {
        def,
        gain: null,
        source: null,
        buffer: null,
        state: { on: false, volume: def.defaultVolume, unavailable: false },
      });
    }
    this.loadPersisted();
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

    return ctx;
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
        source.connect(gain);
        source.start(0);
        runtime.source = source;
      }

      runtime.state.unavailable = false;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(runtime.state.volume, ctx.currentTime + RAMP_SECONDS);
    } catch (err) {
      runtime.state.on = false;
      runtime.state.unavailable = true;
      runtime.source = null;
      this.emitSound(runtime);
    }
  }

  private stopSound(runtime: SoundRuntime) {
    const { source, gain } = runtime;
    if (!source) return;

    const ctx = this.ctx;
    if (gain && ctx) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    }

    // Give the fade a moment before actually tearing down the node.
    window.setTimeout(() => {
      try {
        if (source instanceof AudioBufferSourceNode) {
          source.stop();
        }
        source.disconnect();
      } catch {
        // Already stopped/disconnected — safe to ignore.
      }
    }, 120);

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

  private async getBuffer(ctx: AudioContext, def: SoundDef): Promise<AudioBuffer> {
    const runtime = this.runtimes.get(def.id)!;
    if (runtime.buffer) return runtime.buffer;

    const response = await fetch(`${BASE}sounds/${def.file}`);
    if (!response.ok) {
      throw new Error(`Missing audio file: ${def.file}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    runtime.buffer = buffer;
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
        runtime.state.volume = targetVolume;
        runtime.state.on = true;
        tasks.push(this.startSound(runtime));
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

export { SOUNDS, PRESETS };
