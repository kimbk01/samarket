/**
 * Primary nav click proof only (nav-scoped selectors).
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/qa/owner-p0-shell-visual-primary-nav.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-p0-shell-visual");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const EMAIL = "sadads@adsasdsa.com";

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

async function login() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const password of [process.env.E2E_TEST_PASSWORD, "1234"].filter(Boolean)) {
    const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password });
    if (!error && data.session) return data.session;
  }
  throw new Error("login_failed");
}

loadEnv();
mkdirSync(OUT, { recursive: true });
const session = await login();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const origin = new URL(ORIGIN);
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
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: origin.hostname,
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure: origin.protocol === "https:",
          sameSite: "Lax",
        },
      ]
    : []),
]);
const page = await context.newPage();
await page.setViewportSize({ width: 390, height: 900 });

const primary = {};
const map = [
  ["HOME", /\/stores\/owner\/?$/, /^(Home|홈)$/i],
  ["ORDERS", /\/stores\/owner\/orders/, /Orders|주문/i],
  ["PRODUCTS", /\/stores\/owner\/products/, /Products|상품/i],
  ["CUSTOMERS", /\/stores\/owner\/customer-care/, /Customers|고객/i],
  ["MANAGE", /\/stores\/owner\/settings/, /Manage|관리/i],
];

try {
  await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.body?.hasAttribute("data-owner-compact-shell") &&
      !!document.querySelector("nav.owner-mobile-bottom-nav"),
    null,
    { timeout: 60000 }
  );

  for (const [id, pathRe, labelRe] of map) {
    const nav = page.locator("nav.owner-mobile-bottom-nav");
    const tab = nav.locator("a, button").filter({ hasText: labelRe }).first();
    if ((await tab.count()) === 0) {
      primary[id] = { status: "FAIL", reason: "missing" };
      continue;
    }
    await tab.click({ force: true });
    await page.waitForTimeout(900);
    const path = new URL(page.url()).pathname;
    const ok = pathRe.test(path);
    const active = await tab.evaluate((el) => {
      const aria = el.getAttribute("aria-current");
      const cls = el.className || "";
      return aria === "page" || /active|selected/i.test(cls) || el.getAttribute("data-active") === "true";
    });
    primary[id] = { status: ok ? "PASS" : "FAIL", path, active: !!active, url: page.url() };
  }

  // drawer secondary (scroll)
  await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!document.querySelector("nav.owner-mobile-bottom-nav"), null, {
    timeout: 60000,
  });
  await page.locator(".owner-compact-shell__header button").last().click({ force: true });
  await page.waitForTimeout(400);
  const drawer = await page.evaluate(() => {
    const panel = document.querySelector(".owner-ops-drawer-panel");
    const scroller = panel?.querySelector("[class*='overflow'], .owner-ops-drawer-scroll") || panel;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    const text = panel?.innerText || "";
    return {
      open: panel?.getAttribute("data-open"),
      fabHosts: document.querySelectorAll("[data-support-fab-host]").length,
      hasReviews: /리뷰|Reviews/.test(text),
      hasCategory: /카테고리|Categor/.test(text),
      hasCoupon: /쿠폰|Coupon/.test(text),
      hasGift: /상품권|Gift/.test(text),
      hasBanner: /배너|Banner/.test(text),
      hasAds: /광고|Ads/.test(text),
      hasNotif: /알림|Notification/.test(text),
      hasFinance: /재무|Finance|Coin|Cash|COIN/.test(text),
      hasSettlement: /정산|Settlement/.test(text),
      dupOps: /운영 · 심사|Ops & review/.test(text) && /배달 운영|Delivery settings/.test(text),
      textTail: text.slice(-800),
    };
  });

  const report = { primary, drawer };
  writeFileSync(resolve(OUT, "p0-visual-primary-drawer.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const fail = Object.values(primary).some((v) => v.status !== "PASS");
  if (fail || drawer.fabHosts > 0 || drawer.dupOps) process.exitCode = 1;
} finally {
  await browser.close();
}
