# Companion 2.0 requirements

The 1.3.34 Markdown skill, installer and 575 baseline cases remain compatible.
The optional Node >=20 runtime adds no model, daemon, database or paid service.
All investigated artifacts are untrusted data. Execution requires explicit local
authorization; tool availability is injected, never inferred from skill text.

| ID | Deliverable | Acceptance |
|---|---|---|
| E | Versioned evidence and traceability | Atomic verified storage; broken references, duplicates, stale versions and unsupported requirements detected |
| V | Independent validation | Bad candidates fail; missing/self oracles inconclusive; seeded fuzz and mutation reports carry denominators |
| R | Persistent bounded workflow | Real local reconstruction reaches completion only after independent full validation; interruption resumes; budgets and three identical failures stop |
| I | Scoped REA adapter | Explicit paths; nonmutating diagnosis; owned-block install/uninstall with backups, customization and external edits preserved |
| O | Context and execution optimization | Full-identity cache, version invalidation, shared-dependency test selection, bounded summaries with omissions and local telemetry |

No automatic global installation, network execution, recurring processes, agent
invocation, deployment or publication. CLI defaults to inspection. Local examples
are public software tests, not evidence of model generalization or blind results.
