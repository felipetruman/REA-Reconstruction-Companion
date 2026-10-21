# REA Reconstruction Companion 2.0 — delivery report

## A. Implementation

| Component | State | Tests | Limits |
|---|---|---|---|
| Autonomous Runtime | Implemented | runtime, resources and real CLI E2E | Trusted injected tools; no automatic AI agent; callbacks must cooperate |
| Evidence Engine | Implemented | evidence, hardening, resources | Local atomic persistence; interrupted store locks need inspection |
| Validation Engine | Implemented | validation, benchmark, bad-candidate E2E | Genuine oracle provenance belongs to independent provider; single-target held-out evaluation FAIL 63/64; correctly BLOCKED |
| REA Integration Adapter | Implemented | isolated integration and original installer regression | REA CLI 4.1.0 inspected an actual ELF; current Codex loaded both source skills explicitly; automatic routing unverified; REA major compatibility bounded to 4–6 |
| Context Optimizer | Implemented | optimization, graph/candidate invalidation | Ambiguous impact uses full suite; host tokens absent unless explicitly reported |

## B. Files and purpose

`src/evidence`, `schemas/records.json`: versioned JSON, integrity, atomic storage,
migration, typed dependency audit and traceability queries. `src/validation`:
independent comparisons, contracts/invariants, bounded seeded fuzzing, minimization,
mutations, benchmark protocol and denominator-bearing metrics. `src/runtime`:
durable state machine, scope/DAG, deadlines, cancellation, recovery and completion
gate. `src/adapters`: explicitly authorized real local processes and JSON workflow
integration. `src/integration`: discovery, diagnosis, native installer reuse,
controlled legacy blocks, backups, drift protection and reversal.
`src/optimization`: cache identity/invalidation/history, shared dependency impact,
selective reference loading, bounded context summaries and local telemetry.

`src/cli`, `scripts/benchmark-local.mjs`, `scripts/check-runtime.mjs` provide
usable entry points, measured local benchmarks and static execution-policy checks.
`tests/v2` adds 42 behavior tests. Package version is 2.0.0, with ESM exports and
an optional CLI bin. The release manifest includes new source, schemas and docs.
README and a small additive skill reference describe the optional runtime;
existing Markdown workflow, installer source, updater source and MIT license
are preserved. `zit.toml` declares complete regression and policy gates.

## C. Validation

See [validation evidence](VALIDATION.md), [machine-readable results](validation-results.json)
and [traceability](TRACEABILITY.md). Counts distinguish passed, failed and skipped
cases; local fixtures are never presented as blind model results. Reproduce with
`pnpm test`, `pnpm lint`, `pnpm benchmark:local`, `pnpm build`, then
`python scripts/verify_release.py` after refreshing the manifest if source changed.

## D. Compatibility

The optional runtime requires native Node >=20 and no new package dependencies.
Original `node install.mjs` CLI remains supported. Native scoped skill installation
can be previewed through `integration --action skill-install --skills-dir PATH`;
add `--execute` only when selected. It reuses integration-off installation, never
canonical REA edits. Legacy integration is an explicit fallback with backup and
owned-block reversal. Existing global installation was intentionally unchanged.

Official host interfaces used: [Codex skills](https://developers.openai.com/codex/skills)
and [Claude Code skills](https://code.claude.com/docs/en/skills). Host invocation
syntax differs; no shared undocumented hook or automatic live activation is assumed.

## E. Use

[USAGE.md](USAGE.md) contains complete commands for isolated installation,
verification, generating a local reconstruction, plan/run/status/report,
cancellation, resume, independent revalidation, recovery and integration reversal.
`node src/cli/index.mjs help` is the dependency-free entry point. The example
generator refuses existing destinations; inspection operations create no files.

## F. Follow-up validation and remaining boundaries

Node **20.20.2** executed the full suite: 614 PASS, 0 FAIL, 3 platform skips
before the new CLI probe test. Final follow-up results appear in
[validation-results.json](validation-results.json).

One authorized agent reconstructed a newly generated black-box target without
inherited conversation. Independent held-out evaluation: **63/64, FAIL**.
Runtime reached **BLOCKED**, preserving the SIZE divergence instead of declaring
COMPLETE. [Protocol, frozen artifacts and replay](../evals/heldout-20261021/README.md).
This N=1 experiment does not establish generalization; published replay is no
longer blind. Agent development shared the host; final execution used Docker
isolation with no network, non-root, read-only filesystem and resource limits.

REA CLI **4.1.0** performed `inspect-artifact` on an actual Node 20 ELF. The
current Codex session explicitly read both source skills. Optional
`integration --action probe` verifies the authorized CLI process separately
from read-only file diagnosis; skill metadata revision 26 is not CLI semver.
Evidence: [probe](evidence/rea-live-probe.json),
[inspection](evidence/rea-live-inspection.json). This does not prove automatic
routing, Claude Code activation, or a global V2 upgrade; global files unchanged.

Windows/macOS native execution remains **NOT_RUN**: no corresponding local OS
or VM is available. Existing public-repository CI already covers Ubuntu,
Windows and macOS on Node 20/22/24. Running remote jobs requires a remote push,
which this mission explicitly forbids automatically. No paid API, deployment,
remote push or additional unapproved agent was used.

Local Git integration is performed through accepted Zit records and local
export, preserving history. This is not a published release. Local command
adapters still require trusted tools; they do not provide an OS sandbox.

## Authorized remote/native follow-up

A separate Claude Code session using the existing claude.ai subscription read
REA, Companion and the runtime reference through actual Read tool calls.
[Session evidence](evidence/claude-live-session.json) records successful tool
results and the transcript digest. This validates explicit loading, not automatic
routing, MCP discovery or end-to-end reconstruction inside Claude.

The first authorized fork push was stopped by GitGuardian on a pre-existing
`.NET public-key-token` fixture. Microsoft documents this as a public assembly
identifier derived from a public key, not a credential:
https://learn.microsoft.com/en-us/dotnet/api/system.reflection.assemblyname.getpublickeytoken
A repository-local exact-match false-positive entry preserves all other scanning;
no hook was disabled and no global policy was changed.
