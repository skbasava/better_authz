# Initial compatibility findings — template

> Fill in during Task 0 execution. Preserve negative findings verbatim even
> after fixes are adopted.

## Runtime

- Pinned better-auth: 1.7.10 (candidate pin; confirm against registry + lockfile)
- Probe worker compatibility date: TBD (from passing getSetCookie test)
- Workers test pool: 0.23.0 + vitest 4.1.0 (candidate; smoke test result: TBD)

## Negative findings (do not delete)

| Finding | Repro | Disposition |
| --- | --- | --- |
| Concurrent owner demotions can yield zero owners (unguarded) | run-functional.mjs interleaving | PENDING — atomic D1 guards / proposed mutation DO |

## Gate evidence index

See gate-status.md for per-gate probe commands and results.
