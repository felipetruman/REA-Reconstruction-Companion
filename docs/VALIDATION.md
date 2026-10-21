# Validation evidence

## Baseline and scope

Source baseline: `269ac04cad16bb38e688b71bc2760b44428e4367`, package 1.3.34.
Native Arch Linux x86_64, Node 24.19.0, pnpm 12.10.1. Baseline command
`pnpm test`: **575 tests, 572 pass, 0 fail, 3 skipped**. The three existing
skips remain skips; they are not counted as successful validation.

The new local suite contains 42 behavior tests covering the five components.
`pnpm test:v2` passed **42/42**, including actual CLI and subprocess execution.
The final integrated run passed **614/617, 0 failures, 3 existing skips**;
it additionally covers native scoped installation.
Machine-readable final command results are in `validation-results.json`.

## Reproduce

```sh
pnpm test
pnpm lint
pnpm test:v2
pnpm benchmark:local
pnpm manifest
pnpm build
python scripts/verify_release.py
```

The release verifier unpacks the manifest-checked ZIP into an isolated temporary
directory and executes the full existing/new suite there. Installer tests use
temporary client homes and skills directories, not the developer's real hosts.
Native ESM JavaScript uses runtime structural contracts, syntax and execution
policy checks; no TypeScript compilation result is claimed.

## TDD record and mandatory cases

Behavior tests preceded each new module. RED logs were retained outside Git as
`/tmp/companion-{evidence,validation,runtime,integration,optimization,e2e}-red.log`.
Additional RED cases exposed historical PASS masking a new failure, missing
implementation-to-validation links, and a process budget error masquerading as
an expected business exception. Each affected suite passed after its correction.
Two failures were test mistakes: accessing records outside the integrity envelope
and using a case-sensitive message regexp; both were corrected without weakening
their behavioral assertions.

| Required failure/risk | Executed acceptance |
|---|---|
| Duplicate, inconsistent, corrupted or old-version evidence | evidence.test, hardening.test, resources.test |
| Actual interruption and resume | e2e.test SIGTERM while Node subprocess is working; persisted CANCELLED and resumed COMPLETE |
| Inadequate/self/absent oracle false positives | validation.test rejects missing/self/corpus gaps and distinguishes infrastructure failures |
| Shared dependency affecting multiple features | optimization.test selects both dependents; unknown impact and completion select full suite |
| REA absent, outdated, customized or externally changed | integration.test isolated discovery, preview, owned-block drift, backups, reversal, native install verification |
| Critical failures never complete | runtime.test three equivalent failures and missing critical coverage; real bad candidate E2E |
| Forged, partial or tampered PASS reports | runtime.test requires a fresh verifier-issued receipt and rejects altered observations |
| Complete proof becomes stale | target artifact change blocks; candidate tampering followed by independent validation invalidates COMPLETE |
| Resource control and corruption | explicit operation grants, per-stage/total deadline, output/input limits, lock owner checks, atomic writes and stale revisions |

## Measured local benchmarks

`node scripts/benchmark-local.mjs` was actually executed. Function, format and
stateful public suites each returned PASS: **3/3 suite scenarios**. Seed 42
round-trip fuzzing executed **100 iterations, 0 divergences**. Directed mutation
sample: **1 detected, 1 deliberately equivalent survivor, 1 invalid**. The valid
sample denominator is 2; this is a harness check, not a reliability estimate or
an effectiveness percentage. Per-input results and environment/corpus hashes
are emitted by the script; timings are observations, not improvement claims.

The real CLI walkthrough executed `plan`, `run --until IMPLEMENT`, `status`,
`resume`, `validate` and `report`. It reconstructed a file, returned COMPLETE
only after the preserved independent corpus passed, and reported no broken
graph references. Runtime operations count stages plus tool calls; telemetry
tool counts are separately labeled, so their denominators differ deliberately.

## Follow-up validation (2026-10-21)

Full suite passed on Node 20.20.2 and 24.19.0: **618 tests, 615 PASS,
0 FAIL, 3 platform skips** on each runtime. The added test covers explicit
CLI probe authorization and skill-revision/CLI-version separation.
Native syntax/execution policy passed for all nine ESM modules.

One authorized agent used a fresh target, no inherited conversation and 159
black-box queries. Independent held-out corpus: **63/64, FAIL**. Real runtime
classified the implementation divergence and stopped **BLOCKED**. This proves
that this run did not falsely complete; N=1 cannot estimate effectiveness.
[Archived protocol and reproducible exposed replay](../evals/heldout-20261021/README.md).

REA 4.1.0 performed passive inspection of an actual Node 20 ELF. Both source
skills were explicitly read in the current Codex session. This verifies an
explicit workflow and CLI availability, not automatic global activation.

## Limits of this evidence

Native CI passed 9/9 jobs on Linux, Windows and macOS with Node 20/22/24.
Both source and extracted release pass in every job. Structured counts, job
URLs, source SHA and log digests: [native-ci.json](evidence/native-ci.json).
The new directory durability regression raises the suite to 619 tests:
Linux 616 PASS/3 SKIP, macOS 619 PASS/0 SKIP, Windows 618 PASS/1 SKIP.

Claude Code explicitly read both skills in a real authorized session:
[session evidence](evidence/claude-live-session.json). Automatic routing and REA
MCP access inside that session are not established. Global host files unchanged.
Windows skips only the POSIX SIGTERM test; portable cancellation tests pass.
File fsync and atomic rename remain; Windows directory metadata fsync is
unavailable through Node, so its power-loss durability remains best-effort.

Agent development relied on protocol separation within a shared host, not a
hostile-agent security boundary. Frozen candidate evaluation used pinned,
offline, non-root, read-only Docker with CPU/memory/PID limits. The generic
local command adapter itself is not an OS sandbox. No generalization or
performance improvement is inferred from public fixtures or a single target.
