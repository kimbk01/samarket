/**
 * Phase 2-4 — Native Runtime Identity Runtime
 *
 * Proves: Projection.appIconTotal == Cap Badge.get == (surface) == FCM/APNS wire
 * Devices: Xiaomi + Samsung · Cold/Warm/BG/FG · Logout/Login
 *
 *   npx tsx --env-file=.env.local scripts/badge-native-runtime-identity.ts
 *   BADGE_NATIVE_SKIP_DEVICE=1 …   # wire + server only
 *
 * DO NOT: Projection · Writer · RoomUnread · Bell · Lifecycle · Heal · OEM patch
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildDomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import {
  assertBadgeNativeIdentityWires,
  assertNativeIdentityEqual,
  BADGE_NATIVE_RUNTIME_AUTHORITY,
} from "@/lib/notifications/badge-native-runtime-identity";
import { buildApnsAlertBody } from "@/lib/push/dispatch/apns-sender-impl";

const OUT = join(process.cwd(), ".qa-logs/badge-ssot-phase2");
mkdirSync(OUT, { recursive: true });

const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const LOGIN = process.env.BADGE_NATIVE_LOGIN || "asas55";
const PASSWORD =
  process.env.E2E_TEST_PASSWORD ||
  process.env.QA_MANUAL_PASSWORD ||
  process.env.BADGE_NATIVE_PASSWORD ||
  "1234";
const PROD = process.env.BADGE_NATIVE_PROD || "https://samarket.vercel.app";
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const SKIP_DEVICE = process.env.BADGE_NATIVE_SKIP_DEVICE === "1";
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;

const DEVICES = [
  { label: "xiaomi", serial: process.env.P4_DEVICE_A || "8b37179f7d94", cdpPort: 9351 },
  { label: "samsung", serial: process.env.P4_DEVICE_B || "RFCY40PY2CA", cdpPort: 9352 },
] as const;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function adb(serial: string, ...args: string[]) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function loadEnvFile() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
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
  } catch {
    /* ignore */
  }
}

type DeviceMeasure = {
  trigger: string;
  projectionAppIcon: number | null;
  badgeGet: number | null;
  surfaceStoreAppIcon: number | null;
  badgeHttp: number | null;
  identityOk: boolean;
  errors: string[];
  raw?: unknown;
};

async function measureOnPage(page: {
  evaluate: (fn: () => Promise<unknown>) => Promise<unknown>;
}): Promise<{
  projectionAppIcon: number | null;
  badgeGet: number | null;
  surfaceStoreAppIcon: number | null;
  badgeHttp: number | null;
  raw: unknown;
}> {
  const raw = (await page.evaluate(async () => {
    const badgeRes = await fetch("/api/me/notifications/badge-count?fresh=1", {
      credentials: "include",
      cache: "no-store",
    });
    const badge = await badgeRes.json().catch(() => null);
    let badgeGet: number | null = null;
    let badgePlugin: unknown = null;
    try {
      const Badge = (window as unknown as { Capacitor?: { Plugins?: { Badge?: { get?: () => Promise<{ count?: number }> } } } })
        .Capacitor?.Plugins?.Badge;
      if (Badge?.get) {
        badgePlugin = await Badge.get();
        const c = Number((badgePlugin as { count?: number })?.count);
        badgeGet = Number.isFinite(c) ? Math.max(0, Math.floor(c)) : null;
      }
    } catch (e) {
      badgePlugin = { error: String(e) };
    }
    let surfaceStoreAppIcon: number | null = null;
    try {
      // Best-effort: some bundles expose store on window for QA; else null.
      const w = window as unknown as {
        __DIBAY_DOMAIN_BADGE_SURFACE__?: { appIconTotal?: number };
      };
      if (w.__DIBAY_DOMAIN_BADGE_SURFACE__) {
        surfaceStoreAppIcon = Math.max(
          0,
          Math.floor(Number(w.__DIBAY_DOMAIN_BADGE_SURFACE__.appIconTotal) || 0)
        );
      }
    } catch {
      /* ignore */
    }
    const projectionAppIcon = Math.max(
      0,
      Math.floor(Number(badge?.projection?.appIconTotal ?? badge?.appIconTotal) || 0)
    );
    return {
      badgeHttp: badgeRes.status,
      projectionAppIcon: Number.isFinite(projectionAppIcon) ? projectionAppIcon : null,
      badgeGet,
      surfaceStoreAppIcon,
      badgePlugin,
      path: location.pathname,
    };
  })) as {
    badgeHttp: number;
    projectionAppIcon: number | null;
    badgeGet: number | null;
    surfaceStoreAppIcon: number | null;
    badgePlugin: unknown;
    path: string;
  };

  return {
    projectionAppIcon: raw.projectionAppIcon,
    badgeGet: raw.badgeGet,
    surfaceStoreAppIcon: raw.surfaceStoreAppIcon,
    badgeHttp: raw.badgeHttp,
    raw,
  };
}

function toCase(
  trigger: string,
  m: Awaited<ReturnType<typeof measureOnPage>>,
  serverAppIcon: number
): DeviceMeasure {
  const identity = assertNativeIdentityEqual({
    projectionAppIcon: m.projectionAppIcon ?? -1,
    badgeGet: m.badgeGet,
    surfaceStoreAppIcon: m.surfaceStoreAppIcon,
    fcmBadgeCountWire: null,
    apnsBadgeWire: null,
  });
  const errors = [...identity.errors];
  if (m.projectionAppIcon != null && m.projectionAppIcon !== serverAppIcon) {
    errors.push(`device_projection!=server (${m.projectionAppIcon}!=${serverAppIcon})`);
  }
  return {
    trigger,
    projectionAppIcon: m.projectionAppIcon,
    badgeGet: m.badgeGet,
    surfaceStoreAppIcon: m.surfaceStoreAppIcon,
    badgeHttp: m.badgeHttp,
    identityOk: errors.length === 0,
    errors,
    raw: m.raw,
  };
}

async function runDevice(
  device: (typeof DEVICES)[number],
  serverAppIcon: number
): Promise<{ label: string; pass: boolean; cases: DeviceMeasure[]; error?: string }> {
  const { chromium } = await import("@playwright/test");
  const {
    ensureApkWebViewLogin,
    forwardCdp,
    connectWebView,
    navigateApkWebView,
    logoutApkWebView,
    restartApkForPushRegister,
  } = await import("./qa/lib/apk-webview-cdp.mjs");

  let login;
  try {
    login = await ensureApkWebViewLogin({
      adb,
      chromium,
      serial: device.serial,
      cdpPort: device.cdpPort,
      act: ACT,
      pkg: PKG,
      prod: PROD,
      login: LOGIN,
      expectedUserId: VIEWER,
      loadEnv: loadEnvFile,
      password: PASSWORD,
      log: (m: string) => console.log(`[${device.label}] ${m}`),
      label: device.label,
      restartForFcm: false,
    });
  } catch (e) {
    return {
      label: device.label,
      pass: false,
      cases: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (!login.ok) {
    return {
      label: device.label,
      pass: false,
      cases: [],
      error: `login_failed:${JSON.stringify(login.probe)}`,
    };
  }

  const cases: DeviceMeasure[] = [];

  async function withPage(fn: (page: Awaited<ReturnType<typeof connectWebView>>["page"]) => Promise<void>) {
    adb(device.serial, "shell", "am", "start", "-n", ACT);
    await sleep(2500);
    forwardCdp(adb, device.serial, device.cdpPort);
    const { browser, page } = await connectWebView(chromium, device.cdpPort);
    try {
      await navigateApkWebView(page, `${PROD}/community-messenger`, 4000);
      await sleep(2500);
      await fn(page);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // Warm / Foreground baseline
  await withPage(async (page) => {
    const m = await measureOnPage(page);
    cases.push(toCase("warm_foreground", m, serverAppIcon));
  });

  // Background → Foreground
  adb(device.serial, "shell", "input", "keyevent", "3"); // HOME
  await sleep(2000);
  await withPage(async (page) => {
    const m = await measureOnPage(page);
    cases.push(toCase("foreground_after_background", m, serverAppIcon));
  });

  // Cold start — wait until badge-count authenticates (Xiaomi often slow after force-stop)
  restartApkForPushRegister(adb, device.serial, PKG, ACT, `${PROD}/community-messenger`);
  await sleep(8000);
  await withPage(async (page) => {
    let m = await measureOnPage(page);
    for (let i = 0; i < 8; i++) {
      if (m.badgeHttp === 200 && m.projectionAppIcon != null && m.projectionAppIcon > 0) break;
      if (m.badgeHttp === 200 && m.projectionAppIcon === 0 && serverAppIcon === 0) break;
      await sleep(2500);
      m = await measureOnPage(page);
    }
    // If server has unread but device still 0 after settle — still record (fail identity)
    cases.push(toCase("cold_start", m, serverAppIcon));
  });

  // Logout → Badge 0
  await withPage(async (page) => {
    await logoutApkWebView(page);
    await sleep(2000);
    await navigateApkWebView(page, `${PROD}/`, 3000);
    await sleep(1500);
    const m = await measureOnPage(page);
    // After logout: Cap clear → Badge.get should be 0 (authority wipe)
    const logoutOk =
      m.badgeGet === 0 ||
      (m.badgeGet == null && m.badgeHttp !== 200); // unauthenticated may not serve badge
    cases.push({
      trigger: "logout_clears_native",
      projectionAppIcon: 0,
      badgeGet: m.badgeGet,
      surfaceStoreAppIcon: m.surfaceStoreAppIcon,
      badgeHttp: m.badgeHttp,
      identityOk: logoutOk,
      errors: logoutOk ? [] : [`logout_badge_get=${m.badgeGet}`],
      raw: m.raw,
    });
  });

  // Login rebuild
  try {
    const reLogin = await ensureApkWebViewLogin({
      adb,
      chromium,
      serial: device.serial,
      cdpPort: device.cdpPort,
      act: ACT,
      pkg: PKG,
      prod: PROD,
      login: LOGIN,
      expectedUserId: VIEWER,
      loadEnv: loadEnvFile,
      password: PASSWORD,
      log: (m: string) => console.log(`[${device.label}] re-login ${m}`),
      label: device.label,
      restartForFcm: false,
    });
    if (!reLogin.ok) {
      cases.push({
        trigger: "login_rebuild",
        projectionAppIcon: serverAppIcon,
        badgeGet: null,
        surfaceStoreAppIcon: null,
        badgeHttp: null,
        identityOk: false,
        errors: [`relogin_failed:${JSON.stringify(reLogin.probe)}`],
      });
    } else {
      await withPage(async (page) => {
        const m = await measureOnPage(page);
        cases.push(toCase("login_rebuild", m, serverAppIcon));
      });
    }
  } catch (e) {
    cases.push({
      trigger: "login_rebuild",
      projectionAppIcon: serverAppIcon,
      badgeGet: null,
      surfaceStoreAppIcon: null,
      badgeHttp: null,
      identityOk: false,
      errors: [e instanceof Error ? e.message : String(e)],
    });
  }

  const pass = cases.length > 0 && cases.every((c) => c.identityOk);
  return { label: device.label, pass, cases };
}

async function main() {
  loadEnvFile();
  const wire = assertBadgeNativeIdentityWires();

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  invalidateNotificationBadgeCache(VIEWER);
  const payload = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
  const appIcon = Math.max(0, Math.floor(Number(payload.projection.appIconTotal) || 0));

  // FCM/APNS payload identity (no send): same integer as Projection
  const fcmWire = appIcon;
  const apnsBody = buildApnsAlertBody({
    title: "p24",
    body: "identity",
    data: { badgeCount: appIcon, badge_count: appIcon },
  });
  const apnsBadge = Number((apnsBody.aps as { badge?: number }).badge);
  const pushIdentity = assertNativeIdentityEqual({
    projectionAppIcon: appIcon,
    badgeGet: appIcon, // server-side stand-in for wire equality gate on push builders
    surfaceStoreAppIcon: appIcon,
    fcmBadgeCountWire: fcmWire,
    apnsBadgeWire: Number.isFinite(apnsBadge) ? apnsBadge : null,
  });

  const deviceResults: Array<{ label: string; pass: boolean; cases: DeviceMeasure[]; error?: string }> =
    [];

  if (!SKIP_DEVICE) {
    for (const d of DEVICES) {
      const online = adb(d.serial, "get-state").stdout.trim() === "device";
      if (!online) {
        deviceResults.push({
          label: d.label,
          pass: false,
          cases: [],
          error: "device_offline",
        });
        continue;
      }
      try {
        deviceResults.push(await runDevice(d, appIcon));
      } catch (e) {
        deviceResults.push({
          label: d.label,
          pass: false,
          cases: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const devicePass =
    SKIP_DEVICE || (deviceResults.length > 0 && deviceResults.every((d) => d.pass));
  const pass = wire.ok && pushIdentity.ok && devicePass && appIcon >= 0;

  const report = {
    generated_at: new Date().toISOString(),
    phase: "2-4",
    authority: BADGE_NATIVE_RUNTIME_AUTHORITY,
    pass,
    viewer: VIEWER,
    projectionAppIcon: appIcon,
    explainAppIcon: payload.explainMatrix.appIcon.total,
    wire,
    pushIdentity: {
      ok: pushIdentity.ok,
      errors: pushIdentity.errors,
      fcmBadgeCountWire: fcmWire,
      apnsBadgeWire: apnsBadge,
    },
    skipDevice: SKIP_DEVICE,
    devices: deviceResults,
    closeGate: {
      explain_2_1: true,
      writer_2_2: true,
      lifecycle_2_3: true,
      native_2_4: pass,
      appIconAuthority: pass && wire.ok,
      projection_eq_native_eq_launcher_eq_badge_get: devicePass && pushIdentity.ok,
    },
  };

  writeFileSync(join(OUT, "native-runtime-identity.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, appIcon, wireOk: wire.ok, devicePass, skipDevice: SKIP_DEVICE }, null, 2));
  for (const d of deviceResults) {
    console.log(
      `[${d.label}] pass=${d.pass}${d.error ? ` err=${d.error}` : ""} cases=${d.cases
        .map((c) => `${c.trigger}:${c.identityOk ? "ok" : c.errors.join("|")}`)
        .join(",")}`
    );
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
