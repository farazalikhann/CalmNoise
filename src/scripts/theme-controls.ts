// Visual-only controls: background scene switching + Focus Mode.
// Deliberately has zero interaction with audio-engine.ts or mixer-ui.ts —
// this only ever toggles CSS classes and reads/writes its own localStorage
// key, entirely separate from the saved audio mix.

const BACKGROUND_STORAGE_KEY = 'calmnoise:background:v1';

export function initThemeControls() {
  const root = document.getElementById('scene-root');
  if (!root) return; // Not present on this page.

  const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-scene-layer]'));
  const swatchButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.scene-swatch-btn'));

  const pickerToggle = document.getElementById('scene-picker-toggle') as HTMLButtonElement | null;
  const pickerPanel = document.getElementById('scene-picker-panel') as HTMLElement | null;

  const focusToggle = document.getElementById('focus-toggle') as HTMLButtonElement | null;
  const focusIconEnter = document.getElementById('focus-icon-enter');
  const focusIconExit = document.getElementById('focus-icon-exit');

  // -------------------------------------------------------------------
  // Background scene
  // -------------------------------------------------------------------

  function applyTheme(id: string) {
    for (const layer of layers) {
      layer.classList.toggle('is-active', layer.dataset.themeId === id);
    }
    for (const btn of swatchButtons) {
      const active = btn.dataset.themeId === id;
      btn.dataset.active = String(active);
      btn.setAttribute('aria-checked', String(active));
    }
  }

  function setTheme(id: string) {
    applyTheme(id);
    try {
      localStorage.setItem(BACKGROUND_STORAGE_KEY, id);
    } catch {
      // Storage blocked/full — theme still applies for this session.
    }
  }

  let savedTheme: string | null = null;
  try {
    savedTheme = localStorage.getItem(BACKGROUND_STORAGE_KEY);
  } catch {
    savedTheme = null;
  }
  const serverDefault = layers.find((l) => l.classList.contains('is-active'))?.dataset.themeId ?? layers[0]?.dataset.themeId;
  if (savedTheme && layers.some((l) => l.dataset.themeId === savedTheme)) {
    applyTheme(savedTheme);
  } else if (serverDefault) {
    applyTheme(serverDefault);
  }

  swatchButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.themeId;
      if (id) setTheme(id);
      closePanel();
    });
  });

  function openPanel() {
    if (!pickerPanel || !pickerToggle) return;
    pickerPanel.classList.remove('hidden');
    pickerToggle.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onKeydown);
  }

  function closePanel() {
    if (!pickerPanel || !pickerToggle) return;
    pickerPanel.classList.add('hidden');
    pickerToggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKeydown);
  }

  function onOutsideClick(event: MouseEvent) {
    if (!pickerPanel || !pickerToggle) return;
    const target = event.target as Node;
    if (!pickerPanel.contains(target) && !pickerToggle.contains(target)) {
      closePanel();
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closePanel();
  }

  pickerToggle?.addEventListener('click', () => {
    const isOpen = pickerPanel && !pickerPanel.classList.contains('hidden');
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });

  // -------------------------------------------------------------------
  // Focus mode — session-only (not persisted), pure CSS visibility toggle.
  // Does not stop, pause, or otherwise touch playback.
  // -------------------------------------------------------------------

  focusToggle?.addEventListener('click', () => {
    const isFocus = document.documentElement.classList.toggle('focus-mode');
    focusToggle.setAttribute('aria-pressed', String(isFocus));
    focusToggle.setAttribute('aria-label', isFocus ? 'Exit focus mode' : 'Enter focus mode');
    focusIconEnter?.classList.toggle('hidden', isFocus);
    focusIconExit?.classList.toggle('hidden', !isFocus);
    if (isFocus) closePanel();
  });
}
