#!/usr/bin/env node
/**
 * Commerce chat list lifecycle P2 — APK WebView CDP home-sync field audit.
 * Usage: node scripts/qa/commerce-chat-lifecycle-p2-adb-qa.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  buildApkSessionCookies,
  connectWebView,
  forwardCdp,
  launchApkMainActivity,
  navigateApkWebView,
  probeApkUser,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const SERIAL = process.env.P2_DEVICE?.trim() || "RFCY40PY2CA";
const CDP_PORT = Number(process.env.P2_CDP_PORT || 9235);
const PROD = (process.env.P2_PROD ?? "https://samarket.vercel.app").replace(/\/$/, "");
const LOGIN = process.env.P2_LOGIN?.trim() || "aaaa";
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
const OUT_LOG = path.join(ROOT, "docs/perf/commerce-chat-lifecycle-p2-adb-qa-run.log");
const OUT_JSON = path.join(
  ROOT,
  `docs/perf/commerce-chat-lifecycle-p2-${PROD.includes("127.0.0.1") || PROD.includes("localhost") ? "local" : "prod"}-qa-report.json`
);

const COMPLETED_CHAT_LIST_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

const TRADE_LIFECYCLE_FIELDS = [
  "sellerId",
  "buyerId",
  "tradeFlowStatus",
  "sellerCompletedAt",
  "buyerConfirmedAt",
  "completedAt",
];
const DELIVERY_LIFECYCLE_FIELDS = ["storeOrderId", "orderStatus", "deliveryCompletedAt", "completedAt"];

const LOGCAT_TAGS =
  "chromium ReactNativeJS Console home-sync-fail trade-chat-list commerce-chat dedupe lifecycle";

function loadEnvLocal() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function log(line) {
  const msg = `[p2-lifecycle-qa] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT_LOG, msg + "\n");
}

function adb(serial, ...args) {
  const r = spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function trim(v) {
  return typeof v === "string" ? v.trim() : "";
}

function parseIsoMs(iso) {
  const t = trim(iso);
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

function maxIsoMs(candidates) {
  let best = null;
  for (const c of candidates) {
    const ms = parseIsoMs(c);
    if (ms == null) continue;
    if (best == null || ms > best) best = ms;
  }
  return best;
}

function roomIsTrade(room) {
  const dk = trim(room.messengerDirectKey);
  const kind = room.contextMeta?.kind;
  return kind === "trade" || dk.startsWith("trade_pc:") || dk.startsWith("trade_item:");
}

function roomIsDelivery(room) {
  const dk = trim(room.messengerDirectKey);
  const kind = room.contextMeta?.kind;
  return kind === "delivery" || dk.startsWith("store_order:") || dk.startsWith("trade_order:");
}

function isTradeCompleted(meta) {
  if (!meta || meta.kind !== "trade") return false;
  const flow = trim(meta.tradeFlowStatus);
  if (["seller_marked_done", "buyer_confirmed", "review_completed", "archived"].includes(flow)) return true;
  if (trim(meta.itemStateLabel) === "거래완료") return true;
  return false;
}

function isDeliveryCompleted(meta) {
  if (!meta || meta.kind !== "delivery") return false;
  if (trim(meta.orderStatus) === "completed") return true;
  if (parseIsoMs(meta.deliveryCompletedAt) != null) return true;
  return false;
}

function completionAnchorMs(meta, kind) {
  if (kind === "trade") {
    return maxIsoMs([meta.completedAt, meta.sellerCompletedAt, meta.buyerConfirmedAt]);
  }
  return maxIsoMs([meta.completedAt, meta.deliveryCompletedAt]);
}

function shouldHideCompleted(room, nowMs = Date.now()) {
  if (room.roomStatus === "archived") return true;
  const meta = room.contextMeta;
  if (!meta) return false;
  const kind = meta.kind;
  const completed =
    (kind === "trade" && isTradeCompleted(meta)) || (kind === "delivery" && isDeliveryCompleted(meta));
  if (!completed) return false;
  const anchor = completionAnchorMs(meta, kind);
  if (anchor == null) return false;
  return nowMs - anchor > COMPLETED_CHAT_LIST_VISIBLE_MS;
}

function fieldPresence(meta, fields) {
  const out = {};
  for (const f of fields) {
    const v = meta?.[f];
    out[f] = v != null && trim(String(v)) !== "";
  }
  return out;
}

function summarizeRooms(rooms, label) {
  const trade = rooms.filter(roomIsTrade);
  const delivery = rooms.filter(roomIsDelivery);
  const tradeSamples = trade.slice(0, 8).map((r) => ({
    roomId: r.id,
    directKey: r.messengerDirectKey ?? null,
    isReadonly: r.isReadonly === true,
    contextMeta: r.contextMeta ?? null,
    fields: fieldPresence(r.contextMeta, TRADE_LIFECYCLE_FIELDS),
    completed: isTradeCompleted(r.contextMeta),
    policyHide: shouldHideCompleted(r),
  }));
  const deliverySamples = delivery.slice(0, 8).map((r) => ({
    roomId: r.id,
    directKey: r.messengerDirectKey ?? null,
    isReadonly: r.isReadonly === true,
    contextMeta: r.contextMeta ?? null,
    fields: fieldPresence(r.contextMeta, DELIVERY_LIFECYCLE_FIELDS),
    completed: isDeliveryCompleted(r.contextMeta),
    policyHide: shouldHideCompleted(r),
  }));

  const tradeFieldRates = {};
  for (const f of TRADE_LIFECYCLE_FIELDS) {
    tradeFieldRates[f] = trade.length
      ? trade.filter((r) => fieldPresence(r.contextMeta, [f])[f]).length / trade.length
      : 0;
  }
  const deliveryFieldRates = {};
  for (const f of DELIVERY_LIFECYCLE_FIELDS) {
    deliveryFieldRates[f] = delivery.length
      ? delivery.filter((r) => fieldPresence(r.contextMeta, [f])[f]).length / delivery.length
      : 0;
  }

  const completedTrade = trade.filter((r) => isTradeCompleted(r.contextMeta));
  const completedDelivery = delivery.filter((r) => isDeliveryCompleted(r.contextMeta));

  return {
    label,
    totalChats: rooms.length,
    tradeCount: trade.length,
    deliveryCount: delivery.length,
    tradeFieldRates,
    deliveryFieldRates,
    tradeSamples,
    deliverySamples,
    completedTradeCount: completedTrade.length,
    completedDeliveryCount: completedDelivery.length,
    completedTradeWithTimestamp: completedTrade.filter((r) => completionAnchorMs(r.contextMeta, "trade") != null)
      .length,
    completedDeliveryWithTimestamp: completedDelivery.filter(
      (r) => completionAnchorMs(r.contextMeta, "delivery") != null
    ).length,
    policyChecks: {
      completedTradeVisibleInList: completedTrade.filter((r) => !shouldHideCompleted(r)).length,
      completedTradeHiddenByPolicy: completedTrade.filter((r) => shouldHideCompleted(r)).length,
      completedDeliveryVisibleInList: completedDelivery.filter((r) => !shouldHideCompleted(r)).length,
      completedDeliveryHiddenByPolicy: completedDelivery.filter((r) => shouldHideCompleted(r)).length,
      completedWithoutTimestamp: [
        ...completedTrade.filter((r) => completionAnchorMs(r.contextMeta, "trade") == null),
        ...completedDelivery.filter((r) => completionAnchorMs(r.contextMeta, "delivery") == null),
      ].map((r) => ({ roomId: r.id, kind: r.contextMeta?.kind })),
    },
  };
}

async function fetchHomeSyncInWebView(page, tier, expectedOrigin) {
  return page.evaluate(
    async ({ tierParam, expectedOrigin: originHint }) => {
      const origin = window.location.origin;
      if (originHint && origin !== originHint) {
        return {
          ok: false,
          status: 0,
          url: `${origin}/api/community-messenger/home-sync?tier=${tierParam}&fresh=1`,
          json: null,
          textHead: `origin_mismatch expected=${originHint} actual=${origin}`,
        };
      }
      const url = `${origin}/api/community-messenger/home-sync?tier=${tierParam}&fresh=1`;
      const r = await fetch(url, { credentials: "include", cache: "no-store" });
      const text = await r.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* ignore */
      }
      return { ok: r.ok, status: r.status, url, origin, json, textHead: text.slice(0, 400) };
    },
    { tierParam: tier, expectedOrigin }
  );
}

async function supabaseGroundTruth(userId) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) return { ok: false, reason: "missing_supabase_env" };
  const admin = createClient(url, sk, { auth: { persistSession: false } });

  const { data: pcs } = await admin
    .from("product_chats")
    .select(
      "id, seller_id, buyer_id, trade_flow_status, seller_completed_at, buyer_confirmed_at, community_messenger_room_id"
    )
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .not("seller_completed_at", "is", null)
    .limit(5);

  const { data: orders } = await admin
    .from("store_orders")
    .select("id, order_status, community_messenger_room_id")
    .eq("buyer_user_id", userId)
    .eq("order_status", "completed")
    .limit(5);

  let orderEvents = [];
  const orderIds = (orders ?? []).map((o) => o.id).filter(Boolean);
  if (orderIds.length) {
    const { data: ev } = await admin
      .from("store_order_events")
      .select("order_id, created_at, event_type")
      .in("order_id", orderIds)
      .eq("event_type", "order_completed");
    orderEvents = ev ?? [];
  }

  return {
    ok: true,
    completedProductChats: (pcs ?? []).length,
    completedStoreOrders: (orders ?? []).length,
    orderCompletedEvents: orderEvents.length,
    sampleProductChat: pcs?.[0] ?? null,
    sampleCompletedOrder: orders?.[0] ?? null,
  };
}

function scanLogcatErrors() {
  const raw = adb(SERIAL, "logcat", "-d").stdout ?? "";
  const patterns = [
    /home-sync-fail/i,
    /trade-chat-list.*error/i,
    /dedupe.*error/i,
    /lifecycle.*error/i,
    /\[trade-list-canonical/i,
  ];
  const ignorePatterns = [/NativeIncomingCall\.then\(\)/i, /kakao_native_signout_failed/i];
  const hits = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    if (patterns.some((p) => p.test(line)) && !ignorePatterns.some((p) => p.test(line))) hits.push(line.trim());
  }
  const dibay = raw
    .split("\n")
    .filter((l) => /DIBAY|chromium|Console|ReactNativeJS/i.test(l))
    .filter((l) => /error|fail|exception|lifecycle|dedupe|home-sync/i.test(l))
    .slice(-40);
  return { errorHits: hits.slice(-30), dibayHits: dibay };
}

async function main() {
  fs.writeFileSync(OUT_LOG, "");
  const startedAt = new Date().toISOString();
  log(`start serial=${SERIAL} prod=${PROD} login=${LOGIN}`);

  const devices = adb(null, "devices").stdout ?? "";
  if (!devices.includes(SERIAL)) {
    throw new Error(`device ${SERIAL} not connected: ${devices}`);
  }

  adb(SERIAL, "logcat", "-c");
  launchApkMainActivity(adb, SERIAL, ACT);

  let sock = null;
  for (let i = 0; i < 12; i += 1) {
    await sleep(1000);
    const r = adb(SERIAL, "shell", "cat", "/proc/net/unix");
    const line = (r.stdout || "").split("\n").find((l) => l.includes("webview_devtools_remote"));
    if (line) {
      sock = line.match(/@(webview_devtools_remote_\d+)/)?.[1] ?? null;
      if (sock) break;
    }
  }
  if (!sock) throw new Error(`webview devtools socket not found on ${SERIAL} after 12s`);
  log(`webview socket=${sock}`);
  forwardCdp(adb, SERIAL, CDP_PORT);
  const { browser, page } = await connectWebView(chromium, CDP_PORT);

  let probe = await probeApkUser(page);
  log(`probe before=${JSON.stringify(probe)}`);

  loadEnvLocal();
  const { cookies, userId } = await buildApkSessionCookies({
    login: LOGIN,
    prod: PROD,
    password: PASSWORD,
    loadEnv: loadEnvLocal,
  });
  await page.context().addCookies(cookies);
  await navigateApkWebView(page, `${PROD}/community-messenger`, 6000);
  const pageOrigin = new URL(await page.url()).origin;
  log(`page origin=${pageOrigin} expected=${new URL(PROD).origin}`);
  probe = await probeApkUser(page);
  log(`probe after=${JSON.stringify(probe)}`);
  if (!probe.ok) throw new Error(`login failed: ${JSON.stringify(probe)}`);

  const expectedOrigin = new URL(PROD).origin;
  const fullSync = await fetchHomeSyncInWebView(page, "full", expectedOrigin);
  log(`home-sync full status=${fullSync.status} ok=${fullSync.ok} origin=${fullSync.origin ?? pageOrigin}`);
  const critSync = await fetchHomeSyncInWebView(page, "critical", expectedOrigin);
  log(`home-sync critical status=${critSync.status} ok=${critSync.ok} origin=${critSync.origin ?? pageOrigin}`);

  await browser.close().catch(() => {});

  const fullPayload = fullSync.json?.data ?? fullSync.json ?? null;
  const critPayload = critSync.json?.data ?? critSync.json ?? null;
  const fullChats = fullPayload?.chats ?? fullPayload?.bootstrap?.chats ?? [];
  const critChats = critPayload?.chats ?? critPayload?.bootstrap?.chats ?? [];

  const fullSummary = summarizeRooms(Array.isArray(fullChats) ? fullChats : [], "home-sync-tier-full");
  const critSummary = summarizeRooms(Array.isArray(critChats) ? critChats : [], "home-sync-tier-critical");

  const groundTruth = await supabaseGroundTruth(probe.userId ?? userId);
  log(`groundTruth=${JSON.stringify(groundTruth)}`);

  const logcat = scanLogcatErrors();
  log(`logcat errorHits=${logcat.errorHits.length} dibayHits=${logcat.dibayHits.length}`);

  const tradeFieldsOk =
    fullSummary.tradeCount === 0 ||
    (fullSummary.tradeFieldRates.sellerId === 1 &&
      fullSummary.tradeFieldRates.buyerId === 1 &&
      fullSummary.tradeFieldRates.tradeFlowStatus >= 0.5);
  const deliveryFieldsOk =
    fullSummary.deliveryCount === 0 ||
    (fullSummary.deliveryFieldRates.storeOrderId === 1 && fullSummary.deliveryFieldRates.orderStatus >= 0.5);

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: {
      device: SERIAL,
      prod: PROD,
      login: LOGIN,
      userId: probe.userId ?? userId,
      qaMode: "apk-webview-cdp",
    },
    apiPaths: {
      full: "/api/community-messenger/home-sync?tier=full&fresh=1",
      critical: "/api/community-messenger/home-sync?tier=critical&fresh=1",
    },
    homeSync: {
      full: { httpStatus: fullSync.status, ok: fullSync.ok, ...fullSummary },
      critical: { httpStatus: critSync.status, ok: critSync.ok, ...critSummary },
    },
    groundTruth,
    logcat,
    verdict: {
      homeSyncReachable: fullSync.ok && critSync.ok,
      tradeLifecycleFields: tradeFieldsOk ? "PASS_OR_NO_TRADE_ROOMS" : "FAIL_PARTIAL",
      deliveryLifecycleFields: deliveryFieldsOk ? "PASS_OR_NO_DELIVERY_ROOMS" : "FAIL_PARTIAL",
      logcatClean: logcat.errorHits.length === 0,
    },
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  log(`report written ${OUT_JSON}`);
  console.log(JSON.stringify(report.verdict, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
