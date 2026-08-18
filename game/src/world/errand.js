// The Cattell errand: deliver a parcel to the laboratory, find a note, test
// two instruments, and be credited for the measurements. A small state
// machine over module state; the day flow renders whatever step it is on.

import { adjustStanding } from './standing.js';

export const ERRAND_REWARD_STANDING = 8;
export const INSTRUMENTS_REQUIRED = 2;

export const CATTELL_NOTE = Object.freeze({
  heading: 'Prof. J. McK. Cattell — Psychological Laboratory',
  body: [
    'Doctor — I am called uptown and must miss you. Leave the volume on my desk; you have my thanks for carrying it.',
    'Since you are here: I would value a practised hand at two of the instruments. Take a measurement at any two apparatus and leave your figures on the slate. Your reaction times interest me more than my students’ do — they have learned my habits, and you have not.',
    'The gas is lit. Mind the induction coil; it minds nobody.',
  ],
  signature: '— J. McK. C.',
});

let status = 'idle';
const tested = new Set();
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(getErrand());
}

export function getErrand() {
  return { status, tested: [...tested] };
}

// The parcel arrives once the first consultation of the day has closed.
export function beginErrand() {
  if (status !== 'idle') return false;
  status = 'deliver';
  notify();
  return true;
}

// Walking into the laboratory with the parcel finds the note. Returns true
// the one time the note should open.
export function arriveAtLab() {
  if (status !== 'deliver') return false;
  status = 'note';
  notify();
  return true;
}

export function noteRead() {
  if (status !== 'note') return;
  status = 'testing';
  notify();
}

// Called when an instrument session ends with a real measurement taken.
// Two distinct instruments complete the errand.
export function instrumentTested(kind) {
  if (status !== 'testing' || !kind) return false;
  tested.add(String(kind));
  if (tested.size >= INSTRUMENTS_REQUIRED) {
    status = 'done';
    adjustStanding(ERRAND_REWARD_STANDING, 'measurements left for Professor Cattell');
    notify();
    return true;
  }
  notify();
  return false;
}

export function subscribeErrand(listener) {
  listeners.add(listener);
  listener(getErrand());
  return () => listeners.delete(listener);
}

export function resetErrandForTests() {
  status = 'idle';
  tested.clear();
  notify();
}
