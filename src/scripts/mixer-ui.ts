import { SOUNDS, PRESETS, type SoundState } from './audio-engine';
import { buildShareURL } from '../utils/mix-share';
import { engine } from './engine-instance';

export function initMixer() {
  const grid = document.getElementById('sound-grid');
  if (!grid) return; // Mixer not on this page.

  const masterToggle = document.getElementById('master-toggle') as HTMLButtonElement;
  const masterIconPlay = document.getElementById('master-icon-play')!;
  const masterIconPause = document.getElementById('master-icon-pause')!;
  const masterStatus = document.getElementById('master-status')!;
  const masterHint = document.getElementById('master-hint');
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
      applyCardState(card, toggleBtn, initial);
    }

    toggleBtn.addEventListener('click', () => {
      void engine.toggleSound(sound.id);
      setActivePreset(null);
    });

    volumeInput.addEventListener('input', () => {
      engine.setSoundVolume(sound.id, Number(volumeInput.value) / 100);
      setActivePreset(null);
    });
  }

  engine.onSoundChange(({ id, state }) => {
    const card = cards.get(id);
    if (!card) return;
    const toggleBtn = card.querySelector<HTMLButtonElement>('[data-role="toggle"]')!;
    const missingBadge = card.querySelector<HTMLElement>('[data-role="missing"]')!;
    const volumeInput = card.querySelector<HTMLInputElement>('[data-role="volume"]')!;

    applyCardState(card, toggleBtn, state);
    volumeInput.value = String(Math.round(state.volume * 100));
    missingBadge.hidden = !state.unavailable;
  });

  function applyCardState(card: HTMLElement, toggleBtn: HTMLButtonElement, state: SoundState) {
    card.dataset.on = String(state.on);
    card.dataset.loading = String(state.loading);
    toggleBtn.setAttribute('aria-pressed', String(state.on));
    toggleBtn.setAttribute('aria-busy', String(state.loading));
    const status = card.querySelector<HTMLElement>('[data-role="status"]')!;
    status.textContent = state.loading ? 'Loading…' : state.on ? 'Playing' : 'Tap to play';
  }

  // ---------------------------------------------------------------------
  // Shared-mix link restoration (visual only — never autoplays; playback
  // still only ever starts from an explicit user gesture, same as always)
  // ---------------------------------------------------------------------

  if (engine.restoredFromShare) {
    if (masterHint) {
      masterHint.textContent = 'A shared mix is ready — press play to start it.';
    }

    const activeSounds = SOUNDS.filter((s) => engine.getSoundState(s.id)?.on);
    if (activeSounds.length > 0) {
      const summary = activeSounds
        .map((s) => `${s.name} ${Math.round((engine.getSoundState(s.id)?.volume ?? 0) * 100)}%`)
        .join(', ');
      const shareTitle = 'Custom Mix — CalmNoise';
      const shareDescription = `A shared ambient sound mix: ${summary}. Listen free at CalmNoise — no sign-up required.`;

      document.title = shareTitle;
      setMetaContent('meta[property="og:title"]', shareTitle);
      setMetaContent('meta[property="og:description"]', shareDescription);
      setMetaContent('meta[name="twitter:title"]', shareTitle);
      setMetaContent('meta[name="twitter:description"]', shareDescription);
      setMetaContent('meta[name="description"]', shareDescription);
    }
  }

  function setMetaContent(selector: string, value: string) {
    document.querySelector(selector)?.setAttribute('content', value);
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
    setActivePreset(null);
  });

  engine.onMasterChange(({ isRunning, masterVolume: vol }) => {
    masterToggle.setAttribute('aria-pressed', String(isRunning));
    masterIconPlay.classList.toggle('hidden', isRunning);
    masterIconPause.classList.toggle('hidden', !isRunning);
    masterStatus.textContent = isRunning ? 'Playing' : 'Paused';
    masterVolume.value = String(Math.round(vol * 100));
  });

  // ---------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------

  const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.preset-btn'));

  // Highlights whichever preset was last applied; cleared the moment the
  // user manually changes a sound's on/off state or any volume, since the
  // mix no longer necessarily matches that preset.
  function setActivePreset(id: string | null) {
    for (const btn of presetButtons) {
      btn.dataset.active = String(btn.dataset.presetId === id);
    }
  }

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = PRESETS.find((p) => p.id === btn.dataset.presetId);
      if (!preset) return;
      void engine.applyPreset(preset);
      setActivePreset(preset.id);
    });
  });

  document.getElementById('reset-mix')?.addEventListener('click', () => {
    void engine.resetAll();
    setActivePreset(null);
  });

  // ---------------------------------------------------------------------
  // Share
  // ---------------------------------------------------------------------

  const shareToast = document.getElementById('share-toast');
  let shareToastTimeout: number | null = null;

  function showToast(message: string) {
    if (!shareToast) return;
    shareToast.textContent = message;
    shareToast.style.opacity = '1';
    if (shareToastTimeout !== null) window.clearTimeout(shareToastTimeout);
    shareToastTimeout = window.setTimeout(() => {
      shareToast.style.opacity = '0';
    }, 2400);
  }

  document.getElementById('share-mix')?.addEventListener('click', () => {
    const activeSounds = SOUNDS.filter((s) => engine.getSoundState(s.id)?.on).map((s) => ({
      id: s.id,
      volumePercent: Math.round((engine.getSoundState(s.id)?.volume ?? 0) * 100),
    }));
    const shareUrl = buildShareURL(activeSounds, Math.round(engine.master * 100));

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => showToast('Link copied to clipboard'))
        .catch(() => window.prompt('Copy this link to share your mix:', shareUrl));
    } else {
      window.prompt('Copy this link to share your mix:', shareUrl);
    }
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
