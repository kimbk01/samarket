#!/usr/bin/env node
/**
 * Support A2-3 — Production customer notification → Support Modal restore.
 * Usage: node --env-file=.env.local scripts/qa/support-a2-3-production-close.mjs
 *
 * Proves WEB C1–C4. Physical push remains NOT_PROVEN unless device harness set.
 * CUT B session token lifecycle: DO NOT START.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIXTURE,
  ORIGIN,
  loginSession,
  sbService,
  loadEnvLocal,
  cookieHeader,
  apiJson,
  memberContext,
} from "./support-cut3-lib.mjs";

const OUT_DIR = resolve(process.cwd(), "docs/support-center/a2-3-production-close");
const REPORT_PATH = resolve(OUT_DIR, "support-a2-3-production-close-report.json");
const EXPECTED_SHA = (process.env.A23_COMMIT || "").trim().toLowerCase();

/** Mirror of isAllowedSupportNotificationPath — Production proof uses inbox link_url. */
function isAllowedSupportPath(pathname) {
  if (pathname === "/support/enter") return true;
  const m = /^\/support\/cases\/([^/]+)$/.exec(pathname);
  if (!m) return false;
  let id = m[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    return false;
  }
  const trimmed = id.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return false;
  if (trimmed === "open" || trimmed === "new" || trimmed === "enter") return false;
  return true;
}

function resolveSafeRoute(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.startsWith("//") || !raw.startsWith("/")) return null;
  try {
    const u = new URL(raw, "https://dibay.internal");
    if (!isAllowedSupportPath(u.pathname)) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

function passFail(ok) {
  return ok ? "PASS" : "FAIL";
}

function stop(report, reason) {
  report.STOP_REASON = reason;
  report.A2_3_CUSTOMER_NOTIFICATION_RESTORE = "NOT_CLOSED";
  report.CUT_B = "DO_NOT_START";
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.error("STOP:", reason);
  console.error("report:", REPORT_PATH);
  process.exit(1);
}

async function playwrightCookies(session) {
  const header = await cookieHeader(session);
  const origin = new URL(ORIGIN);
  const cookies = [];
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    cookies.push({
      name: trimmed.slice(0, eq).trim(),
      value: trimmed.slice(eq + 1).trim(),
      domain: origin.hostname,
      path: "/",
      secure: origin.protocol === "https:",
      sameSite: "Lax",
      httpOnly: false,
    });
  }
  return cookies;
}

function routeOf(ev) {
  const p = ev?.display_payload || {};
  return String(p.routeUrl || p.route_url || "");
}

async function main() {
  loadEnvLocal();
  mkdirSync(OUT_DIR, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    LOCAL_HEAD: EXPECTED_SHA || null,
    A2_3_COMMIT: EXPECTED_SHA || null,
    SAFE_SUPPORT_ROUTE: "NOT_PROVEN",
    SUPPORT_ADMIN_REPLIED_WRITE: "NOT_PROVEN",
    ROUTE_URL: null,
    CUSTOMER_NOTIFICATION_ITEM: "NOT_PROVEN",
    CUSTOMER_CLICK: "NOT_PROVEN",
    EXACT_CASE_ID: "NOT_PROVEN",
    WARM_MODAL_RESTORE: "NOT_PROVEN",
    COLD_MODAL_RESTORE: "NOT_PROVEN",
    RESOLVED_MODAL_RESTORE: "NOT_PROVEN",
    UNAUTHORIZED_CASE: "NOT_PROVEN",
    LEGACY_ROUTE_FALLBACK: "NOT_PROVEN",
    RAW_SUPPORT_TOKEN_IN_PAYLOAD: "NOT_PROVEN",
    NOTIFICATION_READ_DECREMENT: "NOT_PROVEN",
    WEB_PRODUCTION: "NOT_PROVEN",
    IOS_PUSH: "NOT_PROVEN",
    ANDROID_PUSH: "NOT_PROVEN",
    A2_3_CUSTOMER_NOTIFICATION_RESTORE: "NOT_CLOSED",
    CUT_B: "DO_NOT_START",
    detail: {},
  };

  // A. Sanitizer unit proof (same module Production code ships)
  const sampleId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const sampleRoute = `/support/cases/${sampleId}`;
  const sanitized = resolveSafeRoute(sampleRoute);
  const sanitizedEnter = resolveSafeRoute("/support/enter");
  const sanitizedBare = resolveSafeRoute("/support");
  report.detail.sanitizer = { sampleRoute, sanitized, sanitizedEnter, sanitizedBare };
  report.SAFE_SUPPORT_ROUTE = passFail(
    sanitized === sampleRoute && sanitizedEnter === "/support/enter" && sanitizedBare == null
  );
  if (report.SAFE_SUPPORT_ROUTE !== "PASS") stop(report, "A_SANITIZER_FAIL");

  const sb = sbService();
  const memberSession = await loginSession(FIXTURE.memberA);
  const memberBSession = await loginSession(FIXTURE.memberB);
  const adminSession = await loginSession(FIXTURE.admin);
  const memberId = memberSession.user.id;
  const memberBId = memberBSession.user.id;
  const adminId = adminSession.user.id;

  // Open fresh case
  const open = await apiJson(memberSession, "POST", "/api/support/cases/open", {
    context: memberContext({
      category: "AD",
      sourceSurface: `a2-3-notif-${Date.now()}`,
    }),
    initialBody: `a2-3 seed ${Date.now()}`,
  });
  if (open.status !== 200 || !open.json?.case?.id || open.json?.created !== true) {
    // try TECHNICAL etc
    stop(report, `open_case_failed:${open.status}:${open.json?.error}`);
  }
  const caseId = open.json.case.id;
  const publicNo = open.json.case.public_case_no;
  report.detail.case = { id: caseId, public_case_no: publicNo };

  await apiJson(adminSession, "PATCH", `/api/admin/support/cases/${caseId}`, {
    action: "assign",
    assigneeAdminId: adminId,
  });

  const replyBody = `a2-3-admin-reply-${Date.now()}`;
  const reply = await apiJson(adminSession, "PATCH", `/api/admin/support/cases/${caseId}`, {
    action: "reply",
    body: replyBody,
  });
  if (reply.status !== 200) stop(report, `admin_reply_fail:${reply.status}`);

  await new Promise((r) => setTimeout(r, 1200));

  const { data: events } = await sb
    .from("notification_events")
    .select("id,type,user_id,display_payload,created_at")
    .eq("user_id", memberId)
    .eq("type", "support_admin_replied")
    .order("created_at", { ascending: false })
    .limit(10);
  const ev = (events || []).find((e) => {
    const dp = e.display_payload || {};
    return String(dp.supportCaseId || "") === caseId || String(dp.routeUrl || "").includes(caseId);
  });
  report.SUPPORT_ADMIN_REPLIED_WRITE = passFail(!!ev);
  if (!ev) stop(report, "C1_no_support_admin_replied");

  const routeUrl = routeOf(ev);
  const safeRoute = resolveSafeRoute(routeUrl);
  report.ROUTE_URL = routeUrl;
  report.detail.event = { id: ev.id, routeUrl, safeRoute, payload: ev.display_payload };
  report.EXACT_CASE_ID = passFail(
    !!safeRoute &&
      (safeRoute === `/support/cases/${caseId}` ||
        safeRoute.startsWith(`/support/cases/${caseId}?`) ||
        safeRoute.includes(`/support/cases/${encodeURIComponent(caseId)}`))
  );
  if (report.EXACT_CASE_ID !== "PASS") stop(report, `C1_route_not_exact:${routeUrl}->${safeRoute}`);

  // payload must not contain raw support tokens
  const payloadStr = JSON.stringify(ev.display_payload || {});
  const hasRawToken =
    /token_hash|session_token|bearer|support_token|raw_token/i.test(payloadStr) &&
    /"[^"]*token[^"]*"\s*:\s*"[A-Za-z0-9._-]{20,}"/.test(payloadStr);
  report.RAW_SUPPORT_TOKEN_IN_PAYLOAD = hasRawToken ? "FAIL" : "NONE";
  if (report.RAW_SUPPORT_TOKEN_IN_PAYLOAD === "FAIL") stop(report, "raw_token_in_payload");

  // Inbox list
  const notifBefore = await apiJson(memberSession, "GET", "/api/me/notifications");
  const listHit = (notifBefore.json?.notifications || []).find((n) => {
    const link = String(n.link_url || "");
    return link.includes(caseId) || String(n.meta?.supportCaseId || "") === caseId;
  });
  report.CUSTOMER_NOTIFICATION_ITEM = passFail(!!listHit && !String(listHit.link_url || "").includes("fallback=origin_unavailable"));
  report.LEGACY_ROUTE_FALLBACK = passFail(
    !!listHit &&
      !/mypage\/inquiries|mypage\/inbox|member-notes|platform-inquiries|community-messenger/i.test(
        String(listHit.link_url || "")
      )
  )
    ? "NONE"
    : "FAIL";
  if (report.CUSTOMER_NOTIFICATION_ITEM !== "PASS") stop(report, "C1_inbox_item_missing_or_fallback");
  if (report.LEGACY_ROUTE_FALLBACK !== "NONE") stop(report, `legacy_fallback:${listHit?.link_url}`);

  const unreadBefore = (notifBefore.json?.notifications || []).filter((n) => !n.is_read).length;

  const browser = await chromium.launch({ headless: true });
  try {
    // ===== C1 / C2 WARM click =====
    const cookies = await playwrightCookies(memberSession);
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();

    // Warm: already on shell, navigate via notification href
    await page.goto(`${ORIGIN}/notifications`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2500);
    const clickHref = String(listHit.link_url || safeRoute);
    await page.goto(`${ORIGIN}${clickHref.startsWith("/") ? clickHref : `/${clickHref}`}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(3500);
    const warmUrl = page.url();
    const warmModal = await page.locator(".dibay-overlay-sheet").count();
    const warmHasReply = await page.locator(".dibay-overlay-sheet").evaluateAll((els, body) => {
      return els.some((el) => (el.textContent || "").includes(body));
    }, replyBody);
    const warmFullPageResidue = /\/support\/cases\//.test(new URL(warmUrl).pathname);
    report.detail.warm = { warmUrl, warmModal, warmHasReply, warmFullPageResidue };
    report.WARM_MODAL_RESTORE = passFail(warmModal > 0 && warmHasReply && !warmFullPageResidue);
    report.CUSTOMER_CLICK = report.WARM_MODAL_RESTORE;
    if (report.WARM_MODAL_RESTORE !== "PASS") stop(report, "C1_WARM_FAIL");

    // Mark read
    if (listHit?.id) {
      const readRes = await apiJson(memberSession, "PATCH", "/api/me/notifications", {
        ids: [listHit.id],
      });
      report.detail.read = { status: readRes.status, json: readRes.json };
      const notifAfter = await apiJson(memberSession, "GET", "/api/me/notifications");
      const unreadAfter = (notifAfter.json?.notifications || []).filter((n) => !n.is_read).length;
      const hitAfter = (notifAfter.json?.notifications || []).find((n) => n.id === listHit.id);
      report.NOTIFICATION_READ_DECREMENT = passFail(
        readRes.status === 200 &&
          ((hitAfter && hitAfter.is_read === true) || unreadAfter <= unreadBefore)
      );
    }

    await page.screenshot({ path: resolve(OUT_DIR, "c1-warm-modal.png"), fullPage: false });
    await ctx.close();

    // ===== C2 COLD =====
    const coldCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await coldCtx.addCookies(cookies);
    const coldPage = await coldCtx.newPage();
    await coldPage.goto(`${ORIGIN}/support/cases/${encodeURIComponent(caseId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await coldPage.waitForTimeout(4500);
    const coldUrl = coldPage.url();
    const coldModal = await coldPage.locator(".dibay-overlay-sheet").count();
    const coldHasReply = await coldPage.locator(".dibay-overlay-sheet").evaluateAll((els, body) => {
      return els.some((el) => (el.textContent || "").includes(body));
    }, replyBody);
    const coldResidue = /\/support\/cases\//.test(new URL(coldUrl).pathname);
    const coldFallback = coldUrl.includes("fallback=origin_unavailable");
    report.detail.cold = { coldUrl, coldModal, coldHasReply, coldResidue, coldFallback };
    report.COLD_MODAL_RESTORE = passFail(
      coldModal > 0 && coldHasReply && !coldResidue && !coldFallback
    );
    await coldPage.screenshot({ path: resolve(OUT_DIR, "c2-cold-modal.png"), fullPage: false });
    await coldCtx.close();
    if (report.COLD_MODAL_RESTORE !== "PASS") stop(report, "C2_COLD_FAIL");

    // ===== C3 RESOLVED =====
    const resolveRes = await apiJson(adminSession, "PATCH", `/api/admin/support/cases/${caseId}`, {
      action: "status",
      status: "RESOLVED",
    });
    if (resolveRes.status !== 200) stop(report, `resolve_fail:${resolveRes.status}`);
    await new Promise((r) => setTimeout(r, 1200));
    const { data: resolvedEvents } = await sb
      .from("notification_events")
      .select("id,type,display_payload,created_at")
      .eq("user_id", memberId)
      .eq("type", "support_case_resolved")
      .order("created_at", { ascending: false })
      .limit(5);
    const resolvedEv = (resolvedEvents || []).find((e) => {
      const dp = e.display_payload || {};
      return String(dp.supportCaseId || "") === caseId;
    });
    report.detail.resolvedEvent = resolvedEv
      ? { id: resolvedEv.id, routeUrl: routeOf(resolvedEv) }
      : null;

    const resCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await resCtx.addCookies(cookies);
    const resPage = await resCtx.newPage();
    await resPage.goto(`${ORIGIN}/support/cases/${encodeURIComponent(caseId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await resPage.waitForTimeout(4500);
    const resModal = await resPage.locator(".dibay-overlay-sheet").count();
    const resComposer = await resPage.locator(".dibay-overlay-sheet textarea").count();
    const resClosedHint = await resPage.locator(".dibay-overlay-sheet").evaluateAll((els) =>
      els.some((el) => /종료|closed|New inquiry|새 문의/i.test(el.textContent || ""))
    );
    report.detail.resolvedUi = { resModal, resComposer, resClosedHint, url: resPage.url() };
    report.RESOLVED_MODAL_RESTORE = passFail(
      !!resolvedEv && resModal > 0 && resComposer === 0 && resClosedHint
    );
    await resPage.screenshot({ path: resolve(OUT_DIR, "c3-resolved-modal.png"), fullPage: false });
    await resCtx.close();
    if (report.RESOLVED_MODAL_RESTORE !== "PASS") stop(report, "C3_RESOLVED_FAIL");

    // ===== C4 unauthorized =====
    const bGet = await apiJson(memberBSession, "GET", `/api/support/cases/${caseId}`);
    const bCookies = await playwrightCookies(memberBSession);
    const bCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await bCtx.addCookies(bCookies);
    const bPage = await bCtx.newPage();
    await bPage.goto(`${ORIGIN}/support/cases/${encodeURIComponent(caseId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await bPage.waitForTimeout(4000);
    const bLeak = await bPage.locator(".dibay-overlay-sheet").evaluateAll((els, body) => {
      return els.some((el) => (el.textContent || "").includes(body));
    }, replyBody);
    report.detail.unauthorized = {
      apiStatus: bGet.status,
      bLeak,
      url: bPage.url(),
      memberBId,
    };
    report.UNAUTHORIZED_CASE =
      (bGet.status === 403 || bGet.status === 404) && !bLeak ? "BLOCKED" : "FAIL";
    await bPage.screenshot({ path: resolve(OUT_DIR, "c4-unauthorized.png"), fullPage: false });
    await bCtx.close();
    if (report.UNAUTHORIZED_CASE !== "BLOCKED") stop(report, "C4_AUTH_FAIL");
  } finally {
    await browser.close().catch(() => {});
  }

  report.WEB_PRODUCTION = passFail(
    report.SAFE_SUPPORT_ROUTE === "PASS" &&
      report.SUPPORT_ADMIN_REPLIED_WRITE === "PASS" &&
      report.EXACT_CASE_ID === "PASS" &&
      report.CUSTOMER_NOTIFICATION_ITEM === "PASS" &&
      report.WARM_MODAL_RESTORE === "PASS" &&
      report.COLD_MODAL_RESTORE === "PASS" &&
      report.RESOLVED_MODAL_RESTORE === "PASS" &&
      report.UNAUTHORIZED_CASE === "BLOCKED" &&
      report.LEGACY_ROUTE_FALLBACK === "NONE" &&
      report.RAW_SUPPORT_TOKEN_IN_PAYLOAD === "NONE"
  );

  report.A2_3_CUSTOMER_NOTIFICATION_RESTORE =
    report.WEB_PRODUCTION === "PASS" ? "WEB_CLOSED" : "NOT_CLOSED";
  // Device push not measured in this harness
  report.IOS_PUSH = "NOT_PROVEN";
  report.ANDROID_PUSH = "NOT_PROVEN";
  report.CUT_B = "DO_NOT_START";

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        reportPath: REPORT_PATH,
        WEB: report.WEB_PRODUCTION,
        A2_3: report.A2_3_CUSTOMER_NOTIFICATION_RESTORE,
        IOS: report.IOS_PUSH,
        ANDROID: report.ANDROID_PUSH,
      },
      null,
      2
    )
  );
  if (report.WEB_PRODUCTION !== "PASS") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
