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

## Limits of this evidence

No live model/agent, tariffed API, REA host session, blind held-out reconstruction,
deployment, remote push or global client change was executed. Those evaluations
are **NOT_RUN**. Native host filesystem installation and legacy text integration
are tested; actual live skill routing remains unverified without host evidence.
Node 22.22.0 additionally passed the 42-test new suite; minimum
Node 20, Windows and macOS have not been executed in this environment.

Trusted local subprocesses are tested. Unknown software sandbox isolation and
CPU/memory/network containment require a caller-provided sandbox adapter. There
is no claim that an executable allowlist confines a granted interpreter.
Cooperative AbortSignal handling is required for in-process callbacks.
An atomic store lock left by a hard kill requires inspection; the runtime only
automatically diagnoses/removes its own explicitly requested dead-owner run lock.

Public fixtures are known to the implementer and provide no evidence of agent
generalization. No external telemetry, daemon, new npm dependency or recurring
process was introduced. Original Markdown/install/update behavior remains under
the original regression suite; MIT licensing is unchanged.
