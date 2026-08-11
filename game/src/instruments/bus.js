// The channel between an instrument's simulation and its chrome.
//
// Its own module on purpose. It started inside InstrumentStage.jsx, and a
// component file gets replaced on every hot update — which hands the panel
// and the scene two different copies of the bus, and the panel then reads a
// null instrument forever. A module with no component in it does not churn.

export const instrumentBus = {
  // The instrument currently being simulated, set by the stage.
  instrument: null,
  // Input collected from the chrome, drained by the stage each frame.
  input: {},
  push(input) {
    Object.assign(instrumentBus.input, input);
  },
  drain() {
    const taken = instrumentBus.input;
    instrumentBus.input = {};
    return taken;
  },
};
