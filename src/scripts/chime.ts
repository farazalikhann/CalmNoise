// A short, soft two-tone chime for Pomodoro phase changes, synthesized
// entirely with the Web Audio API — no audio file needed. Uses its own tiny
// AudioContext, completely independent of the mixer's: it works even if no
// sounds are currently playing, and its volume is unaffected by the mixer's
// master volume or the Pomodoro duck (a phase-change cue should stay
// reliably audible regardless of how quiet the ambience currently is).

let chimeCtx: AudioContext | null = null;

function ensureChimeContext(): AudioContext | null {
  if (chimeCtx) return chimeCtx;
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;
  chimeCtx = new AudioContextCtor();
  return chimeCtx;
}

/**
 * Call once from within a user-gesture handler (the timer's Start button)
 * so the context is already running by the time a later phase-end chime
 * needs to play from a setTimeout callback, which isn't itself a gesture
 * and so can't create/resume an AudioContext on its own.
 */
export function primeChime() {
  const ctx = ensureChimeContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
}

/** Plays a soft two-note chime (a gentle fifth, quick attack, slow decay). */
export function playChime() {
  const ctx = ensureChimeContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const now = ctx.currentTime;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(0.3, now + 0.06);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
  envelope.connect(ctx.destination);

  for (const frequency of [660, 990]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    osc.connect(envelope);
    osc.start(now);
    osc.stop(now + 1.9);
  }
}
