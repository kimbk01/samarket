# DIBAY Crawl Worker — location status

## LOCAL WORKER = SEPARATE PROCESS (LOCKED)

Product collect path:

```text
Admin → Next API → INSERT external_import_jobs → RETURN jobId
Independent process: npx tsx services/crawl-worker/worker-loop.mjs
  → poll/claim queued
  → Crawlee (job-executor.mjs)
  → site adapter
  → external_*
```

- Next MUST NOT `child_process.spawn` / fork / own worker lifecycle
- Crawlee runs only inside `services/crawl-worker/`
- One-shot debug: `npx tsx services/crawl-worker/run-job.mjs <jobId>`
- Restart recovery: stale `running` jobs reclaimed to `queued` (15m default)

## PRODUCTION WORKER HOST = UNRESOLVED

Do **not** treat local process as Production hosting decision.

Candidates (not chosen): dedicated Docker host / VM / container platform.

Not Vercel Functions.
