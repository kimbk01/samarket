/**
 * Phase H extension — Bell badge single writer (slice-1 cutover).
 * Product mutations funnel through applyBellBadgeProjection → registered store sink.
 * DO NOT: delete R4 adminNotice/poll yet · Domain list · Native Call · 7/14 trash.
 */

import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import type { SurfaceProjectionApplyResult } from "@/lib/chat-domain/projections/surface-projection-types";
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";

export type BellBadgeProjectionSourceKind =
  | "network"
  | "read_patch"
  | "optimistic_admin"
  | "clear";

export type BellBadgeProjectionSnapshot = {
  breakdown: NotificationBadgeCount;
  versionMs: number;
  source: BellBadgeProjectionSourceKind;
  totalUnread: number;
};

let lastBell: BellBadgeProjectionSnapshot | null = null;

type BellBadgeProjectionSink = (snapshot: BellBadgeProjectionSnapshot) => void;

let sink: BellBadgeProjectionSink | null = null;

export function registerBellBadgeProjectionSink(next: BellBadgeProjectionSink): void {
  sink = next;
}

export function getBellBadgeProjection(): BellBadgeProjectionSnapshot | null {
  return lastBell;
}

export function applyBellBadgeProjection(
  snapshot: BellBadgeProjectionSnapshot,
): SurfaceProjectionApplyResult {
  const prevTotal = lastBell?.totalUnread ?? null;
  logBadgeFdProbe("applyBellBadgeProjection.enter", {
    in_totalUnread: snapshot.totalUnread,
    in_source: snapshot.source,
    in_versionMs: snapshot.versionMs,
    prev_totalUnread: prevTotal,
  });
  lastBell = snapshot;
  sink?.(snapshot);
  logBadgeFdProbe("applyBellBadgeProjection.exit", {
    out_totalUnread: snapshot.totalUnread,
    status: "ok",
  });
  return { status: "ok" };
}

/** @internal vitest */
export function __applyBellBadgeProjectionForTests(snapshot: BellBadgeProjectionSnapshot): void {
  lastBell = snapshot;
}

/** @internal vitest */
export function __resetBellBadgeProjectionForTest(): void {
  lastBell = null;
}
