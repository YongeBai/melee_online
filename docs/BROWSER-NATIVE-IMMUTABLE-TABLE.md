# Fixed function-table audit for rollback and presentation

This increment starts from `d62fc8f` and removes a provably redundant host-side
scan from the direct C-to-WASM rollback diagnostic. It does not change gameplay,
rendering, the native camera, resolution, no-ISO startup, or the production room
transport. Production rooms remain three-frame lockstep. The 720p60 tournament
target is still unmet.

## What was scanning

The direct core exports a fixed 10,486-entry function table. Before this change,
every checkpoint capture/restore read all 10,486 entries through `table.get`, and
every replica presentation read both the simulation and presentation tables.
Over a 1,800-frame two-client run that meant 37,749,600 replica entry checks per
client, plus roughly 6.6–8.9 million checkpoint checks. These checks verified an
important invariant, but repeated work whose mutation sources can be rejected at
the build boundary.

The store and replica still take the original entry snapshot. They always check
table length, memory identity and size, detached renderer ownership, runtime
health, core identity, mutable globals, host journal state, and dirty-page
coverage. Only the repeated content walk is skipped for an audited immutable
table. An unaudited runtime retains the old full scan. The certification option
`--verify-immutable-table` also forces the old scan as an A/B control.

## Safety boundary

The dirty-core builder now rejects `table.set`, `table.grow`, `table.fill`,
`table.copy`, `table.init`, and `elem.drop`. The rebuilt manifest records
`tableMutations: 0`, and the runtime accepts the immutable-table flag only from
that pinned manifest. The reviewed core has a fixed `10486 10486 funcref` table,
contains none of those mutable instructions, and does not import a table.

The pinned Emscripten host glue reads table entries for indirect calls but has no
table mutator. The served host closure is hash-pinned by `dirty-host-contract.mjs`.
Changing the core, manifest, glue, snapshot code, or replica code therefore
requires a new explicit review and pin update. Fixture and uninstrumented
runtimes do not get the immutable flag and continue to scan every entry.

Unit tests cover build rejection and both runtime paths. Existing guard tests
still prove that length changes, changed entries on unaudited runtimes, memory
growth, aliases, live native receivers, incompatible cores, and aborted runtimes
fail closed.

## Measured effect

The matched Fountain A/B/A/B sequence used two local Chromium clients, 1,800
combat frames, the 960x720 native picture inside the 1280x720 presentation,
identical delayed/reordered traffic, and browser capture. A forces repeated
table scans; B uses the audited fixed-table path. Each entry is client 0 / client
1.

| Trial | Simulation FPS | Captured FPS | Replica guard ms | Snapshot guard ms |
| --- | --- | --- | --- | --- |
| A1 scan | 58.38 / 58.53 | 53.52 / 54.31 | 1506 / 1514 | 342 / 341 |
| B1 audited | 59.04 / 59.06 | 56.78 / 57.73 | 20 / 17 | 7 / 7 |
| A2 scan | 57.33 / 57.41 | 52.34 / 52.44 | 1493 / 1502 | 349 / 336 |
| B2 audited | 58.02 / 58.15 | 53.62 / 53.82 | 17 / 19 | 7 / 8 |

Across these four clients, simulation averaged 57.91 FPS with forced scans and
58.57 FPS with the audit, a 0.66 FPS improvement. Captured cadence averaged
53.15 versus 55.49 FPS. The exact guard reduction is repeatable; total capture
cadence remains host-sensitive and is not physical scanout.

Battlefield was already near the threshold. Its one A/B pair moved from
59.43/59.61 to 59.52/59.57 simulation FPS; captured cadence was mixed at
59.39/59.23 versus 59.34/59.48. At least one candidate submission-interval p95
was 21.4 ms, and both captured results remained below 59.5 FPS. Fountain also
remained below every cadence gate. This is an accepted exact CPU reduction, not
a 720p60 certification.

[Sanitized measurements](benchmarks/browser-2026-09-17-native-immutable-table.json)
retain raw report hashes, source identities, per-client cadence, guard counts,
and correctness results.

## Correctness validation

- Battlefield Falco/Fox and Fountain ICs/Peach each passed 240 per-draw audits.
  The two runs compared 1,327,104,000 RGBA bytes with zero differences and zero
  camera mismatches. Both recorded zero repeated table-entry checks.
- All six legal stages passed 240-frame delayed/reordered two-client correction
  probes with complete-state convergence, snapshot audits, exact corrected
  pixels/camera, and no replay presentations.
- Fountain ICs/Peach passed a separate 1,800-frame stress with 157/134
  corrections and 835/810 replayed frames. Both clients converged to the same
  60,686,336-byte complete-state hash.
- Fox/Falco side-B attachment restore passed in both seat orders. Link/Kirby
  passed the audited correction path.
- The normal room path passed 600 lockstep frames with matching fighter state.
  Elimination, results, rematch, the original 28,800-frame eight-minute timeout,
  return flow, and the six-stage filter passed.
- The full suite passed 624 tests: 614 passed, 10 skipped, zero failed.

These checks cover the invariant changed here, not every move/costume interaction
or a physical input-to-photon path. Audible rollback commitment, production
rollback/recovery, exhaustive roster parity, complete results presentation, and
WAN behavior remain outside the current proof.

## Reproduction

```sh
node --max-old-space-size=4096 scripts/native-port/build-dirty-core.mjs
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --map=fountain --pair=Pp,Pe --verify-immutable-table --label=table-a1
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --map=fountain --pair=Pp,Pe --label=table-b1
node scripts/native-port/probe-certification.mjs --mode=isolated --presentation=replica --replicacopy=dirty --dirtyaudit --frameoracle --frames=240 --map=fountain --pair=Pp,Pe --label=table-audit
node scripts/native-port/probe-rollback.mjs --presentation=replica --replicacopy=dirty --snapshotaudit --map=fountain --pair=Pp,Pe --frames=1800 --workload=combat
npm test
```
