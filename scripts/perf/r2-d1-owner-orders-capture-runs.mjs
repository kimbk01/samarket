/**
 * R2-D1 — owner orders dashboard 3회 시나리오 계측.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/perf/r2-d1-owner-orders-capture-runs.mjs
 *
 * 시나리오: 대시보드 open → idle 60s → tab hide/show → (API로 상태 변경은 수동/별도)
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const user = process.env.E2E_TEST_USERNAME?.trim() || "aa11";
const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
const runs = Number(process.env.R2D1_RUNS ?? 3);
const outPath = process.env.R2D1_OUT ?? "messenger-r2-d1-perf.log";

async function login(page) {
  await page.goto(`${origin}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  const email = page.getByPlaceholder("이메일 또는 로그인 ID");
  await email.waitFor({ state: "visible", timeout: 30_000 });
  await email.fill(user);
  const pw = page.locator('input[type="password"]');
  await pw.fill(pass);
  const submit = page.getByRole("button", { name: /^로그인$/ });
  await submit.waitFor({ state: "visible", timeout: 30_000 });
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 90_000,
    }),
    submit.click(),
  ]);
}

function emptyCounts() {
  return {
    realtime_event: 0,
    row_patch_insert: 0,
    row_patch_update: 0,
    row_patch_remove: 0,
    full_reload: 0,
    full_reload_blocked: 0,
    poll_fetch: 0,
    pageshow_fetch: 0,
    delivery_reload: 0,
    delivery_realtime_event: 0,
    delivery_row_patch_insert: 0,
    delivery_row_patch_update: 0,
    delivery_row_patch_delete: 0,
    delivery_row_patch_miss: 0,
    delivery_full_reload_blocked: 0,
    duplicate_fetch: 0,
    duplicate_fetch_candidate: 0,
    listener_attach: 0,
    listener_detach: 0,
  };
}

const COUNT_KEYS = Object.keys(emptyCounts());

async function oneRun(browser, runIndex) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("dibay:r2d1:trace", "1");
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept().catch(() => undefined));
  const consoleLines = [];
  const orderListFetches = [];

  page.on("request", (req) => {
    const u = req.url();
    if (/\/api\/me\/stores\/[^/]+\/orders(?:\?|$)/.test(u)) {
      orderListFetches.push({ url: u, at: Date.now() });
    }
  });

  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[dibay-r2d1]")) consoleLines.push(t);
  });

  const result = {
    run: runIndex + 1,
    authOk: false,
    dashboardOk: false,
    counts: emptyCounts(),
    duplicate_fetch_lines: 0,
    memory_mb_end: null,
    order_list_fetch_count: 0,
    me_stores_fetch_count: 0,
    dibay_r2d1_console_lines: 0,
  };

  try {
    await login(page);
    result.authOk = true;

    await page.goto(`${origin}/stores/owner/orders`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => {
        const t = document.body?.innerText ?? "";
        return (
          (t.includes("신규 주문") && t.includes("조리중")) ||
          t.includes("아직 주문이 없습니다") ||
          t.includes("주문 관리")
        );
      },
      { timeout: 60_000 }
    );
    result.dashboardOk = true;

    await page.waitForTimeout(3_000);
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(60_000);

    const snap = await page.evaluate(() => {
      const w = window;
      const coll = w.__R2D1_OWNER_ORDERS__;
      const perf = performance.memory;
      return {
        counts: coll?.counts ?? null,
        eventLen: coll?.events?.length ?? 0,
        heapUsedMb:
          perf && typeof perf.usedJSHeapSize === "number"
            ? Math.round((perf.usedJSHeapSize / (1024 * 1024)) * 10) / 10
            : null,
      };
    });

    if (snap.counts) result.counts = { ...emptyCounts(), ...snap.counts };
    result.dibay_r2d1_console_lines = consoleLines.length;
    result.duplicate_fetch_lines = consoleLines.filter((l) => l.includes("duplicate_fetch")).length;
    for (const kind of COUNT_KEYS) {
      result.counts[kind] = Math.max(
        result.counts[kind] ?? 0,
        consoleLines.filter((l) => l.includes(`"${kind}"`) || l.includes(` ${kind} `)).length
      );
    }
    if (snap.counts) {
      for (const [k, v] of Object.entries(snap.counts)) {
        result.counts[k] = Math.max(result.counts[k] ?? 0, Number(v) || 0);
      }
    }
    result.order_list_fetch_count = orderListFetches.length;
    result.memory_mb_end = snap.heapUsedMb;
    result.collector_events = snap.eventLen;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  } finally {
    await context.close();
  }

  for (const line of consoleLines) {
    if (!line.includes("duplicate_fetch")) continue;
    result.duplicate_fetch_lines += 0;
  }

  return { result, consoleLines };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const all = [];
  try {
    for (let i = 0; i < runs; i++) {
      const row = await oneRun(browser, i);
      all.push(row);
      console.log(
        JSON.stringify({
          run: row.result.run,
          counts: row.result.counts,
          order_list_fetch: row.result.order_list_fetch_count,
          memory_mb: row.result.memory_mb_end,
        })
      );
    }
  } finally {
    await browser.close();
  }

  const summary = {
    captured_at: new Date().toISOString(),
    origin,
    runs: all.map((r) => r.result),
    aggregate: {
      full_reload_avg:
        all.reduce((s, r) => s + (r.result.counts?.full_reload ?? 0), 0) / Math.max(1, all.length),
      poll_fetch_avg:
        all.reduce((s, r) => s + (r.result.counts?.poll_fetch ?? 0), 0) / Math.max(1, all.length),
      realtime_event_avg:
        all.reduce((s, r) => s + (r.result.counts?.realtime_event ?? 0), 0) / Math.max(1, all.length),
      row_patch_insert_avg:
        all.reduce((s, r) => s + (r.result.counts?.row_patch_insert ?? 0), 0) / Math.max(1, all.length),
      full_reload_blocked_avg:
        all.reduce((s, r) => s + (r.result.counts?.full_reload_blocked ?? 0), 0) /
        Math.max(1, all.length),
      delivery_reload_avg:
        all.reduce((s, r) => s + (r.result.counts?.delivery_reload ?? 0), 0) / Math.max(1, all.length),
      delivery_full_reload_blocked_avg:
        all.reduce((s, r) => s + (r.result.counts?.delivery_full_reload_blocked ?? 0), 0) /
        Math.max(1, all.length),
      delivery_row_patch_update_avg:
        all.reduce((s, r) => s + (r.result.counts?.delivery_row_patch_update ?? 0), 0) /
        Math.max(1, all.length),
      duplicate_fetch_total: all.reduce((s, r) => s + (r.result.duplicate_fetch_lines ?? 0), 0),
      order_list_fetch_avg:
        all.reduce((s, r) => s + (r.result.order_list_fetch_count ?? 0), 0) / Math.max(1, all.length),
      dibay_r2d1_lines_avg:
        all.reduce((s, r) => s + (r.result.dibay_r2d1_console_lines ?? 0), 0) / Math.max(1, all.length),
    },
  };

  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
