/**
 * Supabase Dashboard — read-only pg_cron job check for P4.
 * Run: node scripts/verify-p4-pg-cron-via-dashboard.mjs
 */
import { chromium } from "playwright";

const projectRef = "ckdosyydvgzqwpbwuhon";
const profileDir = new URL("../.playwright-supabase-profile", import.meta.url).pathname;
const sql = `SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'cleanup_stale_cm_call_sessions';`;

async function main() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1400, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const sqlUrl = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;

  await page.goto(sqlUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });

  const deadline = Date.now() + 180_000;
  const editor = page.locator(".monaco-editor textarea").first();
  while (Date.now() < deadline) {
    if (page.url().includes(`/project/${projectRef}/`) && !page.url().includes("/login")) {
      try {
        await editor.waitFor({ state: "visible", timeout: 5_000 });
        break;
      } catch {
        await page.goto(sqlUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      }
    }
    await page.waitForTimeout(2_000);
  }

  if (page.url().includes("/login")) {
    console.log(JSON.stringify({ status: "BLOCKED", reason: "supabase_login_required" }));
    await context.close();
    process.exit(2);
  }

  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(sql);
  await page.getByRole("button", { name: /^Run$/i }).click();
  await page.waitForTimeout(8_000);

  const bodyText = await page.locator("main").innerText().catch(() => "");
  const hasJob = bodyText.includes("cleanup_stale_cm_call_sessions");
  const hasSchedule = bodyText.includes("*/2 * * * *") || bodyText.includes("0/2");
  console.log(
    JSON.stringify(
      {
        status: hasJob ? "PASS" : "NOT_FOUND",
        jobnameVisible: hasJob,
        scheduleHint: hasSchedule,
        snippet: bodyText.slice(0, 800),
      },
      null,
      2,
    ),
  );
  await context.close();
}

main().catch((e) => {
  console.error(JSON.stringify({ status: "FAIL", error: String(e.message || e) }));
  process.exit(1);
});
