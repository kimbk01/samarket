/**
 * 메신저 방 — [data-cm-composer] textarea 가 DOM 에 보이는지 확인.
 * 사용: E2E_TEST_USERNAME / E2E_TEST_PASSWORD, npm run start 후
 *   node scripts/verify-cm-room-composer-visible.mjs
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
try {
  await testLogin(page);
  await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
  const row = page.locator('[data-messenger-chat-row="true"]').first();
  await row.waitFor({ state: "visible", timeout: 60_000 });
  await row.click();
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });

  const composer = page.locator('[data-cm-composer] textarea').first();
  await composer.waitFor({ state: "visible", timeout: 45_000 });

  const box = await composer.boundingBox();
  const visible = await composer.evaluate((el) => {
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  if (!visible || !box || box.height < 20) {
    const html = await page.locator("[data-cm-composer]").first().innerHTML().catch(() => "");
    console.error("composer not visibly laid out", { box, visible, htmlSnippet: html.slice(0, 200) });
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, composerBox: box, url: page.url() }, null, 2));
} finally {
  await browser.close();
}
