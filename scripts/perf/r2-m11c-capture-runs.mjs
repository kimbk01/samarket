/**
 * R2-M11C — 3회 room tap, [R2-M11C-BREAKDOWN] layout vs flight 분해.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/perf/r2-m11c-capture-runs.mjs
 */
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
const runs = Number(process.env.R2M11C_RUNS ?? 3);

async function login(page) {
  await page.goto(`${origin}/login?next=${encodeURIComponent("/community-messenger")}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  page.on("dialog", (d) => d.accept().catch(() => undefined));
  const email = page.getByPlaceholder("이메일 또는 로그인 ID");
  await email.waitFor({ state: "visible", timeout: 30_000 });
  await email.fill(user);
  await page.locator('input[type="password"]').fill(pass);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
}

function parseM11C(text) {
  const m = text.match(/\[R2-M11C-BREAKDOWN\]\s*(\{.+)/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

async function oneRun(browser, runIndex) {
  const logs = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("R2-M11C")) logs.push(t);
  });

  let b = null;
  try {
    await login(page);
    await page.goto(`${origin}/community-messenger?section=chats`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])'
        ).length > 0,
      { timeout: 90_000 }
    );
    const roomRowBtn = page
      .locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row]) [role="button"]')
      .first();
    await roomRowBtn.click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 });
    await page.locator("[data-cm-composer] textarea").first().waitFor({ state: "visible", timeout: 45_000 });
    await page.waitForTimeout(1500);
    for (const line of logs) {
      const p = parseM11C(line);
      if (p) b = p;
    }
  } catch (err) {
    await context.close();
    return { runIndex, error: String(err), breakdown: b, logCount: logs.length };
  }
  await context.close();
  return { runIndex, error: null, breakdown: b, logCount: logs.length };
}

function pick(b, key) {
  const v = b?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (let i = 0; i < runs; i += 1) {
  results.push(await oneRun(browser, i + 1));
}
await browser.close();

const rows = results.map((r) => ({
  run: r.runIndex,
  error: r.error,
  main_layout_total_ms: pick(r.breakdown, "main_layout_total_ms"),
  bottom_nav_load_ms: pick(r.breakdown, "bottom_nav_load_ms"),
  menu_category_load_ms: pick(r.breakdown, "menu_category_load_ms"),
  auth_layout_ms: pick(r.breakdown, "auth_layout_ms"),
  room_segment_server_ms: pick(r.breakdown, "room_segment_server_ms"),
  remaining_flight_gap_ms: pick(r.breakdown, "remaining_flight_gap_ms"),
  rsc_flight_ms: pick(r.breakdown, "rsc_flight_ms"),
  route_change_to_suspense_release_ms: pick(r.breakdown, "route_change_to_suspense_release_ms"),
  verdict_category: r.breakdown?.verdict_category ?? null,
  marks: r.breakdown?.marks ?? null,
  logCount: r.logCount,
}));

console.log(JSON.stringify({ origin, runs: rows }, null, 2));
