/**
 * Re-check only failed surfaces after FAB geometry token fix.
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/qa/owner-p0-shell-visual-recheck-fab.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-p0-shell-visual");
const STORE = process.env.OWNER_P0_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
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
  for (const password of [process.env.E2E_TEST_PASSWORD, "1234", "DibayQa1!"].filter(Boolean)) {
    const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password });
    if (!error && data.session) return data.session;
  }
  throw new Error("login_failed");
}

function cookies(session, sessionId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const list = [
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
  ];
  if (sessionId) {
    list.push({
      name: "samarket_active_session_id",
      value: String(sessionId),
      domain: origin.hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86400 * 7,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  }
  return list;
}

async function dismiss(page) {
  for (let i = 0; i < 4; i++) {
    const close = page.getByRole("button", { name: /Close|닫기|Don't show|오늘 하루|Hide/i });
    if ((await close.count()) > 0 && (await close.first().isVisible().catch(() => false))) {
      await close.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(300);
      continue;
    }
    break;
  }
}

loadEnv();
mkdirSync(OUT, { recursive: true });
const session = await login();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(cookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
const page = await context.newPage();
await page.setViewportSize({ width: 390, height: 900 });

const report = { fabOwnerNav: null, fabDrawer: null, drawerReach: null, cssFabBottom: null };

try {
  await page.goto(`${ORIGIN}/stores/owner/finance?storeId=${STORE}`, {
    waitUntil: "commit",
    timeout: 120000,
  });
  await page
    .waitForFunction(
      () =>
        document.body?.hasAttribute("data-owner-compact-shell") &&
        !!document.querySelector("nav.owner-mobile-bottom-nav") &&
        !!document.querySelector('[data-support-fab-host="1"]'),
      null,
      { timeout: 90000 }
    )
    .catch(() => null);
  await dismiss(page);
  await page.waitForTimeout(400);

  report.cssFabBottom = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue("--owner-fab-bottom").trim()
  );

  const fabM = await page.evaluate(() => {
    const fab = document.querySelector('[data-support-fab-host="1"]');
    const nav = document.querySelector("nav.owner-mobile-bottom-nav");
    if (!fab || !nav) return { ok: false, reason: !fab ? "fab_missing" : "nav_missing" };
    const fr = fab.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    return {
      ok: fr.bottom <= nr.top + 1 && fab.getAttribute("data-owner-nav-clearance") === "1",
      gap: nr.top - fr.bottom,
      clearance: fab.getAttribute("data-owner-nav-clearance"),
      fabBottom: fr.bottom,
      navTop: nr.top,
      navHeight: nr.height,
    };
  });
  report.fabOwnerNav = fabM.ok ? "PASS" : "FAIL";
  report.fabMetrics = fabM;
  await page.screenshot({ path: resolve(OUT, "recheck-390-finance-fab.png") });

  const menu = page.locator(".owner-compact-shell__header button").last();
  await menu.click({ force: true });
  await page.waitForTimeout(500);
  const z = await page.evaluate(() => {
    const fab = document.querySelector('[data-support-fab-host="1"]');
    const panel = document.querySelector(".owner-ops-drawer-panel");
    const text = panel?.innerText || "";
    return {
      zFab: fab ? Number(getComputedStyle(fab).zIndex) || 0 : null,
      zDrawer: panel ? Number(getComputedStyle(panel).zIndex) || 0 : null,
      open: panel?.getAttribute("data-open"),
      hasReviews: /리뷰|Reviews/.test(text),
      hasCategory: /카테고리|Categor/.test(text),
      hasCoupon: /쿠폰|Coupon/.test(text),
      hasGift: /상품권|Gift/.test(text),
      hasBanner: /배너|Banner/.test(text),
      hasFinance: /재무|Finance|COIN|Coin|캐시|Cash/.test(text),
      hasSettlement: /정산|Settlement/.test(text),
      hasAds: /광고|Ads/.test(text),
      hasNotif: /알림|Notification/.test(text),
      fabVisible: fab ? getComputedStyle(fab).visibility !== "hidden" && Number(getComputedStyle(fab).opacity) > 0 : false,
      fabInFront: (() => {
        if (!fab || !panel) return null;
        const fr = fab.getBoundingClientRect();
        const pr = panel.getBoundingClientRect();
        const midX = Math.min(fr.right, pr.right) - 4;
        const midY = Math.min(fr.bottom, pr.bottom) - 4;
        const el = document.elementFromPoint(midX, midY);
        return el ? !fab.contains(el) : null;
      })(),
    };
  });
  report.fabDrawer =
    z.open === "true" &&
    (z.fabVisible === false ||
      (z.zFab != null && z.zDrawer != null && z.zFab < z.zDrawer))
      ? "PASS"
      : "FAIL";
  report.drawerReach = {
    status:
      z.open === "true" &&
      z.hasReviews &&
      z.hasCategory &&
      z.hasCoupon &&
      z.hasGift &&
      z.hasBanner &&
      z.hasFinance &&
      z.hasSettlement &&
      z.hasAds &&
      z.hasNotif
        ? "PASS"
        : "FAIL",
    detail: z,
  };
  await page.screenshot({ path: resolve(OUT, "recheck-390-drawer-fab.png") });
} finally {
  writeFileSync(resolve(OUT, "p0-visual-fab-recheck.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
if (report.fabOwnerNav !== "PASS" || report.fabDrawer !== "PASS") process.exitCode = 1;
