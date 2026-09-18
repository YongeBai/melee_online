# Fox Illusion and Falco Phantasm attachment lifetime

An idle level-9 Fox CPU exposed a missing-geometry exception at match frame
313. The native menu checks had already passed. The failure was in the
original side-B item callback, not the CPU hand/icon change.

`it_8029CD18` draws the primary item model and a separate secondary JObj from
`item->xDD4_itemVar.foxillusion.xDDC`. That ghost is outside the primary model
tree. The port registered the primary model but omitted this second root.
The renderer correctly rejected its draw as unknown geometry.

`portItemAttachmentsList` now enumerates that exact typed root for
`It_Kind_Fox_Illusion` and `It_Kind_Falco_Phantasm`. Existing Link attachments
still enumerate their two roots; Illusion/Phantasm enumerate only one. The
existing renderer creates a plan from the current owner/root/descriptor,
refreshes native bindings, and retires it when the attachment disappears.
No generic fallback, ignored draw, cosmetic exclusion, relaxed geometry check,
or replacement gameplay implementation was introduced.

The native change reads original item state and writes only the existing
bounded attachment-list output. It adds no persistent native state or imports.
Rebuilt dirty instrumentation retains 110,316 stores, 169 copies and 61 fills;
the global/import/table/memory audit matches the previous core's audit.
Core and host-source pins were renewed for the reviewed change. Game assets
and generated binaries remain outside Git.

The focused probe drives eight complete side-B moves through normal controller
samples. Both fighters produce eight births and eight retirements, 32 attached
frames and 32 frames with native attachment draws. Each reuses six owner
addresses and three root addresses across the moves; all 16 primary/secondary
GPU model resources retire. The old core fails the same Fox probe on its first
secondary ghost. A compiled fixture also covers bounded output, null roots,
unrelated item kinds, adjacent union fields, and changed root/descriptor values
under a reused owner.

The constructor's generic jump assertion also now compares height with the
actual pre-jump grounded sample. Its previous comparison used the earlier intro
spawn-platform height, falsely rejecting Falco after a valid jump from the
floor. Controller inputs, jump duration and native physics are unchanged.

## Validation

[Sanitized evidence](benchmarks/browser-2026-09-17-native-illusion-attachments.json)
records current core/source hashes, raw-report hashes and the following checks:

- Three idle level-9 Fox CPU matches completed 1,800 frames each, past the
  previous frame-313 failure. The active 900-frame menu/gameplay probe also
  passed. CPU hands and keyboard indicators stay hidden, the CPU card remains
  opaque, human transitions restore controls, and P1 still selects CPU tokens.
- Link's complete item-move probe and Kirby's Link-copy acquisition and arrow
  attachment probe passed with the rebuilt core.
- Two independent clients per fighter restored seven boundaries in the order
  before birth, live ghost, retirement, live ghost, before birth, retirement,
  live ghost. All 28 comparisons matched fresh-renderer pixels and camera;
  complete game-state hashes remained unchanged. Each run then passed a
  240-frame delayed/reordered-input correction trial. These explicit restores
  exercise attachment lifetime independently of whether the combat script
  happens to use side-B during a network correction.
- Battlefield and Fountain each passed 240 every-frame pixel/camera comparisons
  with full dirty-copy coverage: zero differing bytes or camera mismatches.
  Separate 1,800-frame delayed-input runs passed complete-state, final image,
  camera and audio-journal references, with every checkpoint capture/restore
  audited. These expensive audit runs are not performance acceptance samples.
- All six legal stages passed two-client 240-frame correction/image/camera
  checks. Rooms passed 600 frames with matching fighter state; elimination,
  timeout, results and rematch checks passed separately.
- The full suite completed 622 tests: 612 passed, 10 skipped, zero failed.
  All 163 reviewed host pins matched built files; nine served runtime/UI/core
  files matched the current build (and source, where applicable).

The dedicated restore option was added after the broad stage runs; only its
diagnostic module and reviewed host-contract hash changed afterward. Its two
focused runs and the full test suite used that final diagnostic revision. The
native core, renderer and gameplay code were unchanged between these checks.

Reproduce the focused checks with:

```sh
node scripts/native-port/probe-constructor.mjs --character=Fx --opponent=Fc --input --render-steps --stage-callbacks --hardware --illusion-attachments
node scripts/native-port/probe-rollback.mjs --presentation=replica --replicacopy=dirty --snapshotaudit --illusion-restore --pair=Fx,Fc --frames=240
```

Repeat with the two character codes reversed for Falco.

Production rooms remain three-frame lockstep. This is a rendering correctness
fix; it does not establish sustained competitive 720p60 or physical input
latency. The rejected eager-reconciliation and packed-draw experiments remain
reverted.
