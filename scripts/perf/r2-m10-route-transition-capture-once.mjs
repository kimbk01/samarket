/**
 * R2-M10 — list tap → route page mount (라우트 전환만).
 * node scripts/perf/r2-m10-route-transition-capture-once.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const storage = path.join(process.cwd(), "tests", "e2e", ".auth", "cm-storage.json");
const runs = Number(process.env.R2_M10_RUNS || "3");
const TARGET_GAP_MS = 150;

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function oneRun(browser, runIndex) {
  const logs = [];
  const context = await browser.newContext({ storageState: storage });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[R2-M10-ROUTE]") || t.includes("r2-m10")) logs.push(t);
  });

  await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const row = page.locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])').first();
  await row.waitFor({ state: "visible", timeout: 60_000 });
  await row.locator('[role="button"]').first().click({ timeout: 15_000 });
  await page.waitForURL(/\/community-messenger\/rooms\/[^/]+/, { timeout: 45_000 });
  await page.waitForTimeout(400);

  const phases = await page.evaluate(() => {
    const w = window;
    return w.getMessengerHomeVerificationSnapshot?.()?.appWidePhaseLastMs ?? {};
  });

  let breakdown = null;
  for (const line of logs) {
    const idx = line.indexOf("[R2-M10-ROUTE]");
    if (idx < 0) continue;
    try {
      breakdown = JSON.parse(line.slice(idx + "[R2-M10-ROUTE]".length).trim());
    } catch {
      /* ignore */
    }
  }

  await context.close();
  const gap =
    num(breakdown?.route_mount_gap_ms) ??
    num(phases.r2m10_route_mount_gap_ms) ??
    num(phases.messenger_room_entry_r2m10_route_mount_gap_ms);
  return {
    runIndex,
    route_mount_gap_ms: gap,
    tap_to_page_mount_ms: num(breakdown?.tap_to_page_mount_ms),
    tap_to_push_ms: num(breakdown?.tap_to_push_ms),
    push_to_route_change_ms: num(breakdown?.push_to_route_change_ms),
    route_change_to_page_mount_ms: num(breakdown?.route_change_to_page_mount_ms),
    prefetch_hit: breakdown?.prefetch_hit ?? null,
    pass: gap != null && gap <= TARGET_GAP_MS,
    breakdown,
    logsSample: logs.slice(-3),
  };
}

if (!fs.existsSync(storage)) {
  // eslint-disable-next-line no-console
  console.error(`Missing storage: ${storage}`);
  process.exit(1);
}

const browser = await chromium.launch();
const results = [];
for (let i = 0; i < runs; i += 1) {
  results.push(await oneRun(browser, i + 1));
  if (i < runs - 1) await new Promise((r) => setTimeout(r, 400));
}
await browser.close();

const gaps = results.map((r) => r.route_mount_gap_ms).filter((v) => v != null);
const verdict =
  gaps.length === runs && gaps.every((g) => g <= TARGET_GAP_MS) ? "PASS" : "HOLD";

// eslint-disable-next-line no-console
console.log(
  "\n=== R2_M10_ROUTE_JSON ===\n" +
    JSON.stringify({ target_gap_ms: TARGET_GAP_MS, verdict, results }, null, 2) +
    "\n=== END ===\n"
);

process.exit(verdict === "PASS" ? 0 : 1);
