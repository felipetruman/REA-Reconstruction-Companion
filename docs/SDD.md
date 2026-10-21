# Software design

Native ESM modules, dependency injection, JSON Schema draft 2020-12, SHA-256.
`src/evidence` owns validated immutable records and a content-integrity envelope.
Writes use exclusive locks, exclusive temporary files, fsync and atomic rename;
revision checks prevent stale overwrites. Unknown schema versions fail closed.
`src/validation` owns independent oracle/candidate contracts and measured reports.
`src/runtime` owns persistent explicit transitions, deadlines, task DAG and recovery.
`src/adapters` owns explicitly authorized bounded local subprocess execution.
`src/integration` diagnoses explicitly scoped REA installations and controls only
its own legacy marker block. Native host skill discovery remains a host concern;
the adapter does not invent hooks or claim live routing from files alone.
`src/optimization` operates on identities, dependency graphs and immutable history.
`src/cli` exposes inspection and explicit execution, never dynamically imports an
untrusted workflow as JavaScript. Config is JSON, local commands are argv arrays.

Validation records identify target, candidate, corpus, oracle and environment.
PASS/FAIL/INCONCLUSIVE/NOT_RUN are distinct. COMPLETE requires a full independent
suite, no failed/inconclusive critical results, all task dependencies satisfied,
and requirements satisfied. Errors retain checkpoints and recovery decisions.
Callbacks receive AbortSignal; arbitrary in-process callbacks must cooperate.
Subprocess adapters enforce timeouts and process-group termination on POSIX.

Evidence history cannot prove current behavior after identity changes. Cache
reuse is historical unless identity matches exactly. Uncertain impact expands
to all tests. Context omissions are explicit and core safety remains included.
