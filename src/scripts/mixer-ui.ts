import { AudioEngine, SOUNDS, PRESETS } from './audio-engine';

export function initMixer() {
  const engine = new AudioEngine();

  const grid = document.getElementById('sound-grid');
  if (!grid) return; // Mixer not on this page.

  const masterToggle = document.getElementById('master-toggle') as HTMLButtonElement;
  const masterIconPlay = document.getElementById('master-icon-play')!;
  const masterIconPause = document.getElementById('master-icon-pause')!;
  const masterStatus = document.getElementById('master-status')!;
  const masterVolume = document.getElementById('master-volume') as HTMLInputElement;

  const sleepCountdown = document.getElementById('sleep-countdown')!;
  const sleepCancel = document.getElementById('sleep-cancel') as HTMLButtonElement;
  const sleepCustomInput = document.getElementById('sleep-custom') as HTMLInputElement;
  const sleepCustomStart = document.getElementById('sleep-custom-start') as HTMLButtonElement;

  // ---------------------------------------------------------------------
  // Sound cards
  // ---------------------------------------------------------------------

  const cards = new Map<string, HTMLElement>();
  for (const sound of SOUNDS) {
    const card = grid.querySelector<HTMLElement>(`[data-sound-id="${sound.id}"]`);
    if (!card) continue;
    cards.set(sound.id, card);

    const toggleBtn = card.querySelector<HTMLButtonElement>('[data-role="toggle"]')!;
    const volumeInput = card.querySelector<HTMLInputElement>('[data-role="volume"]')!;

    // Reflect any state restored from localStorage before first paint interaction.
    const initial = engine.getSoundState(sound.id);
    if (initial) {
      volumeInput.value = String(Math.round(initial.volume * 100));
      applyCardOnState(card, toggleBtn, initial.on);
    }

    toggleBtn.addEventListener('click', () => {
      void engine.toggleSound(sound.id);
    });

    volumeInput.addEventListener('input', () => {
      engine.setSoundVolume(sound.id, Number(volumeInput.value) / 100);
    });
  }

  engine.onSoundChange(({ id, state }) => {
    const card = cards.get(id);
    if (!card) return;
    const toggleBtn = card.querySelector<HTMLButtonElement>('[data-role="toggle"]')!;
    const missingBadge = card.querySelector<HTMLElement>('[data-role="missing"]')!;
    const volumeInput = card.querySelector<HTMLInputElement>('[data-role="volume"]')!;

    applyCardOnState(card, toggleBtn, state.on);
    volumeInput.value = String(Math.round(state.volume * 100));
    missingBadge.hidden = !state.unavailable;
  });

  function applyCardOnState(card: HTMLElement, toggleBtn: HTMLButtonElement, on: boolean) {
    card.dataset.on = String(on);
    toggleBtn.setAttribute('aria-pressed', String(on));
    const status = card.querySelector<HTMLElement>('[data-role="status"]')!;
    status.textContent = on ? 'Playing' : 'Tap to play';
  }

  // ---------------------------------------------------------------------
  // Master transport
  // ---------------------------------------------------------------------

  masterVolume.value = String(Math.round(engine.master * 100));

  masterToggle.addEventListener('click', () => {
    if (engine.running) {
      void engine.pause();
    } else {
      void engine.play();
    }
  });

  masterVolume.addEventListener('input', () => {
    engine.setMasterVolume(Number(masterVolume.value) / 100);
  });

  engine.onMasterChange(({ isRunning }) => {
    masterToggle.setAttribute('aria-pressed', String(isRunning));
    masterIconPlay.classList.toggle('hidden', isRunning);
    masterIconPause.classList.toggle('hidden', !isRunning);
    masterStatus.textContent = isRunning ? 'Playing' : 'Paused';
  });

  // ---------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------

  document.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = PRESETS.find((p) => p.id === btn.dataset.presetId);
      if (preset) void engine.applyPreset(preset);
    });
  });

  // ---------------------------------------------------------------------
  // Sleep timer
  // ---------------------------------------------------------------------

  document.querySelectorAll<HTMLButtonElement>('.sleep-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const minutes = Number(btn.dataset.minutes);
      if (minutes > 0) engine.startSleepTimer(minutes);
    });
  });

  sleepCustomStart.addEventListener('click', () => {
    const minutes = Number(sleepCustomInput.value);
    if (minutes > 0 && minutes <= 480) {
      engine.startSleepTimer(minutes);
    }
  });

  sleepCancel.addEventListener('click', () => {
    engine.cancelSleepTimer();
  });

  engine.onSleepUpdate(({ remainingMs }) => {
    if (remainingMs === null) {
      sleepCountdown.hidden = true;
      sleepCancel.hidden = true;
      return;
    }
    sleepCountdown.hidden = false;
    sleepCancel.hidden = false;
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    sleepCountdown.textContent = `${mins}:${String(secs).padStart(2, '0')} remaining`;
  });
}
