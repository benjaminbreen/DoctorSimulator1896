// Keyboard state polled by the frame loop. Listeners sit on window so canvas
// focus does not matter.

import { isGameplayInputBlocked } from './uiMode.js';

const BINDINGS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyE: 'interact',
  KeyM: 'cycleCamera',
  Space: 'jump',
};

const FORM_TAGS = new Set(['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA']);
const MOVEMENT_ACTIONS = new Set(['forward', 'back', 'left', 'right']);

export function createKeyboard() {
  const physical = {
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
    jump: false,
    interact: false,
    cycleCamera: false,
  };
  const virtual = {
    x: 0,
    z: 0,
    run: false,
    jump: false,
    interact: false,
    cycleCamera: false,
  };
  // PlayerRig and CameraRig already poll `state`. Getters let touch and
  // keyboard controls share that contract without either one releasing the
  // other's held action.
  const state = {};
  for (const action of ['run', 'jump', 'interact', 'cycleCamera']) {
    Object.defineProperty(state, action, {
      enumerable: true,
      get: () => Boolean(physical[action] || virtual[action]),
    });
  }

  function onKey(event, pressed) {
    const action = BINDINGS[event.code];
    if (!action) return;
    if (pressed && isGameplayInputBlocked()) return;
    // Filter keydown only: a keyup landing on a focused panel control must
    // still release the key, or movement sticks on.
    if (pressed && FORM_TAGS.has(event.target?.tagName)) {
      // A modal may restore focus to the button that opened it. Movement
      // keys must leave that button and move the character; Tab is how the
      // player deliberately enters the HUD controls.
      if (event.target.tagName === 'BUTTON' && MOVEMENT_ACTIONS.has(action)) {
        event.target.blur();
      } else {
        return;
      }
    }
    if (pressed && MOVEMENT_ACTIONS.has(action)) event.preventDefault();
    if (event.code === 'Space' && pressed) event.preventDefault();
    physical[action] = pressed;
  }

  const onKeyDown = (event) => onKey(event, true);
  const onKeyUp = (event) => onKey(event, false);
  const clearVirtualInput = () => {
    virtual.x = 0;
    virtual.z = 0;
    virtual.run = false;
    virtual.jump = false;
    virtual.interact = false;
    virtual.cycleCamera = false;
  };

  return {
    state,
    moveInput() {
      if (isGameplayInputBlocked()) {
        return { x: 0, z: 0, run: false, jump: false };
      }
      return {
        x: ((physical.right ? 1 : 0) - (physical.left ? 1 : 0)) + virtual.x,
        z: ((physical.forward ? 1 : 0) - (physical.back ? 1 : 0)) + virtual.z,
        run: state.run,
        jump: state.jump,
      };
    },
    setVirtualMove(x, z, run = false) {
      virtual.x = Math.max(-1, Math.min(1, Number(x) || 0));
      virtual.z = Math.max(-1, Math.min(1, Number(z) || 0));
      virtual.run = Boolean(run);
    },
    setVirtualAction(action, pressed) {
      if (pressed && isGameplayInputBlocked()) return;
      if (action in virtual && action !== 'x' && action !== 'z' && action !== 'run') {
        virtual[action] = Boolean(pressed);
      }
    },
    clearVirtualInput,
    attach() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      for (const key of Object.keys(physical)) physical[key] = false;
      clearVirtualInput();
    },
  };
}
