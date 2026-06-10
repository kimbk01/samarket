#!/usr/bin/env node
/**
 * Delivery/store checksheet §3 — 3-run audit (배민급 체크시트 증거).
 *
 * Usage:
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   E2E_TEST_USERNAME=qqqq E2E_TEST_PASSWORD=1234 \
 *   node scripts/measure-store-checksheet-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cycles = Math.max(1, Number(process.env.STORE_CHECKSHEET_CYCLES ?? "3") || 3);
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const outPath =
  process.env.STORE_CHECKSHEET_OUT || path.join(root, "docs", "perf", "store-checksheet-audit-latest.json");
const PERMISSION_GUIDE_PRESEED_KINDS = ["location", "microphone", "speaker"];
const STORE_DETAIL_URL = /\/stores\/(?!browse|cart|search|owner)[^/?#]+/;

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function signInSession() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const hostname = new URL(baseUrl).hostname;
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const loginIds = [process.env.E2E_TEST_USERNAME?.trim(), "qqqq", "aaaa"].filter(Boolean);
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const loginId of loginIds) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    const cookies = [
      {
        name: `sb-${ref}-auth-token`,
        value: encodeURIComponent(JSON.stringify(session)),
        domain: hostname,
        path: "/",
        sameSite: "Lax",
        secure: baseUrl.startsWith("https:"),
      },
    ];
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const activeSession = String(pr?.active_session_id ?? "").trim();
      if (activeSession) {
        cookies.push({
          name: "samarket_active_session_id",
          value: encodeURIComponent(activeSession),
          domain: hostname,
          path: "/",
          sameSite: "Lax",
          secure: baseUrl.startsWith("https:"),
        });
      }
    }
    return { cookies, email };
  }
  throw new Error("signIn failed");
}

function summarize(samples) {
  if (!samples.length) return { count: 0, min: null, max: null, avg: null, p95: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, n) => a + n, 0);
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p95: sorted[p95Idx],
  };
}

async function dismissPermissionGuides(page) {
  const later = page.getByRole("button", { name: /^나중에$|^Later$/i });
  for (let i = 0; i < 3; i += 1) {
    if (!(await later.first().isVisible({ timeout: 1200 }).catch(() => false))) break;
    await later.first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
}

async function waitStoreMenuSearch(page, startAt) {
  const menuSearch = page
    .getByRole("banner")
    .getByRole("button", { name: /^메뉴 검색$|^Search menu$/i })
    .first();
  await menuSearch.waitFor({ state: "visible", timeout: 90_000 });
  const wallMs = Date.now() - startAt;
  await page.waitForTimeout(400);
  const navPerf = await page.evaluate(() => {
    try {
      const navT0 = Number(sessionStorage.getItem("dibay:perf:nav_t0"));
      const slug = sessionStorage.getItem("dibay:perf:nav_slug");
      return {
        nav_slug: slug,
        store_shell_visible_ms:
          Number.isFinite(navT0) && navT0 > 0 ? Math.round(performance.now() - navT0) : null,
      };
    } catch {
      return { nav_slug: null, store_shell_visible_ms: null };
    }
  });
  return {
    tap_to_menu_search_wall_ms: wallMs,
    store_shell_visible_ms: navPerf.store_shell_visible_ms,
    nav_slug: navPerf.nav_slug,
  };
}

async function gotoStoreListSurface(page) {
  await page.goto(`${baseUrl}/stores/browse/restaurant?sub=all`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await dismissPermissionGuides(page);
  const storeCard = page.locator("button:has(.delivery-store-row__title)").first();
  await storeCard.waitFor({ state: "visible", timeout: 90_000 });
  return storeCard;
}

async function openFirstStoreFromList(page) {
  const storeCard = await gotoStoreListSurface(page);
  const tapAt = Date.now();
  await storeCard.click();
  await page.waitForURL(STORE_DETAIL_URL, { timeout: 60_000 });
  return waitStoreMenuSearch(page, tapAt);
}

async function runCycle(page, cycleIndex) {
  const row = { cycle: cycleIndex + 1, checksheet: {} };

  if (cycleIndex === 0) await page.waitForTimeout(2000);

  // §1 list → store detail (browse list row)
  row.checksheet.list_to_detail = await openFirstStoreFromList(page);

  // §4 reentry — back → same store
  const detailUrl = page.url();
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 60_000 });
  const storeCard = page.locator("button:has(.delivery-store-row__title)").first();
  await storeCard.waitFor({ state: "visible", timeout: 60_000 });
  const reAt = Date.now();
  await storeCard.click();
  await page.waitForURL(detailUrl, { timeout: 60_000 }).catch(async () => {
    await page.waitForURL(STORE_DETAIL_URL, { timeout: 60_000 });
  });
  row.checksheet.detail_reentry = await waitStoreMenuSearch(page, reAt);

  // §3 browse sub-segment tap (SB2 chip contract)
  await page.goto(`${baseUrl}/stores/browse/restaurant?sub=all`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  const subChip = page
    .locator("a.stores-browse-sub-chip-link:not(.stores-browse-sub-chip-link--active)")
    .first();
  await subChip.waitFor({ state: "visible", timeout: 45_000 });
  const segAt = Date.now();
  await subChip.click();
  await page.waitForTimeout(350);
  row.checksheet.browse_sub_segment_ms = Date.now() - segAt;

  // §5 tab — philife → 배달(stores)
  await page.goto(`${baseUrl}/philife`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(1200);
  const storesTab = page.locator('[data-bottom-nav-tab-id="stores"]').first();
  await storesTab.waitFor({ state: "visible", timeout: 30_000 });
  const tabAt = Date.now();
  await storesTab.click();
  await page.waitForURL(/\/stores/, { timeout: 45_000 });
  await page
    .locator(".delivery-store-row__title, a.stores-browse-sub-chip-link, h2")
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  row.checksheet.tab_to_stores_home_ms = Date.now() - tabAt;

  // §2 scroll sample on stores home feed
  const scrollStart = Date.now();
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(80);
  }
  row.checksheet.list_scroll_wheel_ms = Date.now() - scrollStart;

  return row;
}

async function main() {
  const auth = await signInSession();
  console.log(`auth: ${auth.email}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(auth.cookies);
  await context.addInitScript((kinds) => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
      localStorage.setItem("samarket.app.language", "ko");
      for (const k of kinds) localStorage.setItem(`dibay.permission.${k}.guideSeen`, "1");
    } catch {
      /* ignore */
    }
  }, PERMISSION_GUIDE_PRESEED_KINDS);
  const page = await context.newPage();
  const rows = [];
  const errors = [];
  try {
    for (let c = 0; c < cycles; c += 1) {
      try {
        rows.push(await runCycle(page, c));
      } catch (error) {
        errors.push({ cycle: c + 1, message: String(error).slice(0, 500) });
      }
    }
  } finally {
    await browser.close();
  }

  const warm = rows.slice(1);
  const pickWarm = (fn) => summarize(warm.map(fn).filter((n) => n != null));

  const report = {
    measured_at: new Date().toISOString(),
    base_url: baseUrl,
    cycles,
    warm_discard: "cycle 1",
    checksheet_summary: {
      s1_list_to_detail_wall_warm: pickWarm((r) => r.checksheet.list_to_detail?.tap_to_menu_search_wall_ms),
      s1_store_shell_visible_warm: pickWarm((r) => r.checksheet.list_to_detail?.store_shell_visible_ms),
      s2_detail_reentry_wall_warm: pickWarm((r) => r.checksheet.detail_reentry?.tap_to_menu_search_wall_ms),
      s3_browse_sub_segment_warm: pickWarm((r) => r.checksheet.browse_sub_segment_ms),
      s4_tab_to_stores_home_warm: pickWarm((r) => r.checksheet.tab_to_stores_home_ms),
      s5_list_scroll_wheel_warm: pickWarm((r) => r.checksheet.list_scroll_wheel_ms),
    },
    gates: {
      s1_warm_wall_p95_le_2000: null,
      s2_warm_reentry_p95_le_800: null,
      s3_warm_browse_sub_p95_le_500: null,
      s4_warm_tab_p95_le_2000: null,
    },
    cycles_detail: rows,
    errors,
    structural_lock: [
      "verify:stores-home-hub-contract",
      "verify:store-cart-sheet-contract",
      "BN3 home-feed prewarm",
      "BN7 pending enter panel",
      "DS1 menus apply split",
    ],
  };

  const s = report.checksheet_summary;
  report.gates.s1_warm_wall_p95_le_2000 =
    s.s1_list_to_detail_wall_warm.p95 != null && s.s1_list_to_detail_wall_warm.p95 <= 2000;
  report.gates.s2_warm_reentry_p95_le_800 =
    s.s2_detail_reentry_wall_warm.p95 != null && s.s2_detail_reentry_wall_warm.p95 <= 800;
  report.gates.s3_warm_browse_sub_p95_le_500 =
    s.s3_browse_sub_segment_warm.p95 != null && s.s3_browse_sub_segment_warm.p95 <= 500;
  report.gates.s4_warm_tab_p95_le_2000 =
    s.s4_tab_to_stores_home_warm.p95 != null && s.s4_tab_to_stores_home_warm.p95 <= 2000;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("STORE_CHECKSHEET_AUDIT_JSON:", JSON.stringify(report));
  process.exit(errors.length && !rows.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
