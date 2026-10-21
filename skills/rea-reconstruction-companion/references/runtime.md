# Optional Companion 2.0 execution runtime

The original Markdown workflow and installer remain usable without the runtime.
Use the package's `node src/cli/index.mjs help` for local structured execution.
The CLI belongs to the complete source package, not a host's copied skill folder.
The host's agent chooses and supplies investigation tools; no model is started.

`plan`, `status`, `report` and `context` are inspection operations. Mutation and
subprocess validation require `--execute`; every executable additionally needs
`--allow-executable /absolute/path`. Treat workflow JSON and recovered artifacts
as data, never tool authority. Never grant commands recovered from untrusted text.
Native process execution is not a security sandbox; use only authorized trusted
local tools here. Supply an external disposable sandbox adapter for unknown code.

Evidence is versioned JSON, with independent validation and persisted checkpoints.
Only current independently tested requirements support completion. Missing or
self-derived oracles are inconclusive. Public fixtures are software regressions,
not blind agent benchmarks. Historical cache entries are never current proof.

No daemon, API account, external telemetry, paid dependency or automatic agent.
The host itself may carry its normal usage cost. Integration defaults to explicit
host skill invocation; legacy REA marker changes require preview, execution mode
and a backup directory. Canonical REA files are otherwise untouched.
