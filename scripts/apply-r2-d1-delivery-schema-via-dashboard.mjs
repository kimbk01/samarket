/**
 * Supabase Dashboard SQL Editor — catch-up 적용 (전용 Playwright 프로필).
 * 1회차: 브라우저에서 Supabase 로그인 → 2회차부터 세션 재사용.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRef = "ckdosyydvgzqwpbwuhon";
const profileDir = resolve(process.cwd(), ".playwright-supabase-profile");
const sqlPath = resolve(
  process.cwd(),
  "supabase/scripts/r2-d1-store-order-deliveries-schema-catchup.sql"
);
const sql = readFileSync(sqlPath, "utf8");

async function main() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    slowMo: 30,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const sqlUrl = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;

  console.log("Opening", sqlUrl);
  await page.goto(sqlUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });

  const deadline = Date.now() + 300_000;
  let editor = page.locator(".monaco-editor textarea").first();
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

  await editor.waitFor({ state: "visible", timeout: 10_000 });
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(sql);
  await page.getByRole("button", { name: /^Run$/i }).click();
  await page.waitForTimeout(15_000);
  console.log("SQL submitted. URL:", page.url());
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
