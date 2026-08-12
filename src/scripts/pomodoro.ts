// Pure Pomodoro state machine — no audio, no DOM. Deliberately independent
// of AudioEngine's sleep timer (separate class, separate setInterval/
// setTimeout ids) so the two can run at once without conflicting; the UI
// layer (pomodoro-ui.ts) is what bridges phase changes to the mixer (for
// ducking), a chime, notifications, and the tab title.

const STORAGE_KEY = 'calmnoise:pomodoro:v1';
const SESSIONS_BEFORE_LONG_BREAK = 4;

const DEFAULT_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
};

export type PomodoroPhase = 'focus' | 'short-break' | 'long-break';

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
}

export interface PomodoroState {
  phase: PomodoroPhase;
  isRunning: boolean;
  remainingMs: number;
  /** Focus sessions completed since the last long break (0-4). */
  sessionCount: number;
  settings: PomodoroSettings;
}

type Listener<T> = (detail: T) => void;

export class PomodoroTimer extends EventTarget {
  private settings: PomodoroSettings = { ...DEFAULT_SETTINGS };
  private phase: PomodoroPhase = 'focus';
  private sessionCount = 0;
  private isRunning = false;
  private endsAt: number | null = null;
  private remainingMsAtPause: number | null = null;
  private tickInterval: number | null = null;
  private phaseTimeout: number | null = null;

  constructor() {
    super();
    this.loadSettings();
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  get currentSettings(): PomodoroSettings {
    return { ...this.settings };
  }

  get currentPhase(): PomodoroPhase {
    return this.phase;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get sessionsCompleted(): number {
    return this.sessionCount;
  }

  get remainingMs(): number {
    if (this.isRunning && this.endsAt !== null) {
      return Math.max(0, this.endsAt - Date.now());
    }
    if (this.remainingMsAtPause !== null) {
      return this.remainingMsAtPause;
    }
    return this.phaseDurationMs(this.phase);
  }

  get state(): PomodoroState {
    return this.snapshot();
  }

  // ---------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------

  /** Must be called from within a user-gesture handler (browsers require
   *  one for the eventual Notification permission prompt to work). */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const remaining = this.remainingMsAtPause ?? this.phaseDurationMs(this.phase);
    this.remainingMsAtPause = null;
    this.endsAt = Date.now() + remaining;
    this.scheduleTick();
    this.schedulePhaseEnd(remaining);
    this.emitStateChange();
  }

  pause() {
    if (!this.isRunning) return;
    this.remainingMsAtPause = this.remainingMs;
    this.isRunning = false;
    this.endsAt = null;
    this.clearTimers();
    this.emitStateChange();
  }

  reset() {
    this.clearTimers();
    this.isRunning = false;
    this.endsAt = null;
    this.remainingMsAtPause = null;
    this.phase = 'focus';
    this.sessionCount = 0;
    this.emitStateChange();
  }

  /** Validates and clamps (1-180 minutes per phase), persists, and — if the
   *  timer is currently idle — immediately reflects the new duration. */
  updateSettings(partial: Partial<PomodoroSettings>) {
    this.settings = {
      focusMinutes: clampMinutes(partial.focusMinutes ?? this.settings.focusMinutes, this.settings.focusMinutes),
      shortBreakMinutes: clampMinutes(
        partial.shortBreakMinutes ?? this.settings.shortBreakMinutes,
        this.settings.shortBreakMinutes
      ),
      longBreakMinutes: clampMinutes(partial.longBreakMinutes ?? this.settings.longBreakMinutes, this.settings.longBreakMinutes),
    };
    this.persistSettings();
    if (!this.isRunning) {
      this.remainingMsAtPause = null;
      this.emitTick();
    }
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private phaseDurationMs(phase: PomodoroPhase): number {
    const minutes =
      phase === 'focus'
        ? this.settings.focusMinutes
        : phase === 'short-break'
          ? this.settings.shortBreakMinutes
          : this.settings.longBreakMinutes;
    return minutes * 60_000;
  }

  private scheduleTick() {
    if (this.tickInterval !== null) window.clearInterval(this.tickInterval);
    this.tickInterval = window.setInterval(() => this.emitTick(), 1000);
  }

  private schedulePhaseEnd(ms: number) {
    if (this.phaseTimeout !== null) window.clearTimeout(this.phaseTimeout);
    this.phaseTimeout = window.setTimeout(() => this.advancePhase(), ms);
  }

  private advancePhase() {
    const endedPhase = this.phase;

    if (endedPhase === 'focus') {
      this.sessionCount++;
      this.phase = this.sessionCount % SESSIONS_BEFORE_LONG_BREAK === 0 ? 'long-break' : 'short-break';
    } else {
      this.phase = 'focus';
      if (endedPhase === 'long-break') {
        this.sessionCount = 0;
      }
    }

    const duration = this.phaseDurationMs(this.phase);
    this.endsAt = Date.now() + duration;
    this.schedulePhaseEnd(duration);

    this.dispatchEvent(new CustomEvent('phaseend', { detail: { endedPhase, newPhase: this.phase } }));
    this.emitStateChange();
  }

  private clearTimers() {
    if (this.tickInterval !== null) {
      window.clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.phaseTimeout !== null) {
      window.clearTimeout(this.phaseTimeout);
      this.phaseTimeout = null;
    }
  }

  private snapshot(): PomodoroState {
    return {
      phase: this.phase,
      isRunning: this.isRunning,
      remainingMs: this.remainingMs,
      sessionCount: this.sessionCount,
      settings: { ...this.settings },
    };
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  onTick(listener: Listener<PomodoroState>) {
    this.addEventListener('tick', (e) => listener((e as CustomEvent).detail));
  }

  onStateChange(listener: Listener<PomodoroState>) {
    this.addEventListener('statechange', (e) => listener((e as CustomEvent).detail));
  }

  onPhaseEnd(listener: Listener<{ endedPhase: PomodoroPhase; newPhase: PomodoroPhase }>) {
    this.addEventListener('phaseend', (e) => listener((e as CustomEvent).detail));
  }

  private emitTick() {
    this.dispatchEvent(new CustomEvent('tick', { detail: this.snapshot() }));
  }

  private emitStateChange() {
    this.dispatchEvent(new CustomEvent('statechange', { detail: this.snapshot() }));
  }

  // ---------------------------------------------------------------------
  // Persistence — settings only. A running/paused timer is never persisted,
  // so a reload always comes back idle on a fresh Focus phase.
  // ---------------------------------------------------------------------

  private loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.settings = {
        focusMinutes: clampMinutes(parsed.focusMinutes, DEFAULT_SETTINGS.focusMinutes),
        shortBreakMinutes: clampMinutes(parsed.shortBreakMinutes, DEFAULT_SETTINGS.shortBreakMinutes),
        longBreakMinutes: clampMinutes(parsed.longBreakMinutes, DEFAULT_SETTINGS.longBreakMinutes),
      };
    } catch {
      // Corrupt/blocked storage — defaults already in place.
    }
  }

  private persistSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage blocked/full — nothing to do.
    }
  }
}

function clampMinutes(value: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(180, Math.max(1, n));
}
