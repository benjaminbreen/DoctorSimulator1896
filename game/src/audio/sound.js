// Shared browser sound service. Instruments request named sound effects; they
// do not create AudioContexts or own volume state. Music and ambient buses can
// be added later without changing those callers.

const STORAGE_KEY = 'ghosts-game.sound.v1';
const storage = typeof localStorage === 'undefined' ? null : localStorage;

const listeners = new Set();
const state = {
  muted: false,
  masterVolume: 0.8,
  sfxVolume: 0.85,
};

try {
  const stored = storage && JSON.parse(storage.getItem(STORAGE_KEY));
  if (stored) {
    state.muted = Boolean(stored.muted);
    if (Number.isFinite(stored.masterVolume)) state.masterVolume = Math.min(1, Math.max(0, stored.masterVolume));
    if (Number.isFinite(stored.sfxVolume)) state.sfxVolume = Math.min(1, Math.max(0, stored.sfxVolume));
  }
} catch {
  storage?.removeItem(STORAGE_KEY);
}

function persist() {
  storage?.setItem(STORAGE_KEY, JSON.stringify(state));
}

let context = null;
let masterGain = null;
let sfxGain = null;
let attached = false;

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

function notify() {
  for (const listener of listeners) listener({ ...state });
}

function applyLevels() {
  if (!context || !masterGain || !sfxGain) return;
  const now = context.currentTime;
  masterGain.gain.setTargetAtTime(state.muted ? 0 : state.masterVolume, now, 0.015);
  sfxGain.gain.setTargetAtTime(state.sfxVolume, now, 0.015);
}

function ensureContext() {
  if (context || typeof window === 'undefined') return context;
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return null;
  context = new AudioContext();
  masterGain = context.createGain();
  sfxGain = context.createGain();
  sfxGain.connect(masterGain);
  masterGain.connect(context.destination);
  applyLevels();
  return context;
}

export function unlockSound() {
  const audio = ensureContext();
  if (!audio) return Promise.resolve(false);
  if (audio.state === 'suspended') {
    return audio.resume().then(() => true, () => false);
  }
  return Promise.resolve(true);
}

function tone({ frequency, duration, gain = 0.2, type = 'sine', when = 0, detune = 0 }) {
  const audio = ensureContext();
  if (!audio || !sfxGain || state.muted) return;
  const start = audio.currentTime + when;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.detune.setValueAtTime(detune, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(sfxGain);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise({ duration = 0.04, gain = 0.12, when = 0, highpass = 700 }) {
  const audio = ensureContext();
  if (!audio || !sfxGain || state.muted) return;
  const start = audio.currentTime + when;
  const frames = Math.max(1, Math.ceil(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    // Deterministic pseudo-noise is sufficient for a mechanical transient.
    const n = Math.sin((index + 17) * 12.9898) * 43758.5453;
    data[index] = (n - Math.floor(n)) * 2 - 1;
  }
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const envelope = audio.createGain();
  filter.type = 'highpass';
  filter.frequency.value = highpass;
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(sfxGain);
  source.start(start);
}

const EFFECTS = {
  'chronoscope-arm': () => {
    noise({ duration: 0.045, gain: 0.1, highpass: 450 });
    tone({ frequency: 118, duration: 0.09, gain: 0.08, type: 'triangle' });
    tone({ frequency: 164, duration: 0.06, gain: 0.04, type: 'triangle', when: 0.035 });
  },
  'reaction-signal': () => {
    noise({ duration: 0.018, gain: 0.09, highpass: 1800 });
    tone({ frequency: 880, duration: 0.72, gain: 0.26 });
    tone({ frequency: 1760, duration: 0.46, gain: 0.11, when: 0.002 });
    tone({ frequency: 2640, duration: 0.24, gain: 0.045, when: 0.004 });
  },
  'reaction-key': () => {
    noise({ duration: 0.025, gain: 0.15, highpass: 900 });
    tone({ frequency: 210, duration: 0.055, gain: 0.07, type: 'square' });
  },
  'reaction-false-start': () => {
    tone({ frequency: 130, duration: 0.16, gain: 0.12, type: 'triangle' });
    tone({ frequency: 94, duration: 0.2, gain: 0.1, type: 'triangle', when: 0.09 });
  },
  'reaction-complete': () => {
    tone({ frequency: 523.25, duration: 0.28, gain: 0.1 });
    tone({ frequency: 659.25, duration: 0.4, gain: 0.12, when: 0.12 });
  },
  // A card being set down: paper brush, then a low respectful chime.
  'event-card': () => {
    noise({ duration: 0.07, gain: 0.05, highpass: 700 });
    tone({ frequency: 392, duration: 0.22, gain: 0.05, type: 'triangle', when: 0.03 });
    tone({ frequency: 523.25, duration: 0.3, gain: 0.035, when: 0.1 });
  },
};

export function playSfx(name) {
  const effect = EFFECTS[name];
  if (!effect || state.muted) return false;
  void unlockSound();
  effect();
  return true;
}

export function getSoundState() {
  return { ...state };
}

export function subscribeSound(listener) {
  listeners.add(listener);
  listener(getSoundState());
  return () => listeners.delete(listener);
}

export function setSoundMuted(value) {
  state.muted = Boolean(value);
  applyLevels();
  persist();
  notify();
}

export function setMasterVolume(value) {
  state.masterVolume = clamp01(value);
  applyLevels();
  persist();
  notify();
}

export function setSfxVolume(value) {
  state.sfxVolume = clamp01(value);
  applyLevels();
  persist();
  notify();
}

export function attachSoundUnlock() {
  if (attached || typeof window === 'undefined') return () => {};
  attached = true;
  const unlock = () => void unlockSound();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  // Creating the context is the expensive part and needs no gesture (it just
  // starts suspended); doing it at idle keeps the cost off the first input.
  const idle = window.requestIdleCallback?.(() => ensureContext(), { timeout: 20000 })
    ?? setTimeout(() => ensureContext(), 8000);
  return () => {
    if (!attached) return;
    attached = false;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    if (window.requestIdleCallback) window.cancelIdleCallback(idle);
    else clearTimeout(idle);
  };
}

