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

const POLL_MS = 45_000;
const fetchUrl = "/api/me/notifications/badge-count";

let snap: NotificationBadgeCount | null = null;
/** Monotonic projection revision — stale poll must not overwrite newer realtime. */
let lastProjectionVersionMs = 0;
let subscriberCount = 0;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let unauthorizedPaused = false;

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

/**
 * @deprecated Prefer Domain projection apply. Kept for transitional read responses that
 * already carry Builder-shaped categoryCounts (domain rooms in chatMessage fields).
 */
export function applyNotificationBadgeCountFromReadResponse(categoryCounts: unknown): boolean {
  const payload =
    categoryCounts && typeof categoryCounts === "object" && !Array.isArray(categoryCounts)
      ? normalizeNotificationBadgeCountPayload(categoryCounts as Record<string, unknown>)
      : null;
  if (!payload) return false;
  return patchNotificationBadgeCountSnapshot(payload);
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

export function subscribeNotificationBadgeCount(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  subscriberCount += 1;
  if (subscriberCount === 1) void doFetch();
  return () => {
    listeners.delete(onStoreChange);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };
}

async function doFetch(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch(force ? `${fetchUrl}?fresh=1` : fetchUrl, { credentials: "include" });
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
    logNotifyBadge("ui_set", { authority: "domain_badge", total: snap?.total ?? 0 });
    if (!pollInterval && subscriberCount > 0) {
      pollInterval = setInterval(() => {
        if (document.visibilityState === "visible") void doFetch();
      }, POLL_MS);
    }
  } catch {
    logNotifyBadge("ui_set", { fetchFailed: true });
  }
}

export function requestNotificationBadgeCountResync(reason?: string): void {
  void doFetch(true);
  if (reason) logNotifyBadge("ui_set", { resync: reason });
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

export function resetNotificationBadgeCountStoreForTests(): void {
  snap = null;
  lastProjectionVersionMs = 0;
  listeners.clear();
  subscriberCount = 0;
  unauthorizedPaused = false;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  __resetBellBadgeProjectionForTest();
  __resetAppIconBadgeProjectionForTest();
}
