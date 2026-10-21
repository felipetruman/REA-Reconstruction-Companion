# Historical held-out evaluation, 2026-10-21

One user-authorized agent, empty inherited conversation, existing host access;
159 black-box queries. Python reference and 64 expected scenarios sealed before
the candidate. Candidate frozen before evaluation. No hidden feedback or repair.
Independent engine: **FAIL, 63/64**; runtime **BLOCKED**, no false COMPLETE.
Missing behavior: input length >512 must produce SIZE before trimming.

Development separation was a shared-host protocol, not adversarial isolation.
Final candidate execution: pinned Node 20 Docker image, network disabled,
non-root, read-only, dropped capabilities, PID/memory/CPU limits. No extra APIs.
One target cannot estimate generalization. These published fixtures are now
exposed; future runs are historical regression replays, never blind benchmarks.

Reproduce (Docker must already contain the pinned image):

```sh
node evals/heldout-20261021/run.mjs --execute --root /tmp/companion-heldout-replay
```

Expected process exit: **1** (candidate divergence). Expected report: `status: FAIL`, `passed: 63`, `total: 64`, `runtimeState: BLOCKED`.
The runner intentionally retains the frozen incorrect candidate and does not
launch agents. A FAIL demonstrates candidate divergence, not failing software
regression tests. Source, corpus and identity hashes are preserved alongside it.
