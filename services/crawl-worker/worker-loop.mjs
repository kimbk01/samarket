/**
 * Independent crawl worker claim loop.
 *
 * LOCKED product path:
 *   Admin → Next INSERT external_import_jobs → RETURN jobId
 *   THIS PROCESS (separate) → poll/claim queued → Crawlee → adapter → external_*
 *
 * Next MUST NOT spawn this process.
 *
 * Start (repo root, local):
 *   npx tsx services/crawl-worker/worker-loop.mjs
 *
 * Env:
 *   EXTERNAL_IMPORT_WORKER_POLL_MS  (default 2000)
 *   EXTERNAL_IMPORT_STALE_RUNNING_MS (default 900000 = 15m)
 *
 * Restart recovery: stale `running` jobs older than STALE window are reclaimed to `queued`.
 *
 * PRODUCTION WORKER HOST = UNRESOLVED (not Vercel).
 */
import {
  sbAdmin,
  makeWorkerId,
  claimNextQueuedJob,
  reclaimStaleRunningJobs,
  completeJob,
  failJob,
  executeClaimedJob,
} from "./job-executor.mjs";

const POLL_MS = Math.max(500, Number(process.env.EXTERNAL_IMPORT_WORKER_POLL_MS || 2000));
const STALE_MS = Math.max(60_000, Number(process.env.EXTERNAL_IMPORT_STALE_RUNNING_MS || 15 * 60 * 1000));
const WORKER_ID = makeWorkerId("crawl-worker-loop");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tick(sb) {
  const claimed = await claimNextQueuedJob(sb, WORKER_ID);
  if (!claimed) return false;
  const jobId = claimed.id;
  console.log(JSON.stringify({ event: "claimed", jobId, action: claimed.action, workerId: WORKER_ID }));
  try {
    const summary = await executeClaimedJob(sb, claimed);
    await completeJob(sb, jobId, summary);
    console.log(JSON.stringify({ event: "completed", jobId, summary }));
  } catch (e) {
    await failJob(sb, jobId, e);
    console.error(JSON.stringify({ event: "failed", jobId, error: String(e?.message || e) }));
  }
  return true;
}

async function main() {
  const sb = sbAdmin();
  console.log(
    JSON.stringify({
      event: "worker_loop_start",
      workerId: WORKER_ID,
      pollMs: POLL_MS,
      staleMs: STALE_MS,
      vercelFunctionHost: false,
      nextOwnedLifecycle: false,
    })
  );

  // Recover orphans from prior process death
  try {
    const reclaimed = await reclaimStaleRunningJobs(sb, STALE_MS);
    if (reclaimed.length) {
      console.log(JSON.stringify({ event: "reclaimed_stale", ids: reclaimed }));
    }
  } catch (e) {
    console.error(JSON.stringify({ event: "reclaim_error", error: String(e?.message || e) }));
  }

  let loops = 0;
  for (;;) {
    loops += 1;
    try {
      if (loops % 30 === 1) {
        // Periodic reclaim while running
        await reclaimStaleRunningJobs(sb, STALE_MS);
      }
      const worked = await tick(sb);
      if (!worked) await sleep(POLL_MS);
    } catch (e) {
      console.error(JSON.stringify({ event: "loop_error", error: String(e?.message || e) }));
      await sleep(POLL_MS);
    }
  }
}

main();
