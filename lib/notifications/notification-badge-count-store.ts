"use client";

import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";
import {
  applyAppIconBadgeProjection,
  __resetAppIconBadgeProjectionForTest,
} from "@/lib/chat-domain/projections/app-icon-badge-projection";
import {
  applyBellBadgeProjection,
  registerBellBadgeProjectionSink,
  type BellBadgeProjectionSourceKind,
  __resetBellBadgeProjectionForTest,
} from "@/lib/chat-domain/projections/bell-badge-projection";
import {
  applyAuthorityJsonAsProjection,
  type BadgeCountAuthorityJson,
} from "@/lib/notifications/apply-badge-count-authority-response";
import { markProjectionAuthorityWaitingComplete } from "@/lib/notifications/projection-authority";
import { EMPTY_BELL_BADGE_FACTS } from "@/lib/notifications/build-notification-badge-projection";
import { scheduleStartupApiDeferred } from "@/lib/http/startup-api-scheduler";

const POLL_MS = 45_000;
const fetchUrl = "/api/me/notifications/badge-count";
/**
 * P3-b1 — Bell may still defer first paint, but must join Boot Initial Authority
 * (`ensureInitialBadgeSnapshotForBoot`) instead of owning `doFetch`.
 */
const BADGE_COUNT_FIRST_FETCH_JOB = "notification-badge-count-first";
/** Cold Boot COMPLETE owner reason — Device QA / contract marker. */
export const APP_BOOT_INITIAL_BADGE_REASON = "app_boot_initial_badge";

let snap: NotificationBadgeCount | null = null;
/** Monotonic projection revision — stale poll must not overwrite newer realtime. */
let lastProjectionVersionMs = 0;
let subscriberCount = 0;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let unauthorizedPaused = false;
/** Single-flight — coalesce concurrent boot fetches (first-paint deferred + resync races). */
let inflight: Promise<void> | null = null;
let inflightForce = false;
/** P3-b1 — Boot-owned initial snapshot flight (same boot epoch joins). */
let bootOwnedInflight: Promise<void> | null = null;
let bootOwnedEpoch: number | null = null;
/**
 * P3-b2 — Auth Epoch token. Logout bumps this; in-flight responses from prior
 * epochs must discard before Projection / surface commit.
 */
let authEpoch = 0;
/**
 * P3-b2 — After Auth Epoch reset, block network until Boot Initial Authority
 * re-opens the gate (prevents Bell deferred / guest fetch during wipe).
 */
let authEpochFetchOpen = true;

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function sameBadgeCount(a: NotificationBadgeCount, b: NotificationBadgeCount): boolean {
  return (
    a.total === b.total &&
    a.chatMessage === b.chatMessage &&
    a.groupMessage === b.groupMessage &&
    a.tradeMessage === b.tradeMessage &&
    a.tradeStatus === b.tradeStatus &&
    a.orderStatus === b.orderStatus &&
    a.deliveryStatus === b.deliveryStatus &&
    a.communityActivity === b.communityActivity &&
    a.adminMarketingBanner === b.adminMarketingBanner &&
    a.adminNotice === b.adminNotice &&
    a.chat === b.chat &&
    a.group === b.group &&
    a.trade === b.trade &&
    a.store === b.store &&
    a.missedCall === b.missedCall
  );
}

/** Projection sink — Bell store only. DO NOT mirror to App Icon. */
function sinkBellBadgeFromProjection(proj: {
  breakdown: NotificationBadgeCount;
  totalUnread: number;
  versionMs: number;
  source: BellBadgeProjectionSourceKind;
}): void {
  const next = proj.breakdown;
  if (snap && sameBadgeCount(snap, next)) return;
  snap = next;
  emit();
}

registerBellBadgeProjectionSink(sinkBellBadgeFromProjection);

function applyBellFromStore(
  next: NotificationBadgeCount,
  source: BellBadgeProjectionSourceKind,
  versionMs?: number
): boolean {
  const v = Math.max(0, Math.floor(Number(versionMs) || Date.now()));
  if (v < lastProjectionVersionMs) {
    logNotifyBadge("ui_set", { stale_projection_skipped: 1, v, last: lastProjectionVersionMs, source });
    return false;
  }
  lastProjectionVersionMs = v;
  applyBellBadgeProjection({
    breakdown: next,
    versionMs: v,
    source,
    totalUnread: Math.max(0, next.total),
  });
  return true;
}

/** badge-count API JSON · read-thread `categoryCounts` 공통 정규화 */
export function normalizeNotificationBadgeCountPayload(
  j: Record<string, unknown> | null | undefined
): NotificationBadgeCount | null {
  if (!j || typeof j !== "object") return null;
  const hasShape =
    j.total !== undefined ||
    j.chatMessage !== undefined ||
    j.chat_message !== undefined ||
    j.chat !== undefined ||
    j.communityActivity !== undefined ||
    j.community_activity !== undefined;
  if (!hasShape) return null;
  return {
    total: Math.max(0, Math.floor(Number(j.total) || 0)),
    chatMessage: Math.max(0, Math.floor(Number(j.chatMessage ?? j.chat_message ?? j.chat) || 0)),
    groupMessage: Math.max(0, Math.floor(Number(j.groupMessage ?? j.group_message ?? j.group) || 0)),
    tradeMessage: Math.max(0, Math.floor(Number(j.tradeMessage ?? j.trade_message ?? j.trade) || 0)),
    tradeStatus: Math.max(0, Math.floor(Number(j.tradeStatus ?? j.trade_status) || 0)),
    orderStatus: Math.max(0, Math.floor(Number(j.orderStatus ?? j.order_status ?? j.store) || 0)),
    deliveryStatus: Math.max(0, Math.floor(Number(j.deliveryStatus ?? j.delivery_status) || 0)),
    communityActivity: Math.max(
      0,
      Math.floor(Number(j.communityActivity ?? j.community_activity) || 0)
    ),
    adminMarketingBanner: Math.max(
      0,
      Math.floor(Number(j.adminMarketingBanner ?? j.admin_marketing_banner) || 0)
    ),
    adminNotice: Math.max(0, Math.floor(Number(j.adminNotice ?? j.admin_notice) || 0)),
    chat: Math.max(0, Math.floor(Number(j.chat) || 0)),
    group: Math.max(0, Math.floor(Number(j.group) || 0)),
    trade: Math.max(0, Math.floor(Number(j.trade) || 0)),
    store: Math.max(0, Math.floor(Number(j.store) || 0)),
    missedCall: Math.max(0, Math.floor(Number(j.missedCall ?? j.missed_call) || 0)),
  };
}

export function getNotificationBadgeCountSnapshot(): NotificationBadgeCount | null {
  return snap;
}

export function getNotificationBadgeCountServerSnapshot(): NotificationBadgeCount | null {
  return null;
}

export function getNotificationBadgeProjectionVersionMs(): number {
  return lastProjectionVersionMs;
}

/** @internal vitest / device QA — current Auth Epoch token. */
export function getNotificationBadgeAuthEpoch(): number {
  return authEpoch;
}

export function subscribeNotificationBadgeCount(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  subscriberCount += 1;
  if (subscriberCount === 1) {
    // P3-b1 LOCK — Bell is a consumer only. First paint still defers IO, but the
    // fetch joins Boot Initial Generation Authority (no independent doFetch owner).
    // P3-b2 — capture epoch; after Auth Epoch reset the deferred run must no-op.
    const scheduledEpoch = authEpoch;
    scheduleStartupApiDeferred(
      BADGE_COUNT_FIRST_FETCH_JOB,
      () => {
        if (authEpoch !== scheduledEpoch) return;
        if (!authEpochFetchOpen) return;
        if (snap != null) return;
        void ensureInitialBadgeSnapshotForBoot();
      },
      { delayMs: 0, source: "badge-count-first-subscriber" }
    );
  }
  return () => {
    listeners.delete(onStoreChange);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };
}

/**
 * P3-b1 LOCK — Boot Initial Generation Authority.
 * Sole Cold Boot owner of the first COMPLETE Domain snapshot (non-fresh, reason
 * `app_boot_initial_badge`). Bell subscribers join this entry; they must not call
 * `doFetch` directly for the initial COMPLETE.
 *
 * DO NOT change fresh/resync semantics here (P3-c).
 * P3-b2 — re-opens Auth Epoch fetch gate after logout wipe.
 */
export function ensureInitialBadgeSnapshotForBoot(bootEpoch?: number): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // P3-b2 — Boot is the sole owner that may re-open network after Auth Epoch reset.
  authEpochFetchOpen = true;
  if (snap != null) {
    logNotifyBadge("ui_set", {
      boot_initial_skip_complete: 1,
      bootEpoch: bootEpoch ?? bootOwnedEpoch,
    });
    return Promise.resolve();
  }
  if (bootEpoch != null && bootOwnedInflight && bootOwnedEpoch === bootEpoch) {
    return bootOwnedInflight;
  }
  // Join any in-flight non-fresh (Bell↔Boot race on the same cold session).
  if (inflight && !inflightForce) {
    if (bootEpoch != null) {
      bootOwnedEpoch = bootEpoch;
      bootOwnedInflight = inflight;
    }
    return inflight;
  }
  const epoch = bootEpoch ?? bootOwnedEpoch ?? 0;
  bootOwnedEpoch = epoch;
  const p = doFetch(false, APP_BOOT_INITIAL_BADGE_REASON).finally(() => {
    if (bootOwnedInflight === p) bootOwnedInflight = null;
  });
  bootOwnedInflight = p;
  return p;
}

async function doFetch(force = false, waitReason?: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!authEpochFetchOpen) {
    logNotifyBadge("ui_set", {
      auth_epoch_fetch_blocked: 1,
      authEpoch,
      force: force ? 1 : 0,
    });
    return;
  }
  // Single-flight: a non-fresh call joins any inflight; a fresh call joins only an
  // inflight fresh call. Prevents duplicate concurrent badge-count fetches on boot.
  // P3-b1: fresh bypass semantics unchanged (P3-c owns that contract).
  if (inflight && (!force || inflightForce)) return inflight;
  inflightForce = force;
  const flight = runDoFetch(force, waitReason);
  inflight = flight;
  void flight.finally(() => {
    if (inflight === flight) {
      inflight = null;
      inflightForce = false;
    }
  });
  return flight;
}

async function runDoFetch(force = false, waitReason?: string): Promise<void> {
  const epochAtStart = authEpoch;
  try {
    /** Authority state machine: EMPTY → WAITING_COMPLETE while the snapshot is in flight. */
    const waitingReason = force
      ? "badge_count_fresh"
      : waitReason ?? "badge_count_fetch";
    markProjectionAuthorityWaitingComplete(waitingReason);
    const res = await fetch(force ? `${fetchUrl}?fresh=1` : fetchUrl, { credentials: "include" });
    if (authEpoch !== epochAtStart) {
      logNotifyBadge("ui_set", {
        auth_epoch_stale_discard: 1,
        epochAtStart,
        authEpoch,
        force: force ? 1 : 0,
      });
      return;
    }
    if (res.status === 401) {
      snap = null;
      lastProjectionVersionMs = 0;
      emit();
      applyAppIconBadgeProjection({ totalUnread: 0, versionMs: Date.now(), source: "clear" });
      unauthorizedPaused = true;
      return;
    }
    unauthorizedPaused = false;
    const j = (await res.json()) as BadgeCountAuthorityJson & { ok?: boolean };
    if (authEpoch !== epochAtStart) {
      logNotifyBadge("ui_set", {
        auth_epoch_stale_discard: 1,
        epochAtStart,
        authEpoch,
        after: "json",
      });
      return;
    }
    if (!j?.ok) {
      logNotifyBadge("ui_set", { fetchFailed: true });
      return;
    }
    if (j.authority !== "domain_badge") {
      // DO NOT fall back to event SUM — keep last good projection.
      logNotifyBadge("ui_set", { authority_missing: 1, kept_last_projection: snap ? 1 : 0 });
      return;
    }
    const versionMs = Math.max(
      0,
      Math.floor(Number((j as { projectionVersionMs?: unknown }).projectionVersionMs) || Date.now())
    );
    if (versionMs < lastProjectionVersionMs) {
      logNotifyBadge("ui_set", { stale_poll_skipped: 1, versionMs, last: lastProjectionVersionMs });
      return;
    }
    const applied = applyAuthorityJsonAsProjection(j, {
      applyBell: true,
      projectionVersionMs: versionMs,
    });
    if (!applied) {
      logNotifyBadge("ui_set", { projection_incomplete: 1, kept_last_projection: snap ? 1 : 0 });
      return;
    }
    if (authEpoch !== epochAtStart) {
      logNotifyBadge("ui_set", {
        auth_epoch_stale_discard: 1,
        epochAtStart,
        authEpoch,
        after: "apply",
      });
      return;
    }
    lastProjectionVersionMs = versionMs;
    logNotifyBadge("ui_set", {
      authority: "domain_badge",
      total: snap?.total ?? 0,
      ...(waitReason ? { reason: waitReason } : {}),
    });
    if (!pollInterval && subscriberCount > 0) {
      pollInterval = setInterval(() => {
        if (document.visibilityState === "visible") void doFetch();
      }, POLL_MS);
    }
  } catch {
    if (authEpoch !== epochAtStart) {
      logNotifyBadge("ui_set", {
        auth_epoch_stale_discard: 1,
        epochAtStart,
        authEpoch,
        after: "catch",
      });
      return;
    }
    logNotifyBadge("ui_set", { fetchFailed: true });
  }
}

export function requestNotificationBadgeCountResync(reason?: string): void {
  void doFetch(true);
  if (reason) logNotifyBadge("ui_set", { resync: reason });
}

/**
 * P3-a LOCK — apply Domain snapshot from a read-mutation ACK.
 * Same `projectionVersionMs` → no Projection recommit (Authority same-facts skip) and no fresh GET.
 * Returns true when the client must NOT call `badge-count?fresh=1`.
 */
export function applyNotificationBadgeCountAuthorityAck(
  body: BadgeCountAuthorityJson | Record<string, unknown>,
  reason?: string
): boolean {
  if (typeof window === "undefined") return false;
  const epochAtStart = authEpoch;
  const j = body as BadgeCountAuthorityJson & { badgeGeneration?: unknown; ok?: boolean };
  if (j.authority !== "domain_badge") return false;
  const versionMs = Math.max(
    0,
    Math.floor(
      Number(j.projectionVersionMs ?? j.badgeGeneration) || 0
    )
  );
  if (versionMs <= 0) return false;
  if (authEpoch !== epochAtStart) {
    logNotifyBadge("ui_set", {
      auth_epoch_stale_discard: 1,
      epochAtStart,
      authEpoch,
      reason: reason ?? null,
      after: "ack",
    });
    return true;
  }
  if (versionMs < lastProjectionVersionMs) {
    logNotifyBadge("ui_set", {
      ack_stale_skipped: 1,
      versionMs,
      last: lastProjectionVersionMs,
      reason: reason ?? null,
    });
    return true;
  }
  if (versionMs === lastProjectionVersionMs && snap != null) {
    logNotifyBadge("ui_set", {
      ack_same_generation_noop: 1,
      versionMs,
      reason: reason ?? null,
    });
    return true;
  }
  const applied = applyAuthorityJsonAsProjection(j, {
    applyBell: true,
    projectionVersionMs: versionMs,
  });
  if (!applied) return false;
  if (authEpoch !== epochAtStart) {
    logNotifyBadge("ui_set", {
      auth_epoch_stale_discard: 1,
      epochAtStart,
      authEpoch,
      reason: reason ?? null,
      after: "ack_apply",
    });
    return true;
  }
  lastProjectionVersionMs = versionMs;
  unauthorizedPaused = false;
  logNotifyBadge("ui_set", {
    authority: "domain_badge",
    ack_apply: 1,
    total: snap?.total ?? 0,
    versionMs,
    reason: reason ?? null,
  });
  return true;
}

/** Local Builder apply / optimistic — must pass same projection contract. */
export function patchNotificationBadgeCountSnapshot(
  next: NotificationBadgeCount,
  source: BellBadgeProjectionSourceKind = "read_patch",
  versionMs?: number
): boolean {
  if (snap && sameBadgeCount(snap, next)) return true;
  return applyBellFromStore(next, source, versionMs);
}

/**
 * P3-b2 LOCK — production Auth Epoch Reset for Badge store.
 * Bumps epoch (stale in-flight discard), clears snap/inflight/bootOwned,
 * closes fetch gate until Boot Initial Authority re-opens it,
 * clears App Icon locally to 0 (no server fresh GET).
 *
 * DO NOT: start badge-count network here.
 * DO NOT: stop/restart 45s poll policy (P3-c).
 */
export function resetNotificationBadgeCountForAuthEpoch(): void {
  authEpoch += 1;
  authEpochFetchOpen = false;
  snap = null;
  lastProjectionVersionMs = 0;
  // Drop references only — in-flight Promise completions check authEpoch and discard.
  inflight = null;
  inflightForce = false;
  bootOwnedInflight = null;
  bootOwnedEpoch = null;
  applyBellBadgeProjection({
    breakdown: EMPTY_BELL_BADGE_FACTS,
    versionMs: Date.now(),
    source: "clear",
    totalUnread: 0,
  });
  // Boot Initial Authority requires snap == null (skip_complete must not fire for next user).
  snap = null;
  applyAppIconBadgeProjection({ totalUnread: 0, versionMs: Date.now(), source: "clear" });
  emit();
  logNotifyBadge("ui_set", {
    auth_epoch_reset: 1,
    authEpoch,
    network: 0,
  });
}

export function resetNotificationBadgeCountStoreForTests(): void {
  authEpoch = 0;
  authEpochFetchOpen = true;
  snap = null;
  lastProjectionVersionMs = 0;
  listeners.clear();
  subscriberCount = 0;
  unauthorizedPaused = false;
  inflight = null;
  inflightForce = false;
  bootOwnedInflight = null;
  bootOwnedEpoch = null;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  __resetBellBadgeProjectionForTest();
  __resetAppIconBadgeProjectionForTest();
}
