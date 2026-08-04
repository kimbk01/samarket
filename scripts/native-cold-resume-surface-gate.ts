#!/usr/bin/env npx tsx
/**
 * Native cold / resume / force-stop surface gate — Xiaomi · Samsung · iPhone.
 *
 * HARD LOCK regression gate (Final Stabilization). Re-run against Production SHA
 * after badge/unread/native changes to prove the same conditions still hold.
 *
 * Proves (per device):
 *   - cold start, background→resume, force-stop→relaunch
 *   - server A/B ↔ Bell/Bottom/Hub/App Icon/Native Badge
 *   - projectionVersionMs / lastApplied does not go backwards across triggers
 *   - one-room mark_read decreases related Row/Hub/Bottom/Icon
 *
 *   npx tsx --env-file=.env.local scripts/native-cold-resume-surface-gate.ts
 *
 * Evidence: .qa-logs/native-cold-resume-surface-gate/
 * iPhone: prefs (capacitor.badge / lastApplied) + server cookie when CDP Runtime unavailable.
 *
 * DO NOT: declare PRODUCT PASS / HARD LOCK from this script alone (needs CODE/DEPLOY/
 * RUNTIME/RED-TEAM + this gate against the Production SHA).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const OUT = join(
  process.cwd(),
  process.env.NATIVE_COLD_RESUME_OUT || ".qa-logs/native-cold-resume-surface-gate"
);
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
const IPHONE_UDID = process.env.IOS_UDID || "00008120-000025C826F3C01E";
const DEVELOPER_DIR =
  process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";

const ANDROID = [
  { label: "xiaomi", serial: process.env.P4_DEVICE_A || "8b37179f7d94", cdpPort: 9561 },
  { label: "samsung", serial: process.env.P4_DEVICE_B || "RFCY40PY2CA", cdpPort: 9562 },
] as const;

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function adb(serial: string, ...args: string[]) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function n(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

type ServerSnap = {
  A: number;
  B: number;
  appIcon: number;
  bottom: number;
  trade: number;
  customer: number;
  owner: number;
  projectionVersionMs: number;
  authority: string | null;
  rooms: Record<string, number>;
};

type SurfaceSnap = {
  trigger: string;
  A: number | null;
  B: number | null;
  appIcon: number | null;
  bottom: number | null;
  trade: number | null;
  customer: number | null;
  badgeGet: number | null;
  projectionVersionMs: number | null;
  lastApplied: number | null;
  authority: string | null;
  path: string | null;
  failures: string[];
  pass: boolean;
};

function scoreFromBadge(badge: any, badgeGet: number | null, trigger: string, path: string | null): SurfaceSnap {
  const failures: string[] = [];
  if (!badge || badge.ok === false) failures.push("badge_body");
  if (badge?.authority !== "domain_badge") failures.push(`authority_${badge?.authority}`);
  const rooms = badge?.domainUnreadRooms ?? {};
  const gd = n(rooms.general_direct);
  const group = n(rooms.group);
  const trade = n(rooms.trade);
  const customer = n(rooms.store_order);
  const bottom = gd + group + trade + customer;
  const A = n(badge?.memberUnreadNotificationCount ?? badge?.projection?.bellTotal);
  const B = n(badge?.memberConversationUnreadRooms);
  const appIcon = n(
    badge?.memberAppIconAuthority?.appIconTotal ?? badge?.projection?.appIconTotal
  );
  if (appIcon !== A + B) failures.push(`appIcon_not_A+B got=${appIcon} A+B=${A + B}`);
  if (badgeGet != null && badgeGet !== appIcon) {
    failures.push(`native_badge_ne_appIcon badgeGet=${badgeGet} appIcon=${appIcon}`);
  }
  const projectionVersionMs = n(badge?.projectionVersionMs ?? badge?.revision);
  const lastApplied = n(
    badge?.memberAppIconAuthority?.authorityVersion?.split?.("|")?.[1] ??
      badge?.lastAppliedVersion
  );
  return {
    trigger,
    A,
    B,
    appIcon,
    bottom,
    trade,
    customer,
    badgeGet,
    projectionVersionMs: projectionVersionMs || null,
    lastApplied: lastApplied || null,
    authority: badge?.authority ?? null,
    path,
    failures,
    pass: failures.length === 0,
  };
}

async function serverSnap(cookieHeader: string): Promise<ServerSnap> {
  const res = await fetch(`${PROD}/api/me/notifications/badge-count?fresh=1`, {
    headers: { cookie: cookieHeader, accept: "application/json" },
    cache: "no-store",
  });
  const badge = await res.json().catch(() => null);
  const rooms = badge?.domainUnreadRooms ?? {};
  const gd = n(rooms.general_direct);
  const group = n(rooms.group);
  const trade = n(rooms.trade);
  const customer = n(rooms.store_order);
  const A = n(badge?.memberUnreadNotificationCount ?? badge?.projection?.bellTotal);
  const B = n(badge?.memberConversationUnreadRooms);
  const appIcon = n(
    badge?.memberAppIconAuthority?.appIconTotal ?? badge?.projection?.appIconTotal
  );
  return {
    A,
    B,
    appIcon,
    bottom: gd + group + trade + customer,
    trade,
    customer,
    owner: n(badge?.storeOrderOwnerChatUnread ?? badge?.ownerOperationCount),
    projectionVersionMs: n(badge?.projectionVersionMs ?? badge?.revision),
    authority: badge?.authority ?? null,
    rooms: { general_direct: gd, group, trade, store_order: customer },
  };
}

async function buildCookieHeader(): Promise<string> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const loginEmail = LOGIN.includes("@") ? LOGIN : `${LOGIN}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail, password: PASSWORD });
  if (error || !data.session) throw new Error(`login: ${error?.message ?? "no session"}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  const parts = [`sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify(session))}`];
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id")
    .eq("id", data.session.user.id)
    .maybeSingle();
  const activeSessionId = String(pr?.active_session_id ?? "").trim();
  if (activeSessionId) parts.push(`samarket_active_session_id=${activeSessionId}`);
  return parts.join("; ");
}

async function measurePage(page: any, trigger: string): Promise<SurfaceSnap> {
  const measured = await page.evaluate(async () => {
    const badgeRes = await fetch("/api/me/notifications/badge-count?fresh=1", {
      credentials: "include",
      cache: "no-store",
    });
    const badge = await badgeRes.json().catch(() => null);
    let badgeGet: number | null = null;
    try {
      const Badge = (window as any).Capacitor?.Plugins?.Badge;
      if (Badge?.get) {
        const g = await Badge.get();
        badgeGet = Math.max(0, Math.floor(Number(g?.count) || 0));
      }
    } catch {
      /* ignore */
    }
    let lastApplied: number | null = null;
    try {
      const store = (window as any).__DIBAY_BADGE_DEBUG__ || (window as any).__SAM_BADGE__;
      if (store?.lastAppliedVersion != null) lastApplied = Number(store.lastAppliedVersion) || null;
    } catch {
      /* ignore */
    }
    return { badge, badgeGet, lastApplied, path: location.pathname };
  });
  const snap = scoreFromBadge(measured.badge, measured.badgeGet, trigger, measured.path);
  if (measured.lastApplied != null && snap.lastApplied == null) {
    snap.lastApplied = measured.lastApplied;
  }
  return snap;
}

function assertMonotonic(cases: SurfaceSnap[]): string[] {
  const errs: string[] = [];
  let maxVer = 0;
  for (const c of cases) {
    const v = c.projectionVersionMs ?? 0;
    if (v > 0 && v < maxVer) {
      errs.push(`${c.trigger}: projectionVersionMs went backwards ${v}<${maxVer}`);
    }
    if (v > maxVer) maxVer = v;
  }
  return errs;
}

async function runAndroid(device: (typeof ANDROID)[number], cookie: string, server: ServerSnap) {
  const { chromium } = await import("@playwright/test");
  const {
    ensureApkWebViewLogin,
    forwardCdp,
    connectWebView,
    navigateApkWebView,
  } = await import("./qa/lib/apk-webview-cdp.mjs");

  const login = await ensureApkWebViewLogin({
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
    log: (m: string) => console.log(`[${device.label}] ${m}`),
    label: device.label,
    restartForFcm: false,
  });
  if (!login.ok) {
    return { label: device.label, pass: false, error: "login_failed", probe: login.probe, cases: [] as SurfaceSnap[] };
  }

  const cases: SurfaceSnap[] = [];

  async function withPage(trigger: string, settleMs = 2500) {
    adb(device.serial, "shell", "am", "start", "-n", ACT);
    await sleep(settleMs);
    forwardCdp(adb, device.serial, device.cdpPort);
    const { browser, page } = await connectWebView(chromium, device.cdpPort);
    try {
      await navigateApkWebView(page, `${PROD}/community-messenger`, 4000);
      await sleep(2500);
      let snap = await measurePage(page, trigger);
      for (let i = 0; i < 6; i++) {
        if (snap.pass && snap.appIcon === server.appIcon) break;
        if (snap.authority === "domain_badge" && snap.appIcon != null) break;
        await sleep(2000);
        snap = await measurePage(page, trigger);
      }
      // Match against server formula at measure time
      const live = await serverSnap(cookie);
      if (snap.appIcon != null && snap.appIcon !== live.appIcon) {
        snap.failures.push(`device_appIcon_ne_server ${snap.appIcon}!=${live.appIcon}`);
        snap.pass = false;
      }
      if (snap.A != null && snap.A !== live.A) {
        snap.failures.push(`device_A_ne_server ${snap.A}!=${live.A}`);
        snap.pass = false;
      }
      if (snap.B != null && snap.B !== live.B) {
        snap.failures.push(`device_B_ne_server ${snap.B}!=${live.B}`);
        snap.pass = false;
      }
      cases.push(snap);
      return { page, browser, snap, live };
    } catch (e) {
      await browser.close().catch(() => {});
      throw e;
    }
  }

  // 1) cold start
  adb(device.serial, "shell", "am", "force-stop", PKG);
  await sleep(1500);
  adb(device.serial, "shell", "am", "start", "-n", ACT);
  await sleep(8000);
  let held = await withPage("cold_start", 3000);
  await held.browser.close().catch(() => {});

  // 2) background → resume
  adb(device.serial, "shell", "input", "keyevent", "3");
  await sleep(2500);
  held = await withPage("background_resume", 2500);
  await held.browser.close().catch(() => {});

  // 3) force-stop → relaunch
  adb(device.serial, "shell", "am", "force-stop", PKG);
  await sleep(1500);
  adb(device.serial, "shell", "am", "start", "-n", ACT);
  await sleep(8000);
  held = await withPage("force_stop_relaunch", 3000);

  // 4) seed one unread then mark_read — proves decrease on THIS device
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  async function pickUnreadOrSeedable(): Promise<{
    id: string;
    chat_domain: string;
    domain_identity_key: string;
    peer: string;
    role?: string;
    orderId?: string;
    storeId?: string;
  } | null> {
    const { data: parts } = await sb
      .from("community_messenger_participants")
      .select("room_id, unread_count, left_at")
      .eq("user_id", VIEWER)
      .is("left_at", null)
      .limit(120);
    const roomIds = (parts || []).map((p) => p.room_id as string);
    if (!roomIds.length) return null;
    const { data: rooms } = await sb
      .from("community_messenger_rooms")
      .select("id, chat_domain, domain_identity_key, deleted_at")
      .in("id", roomIds)
      .is("deleted_at", null);
    for (const prefer of ["trade", "general_direct", "store_order", "group"] as const) {
      for (const r of rooms || []) {
        if (r.chat_domain !== prefer) continue;
        const { data: members } = await sb
          .from("community_messenger_participants")
          .select("user_id, left_at")
          .eq("room_id", r.id)
          .is("left_at", null);
        const peer = (members || []).map((m) => m.user_id as string).find((u) => u !== VIEWER);
        if (!peer) continue;
        if (r.chat_domain === "store_order") {
          const orderId = String(r.domain_identity_key || "").replace(/^store_order:/, "");
          const { data: order } = await sb
            .from("store_orders")
            .select("id, store_id, buyer_user_id")
            .eq("id", orderId)
            .maybeSingle();
          if (!order || order.buyer_user_id !== VIEWER) continue;
          return {
            ...r,
            peer,
            role: "customer",
            orderId,
            storeId: order.store_id,
          };
        }
        return { ...r, peer };
      }
    }
    return null;
  }

  let markReadResult: Record<string, unknown> | null = null;
  const markTarget = await pickUnreadOrSeedable();
  if (!markTarget) {
    cases.push({
      trigger: "after_mark_read",
      A: null,
      B: null,
      appIcon: null,
      bottom: null,
      trade: null,
      customer: null,
      badgeGet: null,
      projectionVersionMs: null,
      lastApplied: null,
      authority: null,
      path: null,
      failures: ["no_room_for_mark_read_seed"],
      pass: false,
    });
  } else {
    const tag = `native_cold_${device.label}_${Date.now()}`;
    // Ensure room is unread for viewer
    await sb.rpc("dibay_append_room_message_atomic", {
      p_idempotency_key: `${tag}:seed`,
      p_room_id: markTarget.id,
      p_chat_domain: markTarget.chat_domain,
      p_domain_identity_key: markTarget.domain_identity_key,
      p_sender_id: markTarget.peer,
      p_sender_role: "member",
      p_message_type: "text",
      p_content: `native-cold-seed-${device.label}`,
      p_counts_as_unread: true,
    });
    await sleep(1500);
    await navigateApkWebView(held.page, `${PROD}/community-messenger`, 3000);
    await sleep(2500);
    const beforeDevice = await measurePage(held.page, "before_mark_read_seed");
    const beforeRead = await serverSnap(cookie);
    cases.push(beforeDevice);

    const args: Record<string, unknown> = {
      p_viewer_id: VIEWER,
      p_room_id: markTarget.id,
      p_chat_domain: markTarget.chat_domain,
      p_domain_identity_key: markTarget.domain_identity_key,
      p_viewer_role: markTarget.role || "member",
      p_idempotency_key: `${tag}:read`,
    };
    if (markTarget.chat_domain === "store_order") {
      args.p_order_id = markTarget.orderId || null;
      args.p_store_id = markTarget.storeId || null;
      args.p_viewer_role = "customer";
    }
    const { data, error } = await sb.rpc("dibay_mark_room_read_atomic", args);
    await sleep(1500);
    await navigateApkWebView(held.page, `${PROD}/community-messenger`, 3000);
    await sleep(2500);
    let afterSnap = await measurePage(held.page, "after_mark_read");
    for (let i = 0; i < 5; i++) {
      const live = await serverSnap(cookie);
      if (afterSnap.appIcon === live.appIcon && afterSnap.pass) break;
      await sleep(1500);
      afterSnap = await measurePage(held.page, "after_mark_read");
    }
    const afterServer = await serverSnap(cookie);
    const decFail: string[] = [];
    if (
      !(
        afterServer.appIcon < beforeRead.appIcon ||
        afterServer.B < beforeRead.B ||
        afterServer.bottom < beforeRead.bottom
      )
    ) {
      decFail.push(
        `expected_decrease beforeIcon=${beforeRead.appIcon} afterIcon=${afterServer.appIcon} beforeB=${beforeRead.B} afterB=${afterServer.B}`
      );
    }
    if (afterSnap.appIcon != null && afterSnap.appIcon !== afterServer.appIcon) {
      decFail.push(`device_appIcon_ne_server_after_read ${afterSnap.appIcon}!=${afterServer.appIcon}`);
    }
    afterSnap.failures.push(...decFail);
    afterSnap.pass = afterSnap.failures.length === 0;
    cases.push(afterSnap);
    markReadResult = {
      ok: !!data?.ok && !error,
      error: error?.message || data?.error,
      room: markTarget.id,
      domain: markTarget.chat_domain,
      before: beforeRead,
      after: afterServer,
    };
  }

  await held.browser.close().catch(() => {});

  const mono = assertMonotonic(cases.filter((c) => c.trigger !== "after_mark_read" || c.pass || c.failures.length));
  const pass = cases.every((c) => c.pass) && mono.length === 0;
  return {
    label: device.label,
    pass,
    monoErrors: mono,
    cases,
    markRead: markReadResult,
  };
}

async function runIphone(cookie: string, server: ServerSnap) {
  // iOS 26: CDP Runtime often unavailable — use server cookie + native prefs echo.
  const prefsDir = join(OUT, "iphone-prefs");
  mkdirSync(prefsDir, { recursive: true });
  const cases: SurfaceSnap[] = [];

  function launchIos() {
    spawnSync(
      `${DEVELOPER_DIR}/usr/bin/devicectl`,
      ["device", "process", "launch", "--device", IPHONE_UDID, PKG],
      { encoding: "utf8", env: { ...process.env, DEVELOPER_DIR } }
    );
  }

  function terminateIos() {
    spawnSync(
      `${DEVELOPER_DIR}/usr/bin/devicectl`,
      ["device", "process", "terminate", "--device", IPHONE_UDID, PKG],
      { encoding: "utf8", env: { ...process.env, DEVELOPER_DIR } }
    );
  }

  async function prefsEcho(tag: string): Promise<{ echo: number | null; lastApplied: number | null; raw: string }> {
    const plist = join(prefsDir, `${tag}.plist`);
    const jsonPath = join(prefsDir, `${tag}.json`);
    const copy = spawnSync(
      `${DEVELOPER_DIR}/usr/bin/devicectl`,
      [
        "device",
        "copy",
        "from",
        "--device",
        IPHONE_UDID,
        "--domain-type",
        "appDataContainer",
        "--domain-identifier",
        PKG,
        "--source",
        "Library/Preferences/com.dibay.app.plist",
        "--destination",
        plist,
        "--remove-existing-content",
        "true",
      ],
      { encoding: "utf8", env: { ...process.env, DEVELOPER_DIR } }
    );
    spawnSync("plutil", ["-convert", "json", "-o", jsonPath, plist], { encoding: "utf8" });
    let echo: number | null = null;
    let lastApplied: number | null = null;
    let raw = `${copy.stdout || ""}\n${copy.stderr || ""}`;
    try {
      const j = JSON.parse(readFileSync(jsonPath, "utf8"));
      echo = j["capacitor.badge"] != null ? n(j["capacitor.badge"]) : null;
      lastApplied =
        j["dibay.appIconDelivery.lastApplied"] != null
          ? n(j["dibay.appIconDelivery.lastApplied"])
          : null;
      raw = JSON.stringify(j);
      writeFileSync(join(prefsDir, `${tag}-summary.json`), JSON.stringify({ echo, lastApplied }, null, 2));
    } catch (e) {
      raw += `\nparse_error:${e instanceof Error ? e.message : String(e)}`;
    }
    return { echo, lastApplied, raw: raw.slice(0, 2000) };
  }

  async function caseFromServer(
    trigger: string,
    echo: number | null,
    lastApplied: number | null
  ): Promise<SurfaceSnap> {
    const live = await serverSnap(cookie);
    const failures: string[] = [];
    if (live.authority !== "domain_badge") failures.push(`authority_${live.authority}`);
    if (live.appIcon !== live.A + live.B) failures.push(`appIcon_not_A+B`);
    if (echo != null && echo !== live.appIcon) {
      failures.push(`native_echo_ne_appIcon echo=${echo} appIcon=${live.appIcon}`);
    }
    if (lastApplied != null && echo != null && lastApplied !== echo) {
      failures.push(`lastApplied_ne_echo lastApplied=${lastApplied} echo=${echo}`);
    }
    if (echo == null) {
      failures.push("iphone_native_echo_unavailable");
    }
    return {
      trigger,
      A: live.A,
      B: live.B,
      appIcon: live.appIcon,
      bottom: live.bottom,
      trade: live.trade,
      customer: live.customer,
      badgeGet: echo,
      projectionVersionMs: live.projectionVersionMs || null,
      lastApplied,
      authority: live.authority,
      path: "iphone:prefs+server",
      failures,
      pass: failures.filter((f) => f !== "iphone_native_echo_unavailable").length === 0 && echo != null,
    };
  }

  // cold
  terminateIos();
  await sleep(1500);
  launchIos();
  await sleep(10000);
  let echo = await prefsEcho("cold_start");
  cases.push(await caseFromServer("cold_start", echo.echo, echo.lastApplied));

  // background/resume — activate app again
  launchIos();
  await sleep(6000);
  echo = await prefsEcho("background_resume");
  cases.push(await caseFromServer("background_resume", echo.echo, echo.lastApplied));

  // force terminate → relaunch
  terminateIos();
  await sleep(1500);
  launchIos();
  await sleep(10000);
  echo = await prefsEcho("force_stop_relaunch");
  cases.push(await caseFromServer("force_stop_relaunch", echo.echo, echo.lastApplied));

  // mark_read via seed + clear, then poll native prefs until echo matches server
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: parts } = await sb
    .from("community_messenger_participants")
    .select("room_id, unread_count, left_at")
    .eq("user_id", VIEWER)
    .is("left_at", null)
    .limit(40);
  let markRead: Record<string, unknown> | null = null;
  let roomId = parts?.[0]?.room_id as string | undefined;
  if (!roomId && parts?.length) roomId = parts[0].room_id as string;
  if (roomId) {
    const { data: room } = await sb
      .from("community_messenger_rooms")
      .select("id, chat_domain, domain_identity_key")
      .eq("id", roomId)
      .maybeSingle();
    const { data: members } = await sb
      .from("community_messenger_participants")
      .select("user_id, left_at")
      .eq("room_id", roomId)
      .is("left_at", null);
    const peer = (members || []).map((m) => m.user_id as string).find((u) => u !== VIEWER);
    if (room && peer) {
      const tag = `native_cold_ios_${Date.now()}`;
      await sb.rpc("dibay_append_room_message_atomic", {
        p_idempotency_key: `${tag}:seed`,
        p_room_id: room.id,
        p_chat_domain: room.chat_domain,
        p_domain_identity_key: room.domain_identity_key,
        p_sender_id: peer,
        p_sender_role: "member",
        p_message_type: "text",
        p_content: "native-cold-seed-iphone",
        p_counts_as_unread: true,
      });
      await sleep(1500);
      const beforeRead = await serverSnap(cookie);
      const args: Record<string, unknown> = {
        p_viewer_id: VIEWER,
        p_room_id: room.id,
        p_chat_domain: room.chat_domain,
        p_domain_identity_key: room.domain_identity_key,
        p_viewer_role: "member",
        p_idempotency_key: `${tag}:read`,
      };
      if (room.chat_domain === "store_order") {
        const orderId = String(room.domain_identity_key || "").replace(/^store_order:/, "");
        const { data: order } = await sb
          .from("store_orders")
          .select("id, store_id, buyer_user_id")
          .eq("id", orderId)
          .maybeSingle();
        if (order?.buyer_user_id === VIEWER) {
          args.p_order_id = orderId;
          args.p_store_id = order.store_id;
          args.p_viewer_role = "customer";
        }
      }
      const { data, error } = await sb.rpc("dibay_mark_room_read_atomic", args);
      launchIos();
      let after: SurfaceSnap | null = null;
      for (let i = 0; i < 10; i++) {
        await sleep(3000);
        echo = await prefsEcho("after_mark_read");
        after = await caseFromServer("after_mark_read", echo.echo, echo.lastApplied);
        const afterServer = await serverSnap(cookie);
        if (echo.echo === afterServer.appIcon && after.pass) {
          if (
            afterServer.appIcon < beforeRead.appIcon ||
            afterServer.B < beforeRead.B ||
            afterServer.bottom < beforeRead.bottom
          ) {
            break;
          }
        }
        // Keep last after; may still fail
      }
      const afterServer = await serverSnap(cookie);
      if (!after) {
        after = await caseFromServer("after_mark_read", echo.echo, echo.lastApplied);
      }
      if (
        !(
          afterServer.appIcon < beforeRead.appIcon ||
          afterServer.B < beforeRead.B ||
          afterServer.bottom < beforeRead.bottom
        )
      ) {
        after.failures.push(
          `no_decrease_after_mark_read beforeB=${beforeRead.B} afterB=${afterServer.B} beforeIcon=${beforeRead.appIcon} afterIcon=${afterServer.appIcon}`
        );
        after.pass = false;
      }
      cases.push(after);
      markRead = { ok: !!data?.ok && !error, before: beforeRead, afterServer };
    } else {
      cases.push({
        trigger: "after_mark_read",
        A: null,
        B: null,
        appIcon: null,
        bottom: null,
        trade: null,
        customer: null,
        badgeGet: null,
        projectionVersionMs: null,
        lastApplied: null,
        authority: null,
        path: null,
        failures: ["no_peer_room_for_mark_read"],
        pass: false,
      });
    }
  } else {
    cases.push({
      trigger: "after_mark_read",
      A: null,
      B: null,
      appIcon: null,
      bottom: null,
      trade: null,
      customer: null,
      badgeGet: null,
      projectionVersionMs: null,
      lastApplied: null,
      authority: null,
      path: null,
      failures: ["no_unread_room_for_mark_read"],
      pass: false,
    });
  }

  const mono = assertMonotonic(cases);
  // Soft-pass if echo unavailable but server formula holds on all triggers — still FAIL native gate.
  const pass = cases.every((c) => c.pass) && mono.length === 0;
  return {
    label: "iphone",
    pass,
    probe: "prefs+server",
    monoErrors: mono,
    cases,
    markRead,
    serverBaseline: server,
  };
}

async function main() {
  loadEnv();
  const expectedSha = process.env.EXPECTED_SHA || "";
  const cookie = await buildCookieHeader();
  const server = await serverSnap(cookie);
  console.log("[server]", JSON.stringify(server));

  const results: any[] = [];
  for (const d of ANDROID) {
    console.log(`\n=== ${d.label} ===`);
    const r = await runAndroid(d, cookie, server);
    results.push(r);
    console.log(JSON.stringify({ label: r.label, pass: r.pass, cases: r.cases?.map((c: SurfaceSnap) => ({ t: c.trigger, pass: c.pass, failures: c.failures, appIcon: c.appIcon, badgeGet: c.badgeGet })) }, null, 2));
  }

  console.log("\n=== iphone ===");
  const iphone = await runIphone(cookie, server);
  results.push(iphone);
  console.log(JSON.stringify({ label: iphone.label, pass: iphone.pass, cases: iphone.cases?.map((c) => ({ t: c.trigger, pass: c.pass, failures: c.failures, appIcon: c.appIcon, badgeGet: c.badgeGet })) }, null, 2));

  const allPass = results.every((r) => r.pass);
  const report = {
    generated_at: new Date().toISOString(),
    expected_sha: expectedSha || null,
    prod: PROD,
    viewer: VIEWER,
    server,
    pass: allPass,
    product_pass: false,
    hard_lock: false,
    results,
  };
  writeFileSync(join(OUT, "VERDICT.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: allPass, out: join(OUT, "VERDICT.json") }, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
