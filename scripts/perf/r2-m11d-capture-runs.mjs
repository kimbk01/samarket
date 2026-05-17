/**
 * R2-M11D — prefetch vs RSC flight · push 타이밍 · 재진입 reuse.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/perf/r2-m11d-capture-runs.mjs
 */
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
const runs = Number(process.env.R2M11D_RUNS ?? 3);

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

function parseD(text) {
  const m = text.match(/\[R2-M11D-BREAKDOWN\]\s*(\{.+)/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

async function openFirstRoom(page, { pointerDownFirst = false, reenter = false } = {}) {
  await page.goto(`${origin}/community-messenger?section=chats`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])').length >
      0,
    { timeout: 90_000 }
  );
  const btn = page
    .locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row]) [role="button"]')
    .first();
  if (pointerDownFirst) {
    await btn.dispatchEvent("pointerdown");
    await page.waitForTimeout(400);
  }
  await btn.click();
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 });
  await page.locator("[data-cm-composer] textarea").first().waitFor({ state: "visible", timeout: 45_000 });
  const roomUrl = page.url();
  if (reenter) {
    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const same = page
      .locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row]) [role="button"]')
      .first();
    if (pointerDownFirst) {
      await same.dispatchEvent("pointerdown");
      await page.waitForTimeout(400);
    }
    await same.click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 });
    await page.locator("[data-cm-composer] textarea").first().waitFor({ state: "visible", timeout: 45_000 });
  }
  return roomUrl;
}

async function oneRun(browser, runIndex, mode) {
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
    if (t.includes("R2-M11D")) logs.push(t);
  });

  let b = null;
  try {
    await login(page);
    await openFirstRoom(page, {
      pointerDownFirst: mode === "pointerdown_lead",
      reenter: mode === "reenter",
    });
    await page.waitForTimeout(1800);
    for (const line of logs) {
      const p = parseD(line);
      if (p) b = p;
    }
  } catch (err) {
    await context.close();
    return { runIndex, mode, error: String(err), breakdown: b, logCount: logs.length };
  }
  await context.close();
  return { runIndex, mode, error: null, breakdown: b, logCount: logs.length };
}

const modes = ["tap", "pointerdown_lead", "reenter"];
const browser = await chromium.launch({ headless: true });
const results = [];
for (let i = 0; i < runs; i += 1) {
  results.push(await oneRun(browser, i + 1, modes[i] ?? "tap"));
}
await browser.close();

const rows = results.map((r) => ({
  run: r.runIndex,
  mode: r.mode,
  error: r.error,
  room_prefetch_hit: r.breakdown?.room_prefetch_hit ?? null,
  route_push_before_prefetch_done: r.breakdown?.route_push_before_prefetch_done ?? null,
  route_change_after_prefetch_ms: r.breakdown?.route_change_after_prefetch_ms ?? null,
  route_change_to_suspense_release_ms: r.breakdown?.route_change_to_suspense_release_ms ?? null,
  flight_cache_hit: r.breakdown?.flight_cache_hit ?? null,
  rsc_flight_reused: r.breakdown?.rsc_flight_reused ?? null,
  flight_after_route_ms: r.breakdown?.flight_after_route_ms ?? null,
  framework_ceiling_candidate: r.breakdown?.framework_ceiling_candidate ?? null,
  prior_visit_count: r.breakdown?.prior_visit_count ?? null,
  logCount: r.logCount,
}));

const valid = rows.filter((r) => r.logCount > 0 && r.route_change_to_suspense_release_ms != null);
const pushBeforeDoneCount = valid.filter((r) => r.route_push_before_prefetch_done === true).length;
const pushBeforeDonePct =
  valid.length > 0 ? Math.round((pushBeforeDoneCount / valid.length) * 100) : null;

console.log(
  JSON.stringify(
    {
      origin,
      summary: {
        valid_runs: valid.length,
        push_before_prefetch_done_pct: pushBeforeDonePct,
        avg_route_change_to_suspense:
          valid.length > 0
            ? Math.round(
                valid.reduce((a, r) => a + (r.route_change_to_suspense_release_ms ?? 0), 0) / valid.length
              )
            : null,
        framework_ceiling_votes: valid.filter((r) => r.framework_ceiling_candidate === true).length,
      },
      runs: rows,
    },
    null,
    2
  )
);
