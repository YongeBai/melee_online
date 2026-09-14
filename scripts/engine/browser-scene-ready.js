// Melee exposes the VS scene number before its fighters finish loading.
// Cosmetic writes and QA quit/start transitions must wait for initialized play.
export function isLoadedMeleeMatch(state) {
  return state?.major===2 && state.minor===2 && state.sceneKind===2 &&
    state.sceneFrame>240 && Array.isArray(state.fighters) && state.fighters.length>=2;
}
