# Incremental delivery

Baseline: Node 24.19.0 / pnpm 12.10.1, 575 tests, 572 pass, 0 fail,
3 skipped; `pnpm test`, log `/tmp/companion-baseline.log`.

1. E: failing structural/storage/graph tests, then evidence implementation.
2. V: failing independent-oracle/fuzz/mutation tests, then validation implementation.
3. R: failing resume/budget/false-completion tests, then runtime and CLI.
4. I: isolated absent/customized/drift/reversal tests, then adapter.
5. O: failing cache/impact/context tests, then optimizer; full regression,
   real subprocess E2E, isolated legacy installer, docs and recorded change.

Each delivery retains previous behavior. No remote push or global changes.
Final results and remaining external validation belong in VALIDATION.md.
