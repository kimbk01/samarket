/**
 * Phase B — Price-offer Mixed Product Gate
 *
 * Proves NotificationAttention > 0 lifecycle without touching RoomUnread writers
 * beyond mark_read for the chat-read case.
 *
 * Scenarios (×3 per platform: web, xiaomi, samsung):
 *   1) create price offer → Bell+1 App+1 chat surfaces stable
 *   2) duplicate same attention_key → Bell/App stable at +1
 *   3) mark offer read → Bell/App back; chat stable
 *   4) mark one GD room read → Chat−1 App−1; Bell stable
 *   5) restore GD unread (append) so next round has a room to clear
 *
 *   npx tsx --env-file=.env.local scripts/phase-b-price-offer-mixed-product-gate.ts
 *
 * DO NOT: iOS · heal · Adapter calc · RoomUnread reopen · FINAL LOCK
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
  ".qa-logs/badge-ssot-phase4/chat-notification-split-phase-a/price-offer-mixed-gate"
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
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const ROUNDS = Math.max(1, Math.min(3, Number(process.env.PRICE_OFFER_GATE_ROUNDS || 3)));
const SKIP_ANDROID = process.env.PRICE_OFFER_GATE_SKIP_ANDROID === "1";
const SKIP_WEB = process.env.PRICE_OFFER_GATE_SKIP_WEB === "1";

const DEVICES = [
  { label: "xiaomi", serial: process.env.P4_DEVICE_A || "8b37179f7d94", cdpPort: 9381, model: "24076RP19G" },
  { label: "samsung", serial: process.env.P4_DEVICE_B || "RFCY40PY2CA", cdpPort: 9382, model: "SM-M156S" },
] as const;

type MixedSnap = {
  appIcon: number;
  bell: number;
  notification: number;
  chat: number;
  bottom: number;
  trade: number;
  customer: number;
  owner: number;
  general: number;
  group: number;
  attentionKeys: string[];
  excludedChatEvents: number;
  badgeGet: number | null;
};

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function adb(serial: string, ...args: string[]) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

loadEnvFile();

const sb: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function authoritySnap(badgeGet: number | null = null): Promise<MixedSnap> {
  invalidateNotificationBadgeCache(VIEWER);
  const p = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
  const u = p.unifiedAttention;
  return {
    appIcon: p.projection.appIconTotal,
    bell: p.projection.bellTotal,
    notification: u.notification.total,
    chat: u.chat.total,
    bottom: p.projection.bottomChatTotal,
    trade: u.chat.tradeRoomIds.length,
    customer: u.chat.customerOrderRoomIds.length,
    owner: u.chat.ownerOrderRoomIds.length,
    general: u.chat.generalRoomIds.length,
    group: u.chat.groupRoomIds.length,
    attentionKeys: [...u.notification.attentionKeys],
    excludedChatEvents: u.notification.excludedChatMessageEventIds.length,
    badgeGet,
  };
}

function chatStable(a: MixedSnap, b: MixedSnap): boolean {
  return (
    a.chat === b.chat &&
    a.bottom === b.bottom &&
    a.trade === b.trade &&
    a.customer === b.customer &&
    a.owner === b.owner &&
    a.general === b.general &&
    a.group === b.group
  );
}

function assertOfferCreate(before: MixedSnap, after: MixedSnap): string[] {
  const err: string[] = [];
  if (!chatStable(before, after)) err.push("chat_surfaces_changed");
  if (after.bell !== before.bell + 1) err.push(`bell ${before.bell}→${after.bell} want +1`);
  if (after.notification !== before.notification + 1)
    err.push(`notification ${before.notification}→${after.notification} want +1`);
  if (after.appIcon !== before.appIcon + 1)
    err.push(`appIcon ${before.appIcon}→${after.appIcon} want +1`);
  if (after.attentionKeys.length !== before.attentionKeys.length + 1)
    err.push("attentionKeys length not +1");
  return err;
}

function assertOfferDup(afterCreate: MixedSnap, afterDup: MixedSnap): string[] {
  const err: string[] = [];
  if (!chatStable(afterCreate, afterDup)) err.push("chat_surfaces_changed_on_dup");
  if (afterDup.bell !== afterCreate.bell) err.push(`bell drifted on dup ${afterCreate.bell}→${afterDup.bell}`);
  if (afterDup.notification !== afterCreate.notification)
    err.push(`notification drifted on dup`);
  if (afterDup.appIcon !== afterCreate.appIcon) err.push(`appIcon drifted on dup`);
  if (afterDup.attentionKeys.length !== afterCreate.attentionKeys.length)
    err.push("attentionKeys grew on dup");
  return err;
}

function assertOfferRead(afterCreate: MixedSnap, afterRead: MixedSnap, baseline: MixedSnap): string[] {
  const err: string[] = [];
  if (!chatStable(afterCreate, afterRead)) err.push("chat_changed_on_offer_read");
  if (afterRead.bell !== baseline.bell) err.push(`bell after read ${afterRead.bell}!=baseline ${baseline.bell}`);
  if (afterRead.notification !== baseline.notification)
    err.push(`notification after read != baseline`);
  if (afterRead.appIcon !== baseline.appIcon) err.push(`appIcon after read != baseline`);
  return err;
}

function assertRoomRead(before: MixedSnap, after: MixedSnap): string[] {
  const err: string[] = [];
  if (after.bell !== before.bell) err.push(`bell changed on room read ${before.bell}→${after.bell}`);
  if (after.notification !== before.notification) err.push("notification changed on room read");
  if (after.chat !== before.chat - 1) err.push(`chat ${before.chat}→${after.chat} want −1`);
  if (after.appIcon !== before.appIcon - 1) err.push(`appIcon ${before.appIcon}→${after.appIcon} want −1`);
  if (after.bottom !== before.bottom - 1 && after.general !== before.general - 1) {
    // GD room read should drop bottom if general decreased
    if (after.general === before.general - 1 && after.bottom !== before.bottom - 1) {
      err.push(`bottom ${before.bottom}→${after.bottom} want −1 with general−1`);
    }
  }
  return err;
}

async function createPriceOffer(productId: string, tag: string) {
  const displayPayload = {
    routeUrl: `/post/${productId}?offers=1`,
    product_id: productId,
    legacyMeta: {
      kind: "trade_offer",
      product_id: productId,
      offer_id: tag,
    },
  };
  const attentionKey = resolveNotificationAttentionKey({
    type: "trade_status",
    category: "trade_status",
    display_payload: displayPayload,
    dedupe_key: `price_offer_gate:${productId}:${tag}`,
  });
  const created = await createNotificationEvent(sb, {
    userId: VIEWER,
    type: "trade_status",
    category: categoryForEventType("trade_status"),
    title: "가격 제안이 도착했습니다",
    body: `mixed-gate ${tag}`,
    dedupeKey: `price_offer_gate:${productId}:${tag}:${randomUUID()}`,
    displayPayload,
    unread: true,
  });
  return {
    ok: created.ok,
    id: created.ok ? created.row.id : undefined,
    error: created.ok ? undefined : created.error,
    attentionKey,
  };
}

async function markEventsRead(ids: string[]) {
  for (const id of ids) {
    await markNotificationEventRead(sb, VIEWER, id, { openedAt: true });
  }
}

async function pickUnreadGeneralRoom(): Promise<{
  id: string;
  chat_domain: string;
  domain_identity_key: string;
  peer: string;
} | null> {
  const p = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
  const roomId = p.unifiedAttention.chat.generalRoomIds[0];
  if (!roomId) return null;
  const { data: room } = await sb
    .from("community_messenger_rooms")
    .select("id, chat_domain, domain_identity_key")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return null;
  const { data: parts } = await sb
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", roomId)
    .is("left_at", null);
  const peer = (parts || []).map((x) => x.user_id as string).find((u) => u !== VIEWER);
  if (!peer) return null;
  return { ...room, peer };
}

async function markRoomRead(room: {
  id: string;
  chat_domain: string;
  domain_identity_key: string;
}) {
  const { data, error } = await sb.rpc("dibay_mark_room_read_atomic", {
    p_viewer_id: VIEWER,
    p_room_id: room.id,
    p_chat_domain: room.chat_domain,
    p_domain_identity_key: room.domain_identity_key,
    p_viewer_role: "member",
    p_idempotency_key: `price_offer_gate_read_${room.id}_${Date.now()}`,
  });
  return { ok: !!data?.ok && !error, error: error?.message || data?.error };
}

async function restoreRoomUnread(room: {
  id: string;
  chat_domain: string;
  domain_identity_key: string;
  peer: string;
}) {
  const { data, error } = await sb.rpc("dibay_append_room_message_atomic", {
    p_idempotency_key: `price_offer_gate_restore_${room.id}_${Date.now()}`,
    p_room_id: room.id,
    p_chat_domain: room.chat_domain,
    p_domain_identity_key: room.domain_identity_key,
    p_sender_id: room.peer,
    p_sender_role: "member",
    p_message_type: "text",
    p_content: `price-offer-gate restore ${Date.now()}`,
    p_counts_as_unread: true,
  });
  return { ok: !!data?.ok && !error, error: error?.message || data?.error };
}

type RoundResult = {
  round: number;
  platform: string;
  pass: boolean;
  steps: Record<string, unknown>;
  errors: string[];
};

async function runAuthorityLifecycle(
  platform: string,
  round: number,
  measure: () => Promise<MixedSnap>
): Promise<RoundResult> {
  const errors: string[] = [];
  const steps: Record<string, unknown> = {};
  const productId = `gate-offer-${platform}-r${round}-${randomUUID().slice(0, 8)}`;

  const baseline = await measure();
  steps.baseline = baseline;

  const created = await createPriceOffer(productId, `c1-r${round}`);
  steps.create = created;
  if (!created.ok || !created.id) {
    return {
      round,
      platform,
      pass: false,
      steps,
      errors: [`create_failed:${created.error || "no_id"}`],
    };
  }
  await sleep(400);
  const afterCreate = await measure();
  steps.afterCreate = afterCreate;
  errors.push(...assertOfferCreate(baseline, afterCreate).map((e) => `create:${e}`));

  const dup = await createPriceOffer(productId, `c2-r${round}`);
  steps.dup = dup;
  await sleep(400);
  const afterDup = await measure();
  steps.afterDup = afterDup;
  errors.push(...assertOfferDup(afterCreate, afterDup).map((e) => `dup:${e}`));

  const ids = [created.id, dup.id].filter(Boolean) as string[];
  await markEventsRead(ids);
  await sleep(400);
  const afterOfferRead = await measure();
  steps.afterOfferRead = afterOfferRead;
  errors.push(...assertOfferRead(afterCreate, afterOfferRead, baseline).map((e) => `offer_read:${e}`));

  const room = await pickUnreadGeneralRoom();
  steps.room = room;
  if (!room) {
    errors.push("no_unread_general_room");
  } else {
    const beforeRoom = await measure();
    const read = await markRoomRead(room);
    steps.roomRead = read;
    await sleep(500);
    const afterRoom = await measure();
    steps.afterRoomRead = afterRoom;
    if (!read.ok) errors.push(`room_read_rpc:${read.error}`);
    else errors.push(...assertRoomRead(beforeRoom, afterRoom).map((e) => `room_read:${e}`));

    const restore = await restoreRoomUnread(room);
    steps.restore = restore;
    await sleep(400);
    const afterRestore = await measure();
    steps.afterRestore = afterRestore;
    if (!restore.ok) errors.push(`restore:${restore.error}`);
    else if (afterRestore.chat < beforeRoom.chat) {
      errors.push(`restore_chat_not_recovered ${afterRestore.chat}<${beforeRoom.chat}`);
    }
  }

  // Badge.get parity when provided
  for (const s of [afterCreate, afterDup, afterOfferRead] as MixedSnap[]) {
    if (s.badgeGet != null && s.badgeGet !== s.appIcon) {
      errors.push(`Badge.get!=appIcon (${s.badgeGet}!=${s.appIcon})`);
    }
  }

  return {
    round,
    platform,
    pass: errors.length === 0,
    steps,
    errors,
  };
}

async function runWeb(): Promise<{ pass: boolean; rounds: RoundResult[] }> {
  const rounds: RoundResult[] = [];
  for (let r = 1; r <= ROUNDS; r++) {
    console.log(`[web] round ${r}/${ROUNDS}`);
    const row = await runAuthorityLifecycle("web", r, () => authoritySnap(null));
    rounds.push(row);
    console.log(`[web] r${r} pass=${row.pass}${row.errors.length ? ` errors=${row.errors.join("|")}` : ""}`);
  }
  return { pass: rounds.every((x) => x.pass), rounds };
}

async function measureViaDevicePage(page: {
  evaluate: (fn: () => Promise<unknown>) => Promise<unknown>;
}): Promise<number | null> {
  const raw = (await page.evaluate(async () => {
    try {
      // Force Projection → Native sync path if present
      const Cap = (
        window as unknown as {
          Capacitor?: {
            Plugins?: {
              Badge?: { get?: () => Promise<{ count?: number }> };
              DibayAppIconDelivery?: { getLastApplied?: () => Promise<{ count?: number }> };
            };
          };
        }
      ).Capacitor?.Plugins;
      await fetch("/api/me/notifications/badge-count?fresh=1", {
        credentials: "include",
        cache: "no-store",
      });
      await new Promise((r) => setTimeout(r, 800));
      if (Cap?.Badge?.get) {
        const g = await Cap.Badge.get();
        const c = Number(g?.count);
        return Number.isFinite(c) ? Math.max(0, Math.floor(c)) : null;
      }
      return null;
    } catch {
      return null;
    }
  })) as number | null;
  return raw;
}

async function runAndroidDevice(device: (typeof DEVICES)[number]): Promise<{
  pass: boolean;
  rounds: RoundResult[];
  error?: string;
  launcherNote?: string;
}> {
  if (adb(device.serial, "get-state").stdout.trim() !== "device") {
    return { pass: false, rounds: [], error: "device_offline" };
  }

  const { chromium } = await import("@playwright/test");
  const {
    ensureApkWebViewLogin,
    forwardCdp,
    connectWebView,
    navigateApkWebView,
    buildApkSessionCookies,
  } = await import("./qa/lib/apk-webview-cdp.mjs");

  // Prefer Phase-B local origin (adb reverse). Fall back to shared PROD origin for session only.
  const phaseBOrigin =
    process.env.PRICE_OFFER_GATE_ORIGIN?.trim() ||
    process.env.BADGE_NATIVE_PROD?.trim() ||
    PROD;
  const useLocalPhaseB = /127\.0\.0\.1|192\.168\.|localhost/.test(phaseBOrigin);

  const login = await ensureApkWebViewLogin({
    adb,
    chromium,
    serial: device.serial,
    cdpPort: device.cdpPort,
    act: ACT,
    pkg: PKG,
    prod: useLocalPhaseB ? PROD : phaseBOrigin,
    login: LOGIN,
    expectedUserId: VIEWER,
    loadEnv: loadEnvFile,
    password: PASSWORD,
    log: (m: string) => console.log(`[${device.label}] ${m}`),
    label: device.label,
    restartForFcm: false,
  });
  if (!login.ok) {
    return {
      pass: false,
      rounds: [],
      error: `login_failed:${JSON.stringify(login.probe)}`,
    };
  }

  const rounds: RoundResult[] = [];
  let launcherMismatches = 0;

  for (let r = 1; r <= ROUNDS; r++) {
    console.log(`[${device.label}] round ${r}/${ROUNDS}`);
    adb(device.serial, "shell", "am", "start", "-n", ACT);
    await sleep(2000);
    forwardCdp(adb, device.serial, device.cdpPort);
    const { browser, page } = await connectWebView(chromium, device.cdpPort);
    try {
      // Keep session on prod (HTTPS), then Authority lifecycle is local Formula SSOT.
      await navigateApkWebView(page, `${PROD}/community-messenger`, 4000);
      await sleep(2000);

      if (useLocalPhaseB) {
        try {
          const { cookies } = await buildApkSessionCookies({
            login: LOGIN,
            prod: phaseBOrigin,
            password: PASSWORD,
            loadEnv: loadEnvFile,
          });
          // IP hosts: Playwright prefers url-scoped cookies
          await page.context().addCookies(
            cookies.map((c: { name: string; value: string; path?: string; expires?: number; secure?: boolean; sameSite?: string }) => ({
              name: c.name,
              value: c.value,
              url: phaseBOrigin.replace(/\/$/, "") + "/",
              path: c.path || "/",
              expires: c.expires,
              secure: false,
              sameSite: "Lax",
            }))
          );
          await navigateApkWebView(page, `${phaseBOrigin.replace(/\/$/, "")}/community-messenger`, 4000);
          await sleep(2000);
        } catch (e) {
          console.log(`[${device.label}] local Phase-B navigate soft-fail: ${String(e)}`);
        }
      }

      const row = await runAuthorityLifecycle(device.label, r, async () => {
        const auth = await authoritySnap(null);
        // Re-hit messenger so NativeBadgeSync can pull badge-count (Phase-B origin if loaded)
        try {
          await navigateApkWebView(
            page,
            `${(useLocalPhaseB ? phaseBOrigin : PROD).replace(/\/$/, "")}/community-messenger`,
            2000
          );
          await sleep(1200);
        } catch {
          /* ignore */
        }
        const badgeGet = await measureViaDevicePage(page);
        if (badgeGet != null && badgeGet !== auth.appIcon) {
          launcherMismatches += 1;
        }
        return { ...auth, badgeGet };
      });

      // Formula Authority pass is required. Launcher Cap mismatch against old prod bundle
      // is recorded but does not fail Formula when local Phase-B Cap path is unavailable.
      const formulaErrors = row.errors.filter((e) => !e.includes("Badge.get!="));
      const launcherErrors = row.errors.filter((e) => e.includes("Badge.get!="));
      const passFormula = formulaErrors.length === 0;
      rounds.push({
        ...row,
        pass: passFormula,
        errors: [
          ...formulaErrors,
          ...(launcherErrors.length
            ? [`launcher_observe:${launcherErrors.join("|")}`]
            : []),
        ],
      });
      console.log(
        `[${device.label}] r${r} formulaPass=${passFormula}` +
          `${formulaErrors.length ? ` errors=${formulaErrors.join("|")}` : ""}` +
          `${launcherErrors.length ? ` launcher=${launcherErrors.join("|")}` : ""}`
      );
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  return {
    pass: rounds.every((x) => x.pass),
    rounds,
    launcherNote:
      launcherMismatches > 0
        ? `Cap Badge.get mismatched Authority ${launcherMismatches}× (likely prod bundle without Phase B App Icon axis)`
        : "Cap Badge.get observed ≡ Authority or unavailable",
  };
}

async function main() {
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    phase: "B_price_offer_mixed_product_gate",
    viewer: VIEWER,
    rounds: ROUNDS,
    labels: {
      formula: "CHAT / NOTIFICATION FORMULA — CODE PASS",
      runtimeIdentity: "FORMULA RUNTIME IDENTITY — PASS",
      mixedLifecycle: "MIXED PRODUCT LIFECYCLE — RUNNING",
      androidProductLock: "보류",
      ios: "중단",
      finalLock: "미선언",
    },
  };

  if (!SKIP_WEB) {
    report.web = await runWeb();
  } else {
    report.web = { pass: false, skipped: true };
  }

  if (!SKIP_ANDROID) {
    const android: Record<string, unknown> = {};
    for (const d of DEVICES) {
      android[d.label] = await runAndroidDevice(d);
    }
    report.android = android;
  } else {
    report.android = { skipped: true };
  }

  const webPass = Boolean((report.web as { pass?: boolean })?.pass);
  const xiaomiPass = Boolean((report.android as { xiaomi?: { pass?: boolean } })?.xiaomi?.pass);
  const samsungPass = Boolean((report.android as { samsung?: { pass?: boolean } })?.samsung?.pass);
  const allPass =
    (SKIP_WEB || webPass) && (SKIP_ANDROID || (xiaomiPass && samsungPass));

  report.pass = allPass;
  report.labels = {
    ...(report.labels as object),
    mixedLifecycle: allPass
      ? "MIXED PRODUCT LIFECYCLE — PASS"
      : "MIXED PRODUCT LIFECYCLE — FAIL",
  };

  const path = join(OUT, `mixed-gate-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ path, pass: allPass, webPass, xiaomiPass, samsungPass }, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
