/**
 * Xiaomi Delivery stale-echo timeline — OBSERVE ONLY.
 *
 * Chain: Projection → API → Cap Badge.get/prefs → summary setNumber
 * Priority: MainActivity.onResume applyFromCapBadgeCache stale echo.
 *
 * FORBIDDEN: Formula / ChatAttention / NotificationAttention / Bell / RoomUnread edits.
 *
 *   npx tsx --env-file=.env.local scripts/xiaomi-delivery-stale-echo-timeline.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { buildDomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import {
  createNotificationEvent,
  markNotificationEventRead,
} from "@/lib/notifications/core/notification-event-repository";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import { resolveNotificationAttentionKey } from "@/lib/notifications/core/notification-attention-key";

const OUT = join(
  process.cwd(),
  ".qa-logs/badge-ssot-phase4/chat-notification-split-phase-a/step2-launcher-delivery/xiaomi-stale-echo"
);
mkdirSync(OUT, { recursive: true });

const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const LOGIN = process.env.BADGE_NATIVE_LOGIN || "asas55";
const PASSWORD =
  process.env.E2E_TEST_PASSWORD ||
  process.env.QA_MANUAL_PASSWORD ||
  process.env.BADGE_NATIVE_PASSWORD ||
  "1234";
const PROD = process.env.BADGE_NATIVE_PROD || "https://samarket.vercel.app";
const SERIAL = process.env.P4_DEVICE_A || "8b37179f7d94";
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const CDP = Number(process.env.P4_CDP_A || 9381);
const T0 = Date.now();
const SUMMARY_ID = 710001;

type Row = {
  tMs: number;
  tag: string;
  serverAppIcon: number | null;
  serverBell: number | null;
  apiAppIcon: number | null;
  badgeGet: number | null;
  capPrefs: number | null;
  summaryNumber: number | null;
  note?: string;
};

const timeline: Row[] = [];
const consoleBuf: string[] = [];
const logcatPath = join(OUT, `logcat-${T0}.txt`);

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
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnvFile();

const sb: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function adb(...args: string[]) {
  return spawnSync(ADB, ["-s", SERIAL, ...args], { encoding: "utf8" });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readCapPrefs(): number | null {
  const r = adb("shell", "run-as", PKG, "cat", "shared_prefs/capacitor.badge.xml");
  if (r.status !== 0) return null;
  const m = r.stdout.match(/name="capacitor\.badge"\s+value="(-?\d+)"/);
  return m ? Number(m[1]) : null;
}

function readSummaryNumber(): number | null {
  const r = adb("shell", "dumpsys", "notification", "--noredact");
  if (r.status !== 0) return null;
  const marker = `id=${SUMMARY_ID}`;
  const idx = r.stdout.indexOf(marker);
  if (idx < 0) return null;
  const slice = r.stdout.slice(idx, idx + 2500);
  const m = slice.match(/\bnumber=(\d+)/);
  return m ? Number(m[1]) : null;
}

async function serverSnap() {
  invalidateNotificationBadgeCache(VIEWER);
  const p = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
  return {
    appIcon: p.projection.appIconTotal,
    bell: p.projection.bellTotal,
    notif: p.notificationAttentionTotal,
  };
}

function pushRow(partial: Omit<Row, "tMs">) {
  const row: Row = { tMs: Date.now() - T0, ...partial };
  timeline.push(row);
  console.log(JSON.stringify(row));
  return row;
}

async function createPriceOffer(productId: string, tag: string) {
  const displayPayload = {
    routeUrl: `/post/${productId}?offers=1`,
    product_id: productId,
    legacyMeta: { kind: "trade_offer", product_id: productId, offer_id: tag },
  };
  const attentionKey = resolveNotificationAttentionKey({
    type: "trade_status",
    category: "trade_status",
    display_payload: displayPayload,
    dedupe_key: `timeline_offer:${productId}:${tag}`,
  });
  const created = await createNotificationEvent(sb, {
    userId: VIEWER,
    type: "trade_status",
    category: categoryForEventType("trade_status"),
    title: "가격 제안이 도착했습니다",
    body: `timeline ${tag}`,
    dedupeKey: `timeline_offer:${productId}:${tag}:${randomUUID()}`,
    displayPayload,
    unread: true,
  });
  return {
    ok: created.ok,
    id: created.ok ? created.row.id : undefined,
    attentionKey,
    error: created.ok ? undefined : created.error,
  };
}

type PageLike = {
  evaluate: (fn: () => Promise<unknown>) => Promise<unknown>;
  on: (ev: string, fn: (msg: { text: () => string }) => void) => void;
};

async function probe(page: PageLike, tag: string, note?: string) {
  const server = await serverSnap();
  const device = (await page.evaluate(async () => {
    const out: { apiAppIcon: number | null; badgeGet: number | null; err?: string } = {
      apiAppIcon: null,
      badgeGet: null,
    };
    try {
      const res = await fetch("/api/me/notifications/badge-count?fresh=1", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        projection?: { appIconTotal?: number };
        unifiedAttention?: { appIconTotal?: number };
      };
      out.apiAppIcon =
        j.unifiedAttention?.appIconTotal ?? j.projection?.appIconTotal ?? null;
    } catch (e) {
      out.err = String(e);
    }
    try {
      const Cap = (
        window as unknown as {
          Capacitor?: { Plugins?: { Badge?: { get?: () => Promise<{ count?: number }> } } };
        }
      ).Capacitor?.Plugins;
      if (Cap?.Badge?.get) {
        const g = await Cap.Badge.get();
        const c = Number(g?.count);
        out.badgeGet = Number.isFinite(c) ? c : null;
      }
    } catch (e) {
      out.err = `${out.err || ""}|badge:${String(e)}`;
    }
    return out;
  })) as { apiAppIcon: number | null; badgeGet: number | null };

  return pushRow({
    tag,
    serverAppIcon: server.appIcon,
    serverBell: server.bell,
    apiAppIcon: device.apiAppIcon,
    badgeGet: device.badgeGet,
    capPrefs: readCapPrefs(),
    summaryNumber: readSummaryNumber(),
    note,
  });
}

async function reconnectPage(
  chromium: typeof import("@playwright/test")["chromium"],
  connectWebView: (c: unknown, port: number) => Promise<{ browser: { close: () => Promise<void> }; page: PageLike }>
) {
  adb("shell", "am", "start", "-n", ACT);
  await sleep(2000);
  const { forwardCdp } = await import("./qa/lib/apk-webview-cdp.mjs");
  forwardCdp(
    (serial: string, ...args: string[]) => spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" }),
    SERIAL,
    CDP
  );
  const { browser, page } = await connectWebView(chromium, CDP);
  page.on("console", (msg) => {
    const t = msg.text();
    if (/native-badge|native_set|app_icon|Badge|DIBAY_APPICON|dibay-delivery-trace/i.test(t)) {
      consoleBuf.push(`${Date.now() - T0}ms ${t}`);
    }
  });
  return { browser, page };
}

async function main() {
  writeFileSync(logcatPath, "");
  adb("logcat", "-c");
  const logcat = spawn(
    ADB,
    [
      "-s",
      SERIAL,
      "logcat",
      "-v",
      "threadtime",
      "DIBAY_APPICON_DELIVERY:I",
      "Capacitor/Console:I",
      "chromium:I",
      "*:S",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  logcat.stdout?.on("data", (b: Buffer) => appendFileSync(logcatPath, b.toString()));
  logcat.stderr?.on("data", (b: Buffer) => appendFileSync(logcatPath, b.toString()));

  const productId = process.env.PRICE_OFFER_PRODUCT_ID || "timeline-prod-asas55";
  const { chromium } = await import("@playwright/test");
  const {
    ensureApkWebViewLogin,
    forwardCdp,
    connectWebView,
    navigateApkWebView,
  } = await import("./qa/lib/apk-webview-cdp.mjs");

  const login = await ensureApkWebViewLogin({
    adb: (serial: string, ...args: string[]) =>
      spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" }),
    chromium,
    serial: SERIAL,
    cdpPort: CDP,
    act: ACT,
    pkg: PKG,
    prod: PROD,
    login: LOGIN,
    expectedUserId: VIEWER,
    loadEnv: loadEnvFile,
    password: PASSWORD,
    log: (m: string) => console.log(`[xiaomi] ${m}`),
    label: "xiaomi-timeline",
    restartForFcm: false,
  });
  if (!login.ok) throw new Error(`login_failed:${JSON.stringify(login.probe)}`);

  let browser: { close: () => Promise<void> } | null = null;
  try {
    adb("shell", "am", "start", "-n", ACT);
    await sleep(1500);
    forwardCdp(
      (serial: string, ...args: string[]) =>
        spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" }),
      SERIAL,
      CDP
    );
    const connected = await connectWebView(chromium, CDP);
    browser = connected.browser;
    let page = connected.page as PageLike;
    page.on("console", (msg) => {
      const t = msg.text();
      if (/native-badge|native_set|app_icon|Badge|DIBAY_APPICON|dibay-delivery-trace/i.test(t)) {
        consoleBuf.push(`${Date.now() - T0}ms ${t}`);
      }
    });

    await navigateApkWebView(page, `${PROD}/community-messenger`, 5000);
    await sleep(2500);
    await probe(page, "T0_baseline");

    // onResume echo without Projection change
    adb("shell", "input", "keyevent", "3");
    await sleep(1000);
    pushRow({
      tag: "T1_home_native_only",
      serverAppIcon: (await serverSnap()).appIcon,
      serverBell: (await serverSnap()).bell,
      apiAppIcon: null,
      badgeGet: null,
      capPrefs: readCapPrefs(),
      summaryNumber: readSummaryNumber(),
      note: "HOME — Cap/summary only (no WebView probe)",
    });
    await browser?.close().catch(() => undefined);
    const resumed = await reconnectPage(chromium, connectWebView);
    browser = resumed.browser;
    page = resumed.page;
    await navigateApkWebView(page, `${PROD}/community-messenger`, 4000);
    await sleep(2000);
    await probe(page, "T2_after_resume", "onResume → applyFromCapBadgeCache");

    const created = await createPriceOffer(productId, `t-${Date.now()}`);
    if (!created.ok || !created.id) throw new Error(`create_failed:${created.error}`);
    // Hard reload → Boot Apply → NativeBadgeSync → Cap+Delivery one cycle (team PASS gate)
    await page.evaluate(() => {
      location.reload();
      return null;
    });
    await sleep(4000);
    await probe(page, "T3_offer_native_cycle", `id=${created.id} PASS iff proj==cap==summary`);
    await sleep(500);
    await probe(page, "T4_offer_+500ms");
    await sleep(1500);
    await probe(page, "T5_nav_hold", "Cap==Summary must already hold (no onResume needed)");
    await sleep(2000);
    await probe(page, "T6_nav_hold2");
    await sleep(2000);
    await probe(page, "T7_nav_hold3");

    // HOME/resume while Projection should be +1
    adb("shell", "input", "keyevent", "3");
    await sleep(800);
    pushRow({
      tag: "T8_home_while_proj_plus",
      serverAppIcon: (await serverSnap()).appIcon,
      serverBell: null,
      apiAppIcon: null,
      badgeGet: null,
      capPrefs: readCapPrefs(),
      summaryNumber: readSummaryNumber(),
      note: "HOME while offer open — Cap cache echo candidate",
    });
    await browser?.close().catch(() => undefined);
    const resumed2 = await reconnectPage(chromium, connectWebView);
    browser = resumed2.browser;
    page = resumed2.page;
    await navigateApkWebView(page, `${PROD}/community-messenger`, 4000);
    await sleep(2000);
    await probe(page, "T9_resume_while_proj_plus", "onResume Cap cache vs Projection");

    await markNotificationEventRead(sb, VIEWER, created.id, { openedAt: true });
    await page.evaluate(() => {
      location.reload();
      return null;
    });
    await sleep(4000);
    await probe(page, "T10_read_native_cycle", "PASS iff proj==cap==summary after −1");
    await sleep(1200);
    await probe(page, "T11_read_hold");
    await sleep(2500);
    await probe(page, "T12_read_hold2");
  } finally {
    logcat.kill("SIGTERM");
    await browser?.close().catch(() => undefined);
  }

  const divergences: Array<{ tag: string; kind: string; detail: string }> = [];
  for (const row of timeline) {
    const proj = row.serverAppIcon;
    if (proj == null) continue;
    if (row.apiAppIcon != null && row.apiAppIcon !== proj) {
      divergences.push({
        tag: row.tag,
        kind: "Projection_server_vs_API",
        detail: `server=${proj} api=${row.apiAppIcon}`,
      });
    }
    if (row.badgeGet != null && row.badgeGet !== proj) {
      divergences.push({
        tag: row.tag,
        kind: "Projection_vs_Cap_Badge.get",
        detail: `proj=${proj} badgeGet=${row.badgeGet}`,
      });
    }
    if (row.capPrefs != null && row.badgeGet != null && row.capPrefs !== row.badgeGet) {
      divergences.push({
        tag: row.tag,
        kind: "Badge.get_vs_capPrefs",
        detail: `get=${row.badgeGet} prefs=${row.capPrefs}`,
      });
    }
    if (
      row.capPrefs != null &&
      row.summaryNumber != null &&
      row.capPrefs !== row.summaryNumber
    ) {
      divergences.push({
        tag: row.tag,
        kind: "Cap_prefs_vs_summary_setNumber",
        detail: `prefs=${row.capPrefs} summary=${row.summaryNumber}`,
      });
    }
    if (row.summaryNumber != null && row.summaryNumber !== proj) {
      divergences.push({
        tag: row.tag,
        kind: "Projection_vs_summary_setNumber",
        detail: `proj=${proj} summary=${row.summaryNumber}`,
      });
    }
  }

  const first = divergences[0] || null;
  let firstCauseHypothesis =
    "unknown" as
      | "Projection_JS_sync_missing"
      | "JS_Native_plugin_delay"
      | "native_stale_apply"
      | "onResume_Cap_cache_echo_overwrites"
      | "summary_refresh_missing"
      | "unknown";

  if (first?.kind === "Projection_vs_Cap_Badge.get" || first?.kind === "Projection_vs_summary_setNumber") {
    const t9 = timeline.find((r) => r.tag === "T9_resume_while_proj_plus");
    const t8 = timeline.find((r) => r.tag === "T8_home_while_proj_plus");
    if (
      t9 &&
      t8 &&
      t9.serverAppIcon != null &&
      t9.capPrefs != null &&
      t9.serverAppIcon !== t9.capPrefs &&
      t9.summaryNumber === t9.capPrefs &&
      t8.capPrefs === t9.capPrefs
    ) {
      firstCauseHypothesis = "onResume_Cap_cache_echo_overwrites";
    } else {
      const row = timeline.find((r) => r.tag === first.tag);
      if (row && row.apiAppIcon === row.serverAppIcon && row.badgeGet !== row.serverAppIcon) {
        firstCauseHypothesis = "JS_Native_plugin_delay";
      } else if (row && row.apiAppIcon !== row.serverAppIcon) {
        firstCauseHypothesis = "Projection_JS_sync_missing";
      } else if (
        row &&
        row.capPrefs === row.serverAppIcon &&
        row.summaryNumber !== row.serverAppIcon
      ) {
        firstCauseHypothesis = "summary_refresh_missing";
      } else {
        firstCauseHypothesis = "JS_Native_plugin_delay";
      }
    }
  } else if (first?.kind === "Cap_prefs_vs_summary_setNumber") {
    firstCauseHypothesis = "summary_refresh_missing";
  }

  const t3 = timeline.find((r) => r.tag === "T3_offer_native_cycle");
  const t10 = timeline.find((r) => r.tag === "T10_read_native_cycle");
  const identity = (r: Row | undefined) => {
    if (!r || r.serverAppIcon == null) return false;
    const cap = r.badgeGet ?? r.capPrefs;
    return (
      cap === r.serverAppIcon &&
      r.summaryNumber === r.serverAppIcon &&
      (r.apiAppIcon == null || r.apiAppIcon === r.serverAppIcon)
    );
  };
  const deliveryGate = {
    T3_offer_Projection_Cap_Summary: identity(t3),
    T10_read_Projection_Cap_Summary: identity(t10),
    t3,
    t10,
    pass: identity(t3) && identity(t10),
  };

  const report = {
    generated_at: new Date().toISOString(),
    device: SERIAL,
    production: PROD,
    viewer: VIEWER,
    timeline,
    divergences,
    first_divergence: first,
    first_cause_hypothesis: firstCauseHypothesis,
    delivery_gate: deliveryGate,
    console_native_lines: consoleBuf.slice(0, 100),
    logcat_path: logcatPath,
  };
  const path = join(OUT, `timeline-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ path, first, firstCauseHypothesis, deliveryGate }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
