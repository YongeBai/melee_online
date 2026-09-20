# Native-port review fixes — September 19

Follow-up: the [pacing investigation](BROWSER-NATIVE-PACING-2026-09-19.md)
traced the refresh caveat below to cached isolated entry HTML losing its
sessionStorage record in Chromium. Entry HTML is now `no-store`; large assets
retain authenticated conditional caching. The original failed run remains
recorded below as historical evidence.

The reviewed fixes preserve the existing acceptance thresholds and original
960×720 (4:3) framing. No native core, camera, render algorithm, game assets,
stage selection or roster implementation changed.

## Fixes

- Rollback no longer retains unused lockstep frame payloads or acknowledged
  sent inputs. The relay omits redundant lockstep packets for negotiated
  rollback clients, including reconnect replay. Lockstep menus and the server's
  bounded replay history remain intact. A 28,800-frame regression checks retention.
- The release API rejects diagnostic CPU room creation, not just diagnostic
  URLs. Probes now instantiate the actual authenticated release-server factory
  and test its origin policy. IPv6 loopback is included in local origins.
- Private hosted assets now support authenticated ETag/Last-Modified
  revalidation; unchanged assets return 304 without retransmitting their bodies.
- Normal play avoids periodic detailed metric snapshots and DOM JSON updates.
  Explicit measurement runs and final/error reports retain their metrics.
- Invalid initial WebSocket messages cannot poison a subsequent valid handshake.
  Room snapshots preserve the rollback phase label after driver disposal.

## Validation

The full suite reports **651 passed, 10 skipped, zero failures (661 tests)**.
The authenticated release LRAS probe also passes: both peers agree on native
NO CONTEST (outcome 7), confirm terminal frame 137 and return to character select.
Authenticated hosted-entry smoke passes with no ISO/file input and human-only
rooms. Three 1,800-frame scripted-combat workloads passed the existing gates:

| Workload | Simulation FPS, both peers | Captured FPS | Draw p95, ms |
| --- | --- | --- | --- |
| Release, stage 31 | 59.832–59.905 | 59.969 | 7.370–7.535 |
| Fountain, 2–10 ms ordered delays in both directions | 59.706–59.894 | 59.968 | 9.235–9.390 |
| Release, forced socket reconnect | 59.577–59.908 active | 59.965 active | 7.165–7.270 |

Each observed seat produced 1,800 distinct sampled 960×720 images, with no
black, repeated or wrong-size frames. Both peers converged at confirmed frame
1799 with zero obsolete frame/sent-input entries retained. Reconnect paused
for 281 ms; its raw simulation rate was 59.028–59.352 FPS and raw capture rate
59.408 FPS. Active rates exclude that measured pause, not arbitrary slow frames.

The release probes inject measurement controls through CDP after navigation;
the public server still strips diagnostic query parameters. These are localhost
browser-canvas measurements, not scanout, input-to-photon, WAN or all-roster
certification. Lower submission times than the earlier run are encouraging,
but are not a controlled A/B improvement claim.

One pre-match refresh attempt unexpectedly created a new guest room and timed
out; an identical retry passed refresh and forced reconnect. The intermittent
refresh failure remains unresolved and is not counted as a passing run. An
earlier harness attempt lacked Page.enable before installing CDP controls;
that harness error was fixed and also excluded from acceptance results.

## Dirty-host audit

Only three pinned host modules changed: native-room changes JavaScript maps,
transport metadata and reporting; native-live guards optional progress snapshots;
constructor-runner omits that callback outside explicit diagnostics. Inspection
found no new HEAP writes, native imports or writes to native state. Their SHA-256
pins were updated after this inspection. All 166 host artifact pins match the
tested build. The regular and dirty WASM binaries are unchanged; native write
instruction counts remain 111,011 stores,
169 memory copies, 63 fills and zero table mutations.

See [machine-readable evidence](benchmarks/browser-2026-09-19-native-review.json).
