# Working on Melee Online

Read `docs/ENGINEERING-NOTES.md` before changing native menus, input hooks, rendering,
room lifecycle, or performance settings. It records the tested techniques and
pitfalls from the playable implementation. Read `docs/ROLLBACK-AND-ROOMS.md` and
`docs/VALIDATION.md` for architecture and the limits of the measurements.

- UI should look native to Melee. Preserve original menu assets, SIS glyphs,
  animated hands, stage select, and native pause. Added room controls belong
  beneath the native hands; preserve the capture gate that hides unmodified CSS.
- No-ISO startup is an invariant: every playable browser build, including
  performance experiments, must automatically load the hosted game. Never
  replace this flow with a player-supplied ISO/file-picker requirement. The
  user's local USA 1.02 disc is a development fixture, not a player prerequisite.
  Never commit game data, extracted assets, save data, secrets, or supplied
  third-party binaries.
- Native Melee camera behavior is an invariant: preserve the original gameplay
  pitch, yaw, field of view, tracking, zoom, and 4:3 framing. Performance changes
  and cosmetic stage simplifications must not alter camera or projection.
  Investigate incorrect angles against an equivalent native scene; never mask
  a rendering fault with an arbitrary camera offset. Visually verify framing
  when changing rendering, stage backgrounds, or camera-related code.
- A native render category is not proof that an object is cosmetic. Black stage
  backgrounds must preserve visible gameplay objects and cues, including
  Randall on Yoshi's Story. Check stage identity again after pausing before
  applying stage-specific exclusions.
- Keep experiments in their worktree. Use separate server ports, native build
  directories, and runtime/save directories. Do not mutate another worktree's
  engine or stop its running server to test an experiment.
- Distinguish server-side rollback, browser presentation FPS, and measured
  input-to-photon latency. Do not call streamed server rollback Slippi-style
  local prediction.
- When creating scripts, avoid Python unless it is the best choice. If Python
  is necessary, use `uv` and keep secrets in a `.env` file.
