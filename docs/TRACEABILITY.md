# Traceability

| Requirement | Implementation | Executable acceptance |
|---|---|---|
| E | src/evidence | tests/v2/evidence.test.mjs |
| V | src/validation | tests/v2/validation.test.mjs |
| R | src/runtime, src/adapters, src/cli | tests/v2/runtime.test.mjs, tests/v2/e2e.test.mjs |
| I | src/integration | tests/v2/integration.test.mjs; existing install.test.mjs |
| O | src/optimization | tests/v2/optimization.test.mjs |

Status is determined by executable results, not this table. Public fixtures
verify software behavior only. Agent/model blind benchmark results are NOT_RUN.

[TRACEABILITY.json](TRACEABILITY.json) maps all 42 new executed behavior tests
to components, source files, actual PASS results and the integrated suite log.
`validation-results.json` records counts, environment and log digests. Unknown
external validations remain NOT_RUN rather than inheriting local test success.
