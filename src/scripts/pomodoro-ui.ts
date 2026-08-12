import { PomodoroTimer, type PomodoroPhase, type PomodoroState } from './pomodoro';
import { primeChime, playChime } from './chime';
import { engine } from './engine-instance';
import { BASE } from '../utils/base';

const DUCK_FACTOR = 0.3;
const SESSIONS_PER_CYCLE = 4;

export function initPomodoro() {
  const panel = document.getElementById('pomodoro-panel');
  if (!panel) return; // Not present on this page.

  const toggleBtn = document.getElementById('pomodoro-toggle') as HTMLButtonElement;
  const body = document.getElementById('pomodoro-body')!;
  const chevron = document.getElementById('pomodoro-chevron') as HTMLElement;
  const summary = document.getElementById('pomodoro-summary')!;

  const phaseLabelEl = document.getElementById('pomodoro-phase-label')!;
  const countdownEl = document.getElementById('pomodoro-countdown')!;
  const sessionLabelEl = document.getElementById('pomodoro-session-label')!;
  const dots = Array.from(document.querySelectorAll<HTMLElement>('#pomodoro-dots [data-dot]'));

  const startPauseBtn = document.getElementById('pomodoro-start-pause') as HTMLButtonElement;
  const startPauseLabel = document.getElementById('pomodoro-start-pause-label')!;
  const iconStart = document.getElementById('pomodoro-icon-start')!;
  const iconPause = document.getElementById('pomodoro-icon-pause')!;
  const resetBtn = document.getElementById('pomodoro-reset') as HTMLButtonElement;

  const focusInput = document.getElementById('pomodoro-focus-input') as HTMLInputElement;
  const shortInput = document.getElementById('pomodoro-short-input') as HTMLInputElement;
  const longInput = document.getElementById('pomodoro-long-input') as HTMLInputElement;

  const timer = new PomodoroTimer();

  const initialSettings = timer.currentSettings;
  focusInput.value = String(initialSettings.focusMinutes);
  shortInput.value = String(initialSettings.shortBreakMinutes);
  longInput.value = String(initialSettings.longBreakMinutes);

  // ---------------------------------------------------------------------
  // Collapse / expand
  // ---------------------------------------------------------------------

  toggleBtn.addEventListener('click', () => {
    const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', String(!expanded));
    body.classList.toggle('hidden', expanded);
    chevron.style.transform = expanded ? '' : 'rotate(180deg)';
  });

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  function phaseLabel(phase: PomodoroPhase): string {
    return phase === 'focus' ? 'Focus' : phase === 'short-break' ? 'Short Break' : 'Long Break';
  }

  function formatTime(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  let baseTitle = document.title;
  let wasRunning = false;

  function render(state: PomodoroState) {
    phaseLabelEl.textContent = phaseLabel(state.phase);
    countdownEl.textContent = formatTime(state.remainingMs);

    // sessionCount is "focus sessions completed since the last long break"
    // (0-4). During focus it's the count of PRIOR completed sessions this
    // cycle; during a break it's always 1-4, the session that just ended.
    const filledDots = state.sessionCount === 0 ? 0 : ((state.sessionCount - 1) % SESSIONS_PER_CYCLE) + 1;
    dots.forEach((dot, i) => {
      const filled = i < filledDots;
      dot.classList.toggle('bg-accent', filled);
      dot.classList.toggle('bg-white/20', !filled);
    });

    sessionLabelEl.textContent =
      state.phase === 'focus'
        ? `Session ${(state.sessionCount % SESSIONS_PER_CYCLE) + 1} of ${SESSIONS_PER_CYCLE}`
        : `Session ${state.sessionCount} of ${SESSIONS_PER_CYCLE} complete`;

    startPauseLabel.textContent = state.isRunning ? 'Pause' : 'Start';
    iconStart.classList.toggle('hidden', state.isRunning);
    iconPause.classList.toggle('hidden', !state.isRunning);
    startPauseBtn.setAttribute('aria-pressed', String(state.isRunning));

    summary.textContent = state.isRunning ? `${formatTime(state.remainingMs)} · ${phaseLabel(state.phase)}` : 'Off';

    focusInput.disabled = state.isRunning;
    shortInput.disabled = state.isRunning;
    longInput.disabled = state.isRunning;

    // Tab title — capture the pre-timer title fresh each time we start
    // running (it may reflect a shared-mix title set elsewhere), and
    // restore it once the timer stops being the active thing in the tab.
    if (state.isRunning) {
      if (!wasRunning) baseTitle = document.title;
      document.title = `${formatTime(state.remainingMs)} · ${phaseLabel(state.phase)}`;
    } else if (wasRunning) {
      document.title = baseTitle;
    }
    wasRunning = state.isRunning;
  }

  timer.onTick(render);
  timer.onStateChange(render);
  render(timer.state);

  // ---------------------------------------------------------------------
  // Phase-end effects: chime, notification, mixer ducking
  // ---------------------------------------------------------------------

  timer.onPhaseEnd(({ newPhase }) => {
    playChime();

    if (newPhase === 'focus') {
      engine.undoDuck();
    } else {
      engine.duck(DUCK_FACTOR);
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('CalmNoise Focus Timer', {
          body: `${phaseLabel(newPhase)} started.`,
          icon: `${BASE}icons/icon-192.png`,
          tag: 'calmnoise-pomodoro',
        });
      } catch {
        // Some browsers restrict the Notification constructor — ignore.
      }
    }
  });

  // ---------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------

  let notificationRequested = false;

  function requestNotificationPermissionOnce() {
    if (notificationRequested) return;
    notificationRequested = true;
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    void Notification.requestPermission().catch(() => {
      // Ignore — notifications are a progressive enhancement.
    });
  }

  startPauseBtn.addEventListener('click', () => {
    if (timer.running) {
      timer.pause();
      engine.undoDuck();
    } else {
      requestNotificationPermissionOnce();
      primeChime();
      timer.start();
      if (timer.currentPhase !== 'focus') {
        engine.duck(DUCK_FACTOR);
      }
    }
  });

  resetBtn.addEventListener('click', () => {
    timer.reset();
    engine.undoDuck();
  });

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------

  function applySettingsFromInputs() {
    timer.updateSettings({
      focusMinutes: Number(focusInput.value),
      shortBreakMinutes: Number(shortInput.value),
      longBreakMinutes: Number(longInput.value),
    });
    const settings = timer.currentSettings;
    focusInput.value = String(settings.focusMinutes);
    shortInput.value = String(settings.shortBreakMinutes);
    longInput.value = String(settings.longBreakMinutes);
  }

  [focusInput, shortInput, longInput].forEach((input) => {
    input.addEventListener('change', applySettingsFromInputs);
  });
}
