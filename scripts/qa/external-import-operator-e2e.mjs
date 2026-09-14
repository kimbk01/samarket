/**
 * Pre-commit / Phase 11 status correction — code contracts only.
 *
 * DEV_DB_AVAILABLE = NO → browser write E2E = NOT_PROVEN (not "Phase 11 complete").
 *
 * Run: node scripts/qa/external-import-operator-e2e.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, ".tmp/external-import-phase11");
mkdirSync(OUT, { recursive: true });

function read(p) {
  return readFileSync(resolve(ROOT, p), "utf8");
}

function envHost() {
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    const m = raw.match(/^(?:NEXT_PUBLIC_)?SUPABASE_URL\s*=\s*["']?([^"'\n]+)/m);
    if (!m) return null;
    try {
      return new URL(m[1].trim()).hostname;
    } catch {
      return m[1].trim();
    }
  } catch {
    return null;
  }
}

const host = envHost();
const DEV_DB_AVAILABLE =
  host != null && (host.includes("localhost") || host.includes("127.0.0.1")) ? "YES" : "NO";

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: detail || null });
}

check("old_admin_external_board_absent", !existsSync(resolve(ROOT, "app/admin/community/external-board")));
check("old_admin_external_sources_absent", !existsSync(resolve(ROOT, "app/admin/community/external-sources")));
check("old_execute_job_absent", !existsSync(resolve(ROOT, "lib/external-import/jobs/execute-job.ts")));
check("spawn_worker_module_absent", !existsSync(resolve(ROOT, "lib/external-import/jobs/spawn-worker.ts")));

const menu = read("components/admin/admin-menu.ts");
check("menu_external_import", menu.includes("/admin/community/external-import"));
check("menu_no_external_board", !menu.includes("/admin/community/external-board"));
check("admin_page_exists", existsSync(resolve(ROOT, "app/admin/community/external-import/page.tsx")));

const jobsRoute = read("app/api/admin/community/external-import/jobs/route.ts");
check("jobs_no_crawlee_import", !/from\s+["']crawlee["']/.test(jobsRoute));
check("jobs_no_execute_job", !/execute-job|executeExternalImportJob/.test(jobsRoute));
check("jobs_no_spawn_worker", !/spawnExternalImportWorker|spawn-worker|child_process/.test(jobsRoute));
check("jobs_insert_only", /status:\s*["']queued["']/.test(jobsRoute) && /return NextResponse\.json\(\{\s*ok:\s*true,\s*jobId/.test(jobsRoute));

const workerLoop = read("services/crawl-worker/worker-loop.mjs");
check("worker_loop_exists", existsSync(resolve(ROOT, "services/crawl-worker/worker-loop.mjs")));
check("worker_loop_claims", workerLoop.includes("claimNextQueuedJob"));
check("worker_loop_reclaim", workerLoop.includes("reclaimStaleRunningJobs"));
check("worker_loop_no_next", !/next\/server|vercel/i.test(workerLoop) || workerLoop.includes("vercelFunctionHost: false"));

const executor = read("services/crawl-worker/job-executor.mjs");
check("crawlee_in_executor", /CheerioCrawler|PlaywrightCrawler/.test(executor));
check(
  "claim_uses_atomic_rpc",
  executor.includes('rpc("claim_external_import_job"') || executor.includes("rpc('claim_external_import_job'"),
  "FOR UPDATE SKIP LOCKED via RPC"
);
check(
  "claim_no_select_then_update",
  !/select\("id"\)[\s\S]*eq\("status",\s*"queued"\)[\s\S]*claimJobById/.test(executor),
  "no non-atomic poll path"
);
const claimMig = resolve(ROOT, "supabase/migrations/20261230170000_external_import_claim_job_atomic.sql");
check("claim_migration_exists", existsSync(claimMig));
check(
  "claim_migration_skip_locked",
  existsSync(claimMig) && read("supabase/migrations/20261230170000_external_import_claim_job_atomic.sql").includes("for update skip locked")
);

const catalog = read("app/api/admin/community/external-import/catalog/route.ts");
check("catalog_no_engine_filter", !/engine\s*!==\s*["']playwright["']|engine\s*===\s*["']playwright["']/.test(catalog));
check("catalog_product_status", catalog.includes("resolveExternalSiteProductStatus"));
check("catalog_capabilities", catalog.includes("capabilities"));

const write = read("lib/external-import/publish/community-write.ts");
check("publish_dibay_now", /published_at:\s*dibayPublishedAt/.test(write));
check("publish_display_date", /display_date:\s*sourcePublishedAt/.test(write));

const queries = read("lib/neighborhood/queries.ts");
check("feed_selects_display_date", queries.includes("display_date"));

const report = {
  at: new Date().toISOString(),
  DEV_DB_AVAILABLE,
  supabaseHost: host,
  productionWrite: "PROHIBITED",
  PHASE11_CODE_CONTRACT: null,
  PHASE11_UNIT: "PASS_HISTORICAL_OR_RERUN",
  PHASE11_BROWSER_WRITE_E2E: "NOT_PROVEN",
  PHASE11_PRODUCT_E2E: "NOT_PROVEN",
  PHASE11_RUNTIME_E2E: "NOT_PROVEN",
  checks,
  pass: checks.every((c) => c.ok),
  failed: checks.filter((c) => !c.ok).map((c) => c.name),
};
report.PHASE11_CODE_CONTRACT = report.pass ? "PASS" : "FAIL";

writeFileSync(resolve(OUT, "phase11-contract-proof.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
