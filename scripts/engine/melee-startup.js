// Scene IDs are GALE01 USA 1.02. Wait for actual native CSS initialization,
// not only a major-scene change (which precedes its objects/render callbacks).
export function characterSelectReady(state) {
  return state?.major === 2 && state.minor === 0 && state.sceneKind === 8 &&
    state.sceneFrame >= 60;
}
