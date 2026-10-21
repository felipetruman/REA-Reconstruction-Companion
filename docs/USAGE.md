# Install and run

Node >=20 and pnpm are sufficient; the runtime has no npm dependencies.
Commands below run from the complete source package. No global change is needed.

```sh
pnpm test
pnpm lint
node src/cli/index.mjs help
```

Install the original Markdown skill into a **chosen isolated host directory**:

```sh
node install.mjs --client generic --skills-dir /tmp/rea-skills --integration off --dry-run
node install.mjs --client generic --skills-dir /tmp/rea-skills --integration off
node install.mjs --client generic --skills-dir /tmp/rea-skills --integration off --check
```

For existing real installations keep the original INSTALL.md instructions,
explicit integration choice, backup and replacement behavior. Runtime commands
do not alter global Codex, Claude Code or REA settings. Copying only the skill
folder does not install the runtime; keep the complete package available.

## A real local reconstruction

The example creates a public preserved reference corpus and reconstructs an
independent candidate file using trusted local Node code. Use a new directory.

```sh
node src/cli/example.mjs /tmp/rea-companion-demo --execute
node src/cli/index.mjs plan --config /tmp/rea-companion-demo/workflow.json --root /tmp/rea-companion-demo/run
```

The generator prints `allowedExecutable`. Use that exact absolute Node path.
In these commands the shell resolves the current Node executable:

```sh
node src/cli/index.mjs run --config /tmp/rea-companion-demo/workflow.json --root /tmp/rea-companion-demo/run --execute --allow-executable "$(node -p 'process.execPath')" --until IMPLEMENT
node src/cli/index.mjs status --config /tmp/rea-companion-demo/workflow.json --root /tmp/rea-companion-demo/run
node src/cli/index.mjs resume --config /tmp/rea-companion-demo/workflow.json --root /tmp/rea-companion-demo/run --execute --allow-executable "$(node -p 'process.execPath')"
node src/cli/index.mjs validate --config /tmp/rea-companion-demo/workflow.json --root /tmp/rea-companion-demo/run --execute --allow-executable "$(node -p 'process.execPath')"
node src/cli/index.mjs report --config /tmp/rea-companion-demo/workflow.json --root /tmp/rea-companion-demo/run
```

`--until IMPLEMENT` checkpoints after implementation, before validation. To
cancel a running command press Ctrl+C, or send SIGTERM to its printed shell PID.
Cancellation persists state and kills only its owned tool process group. Resume
with the command above. After SIGKILL, use `resume ... --recover-lock --execute`
only after diagnosing the owner; live owners are refused. Atomic store locks
have a separate conservative recovery boundary documented in ARCHITECTURE.md.

Exit codes: 0 successful operation or safe checkpoint, 1 failed/inconclusive
validation, blocked or cancelled workflow, 2 invalid invocation/contract/error.
Plan/status/report/context never create files. Validate invokes the candidate,
so it requires execution authorization and persists the new validation result.
Changing config requires a new run directory; old evidence remains available.

The CLI's JSON workflow contract is illustrated by the generated workflow:
target identity, scope, requirements with acceptance criteria, dependency-ordered
tasks with argv commands, candidate command and preserved oracle cases.
Each case supplies a requirement ID, input and independent expected observation.
Observations may include output, error, persisted state, effects and transitions.
Expected errors use `{ "error": { "name": "Error", "message": "..." } }`.
Intentional differences need a scenario-specific approved exception, reason and
exact `expectedObserved`; original divergence remains in the result.

## Libraries and reports

Import `src/evidence/index.mjs` for `EvidenceStore`, record validation, migration,
canonical hashes and graph reports. `add` is idempotent for identical records;
conflicting IDs fail. `replace` requires the prior record digest. Broken typed
references and dependency cycles are returned by `audit`; full reports identify
unsupported, blocked, stale and implemented/unvalidated requirements.

`src/validation/index.mjs` exports preserved and contract/specification/invariant
oracles, `differential`, seeded `fuzz`, bounded minimization, `mutations`,
`benchmark`, `blindProtocol` and metrics. A contract oracle must be independent
and return a boolean; throwing or absent oracles are inconclusive. The caller
is responsible for genuine oracle provenance, not merely an independent label.
Runtime validation handlers must return the fresh object issued by `differential`,
not a JSON copy or a hand-authored PASS. The live gate verifies the engine receipt;
an explicit `fullSuite: false` report cannot complete a workflow.
Fuzz generators/checks are trusted callbacks; use `corpusFile` to preserve a
reproducible corpus. Mutants are explicit local functions, not unknown code.
Blind evaluation records a protocol and NOT_RUN until an authorized external
custodian/runner supplies an unexposed target and held-out corpus.

`src/optimization/index.mjs` exports exact-identity cache, conservative impact
selection, per-topic reference selection/loading, bounded summaries and local
telemetry. `loadReferences` reports omissions; checkpoints retain full history.
`selectTests` expands shared dependencies and uses the whole suite when impact
is unclear or `completionGate` is true. Evidence/validation coverage metrics
require audited support/current relevant tests, not just nonempty reference IDs.
No calibrated confidence probability is inferred from agent judgments.

## Scoped integration

Native skill installation/verification can reuse the original installer without
canonical REA edits. Without `--execute`, this is a read-only preview; a later
customized installation is preserved unless `--replace` is explicitly supplied.

```sh
node src/cli/index.mjs integration --action skill-install --skills-dir /tmp/rea-native-skills --host codex
node src/cli/index.mjs integration --action skill-install --skills-dir /tmp/rea-native-skills --host codex --execute
```

```sh
node src/cli/index.mjs integration --action diagnose --rea-path /tmp/rea-skills/reverse-engineer-anything --companion-path /tmp/rea-skills/rea-reconstruction-companion --host codex
node src/cli/index.mjs integration --action plan --rea-path /tmp/rea-skills/reverse-engineer-anything --mode legacy
node src/cli/index.mjs integration --action install --rea-path /tmp/rea-skills/reverse-engineer-anything --mode legacy --receipt-dir /tmp/rea-integration-receipts --execute
node src/cli/index.mjs integration --action uninstall --receipt /tmp/rea-integration-receipts/RECEIPT-ID.json --execute
node src/cli/index.mjs context --topic function
```

Supply actual existing REA/receipt paths. `plan` displays exact before/after text;
it does not apply it. Prefer explicit host invocation (`$rea-reconstruction-companion`
in Codex; `/rea-reconstruction-companion` in Claude Code). Legacy integration
modifies only its marked block. Runtime verification remains false until actual
host acknowledgement; file presence alone is insufficient.
