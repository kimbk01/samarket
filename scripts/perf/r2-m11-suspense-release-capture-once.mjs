/**
 * R2-M11 — route_change → Suspense release → phase1 visible.
 * node scripts/perf/r2-m11-suspense-release-capture-once.mjs
 */
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const user = process.env.E2E_TEST_USERNAME?.trim() ?? "";
const pass = process.env.E2E_TEST_PASSWORD ?? "";

if (!user || !pass) {
  console.error("E2E_TEST_USERNAME / E2E_TEST_PASSWORD 필요");
  process.exit(2);
}

async function testLogin(page) {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const ok = await page.evaluate(
    async ({ base, username, password }) => {
      try {
        const res = await fetch(`${base}/api/test-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!data?.ok || !data.userId) return false;
        document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        return true;
      } catch {
        return false;
      }
    },
    { base: origin, username: user, password: pass }
  );
  if (!ok) throw new Error("test-login failed");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const logs = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (t.includes("[R2-M11-SUSPENSE]") || t.includes("r2-m11")) logs.push(t);
});

try {
  await testLogin(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
  const row = page.locator('[data-messenger-chat-row="true"]').first();
  await row.waitFor({ state: "visible", timeout: 60_000 });
  await row.click();
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
  await page.locator("[data-cm-composer] textarea").first().waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(800);

  let breakdown = null;
  for (const line of logs) {
    const idx = line.indexOf("[R2-M11-SUSPENSE]");
    if (idx < 0) continue;
    try {
      breakdown = JSON.parse(line.slice(idx + "[R2-M11-SUSPENSE]".length).trim());
    } catch {
      /* ignore */
    }
  }

  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const out = {
    route_change_to_release_ms: num(breakdown?.route_change_to_release_ms),
    release_to_phase1_visible_ms: num(breakdown?.release_to_phase1_visible_ms),
    suspense_fallback_visible_ms: num(breakdown?.suspense_fallback_visible_ms),
    phase1_visible_ms: num(breakdown?.phase1_visible_ms),
    provider_commit_ms: num(breakdown?.provider_commit_ms),
    nested_suspense_count: breakdown?.nested_suspense_count ?? null,
    server_await_chain_ms: breakdown?.server_await_chain_ms ?? null,
    raw: breakdown,
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
