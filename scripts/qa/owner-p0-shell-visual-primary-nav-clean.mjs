import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-p0-shell-visual");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function dismiss(page) {
  for (let i = 0; i < 6; i++) {
    const popupClose = page.locator(
      '[data-platform-popup-root] button, .dibay-platform-popup-root button, [aria-label*="Close" i], [aria-label*="닫기" i]'
    );
    const dontShow = page.getByRole("button", {
      name: /Don't show|오늘 하루|Close|닫기|Hide|Dismiss/i,
    });
    if ((await dontShow.count()) > 0 && (await dontShow.first().isVisible().catch(() => false))) {
      await dontShow.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(300);
      continue;
    }
    if ((await popupClose.count()) > 0 && (await popupClose.first().isVisible().catch(() => false))) {
      await popupClose.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(300);
      continue;
    }
    await page.keyboard.press("Escape").catch(() => null);
    await page.waitForTimeout(150);
    const still = await page.locator(".dibay-platform-popup-root, [data-platform-popup-root]").count();
    if (still === 0) break;
  }
}

loadEnv();
mkdirSync(OUT, { recursive: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data } = await sb.auth.signInWithPassword({ email: "sadads@adsasdsa.com", password: "1234" });
const session = data.session;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies([
  {
    name: `sb-${ref}-auth-token`,
    value: encodeURIComponent(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      })
    ),
    domain: "localhost",
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ]
    : []),
]);
const page = await context.newPage();
await page.setViewportSize({ width: 390, height: 900 });
await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => !!document.querySelector("nav.owner-mobile-bottom-nav"), null, {
  timeout: 60000,
});
await dismiss(page);

const primary = {};
const tabs = [
  ["ORDERS", 'a[href*="/stores/owner/orders"]', "/stores/owner/orders"],
  ["PRODUCTS", 'a[href*="/stores/owner/products"]', "/stores/owner/products"],
  ["HOME", "button", "/stores/owner"],
  ["CUSTOMERS", 'a[href*="/stores/owner/customer-care"]', "/stores/owner/customer-care"],
  ["MANAGE", 'a[href*="/stores/owner/settings"]', "/stores/owner/settings"],
];

for (const [id, sel, expectPath] of tabs) {
  await dismiss(page);
  const nav = page.locator("nav.owner-mobile-bottom-nav");
  const el =
    id === "HOME"
      ? nav.locator("button").filter({ hasText: /Home|홈/i }).first()
      : nav.locator(sel).first();
  await el.click({ timeout: 8000 });
  await page.waitForTimeout(900);
  await dismiss(page);
  const path = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
  const expect = expectPath.replace(/\/$/, "");
  const ok =
    id === "HOME" ? path === "/stores/owner" : path === expect || path.startsWith(expect + "/");
  const active =
    id === "HOME"
      ? (await el.getAttribute("data-active")) === "true"
      : (await nav.locator(sel).first().getAttribute("data-active")) === "true";
  primary[id] = { status: ok ? "PASS" : "FAIL", path, active, url: page.url() };
}

const report = { primary };
writeFileSync(resolve(OUT, "p0-visual-primary-nav-clean.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (Object.values(primary).some((v) => v.status !== "PASS")) process.exitCode = 1;
