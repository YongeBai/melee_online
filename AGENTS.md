# Working on Melee Online

Read `docs/ENGINEERING-NOTES.md` before changing native menus, input hooks, rendering,
room lifecycle, or performance settings. It records the tested techniques and
pitfalls from the playable implementation. Read `docs/ROLLBACK-AND-ROOMS.md` and
`docs/VALIDATION.md` for architecture and the limits of the measurements.

- UI should look native to Melee. Preserve original menu assets, SIS glyphs,
  animated hands, stage select, and native pause. Added room controls belong
  beneath the native hands; preserve the capture gate that hides unmodified CSS.
- Use the user's local USA 1.02 disc. Never commit game data, extracted assets,
  save data, secrets, or supplied third-party binaries.
- Keep experiments in their worktree. Use separate server ports, native build
  directories, and runtime/save directories. Do not mutate another worktree's
  engine or stop its running server to test an experiment.
- Distinguish server-side rollback, browser presentation FPS, and measured
  input-to-photon latency. Do not call streamed server rollback Slippi-style
  local prediction.
- When creating scripts, avoid Python unless it is the best choice. If Python
  is necessary, use `uv` and keep secrets in a `.env` file.
