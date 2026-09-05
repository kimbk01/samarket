/**
 * Owner Store OS recovery — responsive behavioral proof (CTA/overflow/overlay).
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   scripts/qa/owner-store-os-responsive-behavioral-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/recovery");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const EMAIL = "sadads@adsasdsa.com";
const WIDTHS = (process.env.OWNER_PROOF_WIDTHS || "390,430,768,1024,1280")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

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
  for (let i = 0; i < 5; i++) {
    const btn = page.getByRole("button", { name: /Don't show|오늘|Close|닫기|Hide|Dismiss/i });
    if ((await btn.count()) > 0 && (await btn.first().isVisible().catch(() => false))) {
      await btn.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(200);
      continue;
    }
    await page.keyboard.press("Escape").catch(() => null);
    break;
  }
}

loadEnv();
mkdirSync(OUT, { recursive: true });

const report = { origin: ORIGIN, storeId: STORE, widths: {}, final: "FAIL" };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const passwords = [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean))];
let session = null;
for (const pw of passwords) {
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: pw });
  if (!error && data.session) {
    session = data.session;
    break;
  }
}
if (!session) throw new Error("owner login failed");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const domain = new URL(ORIGIN).hostname;

const browser = await chromium.launch({ headless: true });

const SURFACES = [
  ["home", "/stores/owner"],
  ["orders", "/stores/owner/orders"],
  ["products", "/stores/owner/products"],
  ["product_new", "/stores/owner/products/new"],
  ["customers", "/stores/owner/customer-care"],
  ["finance", "/stores/owner/finance"],
  ["settlement", "/stores/owner/settlements"],
];

try {
  for (const w of WIDTHS) {
    const height = w >= 1024 ? 800 : 844;
    const context = await browser.newContext({ viewport: { width: w, height } });
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
        domain,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: true,
        sameSite: "Lax",
      },
      ...(pr?.active_session_id
        ? [
            {
              name: "samarket_active_session_id",
              value: String(pr.active_session_id),
              domain,
              path: "/",
              expires: Math.floor(Date.now() / 1000) + 86400 * 7,
              httpOnly: false,
              secure: true,
              sameSite: "Lax",
            },
          ]
        : []),
    ]);
    const page = await context.newPage();
    const pages = {};

    for (const [tag, path] of SURFACES) {
      const url = `${ORIGIN}${path}?storeId=${STORE}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(1400);
      await dismiss(page);
      const metrics = await page.evaluate(() => {
        const overflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        const verticalCtas = [...document.querySelectorAll("button,a")].filter((el) => {
          const s = getComputedStyle(el);
          if (s.writingMode && s.writingMode.includes("vertical")) return true;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 40 && r.width < 28;
        }).length;
        const bottomNav = document.querySelector("[data-owner-bottom-nav], nav[data-owner-mobile-bottom-nav]");
        const header = document.querySelector("header");
        const stickyCover = (() => {
          if (!header) return false;
          const hr = header.getBoundingClientRect();
          return hr.bottom > 120 && overflowX > 8;
        })();
        return {
          overflowX,
          verticalCtas,
          hub: !!document.querySelector("[data-owner-customer-care-hub]"),
          shell:
            document.body?.hasAttribute("data-owner-compact-shell") ||
            !!document.querySelector("[data-biz='1']") ||
            !!document.querySelector("[data-owner-home-store-status], [data-owner-customer-care-hub], form"),
          bottomNavVisible: bottomNav ? getComputedStyle(bottomNav).display !== "none" : null,
          stickyCover,
        };
      });
      const ok = metrics.overflowX <= 2 && metrics.verticalCtas === 0 && metrics.shell;
      pages[tag] = { ok, ...metrics, url: page.url() };
      if (tag === "home" || tag === "customers" || tag === "finance") {
        await page.screenshot({ path: resolve(OUT, `responsive-${w}-${tag}.png`), fullPage: false });
      }
    }

    // Drawer behavioral at this width
    await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1000);
    await dismiss(page);
    const burger = page.locator("[data-owner-ops-menu-trigger]").first();
    let drawer = { open: false, hrefCount: 0 };
    if ((await burger.count()) > 0) {
      await burger.click({ force: true });
      await page.waitForTimeout(700);
      drawer = await page.evaluate(() => {
        const root = document.querySelector("[data-owner-ops-drawer-root]");
        const open = !!(root && root.getAttribute("data-open") === "true");
        const hrefs = open
          ? [...(root?.querySelectorAll("a[href]") || [])].map((a) => a.getAttribute("href")).filter(Boolean)
          : [];
        return { open, hrefCount: hrefs.length, sample: hrefs.slice(0, 8) };
      });
      await page.keyboard.press("Escape").catch(() => null);
      await page.waitForTimeout(300);
    }
    pages.drawer = { ok: drawer.open && drawer.hrefCount >= 8, ...drawer };

    // Overlay: prefer proving before drawer pollution; never abort other widths on failure.
    let overlay = { ok: false };
    try {
      await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(1500);
      await dismiss(page);
      const bellCount = await page.locator("[data-owner-notification-bell], [data-tier1-notification-bell]").count();
      const hamCount = await page.locator("[data-owner-ops-menu-trigger]").count();
      if (bellCount === 0 || hamCount === 0) {
        overlay = {
          skipped: true,
          reason: "mobile_header_controls_missing",
          bellCount,
          hamCount,
          ok: w >= 1024,
        };
      } else {
        await page.locator("[data-owner-notification-bell], [data-tier1-notification-bell]").first().click({ force: true });
        await page.waitForTimeout(800);
        const afterBell = await page.evaluate(() => {
          const notifEl = document.querySelector(
            "[data-owner-notification-panel], [data-tier1-notification-panel], .tier1-notification-inbox-popup--open, [class*='tier1-notification-inbox-popup']"
          );
          const notif = !!(
            notifEl &&
            (notifEl.getBoundingClientRect().width > 20 || notifEl.getAttribute("role") === "dialog")
          );
          const drawerOpen = !!document.querySelector(
            ".owner-ops-drawer-panel[data-open='true'], [data-owner-ops-drawer-root][data-open='true']"
          );
          return { notif, drawer: drawerOpen, notifMounted: !!notifEl };
        });
        await dismiss(page);
        await page.waitForTimeout(400);
        // Re-navigate so hamburger is guaranteed present after inbox close.
        await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(1200);
        await dismiss(page);
        await page.locator("[data-owner-ops-menu-trigger]").first().click({ force: true, timeout: 15000 });
        await page.waitForTimeout(800);
        const afterHam = await page.evaluate(() => {
          const notif =
            document.querySelector(
              "[data-owner-notification-panel], [data-tier1-notification-panel], .tier1-notification-inbox-popup--open"
            ) != null;
          const drawerOpen = !!document.querySelector(
            ".owner-ops-drawer-panel[data-open='true'], [data-owner-ops-drawer-root][data-open='true']"
          );
          return { notif, drawer: drawerOpen };
        });
        overlay = {
          bellOk: afterBell.notif && !afterBell.drawer,
          hamOk: afterHam.drawer && !afterHam.notif,
          afterBell,
          afterHam,
          ok: false,
        };
        overlay.ok = overlay.bellOk && overlay.hamOk;
      }
    } catch (e) {
      overlay = { ok: false, error: String(e?.message || e).slice(0, 300) };
    }
    pages.overlay = overlay;

    const widthOk = Object.values(pages).every((p) => p.ok !== false);
    report.widths[String(w)] = { ok: widthOk, pages };
    await context.close();
  }

  report.final = Object.values(report.widths).every((w) => w.ok) ? "PASS" : "FAIL";
  writeFileSync(resolve(OUT, "responsive-behavioral-proof.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ final: report.final, widths: Object.fromEntries(Object.entries(report.widths).map(([k, v]) => [k, v.ok])) }, null, 2));
  process.exit(report.final === "PASS" ? 0 : 2);
} catch (e) {
  report.error = String(e?.stack || e);
  writeFileSync(resolve(OUT, "responsive-behavioral-proof.json"), JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
} finally {
  await browser.close().catch(() => null);
}
