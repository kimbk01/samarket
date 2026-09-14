/**
 * One-shot job runner (manual/debug). Not called by Next.
 *
 * Usage (from repo root):
 *   npx tsx services/crawl-worker/run-job.mjs <jobId>
 *
 * Product path uses worker-loop.mjs (independent poll/claim).
 */
import {
  sbAdmin,
  makeWorkerId,
  claimJobById,
  completeJob,
  failJob,
  executeClaimedJob,
} from "./job-executor.mjs";

async function main() {
  const jobId = String(process.argv[2] || "").trim();
  if (!jobId) {
    console.error("usage: run-job.mjs <jobId>");
    process.exit(2);
  }
  const sb = sbAdmin();
  const workerId = makeWorkerId("crawl-worker-oneshot");
  let claimed;
  try {
    claimed = await claimJobById(sb, jobId, workerId);
  } catch (e) {
    console.error(String(e?.message || e));
    process.exit(1);
  }

  try {
    const summary = await executeClaimedJob(sb, claimed);
    await completeJob(sb, jobId, summary);
    console.log(JSON.stringify({ ok: true, jobId, summary }));
  } catch (e) {
    await failJob(sb, jobId, e);
    console.error(JSON.stringify({ ok: false, jobId, error: String(e?.message || e) }));
    process.exit(1);
  }
}

main();
