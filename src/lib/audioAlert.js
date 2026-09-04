/**
 * Web Audio API based sound synthesizer for AquaGuard alerts.
 * Generates warning chimes and pulsing critical sirens without external audio files.
 */

let audioCtx = null;
let criticalInterval = null;
let isCriticalPlaying = false;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }

  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

/**
 * Unlock audio context on user interaction.
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    return ctx.resume();
  }
  return Promise.resolve();
}

/**
 * Plays a pleasant 2-tone melodic chime for WARNING / elevated risk alerts.
 */
export function playWarningChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.18); // A5
    gain2.gain.setValueAtTime(0.25, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.6);
  } catch (error) {
    console.warn("Could not play warning chime:", error);
  }
}

/**
 * Plays a single pulse of a high-urgency siren.
 */
function playSirenPulse() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    // Frequency sweeps from 750Hz up to 1050Hz then down to 750Hz
    osc.frequency.setValueAtTime(750, now);
    osc.frequency.linearRampToValueAtTime(1050, now + 0.25);
    osc.frequency.linearRampToValueAtTime(750, now + 0.5);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.52);

    // Low-pass filter to make the sawtooth alarm smooth rather than harsh
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.52);
  } catch (error) {
    console.warn("Could not play siren pulse:", error);
  }
}

/**
 * Starts continuous critical alarm siren until stopCriticalAlarm is called.
 */
export function startCriticalAlarm() {
  if (isCriticalPlaying) return;
  isCriticalPlaying = true;

  playSirenPulse();
  criticalInterval = window.setInterval(() => {
    playSirenPulse();
  }, 600);
}

/**
 * Stops the ongoing critical alarm siren.
 */
export function stopCriticalAlarm() {
  isCriticalPlaying = false;
  if (criticalInterval) {
    window.clearInterval(criticalInterval);
    criticalInterval = null;
  }
}

export function isAlarmPlaying() {
  return isCriticalPlaying;
}

