// Keyboard state polled by the frame loop. Listeners sit on window so canvas
// focus does not matter.

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

export function createKeyboard() {
  const state = { forward: false, back: false, left: false, right: false, run: false, interact: false };

  function onKey(event, pressed) {
    const action = BINDINGS[event.code];
    if (!action) return;
    // Filter keydown only: a keyup landing on a focused panel control must
    // still release the key, or movement sticks on.
    if (pressed && FORM_TAGS.has(event.target?.tagName)) return;
    if (event.code === 'Space' && pressed) event.preventDefault();
    state[action] = pressed;
  }

  const onKeyDown = (event) => onKey(event, true);
  const onKeyUp = (event) => onKey(event, false);

  return {
    state,
    moveInput() {
      return {
        x: (state.right ? 1 : 0) - (state.left ? 1 : 0),
        z: (state.forward ? 1 : 0) - (state.back ? 1 : 0),
        run: state.run,
        jump: state.jump,
      };
    },
    attach() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      for (const key of Object.keys(state)) state[key] = false;
    },
  };
}
