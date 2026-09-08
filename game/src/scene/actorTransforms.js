// The crowd owns when a pose changes. Three's normal scene walk otherwise
// recomposes every bone, including invisible and animation-throttled actors.
export function manageActorTransforms(root) {
  const updateWorld = root.updateMatrixWorld;
  const skeletons = new Map();
  root.traverse((node) => {
    if (node.skeleton && !skeletons.has(node.skeleton)) {
      const skeleton = node.skeleton;
      const update = skeleton.update;
      const state = { update, dirty: true };
      skeletons.set(skeleton, state);
      skeleton.update = function () {
        if (!state.dirty) return;
        update.call(this);
        state.dirty = false;
      };
    }
  });
  root.updateMatrixWorld = () => {};
  return {
    update() {
      root.parent?.updateWorldMatrix(true, false);
      updateWorld.call(root, true);
      for (const state of skeletons.values()) state.dirty = true;
    },
    dispose() {
      root.updateMatrixWorld = updateWorld;
      for (const [skeleton, state] of skeletons) skeleton.update = state.update;
    },
  };
}
