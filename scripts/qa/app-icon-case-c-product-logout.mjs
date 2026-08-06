#!/usr/bin/env node
/**
 * APP ICON CASE C — PRODUCT LOGOUT SSOT RUNTIME RE-MEASUREMENT
 *
 * NO product code changes. Measures only.
 * Uses product UI: /mypage/logout → [data-testid=auth_logout_submit]
 *   → LogoutActionTrigger.handleLogout → runAuthLogoutExit → logoutDiBaYAppSession
 *   → logoutCurrentDevice → runExplicitLogoutFlow → …
 *
 * Does NOT use logoutApkWebView (API + cookie clear).
 *
 *   npx tsx --env-file=.env.local scripts/qa/app-icon-case-c-product-logout.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  ensureApkWebViewLogin,
  forwardCdp,
  connectWebView,
  navigateApkWebView,
} from "./lib/apk-webview-cdp.mjs";

const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = join(process.cwd(), `.qa-logs/app-icon-case-c-product-logout-${STAMP}`);
mkdirSync(OUT, { recursive: true });

const PROD = process.env.BADGE_NATIVE_PROD || "https://samarket.vercel.app";
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const LOGIN = process.env.BADGE_NATIVE_LOGIN || "asas55";
const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const PASSWORD =
  process.env.E2E_TEST_PASSWORD ||
  process.env.QA_MANUAL_PASSWORD ||
  process.env.BADGE_NATIVE_PASSWORD ||
  "1234";
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const ROUNDS = Math.max(1, Math.min(3, Number(process.env.CASE_C_ROUNDS || 3)));
/** Android App Icon summary carrier — DibayAppIconDeliveryAdapter.SUMMARY_NOTIFICATION_ID */
const SUMMARY_ID = 710001;

const ANDROID = [
  { label: "xiaomi", serial: process.env.P4_DEVICE_A || "8b37179f7d94", cdpPort: 9681 },
  { label: "samsung", serial: process.env.P4_DEVICE_B || "RFCY40PY2CA", cdpPort: 9682 },
];

const AUDIT_MARKERS = [
  "explicit_logout_start",
  "explicit_logout_context",
  "logout_device_deactivate_start",
  "logout_device_deactivate_done",
  "logout_device_deactivate_failed",
  "auth_logout_server_start",
  "auth_logout_server_done",
  "client_session_wipe_after_logout",
  "terminal_guest_after_explicit_logout",
];

function loadEnv() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function n(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function gitSha(ref) {
  const r = spawnSync("git", ["rev-parse", ref], { encoding: "utf8" });
  return (r.stdout || "").trim() || null;
}

function readSummaryNumber(serial) {
  const r = adb(serial, "shell", "dumpsys", "notification", "--noredact");
  if (r.status !== 0) return null;
  const marker = `id=${SUMMARY_ID}`;
  const idx = (r.stdout || "").indexOf(marker);
  if (idx < 0) return null;
  const slice = r.stdout.slice(idx, idx + 2500);
  const m = slice.match(/\bnumber=(\d+)/);
  return m ? Number(m[1]) : null;
}

function makeSb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) throw new Error("missing supabase env");
  return createClient(url, sk, { auth: { persistSession: false } });
}

async function pickGeneralRoom(sb, viewerId) {
  const { data: rooms } = await sb
    .from("community_messenger_rooms")
    .select("id, chat_domain, domain_identity_key")
    .is("deleted_at", null)
    .eq("chat_domain", "general_direct")
    .limit(80);
  for (const r of rooms || []) {
    const { data: parts } = await sb
      .from("community_messenger_participants")
      .select("user_id, unread_count, left_at")
      .eq("room_id", r.id)
      .is("left_at", null);
    const users = (parts || []).map((p) => p.user_id);
    if (!users.includes(viewerId)) continue;
    const peer = users.find((u) => u !== viewerId);
    if (!peer) continue;
    const self = (parts || []).find((p) => p.user_id === viewerId);
    return { ...r, peer, unreadBefore: n(self?.unread_count) };
  }
  return null;
}

async function appendText(sb, room, senderId, key, content) {
  const { data, error } = await sb.rpc("dibay_append_room_message_atomic", {
    p_idempotency_key: key,
    p_room_id: room.id,
    p_chat_domain: room.chat_domain,
    p_domain_identity_key: room.domain_identity_key,
    p_sender_id: senderId,
    p_sender_role: "member",
    p_message_type: "text",
    p_content: content,
    p_counts_as_unread: true,
  });
  return { ok: !!data?.ok && !error, error: error?.message || data?.error };
}

async function captureSnapshot(page) {
  return page.evaluate(async () => {
    const out = {
      t: Date.now(),
      path: location.pathname,
      viewerId: null,
      deviceId: null,
      sessionPhase: null,
      projectionState: null,
      projectionRevision: null,
      surfaceAppIconTotal: null,
      badgeGet: null,
      httpAppIcon: null,
      httpOk: false,
    };
    try {
      out.viewerId = window.localStorage?.getItem("dibay:auth_bound_user_id") || null;
      out.deviceId =
        window.localStorage?.getItem("dibay:client_instance_id") ||
        window.localStorage?.getItem("samarket:client_instance_id") ||
        null;
    } catch {
      /* ignore */
    }
    try {
      const Badge = window.Capacitor?.Plugins?.Badge;
      if (Badge?.get) {
        const g = await Badge.get();
        out.badgeGet = Math.max(0, Math.floor(Number(g?.count) || 0));
      }
    } catch {
      /* ignore */
    }
    try {
      const r = await fetch("/api/me/notifications/badge-count?fresh=1", {
        credentials: "include",
        cache: "no-store",
      });
      out.httpOk = r.ok;
      const j = await r.json().catch(() => null);
      out.httpAppIcon = Math.max(
        0,
        Math.floor(
          Number(j?.memberAppIconAuthority?.appIconTotal ?? j?.projection?.appIconTotal) || 0
        )
      );
      out.projectionState = j?.projectionAuthorityState ?? null;
      out.projectionRevision =
        j?.projection?.revision ?? j?.memberAppIconAuthority?.revision ?? null;
    } catch {
      /* ignore */
    }
    return out;
  });
}

async function captureClientPhase(page) {
  return page.evaluate(() => {
    const text = [];
    // Best-effort: parse last console-visible globals if any; phase usually only in module.
    try {
      text.push({
        bound: window.localStorage?.getItem("dibay:auth_bound_user_id"),
        path: location.pathname,
      });
    } catch {
      /* ignore */
    }
    return { t: Date.now(), path: location.pathname };
  });
}

function attachConsoleTap(page, sink) {
  const onConsole = (msg) => {
    const type = msg.type();
    const raw = msg.text();
    const entry = { t: Date.now(), type, text: raw };
    sink.push(entry);
  };
  page.on("console", onConsole);
  return () => page.off("console", onConsole);
}

function findFirst(events, pred) {
  for (const e of events) {
    if (pred(e)) return e;
  }
  return null;
}

function hasAudit(events, marker) {
  return findFirst(events, (e) => e.text?.includes(`[${marker}]`));
}

function parseNativeFromLogcat(text) {
  const lines = String(text || "").split("\n");
  const hits = [];
  for (const line of lines) {
    if (
      /Badge\.clear|Badge\.set|syncNativeBadgeCount|DibayAppIconDelivery|NativeBadgeSync|clear_logout|terminal_guest|explicit_logout|dibay-delivery-trace|badge-fd-probe/i.test(
        line
      )
    ) {
      hits.push(line);
    }
  }
  return {
    clearLines: hits.filter((l) => /Badge\.clear|summary_cleared|count.:\s*0|"count"\s*:\s*0/i.test(l)),
    setLines: hits.filter((l) => /Badge\.set|methodData:\s*\{\s*"count"\s*:\s*[1-9]/i.test(l)),
    clearLogoutLines: hits.filter((l) => /clear_logout|decision.:.clear_logout/i.test(l)),
    terminalGuestLines: hits.filter((l) => /terminal_guest/i.test(l)),
    apply0Lines: hits.filter((l) => /DibayAppIconDelivery|DeliveryAdapter\.apply/i.test(l) && /count.:\s*0|"count"\s*:\s*0/i.test(l)),
    sample: hits.slice(0, 80),
    allHits: hits,
  };
}

function classifyRound(row) {
  const ui = row.uiLogoutClicked === true;
  const flowStart = !!row.markers.explicit_logout_start;
  const clearNativeSeen =
    row.markers.nativeClearConsole ||
    row.logcat?.clearLines?.length > 0 ||
    row.logcat?.apply0Lines?.length > 0;
  const wipe = !!row.markers.client_session_wipe_after_logout;
  const terminal = !!row.markers.terminal_guest_after_explicit_logout;
  const clearLogout = !!row.markers.clear_logout;
  const badge0 =
    row.badgeTimeline?.some((b) => b.label !== "before" && b.badgeGet === 0) === true;
  const badgeFinal0 = row.badgeTimeline?.at(-1)?.badgeGet === 0;
  const launcher0 = row.launcherAfter === 0;
  const launcherFinal0 = row.launcherFinal === 0 || launcher0;

  if (!ui) {
    return {
      verdict: "APP ICON LOGOUT ROOT CAUSE NOT PROVEN",
      firstBreak: "NOT_PROVEN",
      reason: "product_logout_ui_not_clicked",
    };
  }
  if (!flowStart) {
    return {
      verdict: "APP ICON LOGOUT RUNTIME FAIL — AUTHORITY_FIRST_BREAK",
      firstBreak: "AUTHORITY_FIRST_BREAK",
      reason: "ui_clicked_but_explicit_logout_start_missing",
      firstMissing: "T1/T2 runExplicitLogoutFlow (explicit_logout_start)",
    };
  }
  // clearNativeBadgeCount is fire-and-forget early in flow; prove via Badge.clear / apply(0)
  const earlyClear = clearNativeSeen;
  if (!earlyClear && !clearLogout) {
    // Still may reach terminal_guest — if flow started but no clear evidence
    if (!wipe) {
      return {
        verdict: "APP ICON LOGOUT RUNTIME FAIL — AUTHORITY_FIRST_BREAK",
        firstBreak: "AUTHORITY_FIRST_BREAK",
        reason: "explicit_logout_start_but_wipe_marker_missing",
        firstMissing: "T4 wipeClientSessionState (client_session_wipe_after_logout)",
      };
    }
    if (!terminal) {
      return {
        verdict: "APP ICON LOGOUT RUNTIME FAIL — AUTHORITY_FIRST_BREAK",
        firstBreak: "AUTHORITY_FIRST_BREAK",
        reason: "wipe_but_terminal_guest_marker_missing",
        firstMissing: "T6 terminal_guest",
      };
    }
    if (!clearLogout) {
      return {
        verdict: "APP ICON LOGOUT RUNTIME FAIL — AUTHORITY_FIRST_BREAK",
        firstBreak: "AUTHORITY_FIRST_BREAK",
        reason: "terminal_guest_but_clear_logout_decision_missing",
        firstMissing: "T7 NativeBadgeSync clear_logout",
      };
    }
  }
  if (!wipe) {
    return {
      verdict: "APP ICON LOGOUT RUNTIME FAIL — AUTHORITY_FIRST_BREAK",
      firstBreak: "AUTHORITY_FIRST_BREAK",
      reason: "flow_started_but_wipe_marker_missing",
      firstMissing: "T4 wipeClientSessionState",
    };
  }
  if (!terminal) {
    return {
      verdict: "APP ICON LOGOUT RUNTIME FAIL — AUTHORITY_FIRST_BREAK",
      firstBreak: "AUTHORITY_FIRST_BREAK",
      reason: "wipe_but_terminal_guest_missing",
      firstMissing: "T6 terminal_guest",
    };
  }
  if (!clearLogout && !clearNativeSeen) {
    return {
      verdict: "APP ICON LOGOUT RUNTIME FAIL — AUTHORITY_FIRST_BREAK",
      firstBreak: "AUTHORITY_FIRST_BREAK",
      reason: "terminal_guest_but_no_clear_logout_or_native_clear",
      firstMissing: "T7 clear_logout / T3 native clear",
    };
  }
  if (clearLogout || clearNativeSeen) {
    if (!badge0 && !badgeFinal0) {
      return {
        verdict: "APP ICON LOGOUT RUNTIME FAIL — NATIVE_FIRST_BREAK",
        firstBreak: "NATIVE_FIRST_BREAK",
        reason: "native_clear_or_clear_logout_seen_but_badgeGet_stays_N",
        firstMissing: "T8 Badge.get=0",
      };
    }
    if ((badge0 || badgeFinal0) && !launcherFinal0 && row.launcherFinal != null) {
      return {
        verdict: "APP ICON LOGOUT RUNTIME FAIL — LAUNCHER_OS_FIRST_BREAK",
        firstBreak: "LAUNCHER_OS_FIRST_BREAK",
        reason: "badgeGet_0_but_launcher_stays_N",
        firstMissing: "T9 Launcher=0",
      };
    }
    if ((badge0 || badgeFinal0) && (launcherFinal0 || row.launcherFinal == null)) {
      // launcher null = cannot prove visual; do not invent PASS for launcher
      if (row.launcherFinal == null && row.launcherAfter == null) {
        return {
          verdict: "APP ICON LOGOUT ROOT CAUSE NOT PROVEN",
          firstBreak: "NOT_PROVEN",
          reason: "badgeGet_0_but_launcher_visual_unobserved",
        };
      }
      return {
        verdict: "APP ICON LOGOUT RUNTIME PASS",
        firstBreak: "NONE",
        reason: "product_ssot_clear_badge0_launcher0",
      };
    }
  }
  return {
    verdict: "APP ICON LOGOUT ROOT CAUSE NOT PROVEN",
    firstBreak: "NOT_PROVEN",
    reason: "insufficient_layer_evidence",
  };
}

async function withLoggedInPage(device, log) {
  const loginRes = await ensureApkWebViewLogin({
    adb,
    chromium,
    serial: device.serial,
    cdpPort: device.cdpPort,
    act: ACT,
    pkg: PKG,
    prod: PROD,
    login: LOGIN,
    expectedUserId: VIEWER,
    loadEnv,
    password: PASSWORD,
    log,
    label: device.label,
    restartForFcm: false,
  });
  if (!loginRes.ok) return { ok: false, error: "login_failed", probe: loginRes.probe };
  adb(device.serial, "shell", "am", "start", "-n", ACT);
  await sleep(2500);
  forwardCdp(adb, device.serial, device.cdpPort);
  const { browser, page } = await connectWebView(chromium, device.cdpPort);
  await navigateApkWebView(page, `${PROD}/community-messenger`, 4000);
  await sleep(2500);
  return { ok: true, browser, page };
}

async function waitNgt0(page, log, maxAttempts = 8) {
  let snap = await captureSnapshot(page);
  for (let i = 0; i < maxAttempts; i++) {
    if ((snap.badgeGet ?? 0) > 0 || (snap.httpAppIcon ?? 0) > 0) return snap;
    log(`wait N>0 attempt=${i + 1} badgeGet=${snap.badgeGet} httpAppIcon=${snap.httpAppIcon}`);
    await navigateApkWebView(page, `${PROD}/community-messenger`, 2000);
    await sleep(1500);
    snap = await captureSnapshot(page);
  }
  return snap;
}

async function clickProductLogoutUi(page, log, consoleEvents) {
  const t0 = Date.now();
  consoleEvents.push({ t: t0, type: "harness", text: "T0 navigate /mypage/logout" });
  await navigateApkWebView(page, `${PROD}/mypage/logout`, 3500);
  await sleep(1500);

  // autoOpen should show modal; click confirm = product SSOT
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="auth_logout_submit"]');
    if (btn && typeof btn.click === "function") {
      btn.click();
      return { ok: true, via: "testid" };
    }
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const buttons = Array.from(dialog.querySelectorAll("button"));
      const confirm = buttons.find((b) => /로그아웃|Log out|Sign out/i.test(b.textContent || ""));
      if (confirm) {
        confirm.click();
        return { ok: true, via: "dialog_text" };
      }
    }
    return { ok: false, via: "not_found", htmlHint: document.body?.innerText?.slice(0, 200) || "" };
  });
  consoleEvents.push({
    t: Date.now(),
    type: "harness",
    text: `T0 logout UI action result=${JSON.stringify(clicked)}`,
  });
  log(`logout UI click: ${JSON.stringify(clicked)}`);
  return clicked;
}

async function badgeGetOnly(page) {
  try {
    return await page.evaluate(async () => {
      try {
        const Badge = window.Capacitor?.Plugins?.Badge;
        if (!Badge?.get) return null;
        const g = await Badge.get();
        return Math.max(0, Math.floor(Number(g?.count) || 0));
      } catch {
        return null;
      }
    });
  } catch {
    return null;
  }
}

async function runRound(device, sb, round) {
  const log = (m) => console.log(`[${device.label}][C${round}] ${m}`);
  const room = await pickGeneralRoom(sb, VIEWER);
  if (!room) {
    return { device: device.label, round, verdict: "NOT_RUN", reason: "no_general_room" };
  }

  const tag = `cprod_${device.label}_${round}_${Date.now()}`;
  const seeded = await appendText(sb, room, room.peer, `${tag}:seed`, `case-c-prod-${round}`);
  log(`seed ok=${seeded.ok} err=${seeded.error || ""}`);
  await sleep(1000);

  adb(device.serial, "logcat", "-c");
  const opened = await withLoggedInPage(device, log);
  if (!opened.ok) {
    return { device: device.label, round, verdict: "NOT_RUN", reason: opened.error };
  }

  const consoleEvents = [];
  const detach = attachConsoleTap(opened.page, consoleEvents);

  try {
    let before = await waitNgt0(opened.page, log);
    const launcherBefore = readSummaryNumber(device.serial);
    log(
      `BEFORE viewer=${before.viewerId} deviceId=${before.deviceId} phase=? proj=${before.projectionState} surface/http=${before.httpAppIcon} badgeGet=${before.badgeGet} launcher=${launcherBefore}`
    );

    if ((before.badgeGet ?? 0) <= 0 && (before.httpAppIcon ?? 0) <= 0) {
      return {
        device: device.label,
        serial: device.serial,
        round,
        verdict: "NOT_RUN",
        reason: "N_not_gt_0_before_logout",
        before,
        launcherBefore,
      };
    }

    const badgeTimeline = [{ label: "before", t: Date.now(), badgeGet: before.badgeGet }];

    const click = await clickProductLogoutUi(opened.page, log, consoleEvents);
    if (!click.ok) {
      const logcatFail = adb(device.serial, "logcat", "-d", "-t", "400").stdout || "";
      writeFileSync(join(OUT, `${device.label}-C${round}-logcat.txt`), logcatFail);
      return {
        device: device.label,
        serial: device.serial,
        round,
        uiLogoutClicked: false,
        verdict: "APP ICON LOGOUT ROOT CAUSE NOT PROVEN",
        firstBreak: "NOT_PROVEN",
        reason: "product_logout_ui_click_failed",
        click,
        before,
        launcherBefore,
        consoleEvents,
      };
    }

    // Immediate after click
    badgeTimeline.push({ label: "immediate_after_click", t: Date.now(), badgeGet: await badgeGetOnly(opened.page) });

    // Poll up to ~5s for markers + badge
    for (const waitMs of [500, 500, 1000, 1000, 1000, 1000]) {
      await sleep(waitMs);
      const label =
        waitMs === 500
          ? `+${badgeTimeline.length * 0.5}s`
          : `poll_${badgeTimeline.length}`;
      badgeTimeline.push({ label, t: Date.now(), badgeGet: await badgeGetOnly(opened.page) });
    }
    // Explicit +1s/+3s/+5s from click (approx from timeline)
    const tClick = consoleEvents.find((e) => e.text?.includes("logout UI action"))?.t || Date.now();
    for (const [label, targetMs] of [
      ["after_1s", 1000],
      ["after_3s", 3000],
      ["after_5s", 5000],
    ]) {
      const elapsed = Date.now() - tClick;
      if (elapsed < targetMs) await sleep(targetMs - elapsed);
      badgeTimeline.push({ label, t: Date.now(), badgeGet: await badgeGetOnly(opened.page) });
    }

    const afterSnap = await captureSnapshot(opened.page).catch(() => null);
    const phaseProbe = await captureClientPhase(opened.page);
    const launcherAfter = readSummaryNumber(device.serial);
    await sleep(500);
    const launcherFinal = readSummaryNumber(device.serial);

    const logcatText = adb(device.serial, "logcat", "-d", "-t", "800").stdout || "";
    writeFileSync(join(OUT, `${device.label}-C${round}-logcat.txt`), logcatText);
    writeFileSync(
      join(OUT, `${device.label}-C${round}-console.json`),
      JSON.stringify(consoleEvents, null, 2)
    );
    const logcat = parseNativeFromLogcat(logcatText);

    const markers = {};
    for (const m of AUDIT_MARKERS) {
      const hit = hasAudit(consoleEvents, m);
      markers[m] = !!hit;
      if (hit) markers[`${m}_t`] = hit.t;
    }
    markers.clear_logout = !!(
      findFirst(consoleEvents, (e) => /clear_logout|decision.:.clear_logout/i.test(e.text || "")) ||
      logcat.clearLogoutLines.length
    );
    markers.nativeClearConsole = !!(
      findFirst(consoleEvents, (e) => /Badge\.clear|syncNativeBadgeCount\.enter[\s\S]*count.:\s*0|"count"\s*:\s*0/i.test(e.text || "")) ||
      logcat.clearLines.length > 0 ||
      logcat.apply0Lines.length > 0
    );
    markers.NativeBadgeSync_seen = !!findFirst(consoleEvents, (e) => /NativeBadgeSync/i.test(e.text || ""));

    const row = {
      device: device.label,
      serial: device.serial,
      round,
      uiLogoutClicked: true,
      clickVia: click.via,
      productPath: "/mypage/logout → auth_logout_submit → runAuthLogoutExit → logoutDiBaYAppSession → logoutCurrentDevice → runExplicitLogoutFlow",
      before,
      launcherBefore,
      afterSnap,
      phaseProbe,
      badgeTimeline,
      launcherAfter,
      launcherFinal,
      markers,
      logcat: {
        clearCount: logcat.clearLines.length,
        setCount: logcat.setLines.length,
        clearLogoutCount: logcat.clearLogoutLines.length,
        terminalGuestCount: logcat.terminalGuestLines.length,
        apply0Count: logcat.apply0Lines.length,
        clearLines: logcat.clearLines.slice(0, 12),
        clearLogoutLines: logcat.clearLogoutLines.slice(0, 8),
        sample: logcat.sample.slice(0, 40),
      },
      consoleAuditHits: consoleEvents.filter((e) =>
        AUDIT_MARKERS.some((m) => e.text?.includes(`[${m}]`))
      ),
      seeded: { ok: seeded.ok, roomId: room.id },
    };

    const classified = classifyRound(row);
    Object.assign(row, classified);

    // Timeline first missing annotation
    const timeline = {
      T0_ui: true,
      T1_logoutCurrentDevice_inferred: markers.explicit_logout_start,
      T2_runExplicitLogoutFlow: markers.explicit_logout_start,
      T3_clearNativeBadgeCount: markers.nativeClearConsole,
      T4_wipe: markers.client_session_wipe_after_logout,
      T5_phase: markers.terminal_guest_after_explicit_logout || markers.clear_logout,
      T6_terminal_guest: markers.terminal_guest_after_explicit_logout,
      T7_clear_logout: markers.clear_logout,
      T8_badgeGet0: badgeTimeline.some((b) => b.label !== "before" && b.badgeGet === 0),
      T9_launcher0: launcherFinal === 0 || launcherAfter === 0,
    };
    row.timeline = timeline;
    const order = [
      ["T0_ui", timeline.T0_ui],
      ["T2_runExplicitLogoutFlow", timeline.T2_runExplicitLogoutFlow],
      ["T3_clearNativeBadgeCount", timeline.T3_clearNativeBadgeCount],
      ["T4_wipe", timeline.T4_wipe],
      ["T6_terminal_guest", timeline.T6_terminal_guest],
      ["T7_clear_logout", timeline.T7_clear_logout],
      ["T8_badgeGet0", timeline.T8_badgeGet0],
      ["T9_launcher0", timeline.T9_launcher0],
    ];
    row.firstMissingStep = order.find(([, ok]) => !ok)?.[0] || null;

    log(
      `RESULT ${row.verdict} break=${row.firstBreak} missing=${row.firstMissingStep} badgeFinal=${badgeTimeline.at(-1)?.badgeGet} launcher=${launcherFinal}`
    );
    return row;
  } finally {
    detach();
    await opened.browser.close().catch(() => {});
  }
}

async function main() {
  loadEnv();
  const head = gitSha("HEAD");
  const originMain = gitSha("origin/main");
  const report = {
    stamp: STAMP,
    out: OUT,
    head,
    originMain,
    production: "see_deploy_note_same_as_prior_7b0e3813d_when_Ready",
    productCodeChanges: 0,
    viewer: VIEWER,
    login: LOGIN,
    prod: PROD,
    rounds: ROUNDS,
    productLogoutChain: {
      ui: "LogoutActionTrigger.handleLogout (components/my/settings/LogoutContent.tsx:30)",
      coordinator: "runAuthLogoutExit (lib/auth/auth-exit-coordinator.ts:40) → logoutDiBaYAppSession",
      facade: "logoutDiBaYAppSession (lib/auth/logout.ts:17) → logoutCurrentDevice",
      client: "logoutCurrentDevice (lib/auth/logout-client.ts:22) → runExplicitLogoutFlow('current_device')",
      flow: "runExplicitLogoutFlow: wipe → terminal_guest → beginLogoutBadgeClearTransaction(pending durable) → execute (await/timeout keeps pending) → navigate → boot recoverPending before hold",
      wipeClear: "wipeClientSessionState Domain/Store reset only",
      sync: "NativeBadgeSync: pending → recover_logout_clear; else terminal_guest defensive; else COMPLETE echo",
      native: "execute → clearNativeBadgeCount → Badge.clear + DibayAppIconDelivery.apply(0) + Badge.get===0 → complete removes durable key",
    },
    harnessDiff: {
      oldCaseC: "logoutApkWebView: POST /api/auth/logout + cookie clear + 1s — NO product SSOT",
      thisCaseC: "UI /mypage/logout + auth_logout_submit — YES product SSOT",
    },
    rows: [],
    ios: {
      udid: "00008120-000025C826F3C01E",
      verdict: "NOT_RUN",
      reason: "no_ios_cap_cdp_product_logout_automation_in_this_script",
    },
  };

  const sb = makeSb();
  const list = spawnSync(ADB, ["devices"], { encoding: "utf8" }).stdout || "";
  const serials = new Set(
    list
      .split("\n")
      .slice(1)
      .map((l) => l.trim().split(/\s+/)[0])
      .filter((s) => s && !s.includes("List") && s.length > 3)
  );

  for (const device of ANDROID) {
    if (!serials.has(device.serial)) {
      report.rows.push({
        device: device.label,
        serial: device.serial,
        verdict: "NOT_RUN",
        reason: "device_not_connected",
      });
      continue;
    }
    for (let round = 1; round <= ROUNDS; round++) {
      try {
        const row = await runRound(device, sb, round);
        report.rows.push(row);
      } catch (e) {
        report.rows.push({
          device: device.label,
          serial: device.serial,
          round,
          verdict: "APP ICON LOGOUT ROOT CAUSE NOT PROVEN",
          firstBreak: "NOT_PROVEN",
          reason: String(e?.message || e),
        });
      }
      // re-login for next round handled inside next withLoggedInPage
    }
  }

  // Aggregate first-break
  const androidRows = report.rows.filter((r) => r.round);
  const breaks = androidRows.map((r) => r.firstBreak).filter(Boolean);
  report.aggregate = {
    rounds: androidRows.length,
    pass: androidRows.filter((r) => r.verdict === "APP ICON LOGOUT RUNTIME PASS").length,
    authority: androidRows.filter((r) => r.firstBreak === "AUTHORITY_FIRST_BREAK").length,
    native: androidRows.filter((r) => r.firstBreak === "NATIVE_FIRST_BREAK").length,
    launcher: androidRows.filter((r) => r.firstBreak === "LAUNCHER_OS_FIRST_BREAK").length,
    notProven: androidRows.filter((r) => r.firstBreak === "NOT_PROVEN" || r.verdict === "NOT_RUN").length,
    dominantBreak: breaks.length
      ? breaks.sort((a, b) => breaks.filter((x) => x === b).length - breaks.filter((x) => x === a).length)[0]
      : null,
  };

  if (
    report.aggregate.authority + report.aggregate.native + report.aggregate.launcher === 0 &&
    report.aggregate.pass === 0
  ) {
    report.caseCVerdict = "APP ICON LOGOUT ROOT CAUSE NOT PROVEN";
  } else if (report.aggregate.pass === androidRows.filter((r) => r.verdict !== "NOT_RUN").length && report.aggregate.pass > 0) {
    report.caseCVerdict = "APP ICON LOGOUT RUNTIME PASS";
  } else if (report.aggregate.dominantBreak === "AUTHORITY_FIRST_BREAK") {
    report.caseCVerdict = "APP ICON LOGOUT RUNTIME FAIL — AUTHORITY_FIRST_BREAK";
  } else if (report.aggregate.dominantBreak === "NATIVE_FIRST_BREAK") {
    report.caseCVerdict = "APP ICON LOGOUT RUNTIME FAIL — NATIVE_FIRST_BREAK";
  } else if (report.aggregate.dominantBreak === "LAUNCHER_OS_FIRST_BREAK") {
    report.caseCVerdict = "APP ICON LOGOUT RUNTIME FAIL — LAUNCHER_OS_FIRST_BREAK";
  } else {
    report.caseCVerdict = "APP ICON LOGOUT ROOT CAUSE NOT PROVEN";
  }

  report.overallUnchanged = {
    CODE: "PASS",
    DEPLOY: "PASS",
    RUNTIME: "PARTIAL",
    APP_ICON_BOOT_FLICKER: "PARTIAL",
    CALL_STUB_UNREAD: "NOT_RUN",
    UNREAD_DIVIDER_FAB: "NOT_RUN",
  };

  writeFileSync(join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: OUT, caseCVerdict: report.caseCVerdict, aggregate: report.aggregate }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
