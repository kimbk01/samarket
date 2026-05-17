/**
 * R2-M11 — 3회 list tap → room, [R2-M11-SUSPENSE] + composer DOM 판정.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/perf/r2-m11-capture-runs.mjs
 */
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
const runs = Number(process.env.R2M11_RUNS ?? 3);

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

function parseLogLine(text) {
  const m11 = text.match(/\[R2-M11-SUSPENSE\]\s*(\{.+)/);
  if (m11) {
    try {
      return { kind: "m11", data: JSON.parse(m11[1]) };
    } catch {
      return { kind: "m11", raw: m11[1] };
    }
  }
  const m10 = text.match(/\[R2-M10-ROUTE\]\s*(\{.+)/);
  if (m10) {
    try {
      return { kind: "m10", data: JSON.parse(m10[1]) };
    } catch {
      return { kind: "m10", raw: m10[1] };
    }
  }
  return null;
}

async function oneRun(browser, runIndex) {
  const logs = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
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
    if (t.includes("R2-M11") || t.includes("R2-M10")) logs.push(t);
  });

  let m11 = null;
  let m10 = null;
  let composerOk = false;
  let authOk = false;

  try {
    await login(page);
    authOk = true;
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
    await roomRowBtn.waitFor({ state: "visible", timeout: 90_000 });
    await roomRowBtn.click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 });
    const ta = page.locator("[data-cm-composer] textarea").first();
    await ta.waitFor({ state: "visible", timeout: 45_000 });
    composerOk = true;
    await page.waitForTimeout(1200);

    for (const line of logs) {
      const p = parseLogLine(line);
      if (p?.kind === "m11" && p.data) m11 = p.data;
      if (p?.kind === "m10" && p.data) m10 = p.data;
    }
  } catch (err) {
    await context.close();
    return { runIndex, authOk, composerOk, error: String(err), m11, m10, logCount: logs.length };
  }

  await context.close();
  return {
    runIndex,
    authOk,
    composerOk,
    m11,
    m10,
    logCount: logs.length,
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (let i = 0; i < runs; i += 1) {
  results.push(await oneRun(browser, i + 1));
}
await browser.close();

const summary = {
  origin,
  runs: results.map((r) => ({
    run: r.runIndex,
    authOk: r.authOk,
    composerOk: r.composerOk,
    error: r.error ?? null,
    route_change_to_release_ms: r.m11?.route_change_to_release_ms ?? null,
    release_to_phase1_visible_ms: r.m11?.release_to_phase1_visible_ms ?? null,
    route_mount_gap_ms: r.m10?.route_mount_gap_ms ?? null,
    nested_suspense_count: r.m11?.nested_suspense_count ?? null,
    suspense_fallback_visible_ms: r.m11?.suspense_fallback_visible_ms ?? null,
    phase1_visible_ms: r.m11?.phase1_visible_ms ?? null,
  })),
};

const passM11Release = summary.runs.filter((r) => r.route_change_to_release_ms != null && r.route_change_to_release_ms <= 150);
const passM11Phase1 = summary.runs.filter(
  (r) => r.release_to_phase1_visible_ms != null && r.release_to_phase1_visible_ms <= 200
);
const passMount = summary.runs.filter((r) => r.route_mount_gap_ms != null && r.route_mount_gap_ms <= 150);
const allComposer = summary.runs.every((r) => r.composerOk);

summary.verdict = {
  composer_ok: allComposer,
  route_change_to_release_pass: passM11Release.length >= 2 ? "PASS" : "HOLD",
  release_to_phase1_visible_pass: passM11Phase1.length >= 2 ? "PASS" : "HOLD",
  route_mount_gap_pass: passMount.length >= 2 ? "PASS" : "HOLD",
  overall: "HOLD",
};
if (
  summary.verdict.composer_ok &&
  summary.verdict.route_change_to_release_pass === "PASS" &&
  summary.verdict.release_to_phase1_visible_pass === "PASS" &&
  summary.verdict.route_mount_gap_pass === "PASS"
) {
  summary.verdict.overall = "PASS";
}

console.log(JSON.stringify(summary, null, 2));
