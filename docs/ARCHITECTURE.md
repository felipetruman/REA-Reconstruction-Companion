# Companion 2.0 architecture

The original skill, 18 reference topics, executable evaluation fixtures,
installer/update locks and manifest-verified release pipeline are retained.
This is an additive native-ESM library/CLI, not a replacement reverse engine.

```text
Markdown skill / explicit user request
             |
JSON workflow -> CLI -> Runtime FSM -> injected trusted tool adapters
                            |                    |
                     checkpoints          authorized local argv
                            |                    |
EvidenceStore <---- structured results ---- Validation Engine
      |                                      |
traceability graph                independent preserved/contract oracles
      |                                      |
cache / impact selection / context summaries / local telemetry
```

## Contracts

`schemas/records.json` is JSON Schema 2020-12 with closed object schemas for
Target, Evidence, Finding, Requirement, Implementation, Oracle, Validation and
Checkpoint. Runtime structural validation implements precisely the vocabulary
used by these schemas; it is not a general-purpose JSON Schema interpreter.
IDs are caller-stable strings or `stableId(type, identity)`. The schema version
is independent of the npm package version. v1 structured documents migrate by
adding record versions; unknown versions fail. Existing Markdown/CSV documents
remain readable by their original workflows; they are not silently reinterpreted.

Records are JSON, never executable instructions. Evidence hashes cover data or
artifact reference; envelope hashes cover the entire stored document. A reference
hash does not authenticate artifact bytes or establish origin: import bytes as
data or separately verify the file digest. SHA-256 provides integrity, not trust.
Validation and cache history are retained. The latest validation must match the
current target identity and an independent oracle to support current coverage.

`Runtime` injects asynchronous `investigate`, `specify`, `implement`, `validate`,
`diagnose`, `repair` handlers. Contexts are cloned, each handler receives an
AbortSignal. The JSON adapter supplies real subprocess operations and the native
differential verifier. It never imports JavaScript named in target evidence.
Core users may provide trusted REA/host adapters through these contracts without
adding a provider SDK. Missing tools block; the runtime does not invent tools.
The live completion gate additionally requires an in-process receipt issued by
`differential`. Filled-in PASS/oracle metadata or a deserialized report cannot
forge this receipt. Trusted validation adapters return the fresh verifier object;
changes to its validated observations invalidate the receipt. Persisted reports
are historical checkpoints, not new proof after interruption or target changes.

The persistent task DAG is topologically sorted and checked against declared
scope. Task results, evidence IDs, requirements, decisions, blockers, operation
counts, stage durations, validation history and transitions survive interruption.
Resumption checks target, scope and workflow identity. Completed tasks are reused;
an interrupted uncommitted task must be idempotent because it can run again.
The JSON adapter always uses the complete corpus for the completion gate.
Incremental selection is separately available through `selectTests` for trusted
adapters and conservatively expands on unknown components or missing mappings.

## Failure and recovery

Explicit states: INVESTIGATE, SPECIFY, IMPLEMENT, VALIDATE, DIAGNOSE, REPAIR,
REVALIDATE, COMPLETE, BLOCKED, CANCELLED. Divergences are categorized as
investigation, specification, implementation, environment or test failures.
Recovery routes retain evidence and validation history; re-specification clears
task completion to avoid reusing work against changed requirements. Three
equivalent validation failures preserve the problematic hypothesis and block.
A changed failure signature remains subject to operation, iteration and time
budgets. A blocked strategy requires a revised plan and new run directory.

SIGINT/SIGTERM request cancellation, terminate the owned subprocess group and
persist a resumable checkpoint. SIGKILL cannot run cleanup. Explicit
`--recover-lock` removes only a run lock whose PID is proven absent. A store
`.lock` left by a kill during an atomic write needs owner/content inspection;
it is deliberately not silently removed. Temporary partial data is not promoted.
Atomic fsync/rename and optimistic hash revisions preserve the last complete
document. Locks are local-machine coordination, not distributed transactions.

## Integration and security boundaries

Codex and Claude Code use different explicit invocation syntax and discovery
directories. Native skill installation reuses the original installer with
integration off; no canonical REA change is needed. Legacy automatic co-use
remains supported by the original installer and the new owned-block adapter.
Backups/receipts precede canonical mutation; uninstall refuses externally changed
owned blocks and preserves changes outside them. Writes reject symlink paths;
read-only discovery resolves aliases and deduplicates by real path. Ambiguous
capitalization is rejected rather than choosing a file accidentally.

Diagnostics report filesystem/version compatibility separately from actual host
activation. Only caller-supplied host acknowledgement can report live loading;
the current Codex session explicitly read both skills; automatic routing and
Claude Code loading remain unverified. An opt-in bounded CLI probe verifies
REA version separately from skill metadata revision. Compatibility
currently recognizes REA majors 4–6 and is not proof all REA releases work.

Official host interfaces checked on 2026-10-20:
[Codex skills](https://developers.openai.com/codex/skills),
[Claude Code skills](https://code.claude.com/docs/en/skills).
The explicit invocation adapters use these mechanisms, not undocumented hooks.

Local argv execution is shell-free, with a separate executable allowlist,
minimal environment, time/output limits and owned POSIX process-group cleanup.
It is **not an OS sandbox**: a granted interpreter can read/write outside cwd
or use networking. Use it only for trusted authorized local fixtures/tools.
Unknown software requires an externally provided disposable sandbox adapter.
No CPU/memory/network isolation is claimed. In-process callbacks must cooperate
with cancellation; a synchronous blocking callback cannot be preempted by Node.
Windows process-tree cleanup and actual Windows/macOS execution are unvalidated.

Telemetry is local. Host tokens require explicit source attribution; byte-based
token figures are labeled estimates. The application neither enables billing nor
promises the surrounding AI host is free. No performance improvement is claimed.
