/**
 * R2-M11B — 3회 list tap → room, [R2-M11B-BREAKDOWN] 분해 수집.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/perf/r2-m11b-capture-runs.mjs
 */
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
const runs = Number(process.env.R2M11B_RUNS ?? 3);

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

function parseM11B(text) {
  const m = text.match(/\[R2-M11B-BREAKDOWN\]\s*(\{.+)/);
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
    if (t.includes("R2-M11B")) logs.push(t);
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
      const p = parseM11B(line);
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
  route_change_to_server_start_ms: pick(r.breakdown, "route_change_to_server_start_ms"),
  server_start_to_server_done_ms: pick(r.breakdown, "server_start_to_server_done_ms"),
  server_done_to_flight_done_ms: pick(r.breakdown, "server_done_to_flight_done_ms"),
  flight_done_to_suspense_release_ms: pick(r.breakdown, "flight_done_to_suspense_release_ms"),
  suspense_release_to_first_client_boundary_ms: pick(
    r.breakdown,
    "suspense_release_to_first_client_boundary_ms"
  ),
  first_client_boundary_to_phase1_visible_ms: pick(
    r.breakdown,
    "first_client_boundary_to_phase1_visible_ms"
  ),
  provider_commit_ms: pick(r.breakdown, "provider_commit_ms"),
  route_change_to_suspense_release_ms: pick(r.breakdown, "route_change_to_suspense_release_ms"),
  room_page_server_wall_ms: pick(r.breakdown, "room_page_server_wall_ms"),
  logCount: r.logCount,
}));

function verdictForSegment(values, threshold) {
  const nums = values.filter((v) => v != null);
  if (nums.length < 2) return "측정누락";
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (avg >= threshold) return "병목";
  return "양호";
}

const summary = {
  origin,
  runs: rows,
  table: {
    route_change_to_server_start: rows.map((r) => r.route_change_to_server_start_ms),
    server_start_to_server_done: rows.map((r) => r.server_start_to_server_done_ms),
    server_done_to_flight_done: rows.map((r) => r.server_done_to_flight_done_ms),
    flight_done_to_suspense_release: rows.map((r) => r.flight_done_to_suspense_release_ms),
    suspense_release_to_first_client_boundary: rows.map(
      (r) => r.suspense_release_to_first_client_boundary_ms
    ),
    first_client_boundary_to_phase1_visible: rows.map((r) => r.first_client_boundary_to_phase1_visible_ms),
    provider_commit: rows.map((r) => r.provider_commit_ms),
    route_change_to_suspense_release: rows.map((r) => r.route_change_to_suspense_release_ms),
  },
};

console.log(JSON.stringify(summary, null, 2));
