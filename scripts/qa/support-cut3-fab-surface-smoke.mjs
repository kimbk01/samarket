#!/usr/bin/env node
/**
 * Support CUT 3 — FAB surface smoke + server case context delivery.
 * Usage: node --env-file=.env.local scripts/qa/support-cut3-fab-surface-smoke.mjs
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { FIXTURE, ORIGIN, loginSession, sbService, loadEnvLocal } from "./support-cut3-lib.mjs";

const REPORT_PATH = resolve(process.cwd(), "docs/support-center/support-cut3-runtime-close-report.json");

const SURFACES = [
  { path: "/mypage/coupons", expectFab: true, label: "member_coupons" },
  { path: "/mypage/points/charge", expectFab: true, label: "member_charge" },
  { path: "/mypage", expectFab: false, label: "member_hub_off" },
  { path: "/stores/owner/apply", expectFab: true, label: "owner_apply" },
  { path: "/stores/owner", expectFab: false, label: "owner_hub_off" },
];

function loadReport() {
  if (!existsSync(REPORT_PATH)) return { checklist: {} };
  return JSON.parse(readFileSync(REPORT_PATH, "utf8"));
}

function cookies(session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  return [
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
}

async function main() {
  loadEnvLocal();
  const report = loadReport();
  report.checklist = report.checklist || {};

  const sessionMember = await loginSession(FIXTURE.memberA);
  const sessionOwner = await loginSession(FIXTURE.owner);
  const sb = sbService();

  const { data: store } = await sb
    .from("stores")
    .select("id")
    .eq("owner_user_id", sessionOwner.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const storeId = store?.id ? String(store.id) : null;

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const surface of SURFACES) {
    const isOwner = surface.path.startsWith("/stores/owner");
    const session = isOwner ? sessionOwner : sessionMember;
    let path = surface.path;
    if (surface.label === "owner_finance" && storeId) {
      path = `/stores/owner/finance?storeId=${encodeURIComponent(storeId)}`;
    }
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies(cookies(session));
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const fabVisible = (await page.locator('[data-support-fab="1"]').count()) > 0;
    const ok = fabVisible === surface.expectFab;
    results.push({ path, label: surface.label, expectFab: surface.expectFab, fabVisible, ok });
    await ctx.close();
  }

  if (storeId) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies(cookies(sessionOwner));
    const page = await ctx.newPage();
    const financePath = `/stores/owner/finance?storeId=${encodeURIComponent(storeId)}`;
    await page.goto(`${ORIGIN}${financePath}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const fabVisible = (await page.locator('[data-support-fab="1"]').count()) > 0;
    results.push({
      path: financePath,
      label: "owner_finance",
      expectFab: true,
      fabVisible,
      ok: fabVisible === true,
    });
    await ctx.close();
  }

  const allowedOk = results.filter((r) => r.expectFab).every((r) => r.ok);
  const forbiddenOk = results.filter((r) => !r.expectFab).every((r) => r.ok);

  report.checklist.FAB_ALLOWED_SURFACE = allowedOk ? "PASS" : "FAIL";
  report.checklist.FAB_FORBIDDEN_SURFACE = forbiddenOk ? "PASS" : "FAIL";
  report.fab_surface_detail = results;

  // Context delivery — click FAB on coupons, wait for case page, verify DB
  let contextDelivery = "NOT_PROVEN";
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies(cookies(sessionMember));
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/mypage/coupons`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const fab = page.locator('[data-support-fab="1"]');
    if ((await fab.count()) === 0) {
      contextDelivery = "FAIL";
    } else {
      await fab.click();
      await page.waitForURL(/\/support\/(enter|cases\/)/, { timeout: 20000 });
      await page.waitForTimeout(3000);
      const url = page.url();
      const match = url.match(/\/support\/cases\/([^/?#]+)/);
      if (match) {
        const { data: row } = await sb
          .from("support_cases")
          .select("audience, category, source_surface, requester_user_id")
          .eq("id", match[1])
          .maybeSingle();
        if (
          row &&
          row.audience === "MEMBER" &&
          row.category === "COUPON" &&
          row.requester_user_id === sessionMember.user.id
        ) {
          contextDelivery = "PASS";
        } else {
          contextDelivery = "FAIL";
        }
      } else {
        contextDelivery = "FAIL";
      }
    }
    await ctx.close();
  } catch (e) {
    contextDelivery = "FAIL";
    report.checklist.CONTEXT_DELIVERY_ERROR = String(e?.message || e);
  }

  report.checklist.CONTEXT_DELIVERY = contextDelivery;

  report.checklist.IOS = { status: "NOT_PROVEN", note: "no_ios_device_in_ci" };
  report.checklist.ANDROID_GESTURE = { status: "NOT_PROVEN", note: "no_android_device_in_ci" };
  report.checklist.ANDROID_3_BUTTON = { status: "NOT_PROVEN", note: "no_android_device_in_ci" };
  report.checklist.MOBILE_WEB = { status: "NOT_PROVEN", note: "playwright_mobile_only_partial" };
  report.checklist.ADMIN_DESKTOP = { status: "NOT_PROVEN", note: "run_separately_if_needed" };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  await browser.close();

  const ok = allowedOk && forbiddenOk && contextDelivery === "PASS";
  console.log(JSON.stringify({ fab_ok: ok, results, CONTEXT_DELIVERY: contextDelivery }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "FAB_SMOKE", error: String(e?.message || e) }));
  process.exit(2);
});
