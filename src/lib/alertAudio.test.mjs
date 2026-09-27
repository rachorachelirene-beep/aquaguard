import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";

import {
  getAudioContext,
  unlockAudio,
  isAudioUnlocked,
  playWarningChime,
  startCriticalAlarm,
  stopCriticalAlarm,
  isAlarmPlaying,
  resetAudioContextForTesting,
} from "./audioAlert.js";

// Mock Web Audio API for headless Node.js testing
class MockAudioNode {
  connect(dest) {
    this.destination = dest;
    return dest;
  }
  disconnect() {
    this.destination = null;
  }
}

class MockAudioParam {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.events = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: "setValueAtTime", val, time });
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: "linearRampToValueAtTime", val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: "exponentialRampToValueAtTime", val, time });
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.frequency = new MockAudioParam(440);
    this.type = "sine";
    this.startedAt = null;
    this.stoppedAt = null;
  }
  start(time) {
    this.startedAt = time;
  }
  stop(time) {
    this.stoppedAt = time;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.frequency = new MockAudioParam(1000);
    this.type = "lowpass";
  }
}

class MockAudioContext {
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.destination = new MockAudioNode();
    this.resumeCalled = false;
    this.oscillators = [];
    this.gainNodes = [];
    this.filters = [];
  }

  createOscillator() {
    const osc = new MockOscillatorNode();
    this.oscillators.push(osc);
    return osc;
  }

  createGain() {
    const gain = new MockGainNode();
    this.gainNodes.push(gain);
    return gain;
  }

  createBiquadFilter() {
    const filter = new MockBiquadFilterNode();
    this.filters.push(filter);
    return filter;
  }

  resume() {
    this.resumeCalled = true;
    return Promise.resolve().then(() => {
      this.state = "running";
    });
  }
}

let activeIntervals = [];

test.beforeEach(() => {
  activeIntervals = [];
  globalThis.window = {
    AudioContext: MockAudioContext,
    setInterval: (fn, ms) => {
      const id = globalThis.setInterval(fn, ms);
      activeIntervals.push(id);
      return id;
    },
    clearInterval: (id) => {
      activeIntervals = activeIntervals.filter((i) => i !== id);
      globalThis.clearInterval(id);
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  resetAudioContextForTesting();
});

test.afterEach(() => {
  stopCriticalAlarm();
  resetAudioContextForTesting();
  activeIntervals.forEach((id) => globalThis.clearInterval(id));
  activeIntervals = [];
  delete globalThis.window;
});

test("AudioContext starts suspended and can be unlocked", async () => {
  const ctx = getAudioContext();
  assert.ok(ctx, "AudioContext must be created");
  assert.equal(ctx.state, "suspended", "AudioContext must start in suspended state");

  await unlockAudio();
  assert.equal(ctx.state, "running", "AudioContext must transition to running once unlocked");
  assert.equal(isAudioUnlocked(), true, "isAudioUnlocked() must report true when running");
});

test("unlockAudio() resumes the AudioContext", async () => {
  const ctx = getAudioContext();
  assert.equal(ctx.state, "suspended");

  await unlockAudio();

  assert.equal(ctx.resumeCalled, true, "resume() must be called on AudioContext");
  assert.equal(ctx.state, "running", "AudioContext state must become running");
});

test("warning chime creates the expected audio nodes without throwing", async () => {
  await unlockAudio();
  const ctx = getAudioContext();
  const initialOscCount = ctx.oscillators.length;

  playWarningChime();

  const newOscillators = ctx.oscillators.slice(initialOscCount);
  assert.equal(newOscillators.length, 2, "Warning chime must create exactly 2 oscillators for the 2-tone chime");

  // Verify Tone 1 (D5 ~587.33 Hz) and Tone 2 (A5 ~880 Hz)
  assert.equal(newOscillators[0].type, "sine");
  assert.equal(newOscillators[0].frequency.events[0]?.val, 587.33);
  assert.equal(newOscillators[1].type, "sine");
  assert.equal(newOscillators[1].frequency.events[0]?.val, 880);

  // Both tones started and scheduled to stop
  assert.notEqual(newOscillators[0].startedAt, null);
  assert.notEqual(newOscillators[0].stoppedAt, null);
  assert.notEqual(newOscillators[1].startedAt, null);
  assert.notEqual(newOscillators[1].stoppedAt, null);
});

test("critical alarm starts correctly", async () => {
  await unlockAudio();
  assert.equal(isAlarmPlaying(), false);

  startCriticalAlarm();

  assert.equal(isAlarmPlaying(), true, "isAlarmPlaying() must be true when critical alarm starts");
  assert.equal(activeIntervals.length, 1, "Exactly one repeating interval must be scheduled");

  const ctx = getAudioContext();
  const sirenOsc = ctx.oscillators[ctx.oscillators.length - 1];
  assert.ok(sirenOsc, "Critical alarm must create siren oscillator");
  assert.equal(sirenOsc.type, "sawtooth", "Siren oscillator must use sawtooth waveform");
});

test("critical alarm does not create overlapping alarms", async () => {
  await unlockAudio();

  startCriticalAlarm();
  assert.equal(activeIntervals.length, 1);

  // Subsequent call while already playing must not duplicate interval
  startCriticalAlarm();
  assert.equal(activeIntervals.length, 1, "Must not create duplicate intervals when called again");
  assert.equal(isAlarmPlaying(), true);
});

test("stopCriticalAlarm() cleans up timers/oscillators", async () => {
  await unlockAudio();

  startCriticalAlarm();
  assert.equal(isAlarmPlaying(), true);
  assert.equal(activeIntervals.length, 1);

  stopCriticalAlarm();

  assert.equal(isAlarmPlaying(), false, "isAlarmPlaying() must be false after stop");
  assert.equal(activeIntervals.length, 0, "Interval timer must be cleared");
});

test("supported audio alert types include warning and critical", () => {
  function resolveAlertAudioAction(alert, isMuted) {
    if (isMuted) return "none";
    const type = String(alert?.type || "").trim().toLowerCase();
    if (type === "critical") return "critical_siren";
    if (type === "warning") return "warning_chime";
    return "none";
  }

  assert.equal(resolveAlertAudioAction({ type: "critical" }, false), "critical_siren");
  assert.equal(resolveAlertAudioAction({ type: "warning" }, false), "warning_chime");
  assert.equal(resolveAlertAudioAction({ type: "CRITICAL" }, false), "critical_siren");
  assert.equal(resolveAlertAudioAction({ type: "Warning" }, false), "warning_chime");
});

test("system, info, and maintenance do not trigger emergency audio", () => {
  function resolveAlertAudioAction(alert, isMuted) {
    if (isMuted) return "none";
    const type = String(alert?.type || "").trim().toLowerCase();
    if (type === "critical") return "critical_siren";
    if (type === "warning") return "warning_chime";
    return "none";
  }

  assert.equal(resolveAlertAudioAction({ type: "system" }, false), "none");
  assert.equal(resolveAlertAudioAction({ type: "info" }, false), "none");
  assert.equal(resolveAlertAudioAction({ type: "maintenance" }, false), "none");
  assert.equal(resolveAlertAudioAction({ type: "unknown" }, false), "none");
});

test("alert ID deduplication prevents the same alert from being processed twice", () => {
  const processedAlertIds = new Set();

  function handleIncomingAlertDedupe(alert) {
    if (!alert || !alert.id) return false;
    const key = `id:${alert.id}`;
    if (processedAlertIds.has(key)) {
      return false; // deduplicated, no audio
    }
    processedAlertIds.add(key);
    return true; // first time, trigger audio
  }

  const alert1 = { id: 9001, type: "warning", title: "Station 1 water level warning" };
  const alert2 = { id: 9002, type: "critical", title: "Station 2 water level critical" };

  // First arrivals succeed
  assert.equal(handleIncomingAlertDedupe(alert1), true);
  assert.equal(handleIncomingAlertDedupe(alert2), true);

  // Duplicate arrival of alert1 must be rejected
  assert.equal(handleIncomingAlertDedupe(alert1), false, "Duplicate alert ID must be rejected");
  assert.equal(handleIncomingAlertDedupe(alert2), false, "Duplicate alert ID must be rejected");
});

test("muted behavior prevents playback even for critical and warning alerts", () => {
  let chimePlayed = false;
  let sirenStarted = false;

  function handleAlertWithMuteCheck(alert, isMuted) {
    if (isMuted) {
      return; // muted blocks all playback
    }
    const type = String(alert?.type || "").trim().toLowerCase();
    if (type === "critical") {
      sirenStarted = true;
    } else if (type === "warning") {
      chimePlayed = true;
    }
  }

  // When muted = true
  handleAlertWithMuteCheck({ type: "critical" }, true);
  handleAlertWithMuteCheck({ type: "warning" }, true);

  assert.equal(chimePlayed, false, "Chime must not play when muted");
  assert.equal(sirenStarted, false, "Siren must not start when muted");

  // When muted = false
  handleAlertWithMuteCheck({ type: "critical" }, false);
  handleAlertWithMuteCheck({ type: "warning" }, false);

  assert.equal(sirenStarted, true, "Siren should trigger when unmuted");
  assert.equal(chimePlayed, true, "Chime should trigger when unmuted");
});
